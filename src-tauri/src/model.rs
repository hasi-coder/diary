//! Records stored (encrypted) in a workspace, plus the shapes exchanged with the UI.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Plaintext `workspace.json`. Holds only what is needed to unlock: the format
/// version, KDF parameters and the wrapped data key. The workspace name lives
/// in the encrypted manifest.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub format_version: u32,
    /// Phase 1 stored the name in plaintext; migrations remove it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub kdf: KdfParams,
    /// Random data key, sealed with the password-derived key (base64).
    pub wrapped_key: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub algorithm: String,
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
    /// base64
    pub salt: String,
}

/// Encrypted `manifest.enc`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub format_version: u32,
    pub name: String,
    pub owner_profile_id: String,
    pub created_at: i64,
    /// Agent access (MCP) settings. Stored here, encrypted, like everything else.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentAccess>,
}

/// Lets coding agents (Codex, Claude, Copilot) manage pages and products over MCP
/// while the journal is unlocked. See `mcp.rs`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AgentAccess {
    pub enabled: bool,
    pub port: u16,
    /// Bearer token agents must send. Random; regenerating it revokes old configs.
    pub token: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProfileKind {
    /// The journal owner. Exactly one per workspace.
    Me,
    /// Supporting characters: friends, family, colleagues.
    Person,
    Page,
    Shop,
    Place,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub kind: ProfileKind,
    pub name: String,
    #[serde(default)]
    pub tagline: String,
    #[serde(default)]
    pub bio: String,
    /// People: how they relate to the journal owner (e.g. "Sister").
    #[serde(default)]
    pub relationship: String,
    /// Pages and shops: e.g. "Coffee shop", "Book club".
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub location: String,
    /// UI theme key for the avatar and cover.
    #[serde(default)]
    pub color: String,
    /// Whether the profile can list items for sale. Always true for shops.
    #[serde(default)]
    pub has_shop: bool,
    /// Gender identities, free text (up to 10), as on Facebook. Empty = not shared.
    #[serde(default)]
    pub genders: Vec<String>,
    /// e.g. "she/her", "they/them", "ze/zir".
    #[serde(default)]
    pub pronouns: String,
    /// Which relationship words to use for this profile: neutral, feminine or masculine.
    #[serde(default = "default_terms")]
    pub terms: String,
    /// e.g. "Married", "In an open relationship", "It's complicated".
    #[serde(default)]
    pub relationship_status: String,
    /// `YYYY-MM-DD`, or `MM-DD` when the year isn't known. Empty = not set.
    #[serde(default)]
    pub birthday: String,
    /// Same format: a wedding or relationship anniversary (people), or when a
    /// page, shop or place opened.
    #[serde(default)]
    pub anniversary: String,
    /// Profile picture. Its bytes live in `media/<id>.enc`.
    #[serde(default)]
    pub avatar: Option<MediaRef>,
    #[serde(default)]
    pub cover: Option<MediaRef>,
    /// Vertical focus of the cover photo, 0 (top) to 100 (bottom).
    #[serde(default = "default_cover_position")]
    pub cover_position: u8,
    /// Pages and shops: product photos are stored at most this many pixels on
    /// their long side (re-encoded as JPEG). 0 keeps them as they are.
    #[serde(default)]
    pub product_photo_max: u32,
    /// Pages and shops: product photos are saved as 80% JPEGs, whatever their size.
    #[serde(default)]
    pub product_photo_jpeg: bool,
    /// Relationships this profile declared. Each is shown on both profiles,
    /// with the inverse label on the other side.
    #[serde(default)]
    pub relations: Vec<Relation>,
    /// Where a page or shop was imported from (agent "publish from URL").
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub source_url: String,
    /// Other shop/page URLs retained when duplicates are merged.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub source_urls: Vec<String>,
    /// Old page ids that now open this page. Product ids never change.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub merged_page_ids: Vec<String>,
    /// Places, shops and pages: the walkable layout for the Places world (see
    /// `src/lib/places/layout.ts` for the schema). Stored as given; the UI owns
    /// its shape. Older records' `plan` (the 3D tour) is dropped on load.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub layout: Option<serde_json::Value>,
    /// People and the owner: how they look in the Places world (age, body,
    /// hair, outfit; see `src/lib/places/character.ts`). The UI owns its shape.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub character: Option<serde_json::Value>,
    /// People and the owner: the four head images their character wears.
    #[serde(default, skip_serializing_if = "Faces::is_empty")]
    pub faces: Faces,
    /// In the Trash since then (unix millis); `None` while live.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_at: Option<i64>,
    /// Trashed together with this profile (its posts and products), and restored with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_with: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_cover_position() -> u8 {
    50
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageMerge {
    pub page: Profile,
    pub source_id: String,
    pub moved_products: usize,
}

fn default_terms() -> String {
    "neutral".into()
}

/// "`to_id` is this profile's `kind`", e.g. kind `sibling`, or `workplace` for a shop.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Relation {
    pub id: String,
    pub to_id: String,
    pub kind: String,
    /// For `custom`: how `to_id` relates to this profile, and the reverse.
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub inverse_label: String,
    /// Free text such as "2019" or "June 2021".
    #[serde(default)]
    pub since: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationInput {
    pub id: Option<String>,
    pub to_id: String,
    pub kind: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub inverse_label: String,
    #[serde(default)]
    pub since: String,
}

/// A character's head seen from four sides. `left` and `right` are profiles
/// with the nose toward that edge of the image. Bytes live in `media/<id>.enc`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Faces {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub front: Option<MediaRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub left: Option<MediaRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub right: Option<MediaRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub back: Option<MediaRef>,
}

