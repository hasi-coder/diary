//! Agent access over MCP (Model Context Protocol), for Codex, Claude Code,
//! GitHub Copilot and other coding agents.
//!
//! The server runs **inside the unlocked app**: agents never get the password or
//! the data key, they connect with a revocable token, and nothing works while
//! the journal is locked. It listens on 127.0.0.1 only.
//!
//! Scope: **pages, shops and their products**: list, read metadata, create,
//! update, add photos (from an image URL or base64), and delete (to the Trash).
//! Posts, people, the owner's profile, series and the Trash are out of reach.
//!
//! Transports:
//! - Streamable HTTP: `POST http://127.0.0.1:<port>/mcp` with `Authorization: Bearer <token>`
//!   (JSON responses, no server-initiated stream).
//! - stdio: `my-diary --mcp-stdio` relays JSON-RPC lines to the HTTP endpoint
//!   (`MY_DIARY_MCP_TOKEN`, optional `MY_DIARY_MCP_URL`), for agents that only speak stdio.

use std::collections::VecDeque;
use std::io::{BufRead, Read, Write};
use std::net::{IpAddr, ToSocketAddrs};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde_json::{json, Value};

use crate::commands::AppState;
use crate::error::{Error, Result};
use crate::model::*;
use crate::store::{now_millis, Workspace};

pub const DEFAULT_PORT: u16 = 47615;
pub const PROTOCOL_VERSION: &str = "2025-06-18";
const MAX_BODY: u64 = 40 * 1024 * 1024;
const MAX_DOWNLOAD: u64 = 25 * 1024 * 1024;
const LOG_SIZE: usize = 200;

// ---- Activity log ----

/// One agent call, for the log in Settings.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEvent {
    pub at: i64,
    pub tool: String,
    pub summary: String,
    pub ok: bool,
}

#[derive(Default)]
pub struct AgentLog(Mutex<VecDeque<AgentEvent>>);

impl AgentLog {
    pub fn push(&self, tool: &str, summary: String, ok: bool) {
        let mut log = self.0.lock().unwrap_or_else(|e| e.into_inner());
        log.push_front(AgentEvent { at: now_millis(), tool: tool.into(), summary, ok });
        log.truncate(LOG_SIZE);
    }

    pub fn recent(&self) -> Vec<AgentEvent> {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).iter().cloned().collect()
    }
}

/// A fresh random bearer token.
pub fn new_token() -> String {
    crate::crypto::random_bytes::<32>().iter().map(|b| format!("{b:02x}")).collect()
}

fn same(a: &str, b: &str) -> bool {
    // Constant time for equal lengths; tokens are fixed-length hex.
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// ---- JSON-RPC ----

/// Handles one JSON-RPC message. `None` for notifications (no reply).
pub fn handle_message(state: &AppState, message: &Value) -> Option<Value> {
    let id = message.get("id").cloned();
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    let id = id?; // notifications (e.g. notifications/initialized) get no reply
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL_VERSION),
            "capabilities": { "tools": { "listChanged": false } },
            "serverInfo": { "name": "my-diary", "title": "My Diary: pages & products", "version": env!("CARGO_PKG_VERSION") },
            "instructions": INSTRUCTIONS,
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools() })),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            let outcome = call_tool(state, &name, &args);
            let (value, ok, summary) = match outcome {
                Ok((value, summary)) => {
                    // Anything but a lookup changed the journal: the open window should show it.
                    if !matches!(name.as_str(), "list_pages" | "get_page" | "find_by_source_url" | "list_products" | "get_product") {
                        state.notify_changed("agent");
                    }
                    (value, true, summary)
                }
                Err(e) => (json!({ "error": e.to_string() }), false, e.to_string()),
            };
            state.agent_log.push(&name, summary, ok);
            Ok(json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&value).unwrap_or_default() }],
                "structuredContent": value,
                "isError": !ok,
            }))
        }
        _ => Err((-32601, format!("Method not found: {method}"))),
    };
    Some(match result {
        Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
        Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
    })
}

const INSTRUCTIONS: &str = "Manages pages, shops and products in the user's encrypted journal (My Diary). \
To publish from a URL: fetch the URL yourself, extract the business or product details, \
call find_by_source_url to avoid duplicates, then create_page / create_product (or update_* if found), \
passing sourceUrl and image URLs. Deletes go to the user's Trash. Posts are not accessible. People can be added (create_person) and updated, and given photos, face views and a Places character, but they can't be listed or read back.";

// ---- Tools ----

