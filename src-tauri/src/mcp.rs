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
                Ok((value, summary)) => (value, true, summary),
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
passing sourceUrl and image URLs. Deletes go to the user's Trash. Posts and people are not accessible.";

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
        tool("set_page_photo", "Set or remove a page's profile picture or cover photo.",
            json!({ "id": { "type": "string" }, "slot": { "type": "string", "enum": ["avatar", "cover"] }, "imageUrl": { "type": "string" }, "imageBase64": { "type": "string" }, "fileName": { "type": "string" }, "remove": { "type": "boolean" } }), &["id", "slot"]),
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
    ws.profiles.get(id).filter(|p| is_page(p)).ok_or_else(|| Error::NotFound(format!("page {id}")))
}

fn photo_json(m: &Option<MediaRef>) -> Value {
    m.as_ref().map_or(Value::Null, |m| json!({ "id": m.id, "name": m.name, "mime": m.mime, "size": m.size }))
}

fn page_json(ws: &Workspace, p: &Profile, full: bool) -> Value {
    let products: Vec<&Item> = ws.items.values().filter(|i| i.shop_id == p.id).collect();
    let mut v = json!({
        "id": p.id, "kind": p.kind, "name": p.name, "category": p.category, "tagline": p.tagline, "location": p.location,
        "sellsProducts": p.can_sell(), "sourceUrl": p.source_url, "productCount": products.len(),
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
            let pages: Vec<Value> = ws.profiles.values().filter(|p| is_page(p) && normalise_url(&p.source_url) == url).map(|p| page_json(ws, p, false)).collect();
            let products: Vec<Value> = ws.items.values().filter(|i| normalise_url(&i.source_url) == url).map(|i| product_json(ws, i)).collect();
            Ok((json!({ "pages": pages, "products": products }), format!("looked up {url}")))
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
    fn protocol_basics() {
        let (_root, state) = unlocked();
        let init = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 0, "method": "initialize", "params": { "protocolVersion": PROTOCOL_VERSION } })).unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "my-diary");
        assert!(handle_message(&state, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none(), "notifications get no reply");
        let tools = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" })).unwrap();
        let names: Vec<&str> = tools["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"create_product") && names.contains(&"add_product_photos"));
        assert!(names.iter().all(|n| !n.contains("post") && !n.contains("person") && !n.contains("trash")), "pages and products only: {names:?}");
        let unknown = handle_message(&state, &json!({ "jsonrpc": "2.0", "id": 3, "method": "resources/list" })).unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
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

        // Deleting goes to the Trash.
        let (_, err) = call(&state, "delete_product", json!({ "id": product_id }));
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