impl Faces {
    pub fn is_empty(&self) -> bool {
        self.front.is_none() && self.left.is_none() && self.right.is_none() && self.back.is_none()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhotoSlot {
    Avatar,
    Cover,
    FaceFront,
    FaceLeft,
    FaceRight,
    FaceBack,
}

impl PhotoSlot {
    pub fn is_face(self) -> bool {
        !matches!(self, PhotoSlot::Avatar | PhotoSlot::Cover)
    }
}

impl Profile {
    pub fn can_sell(&self) -> bool {
        self.kind == ProfileKind::Shop || (self.kind == ProfileKind::Page && self.has_shop)
    }

    /// Whether this profile is a person (or the owner), who can have a character.
    pub fn is_person(&self) -> bool {
        matches!(self.kind, ProfileKind::Me | ProfileKind::Person)
    }

    pub fn photo(&self, slot: PhotoSlot) -> Option<&MediaRef> {
        match slot {
            PhotoSlot::Avatar => self.avatar.as_ref(),
            PhotoSlot::Cover => self.cover.as_ref(),
            PhotoSlot::FaceFront => self.faces.front.as_ref(),
            PhotoSlot::FaceLeft => self.faces.left.as_ref(),
            PhotoSlot::FaceRight => self.faces.right.as_ref(),
            PhotoSlot::FaceBack => self.faces.back.as_ref(),
        }
    }

    pub fn photo_slot(&mut self, slot: PhotoSlot) -> &mut Option<MediaRef> {
        match slot {
            PhotoSlot::Avatar => &mut self.avatar,
            PhotoSlot::Cover => &mut self.cover,
            PhotoSlot::FaceFront => &mut self.faces.front,
            PhotoSlot::FaceLeft => &mut self.faces.left,
            PhotoSlot::FaceRight => &mut self.faces.right,
            PhotoSlot::FaceBack => &mut self.faces.back,
        }
    }

    /// Every photo the profile itself holds: avatar, cover and face views.
    pub fn photos(&self) -> impl Iterator<Item = &MediaRef> {
        [&self.avatar, &self.cover, &self.faces.front, &self.faces.left, &self.faces.right, &self.faces.back].into_iter().flatten()
    }

    pub fn photos_mut(&mut self) -> impl Iterator<Item = &mut MediaRef> {
        let Faces { front, left, right, back } = &mut self.faces;
        [&mut self.avatar, &mut self.cover, front, left, right, back].into_iter().flatten()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub kind: ProfileKind,
    pub name: String,
    #[serde(default)]
    pub tagline: String,
    #[serde(default)]
    pub bio: String,
    #[serde(default)]
    pub relationship: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub has_shop: bool,
    #[serde(default)]
    pub genders: Vec<String>,
    #[serde(default)]
    pub pronouns: String,
    #[serde(default = "default_terms")]
    pub terms: String,
    #[serde(default)]
    pub relationship_status: String,
    #[serde(default)]
    pub birthday: String,
    #[serde(default)]
    pub anniversary: String,
    #[serde(default)]
    pub source_url: String,
}

/// What kind of entry a post is. Older records without a kind are statuses.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PostKind {
    /// A regular post: text plus a few attachments.
    #[default]
    Status,
    /// Long-form writing with a title; the first attachment is its cover.
    Article,
    /// A titled photo/video collection; `content` is its description and the first item its cover.
    Album,
    /// A life event ("Started a new job"): `title` plus an `event_type` category.
    Milestone,
}

/// A note under a post, as on Facebook: "looking back, this was the start of…".
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author_id: String,
    /// Markdown, with mentions like a post.
    pub content: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Facebook's reactions.
pub const REACTIONS: [&str; 7] = ["like", "love", "care", "haha", "wow", "sad", "angry"];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Reaction {
    pub profile_id: String,
    /// One of [`REACTIONS`].
    pub kind: String,
    pub created_at: i64,
}

/// A question asked in a status post (its text is the question), answered by
/// any profile, as on Facebook.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Poll {
    pub options: Vec<PollOption>,
    /// Whether a profile may pick more than one option.
    #[serde(default)]
    pub multiple: bool,
    /// One per profile and option, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub votes: Vec<PollVote>,
}

/// A choice: text, a photo, or both. The photo's bytes live in `media/<id>.enc`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollOption {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<MediaRef>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollVote {
    pub profile_id: String,
    pub option_id: String,
    pub created_at: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollInput {
    pub options: Vec<PollOptionInput>,
    #[serde(default)]
    pub multiple: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollOptionInput {
    /// Set for options already on the poll, so their votes are kept.
    pub id: Option<String>,
    #[serde(default)]
    pub text: String,
    /// A staged upload, or the option's current photo.
    #[serde(default)]
    pub image_id: Option<String>,
}

/// "feeling happy", "eating breakfast" and the like.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Feeling {
    pub emoji: String,
    pub text: String,
}

/// One clause of what a post is about, in the order the author arranged them:
/// a feeling ("feeling" + "festive"), an activity ("working as" + "a nurse") or a
/// life event (no verb; "graduated from university"). Each can tag its own people
/// ("attending an office party with Dev") and add free text ("for the first time").
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub emoji: String,
    pub verb: String,
    pub object: String,
    /// The vocabulary item it names, as `kind:id` (e.g. `role:nurse`); empty for free text.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub thing: String,
    /// People and pages this clause was with.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub with_ids: Vec<String>,
    /// Free text after the clause: "for the first time", "after a 12-hour shift".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub detail: String,
    /// Words describing the object, placed before its noun: "gorgeous red" → "a gorgeous red saree".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub adjectives: String,
    /// How it was done, after the clause: "quietly", "passionately".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub adverb: String,
    /// "was" for something that was going on ("was feeling festive"); empty for "is".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tense: String,
}

