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
    pub created_at: i64,
    pub updated_at: i64,
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
}

/// A journal entry. Mentions are embedded in the Markdown as `@[profile:<uuid>]`.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub id: String,
    pub author_id: String,
    pub content: String,
    /// When the event happened (unix millis); entries may be back-dated.
    pub occurred_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostInput {
    pub id: Option<String>,
    pub author_id: String,
    pub content: String,
    pub occurred_at: Option<i64>,
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
