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
    /// Profile picture. Its bytes live in `media/<id>.enc`.
    #[serde(default)]
    pub avatar: Option<MediaRef>,
    #[serde(default)]
    pub cover: Option<MediaRef>,
    /// Vertical focus of the cover photo, 0 (top) to 100 (bottom).
    #[serde(default = "default_cover_position")]
    pub cover_position: u8,
    /// Relationships this profile declared. Each is shown on both profiles,
    /// with the inverse label on the other side.
    #[serde(default)]
    pub relations: Vec<Relation>,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_cover_position() -> u8 {
    50
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PhotoSlot {
    Avatar,
    Cover,
}

impl Profile {
    pub fn can_sell(&self) -> bool {
        self.kind == ProfileKind::Shop || (self.kind == ProfileKind::Page && self.has_shop)
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

/// A person (or page) tagged at a spot on a photo; `x`/`y` are 0..1 of the image size.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoTag {
    pub profile_id: String,
    pub x: f32,
    pub y: f32,
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
    /// Attached images and videos, in display order. Bytes live in `media/<id>.enc`.
    #[serde(default)]
    pub media: Vec<MediaRef>,
    pub created_at: i64,
    pub updated_at: i64,
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
    pub author_id: String,
    pub content: String,
    pub occurred_at: Option<i64>,
    /// Attachments in display order: ids of staged uploads or of media already on the post.
    #[serde(default)]
    pub media_ids: Vec<String>,
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
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostFilter {
    /// Posts written by, or mentioning, this profile.
    pub profile_id: Option<String>,
    pub kind: Option<PostKind>,
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