fn tools() -> Value {
    let page_fields = json!({
        "name": { "type": "string" },
        "category": { "type": "string", "description": "e.g. Coffee shop, Boutique, Book club" },
        "tagline": { "type": "string", "description": "One-line intro" },
        "bio": { "type": "string", "description": "About text" },
        "location": { "type": "string", "description": "Address or area" },
        "sellsProducts": { "type": "boolean", "description": "Pages only: show a Shop tab. Shops always sell." },
        "sourceUrl": { "type": "string", "description": "Where the details came from" },
        "color": { "type": "string", "enum": ["teal", "pink", "amber", "sky", "indigo", "violet", "emerald", "orange", "slate"] }
    });
    let image_inputs = json!({
        "imageUrls": { "type": "array", "items": { "type": "string" }, "description": "http(s) image URLs the app downloads (max 25 MB each; images are stored up to 5 MB)" },
        "images": { "type": "array", "items": { "type": "object", "properties": { "base64": { "type": "string" }, "fileName": { "type": "string" } }, "required": ["base64"] }, "description": "Images as base64" }
    });
    let product_fields = json!({
        "name": { "type": "string" },
        "description": { "type": "string" },
        "price": { "type": ["number", "null"], "description": "In major units, e.g. 24.5; null for price on request" },
        "currency": { "type": "string", "description": "ISO code, e.g. USD, LKR" },
        "status": { "type": "string", "enum": ["available", "reserved", "sold"] },
        "sourceUrl": { "type": "string", "description": "The product page it came from" }
    });
    let merge = |a: &Value, b: &Value| {
        let mut m = a.as_object().cloned().unwrap_or_default();
        m.extend(b.as_object().cloned().unwrap_or_default());
        Value::Object(m)
    };
    let id = json!({ "id": { "type": "string" } });
    let face_view = |view: &str| json!({
        "type": "object",
        "properties": { "base64": { "type": "string" }, "fileName": { "type": "string" }, "url": { "type": "string" } },
        "description": format!("The {view} view: base64 (or a data: URL), or an http(s) url")
    });
    let tool = |name: &str, description: &str, properties: Value, required: &[&str]| {
        json!({ "name": name, "description": description, "inputSchema": { "type": "object", "properties": properties, "required": required, "additionalProperties": false } })
    };
    json!([
        tool("list_pages", "List pages and shops (metadata only).", json!({ "query": { "type": "string" }, "kind": { "type": "string", "enum": ["page", "shop"] } }), &[]),
        tool("get_page", "A page or shop's metadata, photos and products.", id.clone(), &["id"]),
        tool("find_by_source_url", "Pages and products already imported from a URL (exact match, ignoring a trailing slash).", json!({ "url": { "type": "string" } }), &["url"]),
        tool("create_page", "Create a page or shop, optionally with a profile picture and cover photo from URLs.",
            merge(&merge(&page_fields, &json!({ "kind": { "type": "string", "enum": ["page", "shop"], "default": "page" } })),
                &json!({ "avatarUrl": { "type": "string" }, "coverUrl": { "type": "string" } })), &["name"]),
        tool("update_page", "Update a page or shop. Only the fields given change.", merge(&id, &page_fields), &["id"]),
        tool("merge_pages", "Merge a duplicate page/shop into another. Keeps destination details, fills blanks, preserves product ids, photos and references, and moves only the old profile to Trash. Product listings are not deduplicated. Only use when asked to merge.",
            json!({ "sourceId": { "type": "string", "description": "Duplicate page/shop to merge away" }, "targetId": { "type": "string", "description": "Page/shop to keep" } }), &["sourceId", "targetId"]),
        tool("set_page_photo", "Set or remove a page's profile picture or cover photo.",
            json!({ "id": { "type": "string" }, "slot": { "type": "string", "enum": ["avatar", "cover"] }, "imageUrl": { "type": "string" }, "imageBase64": { "type": "string" }, "fileName": { "type": "string" }, "remove": { "type": "boolean" } }), &["id", "slot"]),
        tool("set_place_layout", "Set or remove the walkable layout of a place, shop or page (the Places world). One cell is 1 m; x grows right, y grows down, as on a drawing. Shape: { version: 2, floors: [{ name, width, depth, entrance: [x,y], spawn: { at: [x,y], facing: 'N'|'NE'|…|'SE' }, rooms: [{ name, rect: [x1,y1,x2,y2], floor: '#hex', checker? }], doors: [{ edge: 'h:x:y' (north side of cell x,y) | 'v:x:y' (west side), kind?: 'door'|'arch', name?, locked?, partition?, cubicle?: [x,y] (the seat inside that locks it) }], partitions: ['v:x:y', …], items: [{ kind, x, y, w?, h?, facing?: 'N'|'S'|'E'|'W', color? }], spots?: { home: [Spot], work: [Spot], visit: [Spot] } }] }, Spot = { seat: [x,y] } | { cell: [x,y], facing }. Walls are drawn wherever two rooms (or a room and outside) meet. Item kinds: chair, armchair, sofa, bench, table, coffee, desk, counter, bed, hbed, couch, bedside, wardrobe, toilet, sink, bath, fridge, stove, kcounter, tv, shelf, plant, rug, cooler, cabinet, rack, mirror, till. Size spaces for groups: corridors 2 cells, cubicles and fitting rooms 2 x 2.",
            json!({ "id": { "type": "string" }, "layout": { "type": ["object", "null"], "description": "The layout; null removes it" } }), &["id", "layout"]),
        tool("create_person", "Add a person to the journal (a friend, family member, colleague), optionally with a profile picture, cover photo and the head views their Places character wears. Fails if someone with that name already exists. Returns only the new id; people can't be listed or read back. Use set_person_character to dress and shape their character.",
            json!({
                "name": { "type": "string" },
                "relationship": { "type": "string", "description": "How they relate to the journal owner, e.g. Sister, Friend" },
                "birthday": { "type": "string", "description": "YYYY-MM-DD, or MM-DD when the year is unknown" },
                "anniversary": { "type": "string", "description": "Same format" },
                "terms": { "type": "string", "enum": ["neutral", "feminine", "masculine"], "description": "Which relationship words to use for them; the default body shape of their character" },
                "pronouns": { "type": "string", "description": "e.g. she/her, they/them" },
                "genders": { "type": "array", "items": { "type": "string" }, "description": "Gender identities, free text (up to 10)" },
                "relationshipStatus": { "type": "string" },
                "tagline": { "type": "string" }, "bio": { "type": "string" }, "location": { "type": "string" },
                "color": { "type": "string", "enum": ["teal", "pink", "amber", "sky", "indigo", "violet", "emerald", "orange", "slate"] },
                "avatar": face_view("profile picture"), "cover": face_view("cover photo"),
                "faces": { "type": "object", "description": "Head views for the Places world: front, frontLeft, frontRight, left, right, back, up, sleeping, sleepingLeft, sleepingRight, down (each { base64 | url })",
                    "additionalProperties": face_view("head view") }
            }), &["name"]),
        tool("update_person", "Change a person's details, or replace their profile picture, cover photo or head views. Only the fields given change. Name the person exactly as in the journal, or give their profile id; `newName` renames them.",
            json!({
                "id": { "type": "string", "description": "Profile id (or use name)" },
                "name": { "type": "string", "description": "The person's name, exactly as in the journal" },
                "newName": { "type": "string" },
                "relationship": { "type": "string" }, "birthday": { "type": "string" }, "anniversary": { "type": "string" },
                "terms": { "type": "string", "enum": ["neutral", "feminine", "masculine"] }, "pronouns": { "type": "string" },
                "genders": { "type": "array", "items": { "type": "string" } }, "relationshipStatus": { "type": "string" },
                "tagline": { "type": "string" }, "bio": { "type": "string" }, "location": { "type": "string" }, "color": { "type": "string" },
                "avatar": face_view("profile picture"), "cover": face_view("cover photo"),
                "faces": { "type": "object", "additionalProperties": face_view("head view") }
            }), &[]),
        tool("set_person_faces", "Set the head images a person's character wears in the Places world: front, left, right and back, plus optional frontLeft and frontRight, and optional views for people lying down: `up` (face to the ceiling), `sleeping` (the same with eyes closed), `sleepingLeft` / `sleepingRight` (closed-eye profiles) and `down` (face turned down). Without an image a view falls back to the nearest one. `left` and `right` are 90° side profiles with the nose toward that edge of the image; `frontLeft` and `frontRight` are turned 45° that way (three-quarter views; the world's camera sees people at 45° most often). Name the person exactly as in the journal, or give their profile id; this tool returns nothing else about the journal.",
            json!({
                "id": { "type": "string", "description": "Profile id (or use name)" },
                "name": { "type": "string", "description": "The person's name, exactly as in the journal" },
                "front": face_view("front"), "frontLeft": face_view("45° left"), "frontRight": face_view("45° right"),
                "left": face_view("left"), "right": face_view("right"), "back": face_view("back"),
                "up": face_view("looking up at the ceiling (a person lying on their back), seen from above"), "sleeping": face_view("sleeping, eyes closed, lying on the back"),
                "sleepingLeft": face_view("sleeping profile, eyes closed, nose to the left"), "sleepingRight": face_view("sleeping profile, eyes closed, nose to the right"),
                "down": face_view("head turned down, face toward the bed")
            }), &[]),
        tool("set_person_character", "Set how a person looks in the Places world. Only the fields given change. Name the person exactly as in the journal, or give their profile id; this tool returns nothing else about the journal. `outfit` dresses them from a template; `wearing` lists the garments worn, bottom layer first; an empty list is the bare body, and nothing is required or restricted by gender, figure or age.",
            json!({
                "id": { "type": "string", "description": "Profile id (or use name)" },
                "name": { "type": "string", "description": "The person's name, exactly as in the journal" },
                "age": { "type": "string", "enum": ["child", "teen", "adult", "elder"] },
                "figure": { "type": "string", "enum": ["feminine", "masculine", "neutral"], "description": "Body shape only, never gender" },
                "anatomy": { "type": "string", "enum": ["auto", "none", "vulva", "penis"], "description": "Resting anatomy, rendered only on adult and elder bodies; auto follows the figure preset" },
                "build": { "type": "string", "enum": ["slim", "average", "broad"] },
                "skin": { "type": "string", "description": "#rrggbb; the Monk scale runs #f6ede4 #f3e7db #f7ead0 #eadaba #d7bd96 #a07e56 #825c43 #604134 #3a312a #292420" },
                "hair": { "type": "object", "properties": { "style": { "type": "string", "enum": ["short", "long", "bun", "curly", "bald"] }, "color": { "type": "string", "description": "#rrggbb" } } },
                "body": { "type": "object", "description": "Fine sliders over figure and build: shape 0 (feminine) … 1 (masculine); weight, muscle, height, bust -1 … 1",
                    "properties": { "shape": { "type": "number" }, "weight": { "type": "number" }, "muscle": { "type": "number" }, "height": { "type": "number" }, "bust": { "type": "number" } } },
                "outfit": { "type": "string", "enum": OUTFITS.iter().map(|(id, _)| *id).collect::<Vec<_>>() },
                "wearing": { "type": "array", "items": { "type": "object", "properties": {
                    "garment": { "type": "string", "description": "tee, fitted_tee, jeans, slim_jeans, a_line_skirt, shoes, underwear_vest, boxer_briefs, or any catalogue piece `<feminine|masculine|neutral>_<underwear|base|mid|outer|footwear|accessories>_<category>` such as feminine_underwear_bra. Any style fits any body." },
                    "color": { "type": "string", "description": "#rrggbb" } }, "required": ["garment", "color"] } },
                "glasses": { "type": "boolean" },
                "beard": { "type": "boolean" },
                "reset": { "type": "boolean", "description": "Forget the saved character (looks come from the profile again)" }
            }), &[]),
        tool("delete_page", "Move a page or shop (with its products and posts) to the user's Trash.", id.clone(), &["id"]),
        tool("list_products", "List products (metadata only).", json!({ "pageId": { "type": "string" }, "query": { "type": "string" }, "status": { "type": "string", "enum": ["available", "reserved", "sold"] } }), &[]),
        tool("get_product", "A product's metadata and photos.", id.clone(), &["id"]),
        tool("create_product", "Create a product in a shop (or a page that sells), with photos.",
            merge(&merge(&json!({ "pageId": { "type": "string" } }), &product_fields), &image_inputs), &["pageId", "name"]),
        tool("update_product", "Update a product. Only the fields given change; removePhotoIds drops photos.",
            merge(&merge(&id, &product_fields), &json!({ "removePhotoIds": { "type": "array", "items": { "type": "string" } } })), &["id"]),
        tool("add_product_photos", "Add photos to a product (up to 20 in total).", merge(&id, &image_inputs), &["id"]),
        tool("delete_product", "Move a product to the user's Trash.", id, &["id"]),
    ])
}

fn arg_str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str)
}

fn required_str<'a>(args: &'a Value, key: &str) -> Result<&'a str> {
    arg_str(args, key).filter(|s| !s.trim().is_empty()).ok_or_else(|| Error::Invalid(format!("Missing \"{key}\".")))
}

fn is_page(p: &Profile) -> bool {
    matches!(p.kind, ProfileKind::Page | ProfileKind::Shop)
}

fn page_of<'a>(ws: &'a Workspace, id: &str) -> Result<&'a Profile> {
    ws.profiles.get(id).or_else(|| ws.profiles.values().find(|p| p.merged_page_ids.iter().any(|old| old == id)))
        .filter(|p| is_page(p)).ok_or_else(|| Error::NotFound(format!("page {id}")))
}

/// A person (or the owner) by id, or by their exact name (ignoring case).
fn person_of(ws: &Workspace, id: Option<&str>, name: Option<&str>) -> Result<String> {
    if let Some(id) = id.filter(|id| !id.is_empty()) {
        return ws.profiles.get(id).filter(|p| p.is_person()).map(|p| p.id.clone()).ok_or_else(|| Error::NotFound(format!("person {id}")));
    }
    let name = name.map(str::trim).filter(|n| !n.is_empty()).ok_or_else(|| Error::Invalid("Give the person's id or name.".into()))?;
    let found: Vec<&Profile> = ws.profiles.values().filter(|p| p.is_person() && p.name.eq_ignore_ascii_case(name)).collect();
    match found.as_slice() {
        [p] => Ok(p.id.clone()),
        [] => Err(Error::NotFound(format!("No person named \"{name}\"."))),
        _ => Err(Error::Invalid(format!("More than one person is named \"{name}\"; give the profile id."))),
    }
}


// ── People ───────────────────────────────────────────────────────────────────

/// Every head view a person can have, with the photo slot that holds it (the app's `FACE_DEFS`).
const FACE_KEYS: [(&str, PhotoSlot); 11] = [
    ("front", PhotoSlot::FaceFront),
    ("frontLeft", PhotoSlot::FaceFrontLeft),
    ("frontRight", PhotoSlot::FaceFrontRight),
    ("left", PhotoSlot::FaceLeft),
    ("right", PhotoSlot::FaceRight),
    ("back", PhotoSlot::FaceBack),
    ("up", PhotoSlot::FaceUp),
    ("sleeping", PhotoSlot::FaceSleeping),
    ("sleepingLeft", PhotoSlot::FaceSleepingLeft),
    ("sleepingRight", PhotoSlot::FaceSleepingRight),
    ("down", PhotoSlot::FaceDown),
];

type Image = (String, Vec<u8>);

/// One image given as `{ base64, fileName }` or `{ url }`.
fn image_of(v: &Value, name: &str) -> Result<Image> {
    match v.get("url").and_then(Value::as_str) {
        Some(url) => fetch_image(url),
        None => Ok(collect_images(&json!({ "images": [{ "base64": v.get("base64").and_then(Value::as_str).unwrap_or(""), "fileName": v.get("fileName").and_then(Value::as_str).unwrap_or(name) }] }), "-", "images")?.remove(0)),
    }
}

