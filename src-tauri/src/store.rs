//! On-disk workspace layout and the in-memory decrypted cache.
//!
//! ```text
//! data_sources/workspace_<label>/
//! ├── workspace.json        plaintext: format version, Argon2id params, wrapped data key
//! ├── manifest.enc          workspace name, owner profile, created time
//! ├── entities/<uuid>.enc   profiles (me, people, pages, shops, places)
//! ├── posts/<uuid>.enc      journal entries
//! └── items/<uuid>.enc      shop listings
//! ```
//!
//! The folder label is chosen by the user and is the only name visible in the
//! repository. Record files are described in `record.rs`.
//!
//! Unlocking derives a key-encryption key from the password, unwraps the random
//! data key, and decrypts every record into memory, upgrading older schemas on
//! the fly (see `migrate.rs`). Dropping the [`Workspace`] (on lock or exit)
//! zeroizes the data key.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::{json, Value};
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::crypto::{self, Key};
use crate::error::{Error, Result};
use crate::migrate::{self, MigrationStatus};
use crate::model::*;
use crate::record::{self, Kind, CURRENT_SCHEMA};

const CONFIG_FILE: &str = "workspace.json";
const MANIFEST_FILE: &str = "manifest.enc";
const MANIFEST_ID: &str = "manifest";
pub const WORKSPACE_PREFIX: &str = "workspace_";
const MENTION_PREFIX: &str = "@[profile:";

/// Argon2id cost parameters.
#[derive(Clone, Copy, Debug)]
pub struct KdfCost {
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

/// OWASP-recommended Argon2id settings (64 MiB, 3 passes).
pub const DEFAULT_KDF: KdfCost = KdfCost { memory_kib: 64 * 1024, iterations: 3, parallelism: 1 };

pub fn now_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Where workspaces live: `$MY_DIARY_DATA_DIR`, or `data_sources/` in this repo.
pub fn data_root() -> PathBuf {
    std::env::var_os("MY_DIARY_DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../data_sources")))
}

pub fn slugify(name: &str) -> String {
    let mut slug = String::new();
    for c in name.trim().to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            slug.push(c);
        } else if !slug.ends_with('_') && !slug.is_empty() {
            slug.push('_');
        }
    }
    slug.trim_end_matches('_').to_string()
}

/// Extracts the profile ids referenced as `@[profile:<id>]` in post content.
pub fn mentions(content: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let mut rest = content;
    while let Some(start) = rest.find(MENTION_PREFIX) {
        rest = &rest[start + MENTION_PREFIX.len()..];
        match rest.find(']') {
            Some(end) => {
                out.push(&rest[..end]);
                rest = &rest[end + 1..];
            }
            None => break,
        }
    }
    out
}

