//! On-disk workspace layout and the in-memory decrypted cache.
//!
//! ```text
//! data_sources/workspace_<slug>/
//! ├── workspace.json   plaintext: name, Argon2id params, wrapped data key
//! ├── manifest.enc     workspace metadata (owner profile, created time)
//! ├── entities/<uuid>.enc   profiles (me, people, pages, shops, places)
//! ├── posts/<uuid>.enc      journal entries
//! └── items/<uuid>.enc      shop listings
//! ```
//!
//! Unlocking derives a key-encryption key from the password, unwraps the random
//! data key, and decrypts every record into memory. Dropping the [`Workspace`]
//! (on lock or exit) zeroizes the data key.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::Serialize;
use uuid::Uuid;
use zeroize::Zeroizing;

use crate::crypto::{self, Key};
use crate::error::{Error, Result};
use crate::model::*;

const FORMAT_VERSION: u32 = 1;
const CONFIG_FILE: &str = "workspace.json";
const MANIFEST_FILE: &str = "manifest.enc";
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

#[derive(Clone, Copy)]
enum Kind {
    Profile,
    Post,
    Item,
}

impl Kind {
    const ALL: [Kind; 3] = [Kind::Profile, Kind::Post, Kind::Item];

    fn dir(self) -> &'static str {
        match self {
            Kind::Profile => "entities",
            Kind::Post => "posts",
            Kind::Item => "items",
        }
    }

    fn aad(self, id: &str) -> String {
        let tag = match self {
            Kind::Profile => "profile",
            Kind::Post => "post",
            Kind::Item => "item",
        };
        format!("{tag}:{id}")
    }
}

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

pub fn list_workspaces(root: &Path) -> Result<Vec<WorkspaceInfo>> {
    let mut out = Vec::new();
    if !root.exists() {
        return Ok(out);
    }
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if let Ok(config) = read_config(&entry.path()) {
            out.push(WorkspaceInfo { id: entry.file_name().to_string_lossy().into_owned(), name: config.name });
        }
    }
    out.sort_by_key(|w| w.name.to_lowercase());
    Ok(out)
}