/// The face views present in `src` (an object with the view names as keys), fetched and decoded.
fn face_images(src: &Value) -> Result<Vec<(&'static str, PhotoSlot, Image)>> {
    let mut views = Vec::new();
    for (key, slot) in FACE_KEYS {
        let Some(v) = src.get(key).filter(|v| !v.is_null()) else { continue };
        views.push((key, slot, image_of(v, key)?));
    }
    Ok(views)
}

/// Stages and attaches photos to a person: `(slot name, image)` pairs. Returns the slots set.
fn attach_photos(ws: &mut Workspace, person: &str, photos: Vec<(&str, PhotoSlot, Image)>) -> Result<Vec<String>> {
    let staged = stage_all(ws, photos.iter().map(|(_, _, img)| img.clone()).collect())?;
    let mut set = Vec::new();
    for ((key, slot, _), media) in photos.iter().zip(staged) {
        ws.set_profile_photo(person, *slot, Some(media))?;
        set.push((*key).to_string());
    }
    Ok(set)
}

/// The photos a create_person / update_person call carries: `avatar`, `cover` and `faces`.
fn person_photos(args: &Value) -> Result<Vec<(&'static str, PhotoSlot, Image)>> {
    let mut photos = Vec::new();
    for (key, slot) in [("avatar", PhotoSlot::Avatar), ("cover", PhotoSlot::Cover)] {
        if let Some(v) = args.get(key).filter(|v| !v.is_null()) {
            photos.push((key, slot, image_of(v, key)?));
        }
    }
    if let Some(faces) = args.get("faces").filter(|v| !v.is_null()) {
        photos.extend(face_images(faces)?);
    }
    Ok(photos)
}

fn apply_person_fields(input: &mut ProfileInput, args: &Value) -> Result<()> {
    let text = |key: &str| arg_str(args, key).map(|s| s.trim().to_string());
    if let Some(v) = text("name") { input.name = v; }
    if let Some(v) = text("relationship") { input.relationship = v; }
    if let Some(v) = text("tagline") { input.tagline = v; }
    if let Some(v) = text("bio") { input.bio = v; }
    if let Some(v) = text("location") { input.location = v; }
    if let Some(v) = text("birthday") { input.birthday = v; }
    if let Some(v) = text("anniversary") { input.anniversary = v; }
    if let Some(v) = text("pronouns") { input.pronouns = v; }
    if let Some(v) = text("relationshipStatus") { input.relationship_status = v; }
    if let Some(v) = text("color") { input.color = v; }
    if let Some(v) = text("terms") {
        if !["neutral", "feminine", "masculine"].contains(&v.as_str()) {
            return Err(Error::Invalid("terms must be neutral, feminine or masculine.".into()));
        }
        input.terms = v;
    }
    if let Some(list) = args.get("genders").and_then(Value::as_array) {
        input.genders = list.iter().filter_map(Value::as_str).map(str::to_string).collect();
    }
    Ok(())
}

fn person_summary(p: &Profile, set: Vec<String>) -> Value {
    json!({ "id": p.id, "name": p.name, "relationship": p.relationship, "photosSet": set })
}

// ── Characters (the Places world) ────────────────────────────────────────────

/// Garments and the slot each fills: src/lib/places/garments.ts (a test keeps them in step).
const GARMENTS: [(&str, &str); 8] = [("tee", "top"), ("fitted_tee", "top"), ("jeans", "bottom"), ("slim_jeans", "bottom"), ("a_line_skirt", "bottom"), ("shoes", "feet"), ("underwear_vest", "underwearTop"), ("boxer_briefs", "underwearBottom")];
const REGIONAL_GARMENTS: [(&str, &str); 9] = [
    ("feminine_base_saree_blouse", "top"), ("feminine_base_saree", "bottom"),
    ("feminine_base_osariya_blouse", "top"), ("feminine_base_osariya", "bottom"),
    ("feminine_base_hatte", "top"), ("feminine_base_redda", "bottom"),
    ("feminine_base_kameez", "top"), ("feminine_base_salwar", "bottom"),
    ("feminine_accessories_dupatta", "scarf"),
];

fn garment_slot(id: &str) -> Option<&'static str> {
    GARMENTS.iter().chain(REGIONAL_GARMENTS.iter()).find(|(g, _)| *g == id).map(|(_, slot)| *slot)
}

/// Catalogue garments are `<style>_<layer>_<category>` (clothingCatalog.ts), e.g. `masculine_underwear_bra`
/// never exists but `feminine_underwear_bra` does. Any style may be worn by any body.
fn catalogue_garment(id: &str) -> bool {
    let mut parts = id.splitn(3, '_');
    let (style, layer, category) = (parts.next().unwrap_or(""), parts.next().unwrap_or(""), parts.next().unwrap_or(""));
    ["feminine", "masculine", "neutral"].contains(&style)
        && ["underwear", "base", "mid", "outer", "footwear", "accessories"].contains(&layer)
        && !category.is_empty()
        && category.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}
const SKIRTS: [&str; 4] = ["a_line_skirt", "feminine_base_saree", "feminine_base_osariya", "feminine_base_redda"];

/// Outfit templates: src/lib/places/outfits/*.json.
const OUTFITS: [(&str, &str); 18] = [
    ("casual", include_str!("../../src/lib/places/outfits/casual.json")),
    ("weekend", include_str!("../../src/lib/places/outfits/weekend.json")),
    ("skirt-day", include_str!("../../src/lib/places/outfits/skirt-day.json")),
    ("school-skirt", include_str!("../../src/lib/places/outfits/school-skirt.json")),
    ("school-trousers", include_str!("../../src/lib/places/outfits/school-trousers.json")),
    ("at-home", include_str!("../../src/lib/places/outfits/at-home.json")),
    ("underwear", include_str!("../../src/lib/places/outfits/underwear.json")),
    ("sl-school-frock", include_str!("../../src/lib/places/outfits/sl-school-frock.json")),
    ("sl-school-shorts", include_str!("../../src/lib/places/outfits/sl-school-shorts.json")),
    ("sl-school-trousers", include_str!("../../src/lib/places/outfits/sl-school-trousers.json")),
    ("sl-school-white-shorts", include_str!("../../src/lib/places/outfits/sl-school-white-shorts.json")),
    ("layered-feminine", include_str!("../../src/lib/places/outfits/layered-feminine.json")),
    ("layered-masculine", include_str!("../../src/lib/places/outfits/layered-masculine.json")),
    ("layered-neutral", include_str!("../../src/lib/places/outfits/layered-neutral.json")),
    ("sl-saree", include_str!("../../src/lib/places/outfits/sl-saree.json")),
    ("sl-osariya", include_str!("../../src/lib/places/outfits/sl-osariya.json")),
    ("sl-redda-hatte", include_str!("../../src/lib/places/outfits/sl-redda-hatte.json")),
    ("sl-salwar-kameez", include_str!("../../src/lib/places/outfits/sl-salwar-kameez.json")),
];

fn is_hex(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

fn hex_arg(v: &Value, what: &str) -> Result<String> {
    v.as_str().filter(|s| is_hex(s)).map(str::to_lowercase).ok_or_else(|| Error::Invalid(format!("{what} must be a colour like #a07e56.")))
}

fn choice<'a>(v: &'a Value, key: &str, allowed: &[&str]) -> Result<&'a str> {
    v.as_str().filter(|s| allowed.contains(s)).ok_or_else(|| Error::Invalid(format!("{key} must be one of {}.", allowed.join(", "))))
}

/// A checked outfit: known garments, no two for the same slot. Nothing is required (an empty list is
/// the bare body) and nothing is restricted by figure, shape or age.
fn wearing_of(list: &Value) -> Result<Vec<Value>> {
    let items = list.as_array().ok_or_else(|| Error::Invalid("wearing is a list of { garment, color }.".into()))?;
    let mut slots = Vec::new();
    let mut ids = Vec::new();
    let mut out = Vec::new();
    for w in items {
        let id = w.get("garment").and_then(Value::as_str).unwrap_or("");
        let slot = garment_slot(id);
        if slot.is_none() && !catalogue_garment(id) {
            return Err(Error::Invalid(format!("Unknown garment \"{id}\".")));
        }
        if ids.contains(&id) || slot.is_some_and(|s| slots.contains(&s)) {
            return Err(Error::Invalid(format!("Two garments for the same slot: {id}.")));
        }
        ids.push(id);
        if let Some(slot) = slot {
            slots.push(slot);
        }
        out.push(json!({ "garment": id, "color": hex_arg(w.get("color").unwrap_or(&Value::Null), "A garment's color")? }));
    }
    Ok(out)
}