/// A person (or page) or a product tagged at a spot on a photo; `x`/`y` are 0..1
/// of the image size. Exactly one of `profile_id` and `item_id` is set.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoTag {
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub profile_id: String,
    /// A shop item: "shop the look".
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub item_id: String,
    pub x: f32,
    pub y: f32,
}

/// A named collection of posts, articles and albums ("Japan trip", "Wedding
/// planning"). A post can be in several series, so their timelines can overlap.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Series {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub color: String,
    /// Read latest part first, like a feed; by default oldest first, like a story.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub newest_first: bool,
    /// Parts in an order set by hand (rough dates: "diary entry 1, 2"); empty means by date.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub part_order: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// A series as the UI sees it: its posts in date order and the span they cover.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSummary {
    #[serde(flatten)]
    pub series: Series,
    pub post_ids: Vec<String>,
    /// `occurred_at` of its first and last posts; `None` while it is empty.
    pub from: Option<i64>,
    pub to: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesInput {
    pub id: Option<String>,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub color: String,
    /// `None` keeps the series' reading order (new series: oldest first).
    #[serde(default)]
    pub newest_first: Option<bool>,
}

/// A journal entry. Mentions are embedded in the Markdown as `@[profile:<uuid>]`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub id: String,
    #[serde(default)]
    pub kind: PostKind,
    /// Articles and albums only.
    #[serde(default)]
    pub title: String,
    pub author_id: String,
    pub content: String,
    /// When the event happened (unix millis); entries may be back-dated.
    pub occurred_at: i64,
    /// Profiles tagged as being with the author ("— with Sarah and Dev").
    #[serde(default)]
    pub with_ids: Vec<String>,
    /// Check-in: a place, shop or page ("— at Lake Minnetonka").
    #[serde(default)]
    pub place_id: Option<String>,
    #[serde(default)]
    pub feeling: Option<Feeling>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub activities: Vec<Activity>,
    /// Milestones only: the life-event template id, e.g. `career.started_a_new_job`.
    #[serde(default)]
    pub event_type: String,
    /// Milestones only: more life events combined into this one ("graduated and got engaged").
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub also_event_types: Vec<String>,
    /// Series this post belongs to.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub series_ids: Vec<String>,
    /// Attached images and videos, in display order. Bytes live in `media/<id>.enc`.
    #[serde(default)]
    pub media: Vec<MediaRef>,
    /// Albums only: the photos are layers of one subject (before and after,
    /// outside and inside), stacked and viewed with a slider; captions name them.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub layered: bool,
    /// Notes added under the post later, by any profile, oldest first.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub comments: Vec<Comment>,
    /// At most one per profile.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub reactions: Vec<Reaction>,
    /// Statuses only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub poll: Option<Poll>,
    /// Statuses only: an earlier post shared as a memory, shown as an embedded card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_post_id: Option<String>,
    /// In the Trash since then (unix millis); `None` while live.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_at: Option<i64>,
    /// Trashed together with this profile (its posts and products), and restored with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_with: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Post {
    /// Every media file the post owns: its attachments, then its poll's photos.
    pub fn all_media(&self) -> impl Iterator<Item = &MediaRef> {
        self.media.iter().chain(self.poll.iter().flat_map(|p| p.options.iter().filter_map(|o| o.image.as_ref())))
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Video,
}