/// Unique lower-cased `#tags` (must contain a letter; `#1` is not a tag).
pub fn hashtags(content: &str) -> Vec<String> {
    let chars: Vec<char> = content.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let at_boundary = i == 0 || chars[i - 1].is_whitespace() || chars[i - 1] == '(';
        if chars[i] == '#' && at_boundary {
            let mut j = i + 1;
            while j < chars.len() && (chars[j].is_alphanumeric() || chars[j] == '_' || chars[j] == '-') {
                j += 1;
            }
            let tag: String = chars[i + 1..j].iter().collect::<String>().to_lowercase();
            if tag.chars().any(char::is_alphabetic) && !out.contains(&tag) {
                out.push(tag);
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

/// Pre-built front matter stored (encrypted) alongside a post.
fn post_meta(post: &Post) -> Value {
    let mut ids: Vec<&str> = mentions(&post.content);
    ids.sort_unstable();
    ids.dedup();
    json!({ "mentions": ids, "tags": hashtags(&post.content) })
}

fn validate_workspace_id(id: &str) -> Result<()> {
    let ok = !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(())
    } else {
        Err(Error::Invalid(format!("Invalid workspace id: {id}")))
    }
}

fn validate_record_id(id: &str) -> Result<()> {
    Uuid::parse_str(id).map(|_| ()).map_err(|_| Error::Invalid(format!("Invalid record id: {id}")))
}

fn required(value: &str, what: &str) -> Result<String> {
    let value = value.trim();
    if value.is_empty() {
        Err(Error::Invalid(format!("{what} is required.")))
    } else {
        Ok(value.to_string())
    }
}

/// Writes via a temp file + rename so a crash never leaves a half-written record.
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn read_config(dir: &Path) -> Result<WorkspaceConfig> {
    let path = dir.join(CONFIG_FILE);
    if !path.exists() {
        return Err(Error::NotFound(format!("workspace at {}", dir.display())));
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_config(dir: &Path, config: &WorkspaceConfig) -> Result<()> {
    atomic_write(&dir.join(CONFIG_FILE), &serde_json::to_vec_pretty(config)?)
}

fn label_of(id: &str) -> String {
    id.strip_prefix(WORKSPACE_PREFIX).unwrap_or(id).to_string()
}

pub fn list_workspaces(root: &Path) -> Result<Vec<WorkspaceInfo>> {
    let mut out = Vec::new();
    if !root.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() && entry.path().join(CONFIG_FILE).exists() {
            let id = entry.file_name().to_string_lossy().into_owned();
            out.push(WorkspaceInfo { label: label_of(&id), id });
        }
    }
    out.sort_by_key(|w| w.label.clone());
    Ok(out)
}

/// Creates `data_sources/workspace_<folder>`. `folder` is visible in the repo;
/// `name` is encrypted. An empty `folder` falls back to the slugified name.
pub fn create_workspace(
    root: &Path,
    folder: &str,
    name: &str,
    owner_name: &str,
    password: &str,
    cost: KdfCost,
) -> Result<Workspace> {
    let name = required(name, "Workspace name")?;
    let owner_name = required(owner_name, "Your name")?;
    if password.chars().count() < 8 {
        return Err(Error::Invalid("Password must be at least 8 characters.".into()));
    }
    let label = match slugify(folder) {
        l if l.is_empty() => slugify(&name),
        l => l,
    };
    if label.is_empty() {
        return Err(Error::Invalid("Folder name must contain letters or digits.".into()));
    }
    let id = format!("{WORKSPACE_PREFIX}{label}");
    let dir = root.join(&id);
    if dir.exists() {
        return Err(Error::Invalid(format!("A workspace folder named \"{id}\" already exists.")));
    }

    let salt = crypto::random_bytes::<16>();
    let kek = crypto::derive_key(password.as_bytes(), &salt, cost.memory_kib, cost.iterations, cost.parallelism)?;
    let data_key = crypto::random_key();
    let config = WorkspaceConfig {
        format_version: CURRENT_SCHEMA,
        name: None,
        kdf: KdfParams {
            algorithm: "argon2id".into(),
            memory_kib: cost.memory_kib,
            iterations: cost.iterations,
            parallelism: cost.parallelism,
            salt: B64.encode(salt),
        },
        wrapped_key: B64.encode(crypto::seal(&kek, "keywrap", data_key.as_ref())?),
    };

    fs::create_dir_all(&dir)?;
    let result = (|| {
        for kind in Kind::RECORDS {
            fs::create_dir_all(dir.join(kind.dir()))?;
        }
        write_config(&dir, &config)?;

        let now = now_millis();
        let owner = Profile {
            id: Uuid::new_v4().to_string(),
            kind: ProfileKind::Me,
            name: owner_name,
            tagline: String::new(),
            bio: String::new(),
            relationship: String::new(),
            category: String::new(),
            location: String::new(),
            color: "teal".into(),
            has_shop: false,
            created_at: now,
            updated_at: now,
        };
        let manifest = Manifest { format_version: CURRENT_SCHEMA, name, owner_profile_id: owner.id.clone(), created_at: now };
        let mut ws = Workspace {
            id: id.clone(),
            dir: dir.clone(),
            key: data_key,
            config,
            manifest,
            profiles: HashMap::new(),
            posts: HashMap::new(),
            items: HashMap::new(),
            stale: HashSet::new(),
            disk_schema: CURRENT_SCHEMA,
        };
        ws.write_manifest()?;
        ws.write_record(Kind::Profile, &owner.id, &owner, json!({}))?;
        ws.profiles.insert(owner.id.clone(), owner);
        Ok(ws)
    })();

    if result.is_err() {
        // The folder did not exist before this call, so it is safe to remove.
        let _ = fs::remove_dir_all(&dir);
    }
    result
}

pub fn open_workspace(root: &Path, id: &str, password: &str) -> Result<Workspace> {
    validate_workspace_id(id)?;
    let dir = root.join(id);
    let config = read_config(&dir)?;
    if config.format_version > CURRENT_SCHEMA {
        return Err(Error::Invalid("This workspace was created by a newer version of My Diary. Update the app.".into()));
    }
    if config.kdf.algorithm != "argon2id" {
        return Err(Error::Invalid("Unsupported key derivation algorithm.".into()));
    }

    let salt = B64.decode(&config.kdf.salt).map_err(|_| Error::Invalid("Corrupt KDF salt.".into()))?;
    let wrapped = B64.decode(&config.wrapped_key).map_err(|_| Error::Invalid("Corrupt wrapped key.".into()))?;
    let kdf = &config.kdf;
    let kek = crypto::derive_key(password.as_bytes(), &salt, kdf.memory_kib, kdf.iterations, kdf.parallelism)?;
    let raw_key = crypto::open(&kek, "keywrap", &wrapped).map_err(|_| Error::BadPassword)?;
    let key: Key = Zeroizing::new(raw_key.as_slice().try_into().map_err(|_| Error::BadPassword)?);

    let mut stale = HashSet::new();
    let manifest_bytes = fs::read(dir.join(MANIFEST_FILE))?;
    let decoded = record::decode(&key, Kind::Manifest, MANIFEST_ID, &manifest_bytes).map_err(|_| Error::BadPassword)?;
    let mut disk_schema = config.format_version.min(decoded.schema);
    if decoded.schema < CURRENT_SCHEMA {
        stale.insert((Kind::Manifest, MANIFEST_ID.to_string()));
    }
    let manifest: Manifest = serde_json::from_value(migrate::upgrade(Kind::Manifest, decoded.schema, decoded.data)?)?;

    let mut ws = Workspace {
        id: id.to_string(),
        dir,
        key,
        config,
        manifest,
        profiles: HashMap::new(),
        posts: HashMap::new(),
        items: HashMap::new(),
        stale,
        disk_schema: CURRENT_SCHEMA,
    };
    ws.profiles = ws.load_all(Kind::Profile, &mut disk_schema)?;
    ws.posts = ws.load_all(Kind::Post, &mut disk_schema)?;
    ws.items = ws.load_all(Kind::Item, &mut disk_schema)?;
    ws.disk_schema = disk_schema;
    Ok(ws)
}

/// An unlocked workspace: the data key plus every decrypted record.
pub struct Workspace {
    pub id: String,
    dir: PathBuf,
    key: Key,
    config: WorkspaceConfig,
    pub manifest: Manifest,
    pub profiles: HashMap<String, Profile>,
    pub posts: HashMap<String, Post>,
    pub items: HashMap<String, Item>,
    /// Records still on disk in an older schema.
    stale: HashSet<(Kind, String)>,
    /// Oldest schema found when the workspace was opened.
    disk_schema: u32,
}

impl Workspace {
    fn record_path(&self, kind: Kind, id: &str) -> PathBuf {
        match kind {
            Kind::Manifest => self.dir.join(MANIFEST_FILE),
            _ => self.dir.join(kind.dir()).join(format!("{id}.enc")),
        }
    }

    fn write_record<T: Serialize>(&mut self, kind: Kind, id: &str, value: &T, meta: Value) -> Result<()> {
        if kind != Kind::Manifest {
            fs::create_dir_all(self.dir.join(kind.dir()))?;
        }
        let bytes = record::encode(&self.key, kind, id, serde_json::to_value(value)?, meta)?;
        atomic_write(&self.record_path(kind, id), &bytes)?;
        self.stale.remove(&(kind, id.to_string()));
        Ok(())
    }

    fn write_manifest(&mut self) -> Result<()> {
        let manifest = self.manifest.clone();
        self.write_record(Kind::Manifest, MANIFEST_ID, &manifest, json!({}))
    }

    fn write_post(&mut self, post: &Post) -> Result<()> {
        self.write_record(Kind::Post, &post.id, post, post_meta(post))
    }

    fn remove_record(&mut self, kind: Kind, id: &str) -> Result<()> {
        self.stale.remove(&(kind, id.to_string()));
        match fs::remove_file(self.record_path(kind, id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn load_all<T: DeserializeOwned>(&mut self, kind: Kind, disk_schema: &mut u32) -> Result<HashMap<String, T>> {
        let mut out = HashMap::new();
        let dir = self.dir.join(kind.dir());
        if !dir.exists() {
            return Ok(out);
        }
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) != Some("enc") {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_owned) else { continue };
            let decoded = record::decode(&self.key, kind, &id, &fs::read(&path)?).map_err(|e| match e {
                Error::Invalid(msg) => Error::Invalid(msg),
                _ => Error::Invalid(format!("Could not decrypt {}", path.display())),
            })?;
            if decoded.schema < CURRENT_SCHEMA {
                self.stale.insert((kind, id.clone()));
                *disk_schema = (*disk_schema).min(decoded.schema);
            }
            let data = migrate::upgrade(kind, decoded.schema, decoded.data)?;
            out.insert(id, serde_json::from_value(data)?);
        }
        Ok(out)
    }

    pub fn owner_id(&self) -> &str {
        &self.manifest.owner_profile_id
    }

    fn config_is_stale(&self) -> bool {
        self.config.format_version < CURRENT_SCHEMA || self.config.name.is_some()
    }

    // ---- Migrations ----

    pub fn migration_status(&self) -> MigrationStatus {
        let stale_files = self.stale.len() + usize::from(self.config_is_stale());
        let disk_schema = if stale_files == 0 { CURRENT_SCHEMA } else { self.disk_schema };
        migrate::status(disk_schema, stale_files)
    }

    /// Rewrites every stale file in the current format. Each file is replaced
    /// atomically and the reader handles mixed formats, so an interrupted run
    /// is safe to resume. Returns the number of files rewritten.
    pub fn run_migration(&mut self) -> Result<usize> {
        let mut stale: Vec<(Kind, String)> = self.stale.iter().cloned().collect();
        stale.sort_by_key(|(kind, id)| (kind.name(), id.clone()));
        let mut rewritten = 0;
        for (kind, id) in stale {
            match kind {
                Kind::Manifest => {
                    self.manifest.format_version = CURRENT_SCHEMA;
                    self.write_manifest()?
                }
                Kind::Profile => {
                    let p = self.profiles[&id].clone();
                    self.write_record(kind, &id, &p, json!({}))?
                }
                Kind::Post => {
                    let p = self.posts[&id].clone();
                    self.write_post(&p)?
                }
                Kind::Item => {
                    let i = self.items[&id].clone();
                    self.write_record(kind, &id, &i, json!({}))?
                }
            }
            rewritten += 1;
        }
        // Rewrite workspace.json last: it is what marks the workspace as current.
        if self.config_is_stale() {
            self.config.format_version = CURRENT_SCHEMA;
            self.config.name = None;
            write_config(&self.dir, &self.config)?;
            rewritten += 1;
        }
        self.disk_schema = CURRENT_SCHEMA;
        Ok(rewritten)
    }

    // ---- Profiles ----

    pub fn save_profile(&mut self, input: ProfileInput) -> Result<Profile> {
        let name = required(&input.name, "Name")?;
        let now = now_millis();
        let (id, created_at) = match &input.id {
            Some(id) => {
                let existing = self.profiles.get(id).ok_or_else(|| Error::NotFound(format!("profile {id}")))?;
                if (existing.kind == ProfileKind::Me) != (input.kind == ProfileKind::Me) {
                    return Err(Error::Invalid("The journal owner's profile type can't be changed.".into()));
                }
                (id.clone(), existing.created_at)
            }
            None => {
                if input.kind == ProfileKind::Me {
                    return Err(Error::Invalid("A workspace has exactly one journal owner.".into()));
                }
                (Uuid::new_v4().to_string(), now)
            }
        };

        let profile = Profile {
            id,
            kind: input.kind,
            name,
            tagline: input.tagline.trim().to_string(),
            bio: input.bio.trim().to_string(),
            relationship: input.relationship.trim().to_string(),
            category: input.category.trim().to_string(),
            location: input.location.trim().to_string(),
            color: input.color,
            has_shop: match input.kind {
                ProfileKind::Shop => true,
                ProfileKind::Page => input.has_shop,
                _ => false,
            },
            created_at,
            updated_at: now,
        };
        if !profile.can_sell() && self.items.values().any(|i| i.shop_id == profile.id) {
            return Err(Error::Invalid("Remove this profile's listed items before turning off its shop.".into()));
        }

        self.write_record(Kind::Profile, &profile.id, &profile, json!({}))?;
        self.profiles.insert(profile.id.clone(), profile.clone());
        Ok(profile)
    }

    /// Deletes a profile together with the posts it authored and the items it lists.
    /// Mentions of it in other posts are left as-is and render as a deleted profile.
    pub fn delete_profile(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        let profile = self.profiles.get(id).ok_or_else(|| Error::NotFound(format!("profile {id}")))?;
        if profile.kind == ProfileKind::Me {
            return Err(Error::Invalid("The journal owner's profile can't be deleted.".into()));
        }

        let posts: Vec<String> = self.posts.values().filter(|p| p.author_id == id).map(|p| p.id.clone()).collect();
        for post_id in posts {
            self.delete_post(&post_id)?;
        }
        let items: Vec<String> = self.items.values().filter(|i| i.shop_id == id).map(|i| i.id.clone()).collect();
        for item_id in items {
            self.delete_item(&item_id)?;
        }
        self.remove_record(Kind::Profile, id)?;
        self.profiles.remove(id);
        Ok(())
    }

    // ---- Posts ----

    pub fn save_post(&mut self, input: PostInput) -> Result<Post> {
        let content = required(&input.content, "Post content")?;
        if !self.profiles.contains_key(&input.author_id) {
            return Err(Error::NotFound(format!("author {}", input.author_id)));
        }
        let now = now_millis();
        let post = match &input.id {
            Some(id) => {
                let existing = self.posts.get(id).ok_or_else(|| Error::NotFound(format!("post {id}")))?;
                Post {
                    id: id.clone(),
                    author_id: input.author_id,
                    content,
                    occurred_at: input.occurred_at.unwrap_or(existing.occurred_at),
                    created_at: existing.created_at,
                    updated_at: now,
                }
            }
            None => Post {
                id: Uuid::new_v4().to_string(),
                author_id: input.author_id,
                content,
                occurred_at: input.occurred_at.unwrap_or(now),
                created_at: now,
                updated_at: now,
            },
        };
        self.write_post(&post)?;
        self.posts.insert(post.id.clone(), post.clone());
        Ok(post)
    }

    pub fn delete_post(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        if self.posts.remove(id).is_none() {
            return Err(Error::NotFound(format!("post {id}")));
        }
        self.remove_record(Kind::Post, id)
    }

    pub fn query_posts(&self, filter: &PostFilter) -> Vec<Post> {
        let search = filter.search.as_ref().map(|s| s.trim().to_lowercase()).filter(|s| !s.is_empty());
        let mut posts: Vec<Post> = self
            .posts
            .values()
            .filter(|p| match &filter.profile_id {
                Some(pid) => p.author_id == *pid || mentions(&p.content).contains(&pid.as_str()),
                None => true,
            })
            .filter(|p| filter.from.map_or(true, |from| p.occurred_at >= from))
            .filter(|p| filter.to.map_or(true, |to| p.occurred_at < to))
            .filter(|p| search.as_ref().map_or(true, |s| p.content.to_lowercase().contains(s)))
            .cloned()
            .collect();
        posts.sort_by(|a, b| b.occurred_at.cmp(&a.occurred_at).then(b.created_at.cmp(&a.created_at)));
        posts
    }

    // ---- Items ----

    pub fn save_item(&mut self, input: ItemInput) -> Result<Item> {
        let name = required(&input.name, "Item name")?;
        let shop = self.profiles.get(&input.shop_id).ok_or_else(|| Error::NotFound(format!("shop {}", input.shop_id)))?;
        if !shop.can_sell() {
            return Err(Error::Invalid(format!("{} doesn't have a shop.", shop.name)));
        }
        if input.price_cents.is_some_and(|p| p < 0) {
            return Err(Error::Invalid("Price can't be negative.".into()));
        }
        let currency = match input.currency.trim() {
            "" => "USD".to_string(),
            c => c.to_uppercase(),
        };
        let now = now_millis();
        let created_at = match &input.id {
            Some(id) => self.items.get(id).ok_or_else(|| Error::NotFound(format!("item {id}")))?.created_at,
            None => now,
        };
        let item = Item {
            id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
            shop_id: input.shop_id,
            name,
            description: input.description.trim().to_string(),
            price_cents: input.price_cents,
            currency,
            status: input.status,
            created_at,
            updated_at: now,
        };
        self.write_record(Kind::Item, &item.id, &item, json!({}))?;
        self.items.insert(item.id.clone(), item.clone());
        Ok(item)
    }

    pub fn delete_item(&mut self, id: &str) -> Result<()> {
        validate_record_id(id)?;
        if self.items.remove(id).is_none() {
            return Err(Error::NotFound(format!("item {id}")));
        }
        self.remove_record(Kind::Item, id)
    }

    // ---- Views ----

    pub fn snapshot(&self) -> Snapshot {
        let mut stats: HashMap<String, ProfileStats> =
            self.profiles.keys().map(|id| (id.clone(), ProfileStats::default())).collect();
        for post in self.posts.values() {
            stats.entry(post.author_id.clone()).or_default().posts += 1;
            let unique: HashSet<&str> = mentions(&post.content).into_iter().collect();
            for id in unique {
                if let Some(s) = stats.get_mut(id) {
                    s.mentions += 1;
                }
            }
        }

        let mut profiles: Vec<Profile> = self.profiles.values().cloned().collect();
        profiles.sort_by_key(|p| p.name.to_lowercase());
        let mut items: Vec<Item> = self.items.values().cloned().collect();
        items.sort_by_key(|i| std::cmp::Reverse(i.created_at));

        let kdf = &self.config.kdf;
        Snapshot {
            workspace: WorkspaceSummary {
                id: self.id.clone(),
                label: label_of(&self.id),
                name: self.manifest.name.clone(),
                owner_profile_id: self.manifest.owner_profile_id.clone(),
            },
            profiles,
            items,
            stats,
            post_dates: self.posts.values().map(|p| p.occurred_at).collect(),
            migration: self.migration_status(),
            storage: StorageInfo {
                path: self.dir.display().to_string(),
                cipher: "AES-256-GCM".into(),
                kdf: "Argon2id".into(),
                kdf_memory_kib: kdf.memory_kib,
                kdf_iterations: kdf.iterations,
                kdf_parallelism: kdf.parallelism,
                pad_block: record::PAD_BLOCK,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };

    fn person(name: &str, kind: ProfileKind) -> ProfileInput {
        ProfileInput {
            id: None,
            kind,
            name: name.into(),
            tagline: String::new(),
            bio: String::new(),
            relationship: String::new(),
            category: String::new(),
            location: String::new(),
            color: "pink".into(),
            has_shop: false,
        }
    }

    fn walk(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                out.extend(walk(&path));
            } else {
                out.push(path);
            }
        }
        out
    }

    /// Asserts that none of `needles` appear anywhere under `root`.
    fn assert_no_plaintext(root: &Path, needles: &[&str]) {
        for path in walk(root) {
            let text = String::from_utf8_lossy(&fs::read(&path).unwrap()).to_string();
            for needle in needles {
                assert!(!text.contains(needle), "{} leaks {needle:?}", path.display());
            }
        }
    }

    #[test]
    fn slugify_names() {
        assert_eq!(slugify("  Personal Journal! "), "personal_journal");
        assert_eq!(slugify("Travel / 2026"), "travel_2026");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn parses_mentions_and_tags() {
        let content = "Coffee at @[profile:a] with @[profile:b] and @[profile:a]. Broken @[profile:c";
        assert_eq!(mentions(content), vec!["a", "b", "a"]);
        assert_eq!(hashtags("#Coffee time (#family) #coffee x#no #1 #a-b_c"), vec!["coffee", "family", "a-b_c"]);
    }

    #[test]
    fn create_and_unlock() {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        assert_eq!(ws.id, "workspace_personal");
        assert_eq!(ws.profiles[ws.owner_id()].kind, ProfileKind::Me);
        assert!(ws.migration_status().pending.is_empty());

        let listed = list_workspaces(root.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].label, "personal");

        assert!(matches!(open_workspace(root.path(), &ws.id, "wrong password"), Err(Error::BadPassword)));
        let reopened = open_workspace(root.path(), &ws.id, "correct horse").unwrap();
        assert_eq!(reopened.owner_id(), ws.owner_id());
        assert_eq!(reopened.manifest.name, "Personal");
        assert_eq!(reopened.snapshot().migration.stale_files, 0);
    }

    #[test]
    fn folder_label_hides_the_name() {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "Journal 2", "Secret Affairs", "Alex Hidden", "correct horse", FAST).unwrap();
        assert_eq!(ws.id, "workspace_journal_2");
        assert_no_plaintext(root.path(), &["Secret", "Affairs", "Alex", "Hidden"]);
        assert_eq!(open_workspace(root.path(), &ws.id, "correct horse").unwrap().manifest.name, "Secret Affairs");
    }

    #[test]
    fn rejects_short_password_and_duplicate_workspace() {
        let root = tempfile::tempdir().unwrap();
        assert!(create_workspace(root.path(), "", "A", "Me", "short", FAST).is_err());
        create_workspace(root.path(), "", "A", "Me", "long enough", FAST).unwrap();
        assert!(create_workspace(root.path(), "a", "Other", "Me", "long enough", FAST).is_err());
    }

    #[test]
    fn records_persist_encrypted() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();

        let sarah = ws.save_profile(person("Sarah Secretname", ProfileKind::Person)).unwrap();
        let shop = ws.save_profile(person("The Rusty Bean", ProfileKind::Shop)).unwrap();
        assert!(shop.has_shop);
        ws.save_post(PostInput {
            id: None,
            author_id: owner.clone(),
            content: format!("Latte at @[profile:{}] with @[profile:{}] #coffee", shop.id, sarah.id),
            occurred_at: Some(1_000),
        })
        .unwrap();
        ws.save_post(PostInput { id: None, author_id: sarah.id.clone(), content: "Hi from Sarah".into(), occurred_at: Some(2_000) })
            .unwrap();
        ws.save_item(ItemInput {
            id: None,
            shop_id: shop.id.clone(),
            name: "Pour-over".into(),
            description: String::new(),
            price_cents: Some(450),
            currency: String::new(),
            status: ItemStatus::Available,
        })
        .unwrap();

        assert_no_plaintext(root.path(), &["Secretname", "Latte", "Rusty", "Pour-over", "Personal", "coffee"]);
        for path in walk(root.path()).into_iter().filter(|p| p.extension().is_some_and(|e| e == "enc")) {
            let len = fs::metadata(&path).unwrap().len() as usize;
            assert_eq!((len - 5 - 12 - 16) % record::PAD_BLOCK, 0, "{} not padded", path.display());
        }

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles.len(), 3);
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items.values().next().unwrap().currency, "USD");

        // Posts carry pre-built front matter.
        let post = ws.posts.values().find(|p| p.author_id == owner).unwrap();
        let bytes = fs::read(root.path().join("workspace_personal/posts").join(format!("{}.enc", post.id))).unwrap();
        let meta = record::decode(&ws.key, Kind::Post, &post.id, &bytes).unwrap().meta;
        assert_eq!(meta["tags"], json!(["coffee"]));
        assert_eq!(meta["mentions"].as_array().unwrap().len(), 2);

        let snap = ws.snapshot();
        assert_eq!(snap.stats[&sarah.id].mentions, 1);
        assert_eq!(snap.stats[&sarah.id].posts, 1);
        assert_eq!(snap.stats[&shop.id].mentions, 1);

        let sarahs = ws.query_posts(&PostFilter { profile_id: Some(sarah.id.clone()), ..Default::default() });
        assert_eq!(sarahs.len(), 2);
        assert_eq!(sarahs[0].occurred_at, 2_000, "newest first");
        let ranged = ws.query_posts(&PostFilter { from: Some(1_500), to: Some(3_000), ..Default::default() });
        assert_eq!(ranged.len(), 1);
        let searched = ws.query_posts(&PostFilter { search: Some("LATTE".into()), ..Default::default() });
        assert_eq!(searched.len(), 1);
    }

    #[test]
    fn profile_rules_and_cascading_delete() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();

        assert!(ws.save_profile(person("Second me", ProfileKind::Me)).is_err());
        assert!(ws.delete_profile(&owner).is_err());

        let page = ws.save_profile(person("Book Club", ProfileKind::Page)).unwrap();
        let item = ItemInput {
            id: None,
            shop_id: page.id.clone(),
            name: "Tote bag".into(),
            description: String::new(),
            price_cents: None,
            currency: "lkr".into(),
            status: ItemStatus::Available,
        };
        assert!(ws.save_item(item.clone()).is_err(), "page without a shop can't sell");

        let page = ws
            .save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: true, ..person("Book Club", ProfileKind::Page) })
            .unwrap();
        assert_eq!(ws.save_item(item).unwrap().currency, "LKR");
        assert!(
            ws.save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: false, ..person("Book Club", ProfileKind::Page) })
                .is_err(),
            "can't disable a shop that still lists items"
        );

        ws.save_post(PostInput { id: None, author_id: page.id.clone(), content: "Meeting Friday".into(), occurred_at: None }).unwrap();
        ws.delete_profile(&page.id).unwrap();
        assert!(ws.posts.is_empty() && ws.items.is_empty());

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles.len(), 1);
        assert!(ws.posts.is_empty() && ws.items.is_empty());
    }

    #[test]
    fn rejects_path_traversal() {
        let root = tempfile::tempdir().unwrap();
        assert!(open_workspace(root.path(), "../etc", "x").is_err());
        let mut ws = create_workspace(root.path(), "", "P", "Me", "long enough", FAST).unwrap();
        assert!(ws.delete_post("../../workspace.json").is_err());
    }

    /// Writes a workspace exactly as Phase 1 (format 1) did.
    fn write_phase1_workspace(root: &Path) -> (String, String) {
        let dir = root.join("workspace_old");
        for d in ["entities", "posts", "items"] {
            fs::create_dir_all(dir.join(d)).unwrap();
        }
        let salt = [9u8; 16];
        let kek = crypto::derive_key(b"correct horse", &salt, FAST.memory_kib, FAST.iterations, FAST.parallelism).unwrap();
        let key = crypto::random_key();
        let config = json!({
            "formatVersion": 1,
            "name": "Old Plaintext Name",
            "kdf": { "algorithm": "argon2id", "memoryKib": FAST.memory_kib, "iterations": FAST.iterations,
                     "parallelism": FAST.parallelism, "salt": B64.encode(salt) },
            "wrappedKey": B64.encode(crypto::seal(&kek, "keywrap", key.as_ref()).unwrap()),
        });
        fs::write(dir.join(CONFIG_FILE), serde_json::to_vec_pretty(&config).unwrap()).unwrap();

        let me = Uuid::new_v4().to_string();
        let sarah = Uuid::new_v4().to_string();
        let post = Uuid::new_v4().to_string();
        let seal = |aad: &str, v: Value| crypto::seal(&key, aad, &serde_json::to_vec(&v).unwrap()).unwrap();
        let manifest = json!({"formatVersion": 1, "name": "Old Plaintext Name", "ownerProfileId": me, "createdAt": 1});
        fs::write(dir.join(MANIFEST_FILE), seal("manifest", manifest)).unwrap();
        for (id, kind, name) in [(&me, "me", "Alex"), (&sarah, "person", "Sarah")] {
            let p = json!({"id": id, "kind": kind, "name": name, "createdAt": 1, "updatedAt": 1});
            fs::write(dir.join("entities").join(format!("{id}.enc")), seal(&format!("profile:{id}"), p)).unwrap();
        }
        let p = json!({"id": post, "authorId": me, "content": format!("Tea with @[profile:{sarah}] #tea"),
                       "occurredAt": 5, "createdAt": 5, "updatedAt": 5});
        fs::write(dir.join("posts").join(format!("{post}.enc")), seal(&format!("post:{post}"), p)).unwrap();
        (post, sarah)
    }

    #[test]
    fn migrates_phase1_workspace() {
        let root = tempfile::tempdir().unwrap();
        let (post_id, sarah) = write_phase1_workspace(root.path());

        let mut ws = open_workspace(root.path(), "workspace_old", "correct horse").unwrap();
        let status = ws.migration_status();
        assert_eq!(status.disk_schema, 1);
        assert_eq!(status.stale_files, 5, "config + manifest + 2 profiles + 1 post");
        assert_eq!(status.pending.len(), 1);
        // Readable before migrating, and nothing has been touched on disk yet.
        assert_eq!(ws.manifest.name, "Old Plaintext Name");
        assert_eq!(ws.snapshot().stats[&sarah].mentions, 1);
        assert!(fs::read_to_string(root.path().join("workspace_old").join(CONFIG_FILE)).unwrap().contains("Old Plaintext Name"));

        // Editing one record before migrating writes it in the new format.
        let p = ws.posts[&post_id].clone();
        ws.save_post(PostInput { id: Some(p.id.clone()), author_id: p.author_id, content: p.content, occurred_at: None }).unwrap();
        assert_eq!(ws.migration_status().stale_files, 4);

        assert_eq!(ws.run_migration().unwrap(), 4);
        assert!(ws.migration_status().pending.is_empty());
        assert_no_plaintext(root.path(), &["Old Plaintext Name", "Alex", "Sarah", "Tea"]);
        for path in walk(root.path()).into_iter().filter(|p| p.extension().is_some_and(|e| e == "enc")) {
            assert_eq!(&fs::read(&path).unwrap()[..4], record::RECORD_MAGIC, "{}", path.display());
        }

        let ws = open_workspace(root.path(), "workspace_old", "correct horse").unwrap();
        assert_eq!(ws.migration_status().stale_files, 0);
        assert_eq!(ws.manifest.name, "Old Plaintext Name");
        assert_eq!(ws.profiles.len(), 2);
        assert_eq!(ws.posts[&post_id].occurred_at, 5);
    }
}