/// The character with `args` laid over it, and the fields that changed.
fn character_patch(current: Value, args: &Value) -> Result<(Value, Vec<&'static str>)> {
    let mut c = match current {
        Value::Object(map) => map,
        _ => Default::default(),
    };
    let mut set = Vec::new();
    let given = |key: &str| args.get(key).filter(|v| !v.is_null());
    for (key, allowed) in [("age", &["child", "teen", "adult", "elder"][..]), ("figure", &["feminine", "masculine", "neutral"]), ("build", &["slim", "average", "broad"]), ("anatomy", &["auto", "none", "vulva", "penis"])] {
        if let Some(v) = given(key) {
            c.insert(key.into(), json!(choice(v, key, allowed)?));
            set.push(key);
        }
    }
    if let Some(v) = given("skin") {
        c.insert("skin".into(), json!(hex_arg(v, "skin")?));
        set.push("skin");
    }
    if let Some(v) = given("hair") {
        let mut hair = c.get("hair").cloned().unwrap_or_else(|| json!({}));
        if let Some(style) = v.get("style") {
            hair["style"] = json!(choice(style, "hair.style", &["short", "long", "bun", "curly", "bald"])?);
        }
        if let Some(color) = v.get("color") {
            hair["color"] = json!(hex_arg(color, "hair.color")?);
        }
        c.insert("hair".into(), hair);
        set.push("hair");
    }
    if let Some(v) = given("body") {
        let mut body = c.get("body").cloned().unwrap_or_else(|| json!({}));
        for (key, min) in [("shape", 0.0), ("weight", -1.0), ("muscle", -1.0), ("height", -1.0), ("bust", -1.0)] {
            if let Some(n) = v.get(key).and_then(Value::as_f64) {
                body[key] = json!((n.clamp(min, 1.0) * 100.0).round() / 100.0);
            }
        }
        c.insert("body".into(), body);
        set.push("body");
    }
    for key in ["glasses", "beard"] {
        if let Some(b) = given(key).and_then(Value::as_bool) {
            c.insert(key.into(), json!(b));
            set.push(key);
        }
    }
    let wearing = if let Some(id) = given("outfit") {
        let id = id.as_str().unwrap_or("");
        let (_, file) = OUTFITS.iter().find(|(o, _)| *o == id).ok_or_else(|| Error::Invalid(format!("Unknown outfit \"{id}\".")))?;
        set.push("outfit");
        let template: Value = serde_json::from_str(file).expect("outfit templates are valid JSON");
        Some(wearing_of(&template["wearing"])?)
    } else if let Some(list) = given("wearing") {
        set.push("wearing");
        Some(wearing_of(list)?)
    } else {
        None
    };
    if let Some(wearing) = wearing {
        // The fields drawn faces, avatars and the box body still read.
        let in_slot = |slot: &str| wearing.iter().find(|w| w["garment"].as_str().and_then(garment_slot) == Some(slot)).cloned();
        if let Some(top) = in_slot("top") {
            c.insert("top".into(), top["color"].clone());
        }
        if let Some(bottom) = in_slot("bottom") {
            c.insert("bottom".into(), bottom["color"].clone());
            c.insert("skirt".into(), json!(SKIRTS.iter().any(|s| bottom["garment"] == *s)));
        }
        c.insert("wearing".into(), Value::Array(wearing));
    }
    Ok((Value::Object(c), set))
}

fn photo_json(m: &Option<MediaRef>) -> Value {
    m.as_ref().map_or(Value::Null, |m| json!({ "id": m.id, "name": m.name, "mime": m.mime, "size": m.size }))
}

fn page_json(ws: &Workspace, p: &Profile, full: bool) -> Value {
    let products: Vec<&Item> = ws.items.values().filter(|i| i.shop_id == p.id).collect();
    let mut v = json!({
        "id": p.id, "kind": p.kind, "name": p.name, "category": p.category, "tagline": p.tagline, "location": p.location,
        "sellsProducts": p.can_sell(), "sourceUrl": p.source_url, "sourceUrls": p.source_urls,
        "mergedPageIds": p.merged_page_ids, "productCount": products.len(),
        "hasProfilePicture": p.avatar.is_some(), "hasCover": p.cover.is_some(), "updatedAt": p.updated_at,
    });
    if full {
        v["bio"] = json!(p.bio);
        v["color"] = json!(p.color);
        v["profilePicture"] = photo_json(&p.avatar);
        v["cover"] = photo_json(&p.cover);
        v["products"] = products.iter().map(|i| json!({ "id": i.id, "name": i.name, "price": price(i), "currency": i.currency, "status": i.status })).collect();
    }
    v
}

fn price(i: &Item) -> Value {
    i.price_cents.map_or(Value::Null, |c| json!(c as f64 / 100.0))
}

fn product_json(ws: &Workspace, i: &Item) -> Value {
    json!({
        "id": i.id, "pageId": i.shop_id, "pageName": ws.profiles.get(&i.shop_id).map(|p| p.name.as_str()),
        "name": i.name, "description": i.description, "price": price(i), "currency": i.currency, "status": i.status,
        "sourceUrl": i.source_url,
        "photos": i.media.iter().map(|m| json!({ "id": m.id, "name": m.name, "mime": m.mime, "size": m.size, "kind": m.kind })).collect::<Vec<_>>(),
        "updatedAt": i.updated_at,
    })
}

fn profile_input(p: &Profile) -> ProfileInput {
    ProfileInput {
        id: Some(p.id.clone()),
        kind: p.kind,
        name: p.name.clone(),
        tagline: p.tagline.clone(),
        bio: p.bio.clone(),
        relationship: p.relationship.clone(),
        category: p.category.clone(),
        location: p.location.clone(),
        color: p.color.clone(),
        has_shop: p.has_shop,
        genders: p.genders.clone(),
        pronouns: p.pronouns.clone(),
        terms: p.terms.clone(),
        relationship_status: p.relationship_status.clone(),
        birthday: p.birthday.clone(),
        anniversary: p.anniversary.clone(),
        source_url: p.source_url.clone(),
    }
}

fn apply_page_fields(input: &mut ProfileInput, args: &Value) {
    let text = |key: &str| arg_str(args, key).map(|s| s.trim().to_string());
    if let Some(v) = text("name") {
        input.name = v;
    }
    if let Some(v) = text("category") {
        input.category = v;
    }
    if let Some(v) = text("tagline") {
        input.tagline = v;
    }
    if let Some(v) = text("bio") {
        input.bio = v;
    }
    if let Some(v) = text("location") {
        input.location = v;
    }
    if let Some(v) = text("sourceUrl") {
        input.source_url = v;
    }
    if let Some(v) = text("color") {
        input.color = v;
    }
    if let Some(v) = args.get("sellsProducts").and_then(Value::as_bool) {
        input.has_shop = v;
    }
}

fn parse_status(s: &str) -> Result<ItemStatus> {
    serde_json::from_value(json!(s)).map_err(|_| Error::Invalid(format!("Unknown status {s}.")))
}

fn normalise_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_lowercase()
}

/// Images an agent passed: URLs are downloaded here, outside the workspace lock.
fn collect_images(args: &Value, urls_key: &str, images_key: &str) -> Result<Vec<(String, Vec<u8>)>> {
    let mut out = Vec::new();
    for url in args.get(urls_key).and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str) {
        out.push(fetch_image(url)?);
    }
    for img in args.get(images_key).and_then(Value::as_array).into_iter().flatten() {
        let data = img.get("base64").and_then(Value::as_str).unwrap_or("");
        let data = data.split_once("base64,").map_or(data, |(_, d)| d); // allow data: URLs
        let bytes = B64.decode(data.trim()).map_err(|_| Error::Invalid("An image isn't valid base64.".into()))?;
        out.push((img.get("fileName").and_then(Value::as_str).unwrap_or("image").to_string(), bytes));
    }
    Ok(out)
}

/// Stages images (validates type and size); discards them all if one fails.
fn stage_all(ws: &mut Workspace, images: Vec<(String, Vec<u8>)>) -> Result<Vec<String>> {
    let mut ids = Vec::new();
    for (name, bytes) in images {
        match ws.stage_media(&name, bytes) {
            Ok(m) => ids.push(m.id),
            Err(e) => {
                ws.discard_media(&ids);
                return Err(e);
            }
        }
    }
    Ok(ids)
}