/// Metadata for an attachment. Stored (encrypted) inside the post, so listing
/// media never requires decrypting the large blobs.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRef {
    pub id: String,
    pub kind: MediaKind,
    pub mime: String,
    /// Original file name.
    pub name: String,
    pub size: u64,
    /// Per-photo caption (used mostly in albums).
    #[serde(default)]
    pub caption: String,
    #[serde(default)]
    pub tags: Vec<PhotoTag>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostInput {
    pub id: Option<String>,
    #[serde(default)]
    pub kind: PostKind,
    #[serde(default)]
    pub title: String,
    /// Caption per attachment id. Attachments missing here keep their caption.
    #[serde(default)]
    pub captions: HashMap<String, String>,
    #[serde(default)]
    pub with_ids: Vec<String>,
    #[serde(default)]
    pub place_id: Option<String>,
    #[serde(default)]
    pub feeling: Option<Feeling>,
    #[serde(default)]
    pub activities: Vec<Activity>,
    #[serde(default)]
    pub event_type: String,
    #[serde(default)]
    pub also_event_types: Vec<String>,
    #[serde(default)]
    pub series_ids: Vec<String>,
    pub author_id: String,
    pub content: String,
    pub occurred_at: Option<i64>,
    /// Attachments in display order: ids of staged uploads or of media already on the post.
    #[serde(default)]
    pub media_ids: Vec<String>,
    /// Albums only: show the photos as layers with a slider.
    #[serde(default)]
    pub layered: bool,
    /// Statuses only; `None` removes the post's poll.
    #[serde(default)]
    pub poll: Option<PollInput>,
    /// Statuses only: the earlier post shared as a memory.
    #[serde(default)]
    pub shared_post_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ItemStatus {
    Available,
    Reserved,
    Sold,
}

/// A listing sold by a shop (or a page with a shop).
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub shop_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub price_cents: Option<i64>,
    #[serde(default)]
    pub currency: String,
    pub status: ItemStatus,
    /// Product photos and videos, in display order (the first is the main one).
    #[serde(default)]
    pub media: Vec<MediaRef>,
    /// The product page it was imported from.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub source_url: String,
    /// In the Trash since then (unix millis); `None` while live.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_at: Option<i64>,
    /// Trashed together with this profile (its posts and products), and restored with it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trashed_with: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub id: Option<String>,
    pub shop_id: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub price_cents: Option<i64>,
    #[serde(default)]
    pub currency: String,
    pub status: ItemStatus,
    /// Staged uploads or photos already on the item, in display order.
    #[serde(default)]
    pub media_ids: Vec<String>,
    #[serde(default)]
    pub source_url: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostFilter {
    /// Posts written by, or mentioning, this profile.
    pub profile_id: Option<String>,
    pub kind: Option<PostKind>,
    /// Posts in this series.
    pub series_id: Option<String>,
    /// Inclusive lower bound on `occurred_at` (unix millis).
    pub from: Option<i64>,
    /// Exclusive upper bound on `occurred_at` (unix millis).
    pub to: Option<i64>,
    /// Case-insensitive substring match on the content.
    pub search: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    /// Folder name, e.g. `workspace_personal`.
    pub id: String,
    /// Folder name without the prefix. The real name is encrypted.
    pub label: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileStats {
    pub posts: usize,
    pub mentions: usize,
}

/// Everything the UI needs after unlocking, except post bodies (queried separately).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub workspace: WorkspaceSummary,
    pub profiles: Vec<Profile>,
    pub items: Vec<Item>,
    pub series: Vec<SeriesSummary>,
    /// Entries in the Trash.
    pub trash_count: usize,
    pub stats: HashMap<String, ProfileStats>,
    /// `occurred_at` of every post, so the UI can build the year/month scrubber
    /// in the viewer's local time zone.
    pub post_dates: Vec<i64>,
    pub migration: crate::migrate::MigrationStatus,
    pub storage: StorageInfo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageInfo {
    pub path: String,
    pub cipher: String,
    pub kdf: String,
    pub kdf_memory_kib: u32,
    pub kdf_iterations: u32,
    pub kdf_parallelism: u32,
    pub pad_block: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSummary {
    pub id: String,
    pub label: String,
    pub name: String,
    pub owner_profile_id: String,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    /// Folded query terms, for highlighting.
    pub terms: Vec<String>,
    pub posts: Vec<PostHit>,
    pub profiles: Vec<Hit>,
    pub items: Vec<Hit>,
    pub totals: SearchTotals,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostHit {
    pub post: Post,
    pub snippet: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Hit {
    pub id: String,
    pub snippet: String,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchTotals {
    pub posts: usize,
    pub profiles: usize,
    pub items: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordChange {
    /// Whether a new data key was generated and every file re-encrypted.
    pub rotated: bool,
    pub files_rewritten: usize,
}

/// Disk space a workspace uses, per folder (Settings › Storage).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub parts: Vec<StoragePart>,
    pub total_bytes: u64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePart {
    /// "media", "posts", "entities", "items", "series" or "other" (manifest and key file).
    pub key: String,
    pub files: usize,
    pub bytes: u64,
}

/// What shrinking a page's product photos did.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShrinkReport {
    pub photos: usize,
    pub shrunk: usize,
    pub bytes_before: u64,
    pub bytes_after: u64,
}

/// Something in the Trash, as the Trash view lists it.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrashEntry {
    /// "post", "profile" or "item".
    pub kind: String,
    pub id: String,
    pub title: String,
    /// Post kind, profile kind, or "item".
    pub subtitle: String,
    pub trashed_at: i64,
    /// Posts and products that went with it (a deleted profile's).
    pub with_count: usize,
}