pub fn create_workspace(
    root: &Path,
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
    let slug = slugify(&name);
    if slug.is_empty() {
        return Err(Error::Invalid("Workspace name must contain letters or digits.".into()));
    }
    let id = format!("{WORKSPACE_PREFIX}{slug}");
    let dir = root.join(&id);
    if dir.exists() {
        return Err(Error::Invalid(format!("A workspace folder named \"{id}\" already exists.")));
    }

    let salt = crypto::random_bytes::<16>();
    let kek = crypto::derive_key(password.as_bytes(), &salt, cost.memory_kib, cost.iterations, cost.parallelism)?;
    let data_key = crypto::random_key();
    let config = WorkspaceConfig {
        format_version: FORMAT_VERSION,
        name: name.clone(),
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
        for kind in Kind::ALL {
            fs::create_dir_all(dir.join(kind.dir()))?;
        }
        atomic_write(&dir.join(CONFIG_FILE), &serde_json::to_vec_pretty(&config)?)?;

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
        let manifest =
            Manifest { format_version: FORMAT_VERSION, name, owner_profile_id: owner.id.clone(), created_at: now };
        let mut ws = Workspace {
            id: id.clone(),
            dir: dir.clone(),
            key: data_key,
            manifest,
            profiles: HashMap::new(),
            posts: HashMap::new(),
            items: HashMap::new(),
        };
        ws.write_record(Kind::Profile, &owner.id, &owner)?;
        ws.profiles.insert(owner.id.clone(), owner);
        atomic_write(&dir.join(MANIFEST_FILE), &ws.seal_json("manifest", &ws.manifest)?)?;
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
    if config.format_version != FORMAT_VERSION || config.kdf.algorithm != "argon2id" {
        return Err(Error::Invalid("Unsupported workspace format.".into()));
    }

    let salt = B64.decode(&config.kdf.salt).map_err(|_| Error::Invalid("Corrupt KDF salt.".into()))?;
    let wrapped = B64.decode(&config.wrapped_key).map_err(|_| Error::Invalid("Corrupt wrapped key.".into()))?;
    let kdf = &config.kdf;
    let kek = crypto::derive_key(password.as_bytes(), &salt, kdf.memory_kib, kdf.iterations, kdf.parallelism)?;
    let raw_key = crypto::open(&kek, "keywrap", &wrapped).map_err(|_| Error::BadPassword)?;
    let key: Key = Zeroizing::new(raw_key.as_slice().try_into().map_err(|_| Error::BadPassword)?);

    let manifest_bytes = fs::read(dir.join(MANIFEST_FILE))?;
    let manifest: Manifest =
        serde_json::from_slice(&crypto::open(&key, "manifest", &manifest_bytes).map_err(|_| Error::BadPassword)?)?;

    let mut ws = Workspace {
        id: id.to_string(),
        dir,
        key,
        manifest,
        profiles: HashMap::new(),
        posts: HashMap::new(),
        items: HashMap::new(),
    };
    ws.profiles = ws.load_all(Kind::Profile)?;
    ws.posts = ws.load_all(Kind::Post)?;
    ws.items = ws.load_all(Kind::Item)?;
    Ok(ws)
}

/// An unlocked workspace: the data key plus every decrypted record.
pub struct Workspace {
    pub id: String,
    dir: PathBuf,
    key: Key,
    pub manifest: Manifest,
    pub profiles: HashMap<String, Profile>,
    pub posts: HashMap<String, Post>,
    pub items: HashMap<String, Item>,
}

impl Workspace {
    fn seal_json<T: Serialize>(&self, aad: &str, value: &T) -> Result<Vec<u8>> {
        let plaintext = Zeroizing::new(serde_json::to_vec(value)?);
        crypto::seal(&self.key, aad, &plaintext)
    }

    fn record_path(&self, kind: Kind, id: &str) -> PathBuf {
        self.dir.join(kind.dir()).join(format!("{id}.enc"))
    }

    fn write_record<T: Serialize>(&self, kind: Kind, id: &str, value: &T) -> Result<()> {
        let dir = self.dir.join(kind.dir());
        fs::create_dir_all(&dir)?;
        atomic_write(&self.record_path(kind, id), &self.seal_json(&kind.aad(id), value)?)
    }

    fn remove_record(&self, kind: Kind, id: &str) -> Result<()> {
        match fs::remove_file(self.record_path(kind, id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
            _ => Ok(()),
        }
    }

    fn load_all<T: DeserializeOwned>(&self, kind: Kind) -> Result<HashMap<String, T>> {
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
            let plaintext = crypto::open(&self.key, &kind.aad(&id), &fs::read(&path)?)
                .map_err(|_| Error::Invalid(format!("Could not decrypt {}", path.display())))?;
            out.insert(id, serde_json::from_slice(&plaintext)?);
        }
        Ok(out)
    }

    pub fn owner_id(&self) -> &str {
        &self.manifest.owner_profile_id
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

        self.write_record(Kind::Profile, &profile.id, &profile)?;
        self.profiles.insert(profile.id.clone(), profile.clone());
        Ok(profile)
    }

    /// Deletes a profile together with the posts it authored and the items it lists.
    /// Mentions of it in other posts are left as-is and render as an unknown profile.
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
        self.write_record(Kind::Post, &post.id, &post)?;
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
        self.write_record(Kind::Item, &item.id, &item)?;
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

        Snapshot {
            workspace: WorkspaceSummary {
                id: self.id.clone(),
                name: self.manifest.name.clone(),
                owner_profile_id: self.manifest.owner_profile_id.clone(),
            },
            profiles,
            items,
            stats,
            post_dates: self.posts.values().map(|p| p.occurred_at).collect(),
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

    #[test]
    fn slugify_names() {
        assert_eq!(slugify("  Personal Journal! "), "personal_journal");
        assert_eq!(slugify("Travel / 2026"), "travel_2026");
        assert_eq!(slugify("!!!"), "");
    }

    #[test]
    fn parses_mentions() {
        let content = "Coffee at @[profile:a] with @[profile:b] and @[profile:a]. Broken @[profile:c";
        assert_eq!(mentions(content), vec!["a", "b", "a"]);
    }

    #[test]
    fn create_and_unlock() {
        let root = tempfile::tempdir().unwrap();
        let ws = create_workspace(root.path(), "Personal", "Alex", "correct horse", FAST).unwrap();
        assert_eq!(ws.id, "workspace_personal");
        assert_eq!(ws.profiles[ws.owner_id()].kind, ProfileKind::Me);

        let listed = list_workspaces(root.path()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].name, "Personal");

        assert!(matches!(open_workspace(root.path(), &ws.id, "wrong password"), Err(Error::BadPassword)));
        let reopened = open_workspace(root.path(), &ws.id, "correct horse").unwrap();
        assert_eq!(reopened.owner_id(), ws.owner_id());
        assert_eq!(reopened.profiles.len(), 1);
    }

    #[test]
    fn rejects_short_password_and_duplicate_workspace() {
        let root = tempfile::tempdir().unwrap();
        assert!(create_workspace(root.path(), "A", "Me", "short", FAST).is_err());
        create_workspace(root.path(), "A", "Me", "long enough", FAST).unwrap();
        assert!(create_workspace(root.path(), "A", "Me", "long enough", FAST).is_err());
    }

    #[test]
    fn records_persist_encrypted() {
        let root = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(root.path(), "Personal", "Alex", "correct horse", FAST).unwrap();
        let owner = ws.owner_id().to_string();

        let sarah = ws.save_profile(person("Sarah Secretname", ProfileKind::Person)).unwrap();
        let shop = ws.save_profile(person("The Rusty Bean", ProfileKind::Shop)).unwrap();
        assert!(shop.has_shop);
        ws.save_post(PostInput {
            id: None,
            author_id: owner.clone(),
            content: format!("Latte at @[profile:{}] with @[profile:{}]", shop.id, sarah.id),
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

        // Nothing readable on disk.
        for entry in walk(root.path()) {
            if entry.extension().and_then(|e| e.to_str()) == Some("enc") {
                let bytes = fs::read(&entry).unwrap();
                let text = String::from_utf8_lossy(&bytes);
                assert!(!text.contains("Secretname") && !text.contains("Latte"), "{} leaks plaintext", entry.display());
            }
        }

        let ws = open_workspace(root.path(), "workspace_personal", "correct horse").unwrap();
        assert_eq!(ws.profiles.len(), 3);
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items.values().next().unwrap().currency, "USD");

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
        let mut ws = create_workspace(root.path(), "Personal", "Alex", "correct horse", FAST).unwrap();
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

        let page = ws.save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: true, ..person("Book Club", ProfileKind::Page) }).unwrap();
        assert_eq!(ws.save_item(item).unwrap().currency, "LKR");
        assert!(
            ws.save_profile(ProfileInput { id: Some(page.id.clone()), has_shop: false, ..person("Book Club", ProfileKind::Page) }).is_err(),
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
        let mut ws = create_workspace(root.path(), "P", "Me", "long enough", FAST).unwrap();
        assert!(ws.delete_post("../../workspace.json").is_err());
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
}