/// Runs a tool: `(result, summary for the activity log)`.
pub fn call_tool(state: &AppState, name: &str, args: &Value) -> Result<(Value, String)> {
    match name {
        "list_pages" => state.with_workspace(|ws| {
            let q = arg_str(args, "query").unwrap_or("").to_lowercase();
            let kind = arg_str(args, "kind");
            let mut pages: Vec<&Profile> = ws
                .profiles
                .values()
                .filter(|p| is_page(p))
                .filter(|p| kind.map_or(true, |k| serde_json::to_value(p.kind).ok().and_then(|v| v.as_str().map(|s| s == k)).unwrap_or(false)))
                .filter(|p| q.is_empty() || format!("{} {} {}", p.name, p.category, p.location).to_lowercase().contains(&q))
                .collect();
            pages.sort_by_key(|p| p.name.to_lowercase());
            let list: Vec<Value> = pages.iter().map(|p| page_json(ws, p, false)).collect();
            Ok((json!({ "pages": list }), format!("listed {} pages", pages.len())))
        }),
        "get_page" => state.with_workspace(|ws| {
            let p = page_of(ws, required_str(args, "id")?)?;
            Ok((page_json(ws, p, true), format!("read page \"{}\"", p.name)))
        }),
        "find_by_source_url" => state.with_workspace(|ws| {
            let url = normalise_url(required_str(args, "url")?);
            let pages: Vec<Value> = ws.profiles.values().filter(|p| is_page(p)
                && std::iter::once(&p.source_url).chain(&p.source_urls).any(|u| normalise_url(u) == url))
                .map(|p| page_json(ws, p, false)).collect();
            let products: Vec<Value> = ws.items.values().filter(|i| normalise_url(&i.source_url) == url).map(|i| product_json(ws, i)).collect();
            Ok((json!({ "pages": pages, "products": products }), format!("looked up {url}")))
        }),
        "merge_pages" => state.with_workspace(|ws| {
            let merged = ws.merge_pages(required_str(args, "sourceId")?, required_str(args, "targetId")?)?;
            let summary = format!("merged page {} into \"{}\" ({} products moved)", merged.source_id, merged.page.name, merged.moved_products);
            Ok((json!({ "page": page_json(ws, &merged.page, true), "sourceId": merged.source_id,
                "movedProducts": merged.moved_products, "note": "Only the old profile was moved to Trash; products and references were preserved." }), summary))
        }),
        "create_page" => {
            let avatar = arg_str(args, "avatarUrl").map(fetch_image).transpose()?;
            let cover = arg_str(args, "coverUrl").map(fetch_image).transpose()?;
            state.with_workspace(|ws| {
                let kind = match arg_str(args, "kind").unwrap_or("page") {
                    "shop" => ProfileKind::Shop,
                    "page" => ProfileKind::Page,
                    other => return Err(Error::Invalid(format!("Pages can be \"page\" or \"shop\", not \"{other}\"."))),
                };
                let mut input = ProfileInput {
                    id: None,
                    kind,
                    name: String::new(),
                    tagline: String::new(),
                    bio: String::new(),
                    relationship: String::new(),
                    category: String::new(),
                    location: String::new(),
                    color: if kind == ProfileKind::Shop { "amber".into() } else { "violet".into() },
                    has_shop: false,
                    genders: Vec::new(),
                    pronouns: String::new(),
                    terms: "neutral".into(),
                    relationship_status: String::new(),
                    birthday: String::new(),
                    anniversary: String::new(),
                    source_url: String::new(),
                };
                apply_page_fields(&mut input, args);
                let page = ws.save_profile(input)?;
                for (slot, image) in [(PhotoSlot::Avatar, avatar), (PhotoSlot::Cover, cover)] {
                    if let Some((name, bytes)) = image {
                        let staged = ws.stage_media(&name, bytes)?;
                        ws.set_profile_photo(&page.id, slot, Some(staged.id))?;
                    }
                }
                let page = &ws.profiles[&page.id];
                Ok((page_json(ws, page, true), format!("created page \"{}\"", page.name)))
            })
        }
        "update_page" => state.with_workspace(|ws| {
            let mut input = profile_input(page_of(ws, required_str(args, "id")?)?);
            apply_page_fields(&mut input, args);
            let page = ws.save_profile(input)?;
            Ok((page_json(ws, &page, true), format!("updated page \"{}\"", page.name)))
        }),
        "set_place_layout" => state.with_workspace(|ws| {
            let page = page_of(ws, required_str(args, "id")?)?;
            let layout = match args.get("layout") {
                None | Some(Value::Null) => None,
                Some(layout) => Some(layout.clone()),
            };
            let page = ws.set_profile_layout(&page.id.clone(), layout)?;
            Ok((page_json(ws, &page, true), format!("set the layout of \"{}\"", page.name)))
        }),
        "set_person_faces" => {
            let views = face_images(args)?;
            if views.is_empty() {
                return Err(Error::Invalid("Give at least one view: front, frontLeft, frontRight, left, right, back, up, sleeping, sleepingLeft, sleepingRight or down.".into()));
            }
            state.with_workspace(|ws| {
                let person = person_of(ws, arg_str(args, "id"), arg_str(args, "name"))?;
                let set = attach_photos(ws, &person, views)?;
                let p = &ws.profiles[&person];
                Ok((json!({ "id": p.id, "name": p.name, "set": set }), format!("set {} face view(s) of \"{}\"", set.len(), p.name)))
            })
        }
        "create_person" => {
            let photos = person_photos(args)?;
            state.with_workspace(|ws| {
                let mut input = ProfileInput {
                    id: None, kind: ProfileKind::Person, name: String::new(), tagline: String::new(), bio: String::new(),
                    relationship: String::new(), category: String::new(), location: String::new(), color: "teal".into(), has_shop: false,
                    genders: Vec::new(), pronouns: String::new(), terms: "neutral".into(), relationship_status: String::new(),
                    birthday: String::new(), anniversary: String::new(), source_url: String::new(),
                };
                apply_person_fields(&mut input, args)?;
                if let Some(same) = ws.profiles.values().find(|p| p.is_person() && p.name.eq_ignore_ascii_case(input.name.trim())) {
                    return Err(Error::Invalid(format!("\"{}\" already exists (id {}). Use update_person to change them.", same.name, same.id)));
                }
                let person = ws.save_profile(input)?;
                let set = attach_photos(ws, &person.id, photos)?;
                let p = &ws.profiles[&person.id];
                Ok((person_summary(p, set), format!("added the person \"{}\"", p.name)))
            })
        }
        "update_person" => {
            let photos = person_photos(args)?;
            state.with_workspace(|ws| {
                let id = person_of(ws, arg_str(args, "id"), arg_str(args, "name"))?;
                let mut input = profile_input(&ws.profiles[&id]);
                // A name only identifies the person unless `newName` renames them.
                let rename = arg_str(args, "newName").map(|s| s.trim().to_string());
                let mut fields = args.clone();
                if let Some(obj) = fields.as_object_mut() { obj.remove("name"); }
                apply_person_fields(&mut input, &fields)?;
                if let Some(n) = rename { input.name = n; }
                let person = ws.save_profile(input)?;
                let set = attach_photos(ws, &person.id, photos)?;
                let p = &ws.profiles[&person.id];
                Ok((person_summary(p, set), format!("updated the person \"{}\"", p.name)))
            })
        }
        "set_person_character" => state.with_workspace(|ws| {
            let person = person_of(ws, arg_str(args, "id"), arg_str(args, "name"))?;
            let name = ws.profiles[&person].name.clone();
            if args.get("reset").and_then(Value::as_bool) == Some(true) {
                ws.set_profile_character(&person, None)?;
                return Ok((json!({ "id": person, "name": name, "reset": true }), format!("reset the character of \"{name}\"")));
            }
            let current = ws.profiles[&person].character.clone().unwrap_or_else(|| json!({}));
            let (character, set) = character_patch(current, args)?;
            if set.is_empty() {
                return Err(Error::Invalid("Give at least one field to set.".into()));
            }
            ws.set_profile_character(&person, Some(character))?;
            Ok((json!({ "id": person, "name": name, "set": set }), format!("set the character of \"{name}\" ({})", set.join(", "))))
        }),
        "set_page_photo" => {
            let slot = match required_str(args, "slot")? {
                "avatar" => PhotoSlot::Avatar,
                "cover" => PhotoSlot::Cover,
                other => return Err(Error::Invalid(format!("slot must be avatar or cover, not {other}."))),
            };
            let remove = args.get("remove").and_then(Value::as_bool).unwrap_or(false);
            let image = if remove {
                None
            } else if let Some(url) = arg_str(args, "imageUrl") {
                Some(fetch_image(url)?)
            } else {
                let images = collect_images(&json!({ "images": [{ "base64": arg_str(args, "imageBase64").unwrap_or(""), "fileName": arg_str(args, "fileName").unwrap_or("image") }] }), "-", "images")?;
                images.into_iter().next()
            };
            state.with_workspace(|ws| {
                let id = page_of(ws, required_str(args, "id")?)?.id.clone();
                let media = match image {
                    Some((name, bytes)) => Some(ws.stage_media(&name, bytes)?.id),
                    None => None,
                };
                let page = ws.set_profile_photo(&id, slot, media)?;
                Ok((page_json(ws, &page, true), format!("{} photo of \"{}\"", if remove { "removed a" } else { "set a" }, page.name)))
            })
        }
        "delete_page" => state.with_workspace(|ws| {
            let page = page_of(ws, required_str(args, "id")?)?.clone();
            ws.delete_profile(&page.id)?;
            Ok((json!({ "trashed": page.id, "note": "Moved to the user's Trash with its products and posts." }), format!("moved page \"{}\" to the Trash", page.name)))
        }),
        "list_products" => state.with_workspace(|ws| {
            let q = arg_str(args, "query").unwrap_or("").to_lowercase();
            let page = arg_str(args, "pageId");
            let status = arg_str(args, "status").map(parse_status).transpose()?;
            let mut items: Vec<&Item> = ws
                .items
                .values()
                .filter(|i| page.map_or(true, |p| i.shop_id == p))
                .filter(|i| status.map_or(true, |s| i.status == s))
                .filter(|i| q.is_empty() || format!("{} {}", i.name, i.description).to_lowercase().contains(&q))
                .collect();
            items.sort_by_key(|i| i.name.to_lowercase());
            let list: Vec<Value> = items.iter().map(|i| product_json(ws, i)).collect();
            Ok((json!({ "products": list }), format!("listed {} products", items.len())))
        }),
        "get_product" => state.with_workspace(|ws| {
            let item = ws.items.get(required_str(args, "id")?).ok_or_else(|| Error::NotFound("product".into()))?;
            Ok((product_json(ws, item), format!("read product \"{}\"", item.name)))
        }),
        "create_product" => {
            let images = collect_images(args, "imageUrls", "images")?;
            state.with_workspace(|ws| {
                let shop = page_of(ws, required_str(args, "pageId")?)?.id.clone();
                let media_ids = stage_all(ws, images)?;
                let input = ItemInput {
                    id: None,
                    shop_id: shop,
                    name: required_str(args, "name")?.to_string(),
                    description: arg_str(args, "description").unwrap_or("").to_string(),
                    price_cents: args.get("price").and_then(Value::as_f64).map(|p| (p * 100.0).round() as i64),
                    currency: arg_str(args, "currency").unwrap_or("").to_string(),
                    status: arg_str(args, "status").map(parse_status).transpose()?.unwrap_or(ItemStatus::Available),
                    media_ids: media_ids.clone(),
                    source_url: arg_str(args, "sourceUrl").unwrap_or("").to_string(),
                };
                match ws.save_item(input) {
                    Ok(item) => Ok((product_json(ws, &item), format!("created product \"{}\" ({} photos)", item.name, item.media.len()))),
                    Err(e) => {
                        ws.discard_media(&media_ids);
                        Err(e)
                    }
                }
            })
        }
        "update_product" | "add_product_photos" => {
            let images = collect_images(args, "imageUrls", "images")?;
            state.with_workspace(|ws| {
                let item = ws.items.get(required_str(args, "id")?).cloned().ok_or_else(|| Error::NotFound("product".into()))?;
                let remove: Vec<&str> = args.get("removePhotoIds").and_then(Value::as_array).into_iter().flatten().filter_map(Value::as_str).collect();
                let added = stage_all(ws, images)?;
                let media_ids: Vec<String> = item.media.iter().map(|m| m.id.clone()).filter(|id| !remove.contains(&id.as_str())).chain(added.iter().cloned()).collect();
                let input = ItemInput {
                    id: Some(item.id.clone()),
                    shop_id: item.shop_id.clone(),
                    name: arg_str(args, "name").map_or(item.name.clone(), str::to_string),
                    description: arg_str(args, "description").map_or(item.description.clone(), str::to_string),
                    price_cents: match args.get("price") {
                        Some(Value::Null) => None,
                        Some(p) => p.as_f64().map(|p| (p * 100.0).round() as i64).or(item.price_cents),
                        None => item.price_cents,
                    },
                    currency: arg_str(args, "currency").map_or(item.currency.clone(), str::to_string),
                    status: arg_str(args, "status").map(parse_status).transpose()?.unwrap_or(item.status),
                    media_ids,
                    source_url: arg_str(args, "sourceUrl").unwrap_or("").to_string(),
                };
                match ws.save_item(input) {
                    Ok(saved) => Ok((product_json(ws, &saved), format!("updated product \"{}\" (+{} photos)", saved.name, added.len()))),
                    Err(e) => {
                        ws.discard_media(&added);
                        Err(e)
                    }
                }
            })
        }
        "delete_product" => state.with_workspace(|ws| {
            let item = ws.items.get(required_str(args, "id")?).cloned().ok_or_else(|| Error::NotFound("product".into()))?;
            ws.delete_item(&item.id)?;
            Ok((json!({ "trashed": item.id, "note": "Moved to the user's Trash." }), format!("moved product \"{}\" to the Trash", item.name)))
        }),
        _ => Err(Error::Invalid(format!("Unknown tool {name}."))),
    }
}

// ---- Fetching images ----

/// Refuses loopback, private, link-local and other non-public addresses, so an
/// agent can't make the app reach into the local network.
fn public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => !(v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast() || v4.is_documentation() || v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64),
        IpAddr::V6(v6) => {
            let seg = v6.segments();
            !(v6.is_loopback() || v6.is_unspecified() || (seg[0] & 0xfe00) == 0xfc00 || (seg[0] & 0xffc0) == 0xfe80 || v6.to_ipv4_mapped().is_some_and(|v4| !public_ip(IpAddr::V4(v4))))
        }
    }
}

fn check_url(url: &str) -> Result<()> {
    let rest = url.strip_prefix("https://").or_else(|| url.strip_prefix("http://")).ok_or_else(|| Error::Invalid("Image URLs must be http(s).".into()))?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or("");
    let default_port = if url.starts_with("https") { 443 } else { 80 };
    let addrs: Vec<_> = if host_port.starts_with('[') || host_port.contains(':') && host_port.matches(':').count() == 1 {
        host_port.to_socket_addrs().map_err(|_| Error::Invalid(format!("Can't resolve {host_port}.")))?.collect()
    } else {
        (host_port, default_port).to_socket_addrs().map_err(|_| Error::Invalid(format!("Can't resolve {host_port}.")))?.collect()
    };
    if addrs.is_empty() || addrs.iter().any(|a| !public_ip(a.ip())) {
        return Err(Error::Invalid(format!("{host_port} isn't a public address.")));
    }
    Ok(())
}

/// Resolves a redirect `Location` against the URL that sent it.
fn join_url(base: &str, location: &str) -> String {
    let location = location.trim();
    if location.starts_with("http://") || location.starts_with("https://") {
        return location.to_string();
    }
    let scheme_end = base.find("://").map_or(0, |i| i + 3);
    let scheme = &base[..scheme_end.saturating_sub(3)];
    if let Some(rest) = location.strip_prefix("//") {
        return format!("{scheme}://{rest}");
    }
    let origin_end = base[scheme_end..].find('/').map_or(base.len(), |i| scheme_end + i);
    let origin = &base[..origin_end];
    if location.starts_with('/') {
        return format!("{origin}{location}");
    }
    let path = base[origin_end..].split(['?', '#']).next().unwrap_or("");
    let dir = path.rfind('/').map_or("/", |i| &path[..=i]);
    format!("{origin}{dir}{location}")
}

/// Downloads an image (following up to 5 redirects, each checked). Returns `(file name, bytes)`.
pub fn fetch_image(url: &str) -> Result<(String, Vec<u8>)> {
    let agent = ureq::AgentBuilder::new().redirects(0).timeout(Duration::from_secs(30)).build();
    let mut current = url.trim().to_string();
    for _ in 0..6 {
        check_url(&current)?;
        let response = match agent.get(&current).set("User-Agent", "MyDiary/1.0 (image import)").call() {
            Ok(r) => r,
            Err(ureq::Error::Status(code, r)) if (300..400).contains(&code) => r,
            Err(ureq::Error::Status(code, _)) => return Err(Error::Invalid(format!("{current} answered HTTP {code}."))),
            Err(e) => return Err(Error::Invalid(format!("Couldn't fetch {current}: {e}"))),
        };
        if (300..400).contains(&response.status()) {
            let next = response.header("location").ok_or_else(|| Error::Invalid("A redirect without a location.".into()))?;
            current = join_url(&current, next);
            continue;
        }
        let mut bytes = Vec::new();
        response.into_reader().take(MAX_DOWNLOAD + 1).read_to_end(&mut bytes)?;
        if bytes.len() as u64 > MAX_DOWNLOAD {
            return Err(Error::Invalid(format!("{current} is larger than 25 MB.")));
        }
        let name = current.split(['?', '#']).next().unwrap_or("").rsplit('/').next().filter(|n| !n.is_empty()).unwrap_or("image").to_string();
        return Ok((name, bytes));
    }
    Err(Error::Invalid("Too many redirects.".into()))
}

// ---- HTTP server ----

/// A running endpoint; stops when dropped or stopped.
pub struct McpServer {
    server: Arc<tiny_http::Server>,
    pub port: u16,
}

impl McpServer {
    pub fn stop(&self) {
        self.server.unblock();
    }
}

impl Drop for McpServer {
    fn drop(&mut self) {
        self.server.unblock();
    }
}

/// Runs a closure against the app state (Tauri's managed state, or a test's).
pub type WithState = Box<dyn Fn(&mut dyn FnMut(&AppState)) + Send + 'static>;

/// Starts the endpoint on 127.0.0.1:`port` (0 picks a free one). The state is
/// reached per request, so the server never holds the workspace itself.
pub fn start(port: u16, with_state: WithState) -> Result<McpServer> {
    let server = Arc::new(tiny_http::Server::http(("127.0.0.1", port)).map_err(|e| Error::Invalid(format!("Can't listen on port {port}: {e}")))?);
    let port = server.server_addr().to_ip().map_or(port, |a| a.port());
    let worker = server.clone();
    std::thread::Builder::new()
        .name("mcp".into())
        .spawn(move || {
            for request in worker.incoming_requests() {
                let mut request = Some(request);
                with_state(&mut |state| {
                    if let Some(r) = request.take() {
                        respond(state, port, r);
                    }
                });
            }
        })?;
    Ok(McpServer { server, port })
}

fn reply(request: tiny_http::Request, status: u16, body: &str, extra: &[(&str, &str)]) {
    let mut response = tiny_http::Response::from_string(body).with_status_code(status);
    for (k, v) in [("Content-Type", "application/json"), ("Cache-Control", "no-store")].iter().chain(extra.iter()) {
        if let Ok(h) = tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()) {
            response = response.with_header(h);
        }
    }
    let _ = request.respond(response);
}

fn header<'a>(request: &'a tiny_http::Request, name: &'static str) -> Option<&'a str> {
    request.headers().iter().find(|h| h.field.equiv(name)).map(|h| h.value.as_str())
}

fn respond(state: &AppState, port: u16, mut request: tiny_http::Request) {
    // DNS-rebinding guard: only our own host names.
    let host_ok = header(&request, "Host").is_some_and(|h| h == format!("127.0.0.1:{port}") || h == format!("localhost:{port}"));
    if !host_ok {
        return reply(request, 403, r#"{"error":"Forbidden host"}"#, &[]);
    }
    if request.url().split('?').next() != Some("/mcp") {
        return reply(request, 404, r#"{"error":"Not found. The endpoint is /mcp"}"#, &[]);
    }
    if *request.method() != tiny_http::Method::Post {
        return reply(request, 405, r#"{"error":"Use POST"}"#, &[("Allow", "POST")]);
    }
    // Authorisation: the workspace must be unlocked, agent access on, and the token right.
    let expected = state.with_workspace(|ws| Ok(ws.manifest.agent.clone().filter(|a| a.enabled).map(|a| a.token)));
    let token = header(&request, "Authorization").and_then(|v| v.strip_prefix("Bearer ")).unwrap_or("").trim().to_string();
    match expected {
        Err(_) => return reply(request, 503, r#"{"error":"My Diary is locked. Unlock the journal to let agents in."}"#, &[]),
        Ok(None) => return reply(request, 403, r#"{"error":"Agent access is turned off in My Diary's Settings."}"#, &[]),
        Ok(Some(expected)) if !same(&token, &expected) => return reply(request, 401, r#"{"error":"Invalid token"}"#, &[("WWW-Authenticate", "Bearer")]),
        Ok(Some(_)) => {}
    }
    let mut body = String::new();
    if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
        return reply(request, 400, r#"{"error":"Unreadable body"}"#, &[]);
    }
    let message: Value = match serde_json::from_str(&body) {
        Ok(v) => v,
        Err(_) => return reply(request, 400, &json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32700, "message": "Parse error" } }).to_string(), &[]),
    };
    match handle_message(state, &message) {
        Some(response) => reply(request, 200, &response.to_string(), &[]),
        None => reply(request, 202, "", &[]),
    }
}

// ---- stdio bridge ----

/// `my-diary --mcp-stdio`: relays newline-delimited JSON-RPC between stdio and
/// the app's HTTP endpoint, for agents that launch MCP servers as commands.
pub fn stdio_bridge() {
    let url = std::env::var("MY_DIARY_MCP_URL").unwrap_or_else(|_| format!("http://127.0.0.1:{DEFAULT_PORT}/mcp"));
    let token = std::env::var("MY_DIARY_MCP_TOKEN").unwrap_or_default();
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(300)).build();
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let id = serde_json::from_str::<Value>(&line).ok().and_then(|v| v.get("id").cloned());
        let out = match agent.post(&url).set("Content-Type", "application/json").set("Authorization", &format!("Bearer {token}")).send_string(&line) {
            Ok(r) if r.status() == 202 => None,
            Ok(r) => r.into_string().ok(),
            Err(ureq::Error::Status(_, r)) => {
                let message = r.into_string().ok().and_then(|b| serde_json::from_str::<Value>(&b).ok()).and_then(|v| v["error"].as_str().map(str::to_owned));
                id.clone().map(|id| json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": message.unwrap_or_else(|| "My Diary refused the request.".into()) } }).to_string())
            }
            Err(_) => id.clone().map(|id| {
                json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": "Can't reach My Diary. Open the app, unlock the journal and turn on Agent access in Settings." } }).to_string()
            }),
        };
        if let Some(out) = out.filter(|o| !o.trim().is_empty()) {
            // One message per line: compact any pretty-printed body.
            let compact = serde_json::from_str::<Value>(&out).map(|v| v.to_string()).unwrap_or(out);
            let _ = writeln!(stdout, "{compact}");
            let _ = stdout.flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::{self, KdfCost};

    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };
    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n0000000000000000";

    fn unlocked() -> (tempfile::TempDir, Arc<AppState>) {
        let root = tempfile::tempdir().unwrap();
        let mut ws = store::create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        ws.save_agent_access(Some(AgentAccess { enabled: true, port: 0, token: "t".repeat(64) })).unwrap();
        let state = Arc::new(AppState::new(root.path().to_path_buf()));
        *state.workspace.lock().unwrap() = Some(ws);
        (root, state)
    }

    fn call(state: &AppState, tool: &str, args: Value) -> (Value, bool) {
        let msg = json!({ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": tool, "arguments": args } });
        let r = handle_message(state, &msg).unwrap();
        (r["result"]["structuredContent"].clone(), r["result"]["isError"].as_bool().unwrap())
    }

    #[test]
    fn people_are_added_and_updated_with_photos_and_faces() {
        let (_root, state) = unlocked();
        let img = json!({ "base64": B64.encode(PNG), "fileName": "p.png" });
        let (out, err) = call(&state, "create_person", json!({
            "name": "Maya Perera", "relationship": "Sister", "birthday": "1990-04-12", "terms": "feminine", "pronouns": "she/her",
            "avatar": img.clone(), "cover": img.clone(), "faces": { "front": img.clone(), "sleeping": img.clone(), "down": img.clone() }
        }));
        assert!(!err, "{out}");
        assert_eq!(out["name"], "Maya Perera");
        assert_eq!(out["photosSet"], json!(["avatar", "cover", "front", "sleeping", "down"]));
        let id = out["id"].as_str().unwrap().to_string();
        state.with_workspace(|ws| {
            let p = &ws.profiles[&id];
            assert_eq!((p.kind, p.relationship.as_str(), p.birthday.as_str(), p.terms.as_str()), (ProfileKind::Person, "Sister", "1990-04-12", "feminine"));
            assert!(p.avatar.is_some() && p.cover.is_some() && p.faces.front.is_some() && p.faces.sleeping.is_some() && p.faces.down.is_some() && p.faces.back.is_none());
            Ok(())
        }).unwrap();

        let (_, err) = call(&state, "create_person", json!({ "name": "maya perera" }));
        assert!(err, "a second person with the same name is refused");
        let (_, err) = call(&state, "create_person", json!({ "name": "Bad Date", "birthday": "not a date" }));
        assert!(err, "dates are validated");
        let (_, err) = call(&state, "create_person", json!({ "name": "Bad Terms", "terms": "robot" }));
        assert!(err);
        state.with_workspace(|ws| { assert!(!ws.profiles.values().any(|p| p.name == "Bad Date" || p.name == "Bad Terms")); Ok(()) }).unwrap();

        let (out, err) = call(&state, "update_person", json!({ "name": "MAYA PERERA", "relationship": "Best friend", "newName": "Maya P.", "faces": { "left": img.clone() } }));
        assert!(!err, "{out}");
        assert_eq!(out["name"], "Maya P.");
        assert_eq!(out["photosSet"], json!(["left"]));
        state.with_workspace(|ws| {
            let p = &ws.profiles[&id];
            assert_eq!((p.relationship.as_str(), p.birthday.as_str()), ("Best friend", "1990-04-12"), "unmentioned fields are kept");
            assert!(p.faces.left.is_some() && p.faces.front.is_some() && p.avatar.is_some());
            Ok(())
        }).unwrap();
        let (_, err) = call(&state, "update_person", json!({ "name": "Nobody", "bio": "x" }));
        assert!(err);
    }

    #[test]
    fn face_views_go_to_a_named_person_and_reveal_nothing_else() {
        let (_root, state) = unlocked();
        let june = state.with_workspace(|ws| {
            let input = ProfileInput { kind: ProfileKind::Person, name: "June Morgan".into(), bio: "private".into(), ..profile_input(&ws.profiles[ws.owner_id()].clone()) };
            let input = ProfileInput { id: None, ..input };
            ws.save_profile(input)
        }).unwrap();
        let img = json!({ "base64": B64.encode(PNG), "fileName": "front.png" });

        let (out, err) = call(&state, "set_person_faces", json!({ "name": "june morgan", "front": img.clone(), "frontRight": img.clone(), "left": img.clone() }));
        assert!(!err, "{out}");
        assert_eq!(out, json!({ "id": june.id, "name": "June Morgan", "set": ["front", "frontRight", "left"] }), "only what was set");
        state.with_workspace(|ws| {
            let p = &ws.profiles[&june.id];
            assert!(p.faces.front.is_some() && p.faces.front_right.is_some() && p.faces.left.is_some() && p.faces.front_left.is_none() && p.faces.back.is_none());
            assert!(serde_json::to_value(&p.faces).unwrap().get("frontRight").is_some(), "camelCase for the app");
            Ok(())
        }).unwrap();

        let (_, err) = call(&state, "set_person_faces", json!({ "name": "Nobody", "front": img.clone() }));
        assert!(err, "unknown names are refused");
        let (page, _) = call(&state, "create_page", json!({ "name": "River & Rose", "kind": "shop" }));
        let (_, err) = call(&state, "set_person_faces", json!({ "id": page["id"], "front": img.clone() }));
        assert!(err, "pages have no faces");
        let (_, err) = call(&state, "set_person_faces", json!({ "name": "June Morgan" }));
        assert!(err, "at least one view");
    }

    #[test]
    fn anatomy_patch_is_independent_of_figure_and_preserves_other_fields() {
        let original = json!({ "figure": "feminine", "age": "adult", "anatomy": "auto", "skin": "#825c43" });
        for anatomy in ["auto", "none", "vulva", "penis"] {
            let (patched, fields) = character_patch(original.clone(), &json!({ "anatomy": anatomy })).unwrap();
            assert_eq!(patched["anatomy"], anatomy);
            assert_eq!(patched["figure"], original["figure"]);
            assert_eq!(patched["skin"], original["skin"]);
            assert_eq!(fields, vec!["anatomy"]);
        }
        assert!(character_patch(original, &json!({ "anatomy": "unknown" })).is_err());
    }

    #[test]
    fn characters_change_only_what_is_given_and_reveal_nothing_else() {
        let (_root, state) = unlocked();
        let june = state.with_workspace(|ws| {
            let input = ProfileInput { id: None, kind: ProfileKind::Person, name: "June Morgan".into(), bio: "private".into(), ..profile_input(&ws.profiles[ws.owner_id()].clone()) };
            ws.save_profile(input)
        }).unwrap();

        let (out, err) = call(&state, "set_person_character", json!({ "name": "june morgan", "age": "elder", "outfit": "skirt-day", "hair": { "style": "bun" } }));
        assert!(!err, "{out}");
        assert_eq!(out, json!({ "id": june.id, "name": "June Morgan", "set": ["age", "hair", "outfit"] }), "only what was set");
        let (out, err) = call(&state, "set_person_character", json!({ "id": june.id, "body": { "weight": 3, "bust": 0.25 }, "skin": "#D7BD96" }));
        assert!(!err, "{out}");
        let c = state.with_workspace(|ws| Ok(ws.profiles[&june.id].character.clone().unwrap())).unwrap();
        assert_eq!(c["age"], "elder", "earlier fields stay");
        assert_eq!((c["hair"]["style"].as_str(), c["skin"].as_str()), (Some("bun"), Some("#d7bd96")));
        assert_eq!(c["body"], json!({ "weight": 1.0, "bust": 0.25 }), "sliders are clamped");
        assert_eq!((c["wearing"][1]["garment"].as_str(), c["skirt"].as_bool(), c["bottom"].as_str()), (Some("a_line_skirt"), Some(true), Some("#db2777")), "outfit and the fields it implies");

        for (bad, why) in [
            (json!({ "name": "June Morgan", "wearing": [{ "garment": "tee", "color": "#ffffff" }, { "garment": "fitted_tee", "color": "#ffffff" }] }), "two for a slot"),
            (json!({ "name": "June Morgan", "wearing": [{ "garment": "tee", "color": "#fff" }, { "garment": "jeans", "color": "#000000" }] }), "colour"),
            (json!({ "name": "June Morgan", "wearing": [{ "garment": "cape", "color": "#ffffff" }] }), "unknown garment"),
            (json!({ "name": "June Morgan", "outfit": "ballgown" }), "unknown outfit"),
            (json!({ "name": "June Morgan", "age": "ancient" }), "bad age"),
            (json!({ "name": "June Morgan" }), "nothing to set"),
            (json!({ "name": "Nobody", "age": "adult" }), "unknown person"),
        ] {
            let (_, err) = call(&state, "set_person_character", bad);
            assert!(err, "{why}");
        }
        let (_, err) = call(&state, "set_person_character", json!({ "name": "June Morgan", "reset": true }));
        assert!(!err);
        assert!(state.with_workspace(|ws| Ok(ws.profiles[&june.id].character.clone())).unwrap().is_none());
    }

    #[test]
    fn garments_and_outfits_match_the_app() {
        let root = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/places");
        let ts = std::fs::read_to_string(format!("{root}/garments.ts")).unwrap();
        for (id, slot) in GARMENTS {
            let line = ts.lines().find(|l| l.contains(&format!("(\"{id}\",")) || l.contains(&format!("id: \"{id}\""))).unwrap_or_else(|| panic!("{id} in garments.ts"));
            assert!(line.contains(&format!("\"{slot}\"")), "{id} is a {slot}");
        }
        let files: Vec<String> = std::fs::read_dir(format!("{root}/outfits")).unwrap().filter_map(|e| e.ok()?.file_name().into_string().ok()).filter(|n| n.ends_with(".json")).collect();
        assert_eq!(files.len(), OUTFITS.len(), "every outfit file is known here");
        for (id, file) in OUTFITS {
            assert!(files.contains(&format!("{id}.json")));
            let template: Value = serde_json::from_str(file).unwrap();
            wearing_of(&template["wearing"]).unwrap_or_else(|e| panic!("{id}: {e}"));
        }
    }

    #[test]
    fn sri_lankan_outfits_keep_regional_slots_and_legacy_colours_in_sync() {
        let ts = include_str!("../../src/lib/places/sriLankanClothing.ts");
        for (id, slot) in REGIONAL_GARMENTS {
            let line = ts.lines().find(|line| line.contains(&format!("id: \"{id}\""))).unwrap();
            assert!(line.contains(&format!("slot: \"{slot}\"")));
        }
        let (character, _) = character_patch(json!({}), &json!({ "outfit": "sl-saree" })).unwrap();
        assert_eq!(character["top"], "#7f1d1d");
        assert_eq!(character["bottom"], "#b91c1c");
        assert_eq!(character["skirt"], true);
        let (character, _) = character_patch(character, &json!({ "outfit": "sl-salwar-kameez" })).unwrap();
        assert_eq!(character["top"], "#6d28d9");
        assert_eq!(character["skirt"], false);
        assert!(wearing_of(&json!([
            { "garment": "feminine_base_saree", "color": "#ffffff" },
            { "garment": "feminine_base_redda", "color": "#ffffff" }
        ])).is_err());
    }

    #[test]
    fn protocol_basics() {
        let (_root, state) = unlocked();
        let init = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": PROTOCOL_VERSION } })).unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "my-diary");
        assert!(handle_message(&state, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none(), "notifications get no reply");
        let tools = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).unwrap();
        let names: Vec<&str> = tools["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"create_product") && names.contains(&"add_product_photos"));
        // Pages and products, plus write-only tools for people: nothing lists or reads them back.
        assert!(names.iter().all(|n| !n.contains("post") && (!n.contains("person") || ["set_person_", "create_person", "update_person"].iter().any(|w| n.starts_with(w))) && !n.contains("trash")), "pages and products only: {names:?}");
        let unknown = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list" })).unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
    }

    #[test]
    fn merge_pages_tool_preserves_ids_resolves_old_urls_and_stays_in_scope() {
        let (_root, state) = unlocked();
        let (source, err) = call(&state, "create_page", json!({ "name": "Duplicate", "kind": "shop", "sourceUrl": "https://india.example/" }));
        assert!(!err);
        let (target, err) = call(&state, "create_page", json!({ "name": "Keep", "kind": "shop", "sourceUrl": "https://lk.example/" }));
        assert!(!err);
        let (product, err) = call(&state, "create_product", json!({ "pageId": source["id"], "name": "Bra", "price": 695, "currency": "INR", "images": [{ "base64": B64.encode(PNG) }] }));
        assert!(!err);
        let (merged, err) = call(&state, "merge_pages", json!({ "sourceId": source["id"], "targetId": target["id"] }));
        assert!(!err, "{merged}");
        assert_eq!(merged["movedProducts"], 1);
        assert_eq!(merged["page"]["id"], target["id"]);
        assert_eq!(merged["page"]["productCount"], 1);
        assert!(merged.get("posts").is_none());
        assert!(merged["page"].get("relations").is_none());
        let (after, err) = call(&state, "get_product", json!({ "id": product["id"] }));
        assert!(!err);
        assert_eq!(after["id"], product["id"]);
        assert_eq!(after["pageId"], target["id"]);
        assert_eq!(after["photos"], product["photos"]);
        assert_eq!(after["currency"], "INR");
        let (found, err) = call(&state, "find_by_source_url", json!({ "url": "https://india.example/" }));
        assert!(!err);
        assert_eq!(found["pages"][0]["id"], target["id"]);
        let (old_link, err) = call(&state, "get_page", json!({ "id": source["id"] }));
        assert!(!err);
        assert_eq!(old_link["id"], target["id"]);
        let (retry, err) = call(&state, "merge_pages", json!({ "sourceId": source["id"], "targetId": target["id"] }));
        assert!(!err);
        assert_eq!(retry["movedProducts"], 0);
        let owner = state.with_workspace(|ws| Ok(ws.manifest.owner_profile_id.clone())).unwrap();
        let (_, err) = call(&state, "merge_pages", json!({ "sourceId": owner, "targetId": target["id"] }));
        assert!(err);
        let edited = call(&state, "update_page", json!({"id": target["id"], "tagline": "Edited"}));
        assert!(!edited.1);
        let found = call(&state, "find_by_source_url", json!({"url": "https://india.example"}));
        assert_eq!(found.0["pages"][0]["id"], target["id"]);
    }

    #[test]
    fn pages_and_products() {
        let (_root, state) = unlocked();
        let img = json!({ "base64": B64.encode(PNG), "fileName": "front.png" });

        let (page, err) = call(&state, "create_page", json!({ "name": "Saree House", "kind": "shop", "category": "Boutique", "sourceUrl": "https://sareehouse.example/" }));
        assert!(!err, "{page}");
        let page_id = page["id"].as_str().unwrap().to_string();
        assert_eq!(page["sellsProducts"], true);

        let (product, err) = call(&state, "create_product", json!({ "pageId": page_id, "name": "Silk saree", "price": 245.5, "currency": "lkr", "sourceUrl": "https://sareehouse.example/silk", "images": [img.clone(), img.clone()] }));
        assert!(!err, "{product}");
        let product_id = product["id"].as_str().unwrap().to_string();
        assert_eq!((product["price"].as_f64(), product["currency"].as_str()), (Some(245.5), Some("LKR")));
        assert_eq!(product["photos"].as_array().unwrap().len(), 2);

        // Publishing the same URL again finds what's there.
        let (found, _) = call(&state, "find_by_source_url", json!({ "url": "https://SareeHouse.example" }));
        assert_eq!(found["pages"].as_array().unwrap().len(), 1);
        let (found, _) = call(&state, "find_by_source_url", json!({ "url": "https://sareehouse.example/silk/" }));
        assert_eq!(found["products"][0]["id"], product_id.as_str());

        // Updates change only what's given; photos can be added and removed.
        let first_photo = product["photos"][0]["id"].as_str().unwrap().to_string();
        let (updated, err) = call(&state, "update_product", json!({ "id": product_id, "price": null, "status": "reserved", "removePhotoIds": [first_photo], "images": [img.clone()] }));
        assert!(!err, "{updated}");
        assert_eq!((updated["price"].clone(), updated["status"].clone(), updated["name"].clone()), (Value::Null, json!("reserved"), json!("Silk saree")));
        assert_eq!(updated["photos"].as_array().unwrap().len(), 2);
        let (more, _) = call(&state, "add_product_photos", json!({ "id": product_id, "images": [img.clone()] }));
        assert_eq!(more["photos"].as_array().unwrap().len(), 3);
        let (page_after, _) = call(&state, "set_page_photo", json!({ "id": page_id, "slot": "cover", "imageBase64": B64.encode(PNG) }));
        assert_eq!(page_after["hasCover"], true);
        let (bad, err) = call(&state, "add_product_photos", json!({ "id": product_id, "images": [{ "base64": B64.encode(b"not an image") }] }));
        assert!(err, "{bad}");

        // People and posts are out of reach.
        let owner = state.with_workspace(|ws| Ok(ws.owner_id().to_string())).unwrap();
        let (_, err) = call(&state, "get_page", json!({ "id": owner }));
        assert!(err, "the owner's profile isn't a page");
        let (_, err) = call(&state, "update_page", json!({ "id": owner, "name": "Hacked" }));
        assert!(err);
        let (_, err) = call(&state, "create_product", json!({ "pageId": owner, "name": "x" }));
        assert!(err);

        // Deleting goes to the Trash; every change tells the window, lookups don't.
        let changes = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let seen = changes.clone();
        state.set_notifier(move |source| {
            assert_eq!(source, "agent");
            seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        call(&state, "list_products", json!({}));
        assert_eq!(changes.load(std::sync::atomic::Ordering::SeqCst), 0);
        let (_, err) = call(&state, "delete_product", json!({ "id": product_id }));
        assert_eq!(changes.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(!err);
        let (listed, _) = call(&state, "list_products", json!({}));
        assert!(listed["products"].as_array().unwrap().is_empty());
        let trash = state.with_workspace(|ws| Ok(ws.list_trash())).unwrap();
        assert_eq!(trash.len(), 1);
        assert!(state.agent_log.recent().iter().any(|e| e.summary.contains("moved product")));
    }

    #[test]
    fn image_urls_must_be_public() {
        for url in ["file:///etc/passwd", "ftp://example.com/a.png", "http://127.0.0.1/a.png", "http://localhost:8080/a.png", "http://10.1.2.3/a.png", "http://192.168.1.1/a.png", "http://169.254.169.254/latest", "http://[::1]:80/a.png"] {
            assert!(check_url(url).is_err(), "{url}");
        }
        assert_eq!(join_url("https://a.com/x/y.png?q", "/z.png"), "https://a.com/z.png");
        assert_eq!(join_url("https://a.com/x/y.png", "z.png"), "https://a.com/x/z.png");
        assert_eq!(join_url("https://a.com/x", "//cdn.b.com/i.png"), "https://cdn.b.com/i.png");
        assert_eq!(join_url("https://a.com/x", "https://c.com/i.png"), "https://c.com/i.png");
    }

    #[test]
    fn http_endpoint_checks_host_token_and_lock() {
        let (_root, state) = unlocked();
        let shared = state.clone();
        let server = start(0, Box::new(move |f| f(&shared))).unwrap();
        let url = format!("http://127.0.0.1:{}/mcp", server.port);
        let body = json!({ "jsonrpc": "2.0", "id": 1, "method": "ping" }).to_string();
        let status = |r: std::result::Result<ureq::Response, ureq::Error>| match r {
            Ok(r) => r.status(),
            Err(ureq::Error::Status(code, _)) => code,
            Err(e) => panic!("{e}"),
        };
        let post = |token: &str| status(ureq::post(&url).set("Authorization", &format!("Bearer {token}")).send_string(&body));

        assert_eq!(post("wrong"), 401);
        assert_eq!(post(&"t".repeat(64)), 200);
        assert_eq!(status(ureq::get(&url).call()), 405);
        let notification = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string();
        assert_eq!(status(ureq::post(&url).set("Authorization", &format!("Bearer {}", "t".repeat(64))).send_string(&notification)), 202);
        // A web page reaching it through DNS rebinding sends its own host name.
        assert_eq!(status(ureq::post(&url).set("Host", "evil.example").set("Authorization", &format!("Bearer {}", "t".repeat(64))).send_string(&body)), 403);
        // Locked: nobody gets in.
        *state.workspace.lock().unwrap() = None;
        assert_eq!(post(&"t".repeat(64)), 503);
        server.stop();
    }
}
