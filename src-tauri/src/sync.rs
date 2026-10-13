//! Save & Sync: copies of a workspace's encrypted files, without the key.
//!
//! - **Git, latest version only.** A private git folder per workspace (in the
//!   app's data folder, not the workspace) stages `workspace_<label>/`, makes one
//!   commit with no parent and force-pushes it, then drops the old local objects.
//!   The remote holds just the current state: no history of edits, no growth
//!   from re-encrypted files. If the remote has a snapshot this device didn't
//!   push (another computer), it refuses unless forced.
//! - **Backup folder.** Snapshots of the workspace in any folder (e.g. one synced
//!   by Google Drive, iCloud or Dropbox). Files are stored once by content hash,
//!   so unchanged records and photos cost nothing; the last N snapshots are kept
//!   and any can be restored as a new workspace.
//!
//! Everything copied is already encrypted. Settings are per device
//! (`sync.json` in the app's config folder): they hold only paths and a URL.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::error::{Error, Result};
use crate::store::{now_millis, validate_workspace_id, WORKSPACE_PREFIX};

const SKIP_DIRS: [&str; 2] = [".cache", ".rotate"];
const IDENTIFIER: &str = "com.hasi-coder.mydiary";

/// Per-workspace sync settings and status, on this device.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkspaceSync {
    /// e.g. `https://github.com/you/data.git` or `git@github.com:you/data.git`; empty = off.
    pub git_remote: String,
    /// Branch holding the snapshot (default `main`). Use one branch per workspace.
    pub git_branch: String,
    /// Private key for an SSH remote (e.g. `~/.ssh/id_ed25519_work`); empty = ssh's defaults.
    pub ssh_key: String,
    /// Folder for backups (e.g. inside Google Drive); empty = off.
    pub backup_dir: String,
    /// Backup snapshots to keep (default 10).
    pub keep: u32,
    /// Save & Sync automatically when the journal is locked.
    pub on_lock: bool,
    /// The commit this device last pushed, to notice snapshots pushed from elsewhere.
    pub last_pushed_commit: String,
    pub last_git_at: Option<i64>,
    pub last_backup_at: Option<i64>,
    pub last_error: String,
}

impl WorkspaceSync {
    pub fn branch(&self) -> &str {
        if self.git_branch.trim().is_empty() {
            "main"
        } else {
            self.git_branch.trim()
        }
    }

    pub fn keep(&self) -> usize {
        if self.keep == 0 {
            10
        } else {
            self.keep as usize
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SyncFile {
    pub workspaces: HashMap<String, WorkspaceSync>,
}

/// The app's per-device config folder (same place Tauri uses for the identifier).
pub fn config_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("MY_DIARY_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support").join(IDENTIFIER)
    } else if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or(home).join(IDENTIFIER)
    } else {
        std::env::var_os("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config")).join(IDENTIFIER)
    }
}

pub fn load(config: &Path) -> SyncFile {
    fs::read(config.join("sync.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

pub fn save(config: &Path, file: &SyncFile) -> Result<()> {
    fs::create_dir_all(config)?;
    let tmp = config.join("sync.json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(file)?)?;
    fs::rename(tmp, config.join("sync.json"))?;
    Ok(())
}

/// Updates one workspace's entry, reloading first so concurrent saves don't clobber each other.
pub fn update(config: &Path, workspace: &str, f: impl FnOnce(&mut WorkspaceSync)) -> Result<WorkspaceSync> {
    let mut file = load(config);
    let entry = file.workspaces.entry(workspace.to_string()).or_default();
    f(entry);
    let out = entry.clone();
    save(config, &file)?;
    Ok(out)
}

// ---- Files of a workspace ----

/// Every file of a workspace, as paths relative to it (sorted), skipping caches,
/// half-finished rotations and temp files.
fn workspace_files(dir: &Path) -> Result<Vec<PathBuf>> {
    fn walk(base: &Path, dir: &Path, out: &mut Vec<PathBuf>) -> Result<()> {
        for entry in fs::read_dir(dir)? {
            let path = entry?.path();
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if path.is_dir() {
                if !SKIP_DIRS.contains(&name) {
                    walk(base, &path, out)?;
                }
            } else if !name.ends_with(".tmp") && name != ".DS_Store" {
                out.push(path.strip_prefix(base).unwrap_or(&path).to_path_buf());
            }
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(dir, dir, &mut out)?;
    out.sort();
    Ok(out)
}

fn workspace_dir(data_root: &Path, workspace: &str) -> Result<PathBuf> {
    validate_workspace_id(workspace)?;
    let dir = data_root.join(workspace);
    if !dir.join("workspace.json").exists() {
        return Err(Error::NotFound(format!("workspace {workspace}")));
    }
    Ok(dir)
}

// ---- Git: latest version only ----

/// git, found even when the app is started from the Dock (without the shell's PATH).
fn git_binary() -> Option<PathBuf> {
    let candidates = ["git", "/opt/homebrew/bin/git", "/usr/local/bin/git", "/usr/bin/git", "C:\\Program Files\\Git\\cmd\\git.exe"];
    candidates.iter().map(PathBuf::from).find(|g| Command::new(g).arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success()))
}

pub fn git_available() -> bool {
    git_binary().is_some()
}

struct Git {
    bin: PathBuf,
    git_dir: PathBuf,
    work_tree: PathBuf,
    ssh_command: String,
}

fn expand_home(path: &str) -> PathBuf {
    match path.trim().strip_prefix("~/") {
        Some(rest) => std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default().join(rest),
        None => PathBuf::from(path.trim()),
    }
}

/// How git should run ssh: never prompting, and with the workspace's own key
/// (ignoring ~/.ssh/config host aliases) when one is set.
fn ssh_command(key: &str) -> String {
    if key.trim().is_empty() {
        return "ssh -o BatchMode=yes".into();
    }
    let key = expand_home(key).display().to_string().replace('\'', "'\\''");
    format!("ssh -i '{key}' -o IdentitiesOnly=yes -o BatchMode=yes -F /dev/null")
}

impl Git {
    fn run(&self, args: &[&str]) -> Result<String> {
        let output = Command::new(&self.bin)
            .arg(format!("--git-dir={}", self.git_dir.display()))
            .arg(format!("--work-tree={}", self.work_tree.display()))
            .args(["-c", "core.autocrlf=false", "-c", "core.quotepath=off", "-c", "gc.auto=0"])
            .args(args)
            // Never wait for a password prompt; credential helpers (keychain, gh) still work.
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_SSH_COMMAND", &self.ssh_command)
            .env("GIT_AUTHOR_NAME", "My Diary")
            .env("GIT_AUTHOR_EMAIL", "my-diary@localhost")
            .env("GIT_COMMITTER_NAME", "My Diary")
            .env("GIT_COMMITTER_EMAIL", "my-diary@localhost")
            .stdin(Stdio::null())
            .output()?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let err = String::from_utf8_lossy(&output.stderr);
            Err(Error::Invalid(format!("git {}: {}", args.first().unwrap_or(&""), err.trim())))
        }
    }
}

/// A staged snapshot, ready to push (staging needs a quiet workspace; pushing doesn't).
pub struct StagedSnapshot {
    git: Git,
    commit: String,
    remote: String,
    branch: String,
}

/// Stages the workspace into its sync repo and commits it, with no parent.
/// Run while nothing is writing to the workspace.
pub fn stage_git(data_root: &Path, sync_root: &Path, workspace: &str, settings: &WorkspaceSync) -> Result<StagedSnapshot> {
    let remote = settings.git_remote.trim();
    if remote.is_empty() {
        return Err(Error::Invalid("Set a git remote first.".into()));
    }
    workspace_dir(data_root, workspace)?;
    let bin = git_binary().ok_or_else(|| Error::Invalid("git isn't installed.".into()))?;
    let git_dir = sync_root.join(format!("{workspace}.git"));
    if !settings.ssh_key.trim().is_empty() && !expand_home(&settings.ssh_key).is_file() {
        return Err(Error::Invalid(format!("SSH key {} not found.", settings.ssh_key.trim())));
    }
    let git = Git { bin, git_dir: git_dir.clone(), work_tree: data_root.to_path_buf(), ssh_command: ssh_command(&settings.ssh_key) };
    if !git_dir.exists() {
        fs::create_dir_all(sync_root)?;
        let status = Command::new(&git.bin).args(["init", "-q", "--bare"]).arg(&git_dir).stdin(Stdio::null()).output()?;
        if !status.status.success() {
            return Err(Error::Invalid("Couldn't create the sync repository.".into()));
        }
        // A bare repo with an explicit work tree: the index lives here, never in the workspace.
        git.run(&["config", "core.bare", "false"])?;
    }
    fs::create_dir_all(git_dir.join("info"))?;
    fs::write(git_dir.join("info/exclude"), ".cache/\n.rotate/\n*.tmp\n.DS_Store\n")?;
    // A fresh index each time: exactly this workspace, nothing else from the data folder.
    let _ = fs::remove_file(git_dir.join("index"));
    git.run(&["add", "-A", "--", workspace])?;
    let tree = git.run(&["write-tree"])?;
    let commit = git.run(&["commit-tree", &tree, "-m", &format!("Snapshot of {workspace}")])?;
    Ok(StagedSnapshot { git, commit, remote: remote.to_string(), branch: settings.branch().to_string() })
}

/// What a git sync did.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitOutcome {
    pub commit: String,
    /// False when the remote already had exactly this state.
    pub pushed: bool,
}

/// Force-pushes a staged snapshot as the branch's only commit, then forgets older local objects.
pub fn push_git(staged: &StagedSnapshot, last_pushed: &str, force: bool) -> Result<GitOutcome> {
    let git = &staged.git;
    let head = git.run(&["ls-remote", &staged.remote, &format!("refs/heads/{}", staged.branch)])?;
    let remote_head = head.split_whitespace().next().unwrap_or("").to_string();
    if !remote_head.is_empty() && remote_head != last_pushed && !force {
        return Err(Error::Invalid(format!(
            "The remote branch {} has a snapshot this device didn't push (from another computer?). Sync with “Overwrite remote” to replace it.",
            staged.branch
        )));
    }
    // Same tree as what's already there: nothing to push.
    let same = !remote_head.is_empty()
        && remote_head == last_pushed
        && git.run(&["rev-parse", &format!("{last_pushed}^{{tree}}")]).ok() == git.run(&["rev-parse", &format!("{}^{{tree}}", staged.commit)]).ok();
    if same {
        return Ok(GitOutcome { commit: last_pushed.to_string(), pushed: false });
    }
    git.run(&["push", "--force", "--quiet", &staged.remote, &format!("{}:refs/heads/{}", staged.commit, staged.branch)])?;
    // Latest only, locally too: keep just this snapshot.
    git.run(&["update-ref", "refs/heads/snapshot", &staged.commit])?;
    let _ = git.run(&["reflog", "expire", "--expire=now", "--all"]);
    let _ = git.run(&["prune", "--expire=now"]);
    Ok(GitOutcome { commit: staged.commit.clone(), pushed: true })
}

// ---- Backup folder ----

/// One backup snapshot, as listed.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub created_at: i64,
    pub files: usize,
    pub bytes: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotManifest {
    workspace: String,
    created_at: i64,
    /// Relative path (with `/`) -> content hash.
    files: BTreeMap<String, String>,
    sizes: BTreeMap<String, u64>,
}

fn backup_root(backup_dir: &str, workspace: &str) -> Result<PathBuf> {
    let dir = backup_dir.trim();
    if dir.is_empty() {
        return Err(Error::Invalid("Choose a backup folder first.".into()));
    }
    let dir = expand_home(dir);
    if !dir.is_absolute() {
        return Err(Error::Invalid("Use a full folder path for backups.".into()));
    }
    Ok(dir.join(format!("my-diary-{workspace}")))
}

fn snapshots(root: &Path) -> Result<Vec<(String, SnapshotManifest)>> {
    let dir = root.join("snapshots");
    let mut out = Vec::new();
    if dir.exists() {
        for entry in fs::read_dir(&dir)? {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Ok(m) = serde_json::from_slice::<SnapshotManifest>(&fs::read(&path)?) {
                    out.push((path.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_string(), m));
                }
            }
        }
    }
    out.sort_by_key(|(name, _)| name.clone());
    Ok(out)
}

pub fn list_backups(backup_dir: &str, workspace: &str) -> Result<Vec<BackupInfo>> {
    let root = backup_root(backup_dir, workspace)?;
    let mut list: Vec<BackupInfo> = snapshots(&root)?
        .into_iter()
        .map(|(name, m)| BackupInfo { name, created_at: m.created_at, files: m.files.len(), bytes: m.sizes.values().sum() })
        .collect();
    list.reverse();
    Ok(list)
}

fn timestamp_name(millis: i64) -> String {
    // UTC, sortable: 20261013-091502-123
    let secs = millis.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Civil date from days since 1970-01-01 (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}{m:02}{d:02}-{:02}{:02}{:02}-{:03}", rem / 3600, rem / 60 % 60, rem % 60, millis.rem_euclid(1000))
}

/// What a backup did.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupOutcome {
    /// The new snapshot, or `None` when nothing changed since the last one.
    pub snapshot: Option<String>,
    pub new_files: usize,
    pub pruned: usize,
}

/// Writes a snapshot of the workspace into the backup folder (files stored once
/// by content), then keeps only the newest `keep`. Run while nothing is writing.
pub fn backup(data_root: &Path, workspace: &str, settings: &WorkspaceSync) -> Result<BackupOutcome> {
    let dir = workspace_dir(data_root, workspace)?;
    let root = backup_root(&settings.backup_dir, workspace)?;
    let objects = root.join("objects");
    fs::create_dir_all(&objects)?;
    fs::create_dir_all(root.join("snapshots"))?;

    let mut files = BTreeMap::new();
    let mut sizes = BTreeMap::new();
    let mut new_files = 0;
    for rel in workspace_files(&dir)? {
        let bytes = fs::read(dir.join(&rel))?;
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let object = objects.join(&hash[..2]).join(&hash);
        if !object.exists() {
            fs::create_dir_all(object.parent().unwrap_or(&objects))?;
            let tmp = object.with_extension("tmp");
            fs::write(&tmp, &bytes)?;
            fs::rename(&tmp, &object)?;
            new_files += 1;
        }
        let key = rel.to_string_lossy().replace('\\', "/");
        sizes.insert(key.clone(), bytes.len() as u64);
        files.insert(key, hash);
    }

    let existing = snapshots(&root)?;
    if existing.last().is_some_and(|(_, last)| last.files == files) {
        return Ok(BackupOutcome { snapshot: None, new_files: 0, pruned: 0 });
    }
    let created_at = now_millis();
    let name = timestamp_name(created_at);
    let manifest = SnapshotManifest { workspace: workspace.to_string(), created_at, files, sizes };
    let path = root.join("snapshots").join(format!("{name}.json"));
    fs::write(path.with_extension("tmp"), serde_json::to_vec_pretty(&manifest)?)?;
    fs::rename(path.with_extension("tmp"), &path)?;

    // Keep the newest N, then drop objects no snapshot uses.
    let all = snapshots(&root)?;
    let excess = all.len().saturating_sub(settings.keep());
    for (old, _) in &all[..excess] {
        fs::remove_file(root.join("snapshots").join(format!("{old}.json")))?;
    }
    let used: HashSet<String> = all[excess..].iter().flat_map(|(_, m)| m.files.values().cloned()).collect();
    for shard in fs::read_dir(&objects)? {
        let shard = shard?.path();
        if shard.is_dir() {
            for object in fs::read_dir(&shard)? {
                let object = object?.path();
                let name = object.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if !used.contains(name) {
                    fs::remove_file(&object)?;
                }
            }
        }
    }
    Ok(BackupOutcome { snapshot: Some(name), new_files, pruned: excess })
}

/// Restores a backup snapshot as a new workspace folder (never over an existing one).
/// Returns its id; it opens with the password the workspace had at that time.
pub fn restore_backup(data_root: &Path, workspace: &str, settings: &WorkspaceSync, snapshot: &str) -> Result<String> {
    let root = backup_root(&settings.backup_dir, workspace)?;
    if snapshot.is_empty() || !snapshot.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(Error::Invalid("Unknown backup.".into()));
    }
    let manifest: SnapshotManifest = serde_json::from_slice(&fs::read(root.join("snapshots").join(format!("{snapshot}.json")))?)?;
    let label = workspace.strip_prefix(WORKSPACE_PREFIX).unwrap_or(workspace);
    let target_id = format!("{WORKSPACE_PREFIX}{label}_restored_{}", snapshot.replace('-', "_"));
    validate_workspace_id(&target_id)?;
    let target = data_root.join(&target_id);
    if target.exists() {
        return Err(Error::Invalid(format!("{target_id} already exists.")));
    }
    for (rel, hash) in &manifest.files {
        if rel.split('/').any(|part| part == ".." || part.is_empty()) || !hash.chars().all(|c| c.is_ascii_hexdigit()) || hash.len() < 3 {
            return Err(Error::Invalid("The backup is damaged.".into()));
        }
        let bytes = fs::read(root.join("objects").join(&hash[..2]).join(hash))?;
        if format!("{:x}", Sha256::digest(&bytes)) != *hash {
            return Err(Error::Invalid(format!("The backup copy of {rel} is damaged.")));
        }
        let dest = target.join(rel);
        fs::create_dir_all(dest.parent().unwrap_or(&target))?;
        fs::write(dest, bytes)?;
    }
    Ok(target_id)
}

// ---- Command line ----

/// `my-diary --sync <workspace_id> [--force]`: the same Save & Sync as the button,
/// using this device's settings. Needs no password: everything is already encrypted.
pub fn cli(args: &[String]) -> i32 {
    let Some(workspace) = args.iter().skip_while(|a| *a != "--sync").nth(1).cloned() else {
        eprintln!("usage: my-diary --sync <workspace_id> [--force]");
        return 2;
    };
    let force = args.iter().any(|a| a == "--force");
    let config = config_dir();
    let settings = load(&config).workspaces.get(&workspace).cloned().unwrap_or_default();
    match run(&crate::store::data_root(), &config, &workspace, &settings, force) {
        Ok(report) => {
            println!("{}", report.summary());
            0
        }
        Err(e) => {
            eprintln!("{e}");
            1
        }
    }
}

/// What Save & Sync did, for the UI and the CLI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub backup: Option<BackupOutcome>,
    pub git: Option<GitOutcome>,
    pub errors: Vec<String>,
}

impl SyncReport {
    pub fn summary(&self) -> String {
        let mut parts = Vec::new();
        match &self.backup {
            Some(BackupOutcome { snapshot: Some(name), new_files, .. }) => parts.push(format!("Backed up ({name}, {new_files} new files).")),
            Some(_) => parts.push("Backup: no changes since the last one.".into()),
            None => {}
        }
        match &self.git {
            Some(GitOutcome { pushed: true, commit }) => parts.push(format!("Pushed snapshot {}.", &commit[..commit.len().min(8)])),
            Some(_) => parts.push("Git: already up to date.".into()),
            None => {}
        }
        parts.extend(self.errors.iter().cloned());
        if parts.is_empty() {
            "Nothing to do: set a backup folder or a git remote.".into()
        } else {
            parts.join(" ")
        }
    }
}

/// The local half of Save & Sync: the backup, and the staged git snapshot.
pub struct Prepared {
    report: SyncReport,
    staged: Option<StagedSnapshot>,
}

/// Backs up and stages (each if set up). Copies files, so the app runs it while
/// holding the workspace still; the network push comes after, in [`finish`].
pub fn prepare(data_root: &Path, config: &Path, workspace: &str, settings: &WorkspaceSync) -> Result<Prepared> {
    workspace_dir(data_root, workspace)?;
    let mut report = SyncReport { backup: None, git: None, errors: Vec::new() };
    if !settings.backup_dir.trim().is_empty() {
        match backup(data_root, workspace, settings) {
            Ok(b) => report.backup = Some(b),
            Err(e) => report.errors.push(format!("Backup failed: {e}")),
        }
    }
    let staged = if settings.git_remote.trim().is_empty() {
        None
    } else {
        match stage_git(data_root, &config.join("sync"), workspace, settings) {
            Ok(s) => Some(s),
            Err(e) => {
                report.errors.push(format!("Git failed: {e}"));
                None
            }
        }
    };
    Ok(Prepared { report, staged })
}

/// Pushes the staged snapshot (if any) and records the outcome in `sync.json`.
pub fn finish(config: &Path, workspace: &str, settings: &WorkspaceSync, prepared: Prepared, force: bool) -> Result<SyncReport> {
    let Prepared { mut report, staged } = prepared;
    if let Some(staged) = staged {
        match push_git(&staged, &settings.last_pushed_commit, force) {
            Ok(g) => report.git = Some(g),
            Err(e) => report.errors.push(format!("Git failed: {e}")),
        }
    }
    let now = now_millis();
    update(config, workspace, |s| {
        if report.backup.is_some() {
            s.last_backup_at = Some(now);
        }
        if let Some(g) = &report.git {
            s.last_git_at = Some(now);
            s.last_pushed_commit = g.commit.clone();
        }
        s.last_error = report.errors.join(" ");
    })?;
    Ok(report)
}

/// Both halves, for the command line (where nothing else is writing).
pub fn run(data_root: &Path, config: &Path, workspace: &str, settings: &WorkspaceSync, force: bool) -> Result<SyncReport> {
    let prepared = prepare(data_root, config, workspace, settings)?;
    finish(config, workspace, settings, prepared, force)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::PostInput;
    use crate::store::{self, KdfCost};

    const FAST: KdfCost = KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 };

    fn git(dir: &Path, args: &[&str]) -> String {
        let out = Command::new(git_binary().unwrap()).arg(format!("--git-dir={}", dir.display())).args(args).output().unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn write_post(data: &Path, text: &str) {
        let mut ws = store::open_workspace(data, "workspace_personal", "correct horse").unwrap();
        let owner = ws.owner_id().to_string();
        ws.save_post(PostInput { author_id: owner, content: text.into(), ..Default::default() }).unwrap();
    }

    #[test]
    fn git_keeps_only_the_latest_snapshot() {
        if !git_available() {
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let (data, config, remote) = (tmp.path().join("data"), tmp.path().join("config"), tmp.path().join("remote.git"));
        fs::create_dir_all(&data).unwrap();
        store::create_workspace(&data, "", "Personal", "Alex", "correct horse", FAST).unwrap();
        fs::create_dir_all(data.join("workspace_personal/.cache")).unwrap();
        fs::write(data.join("workspace_personal/.cache/x"), "cache").unwrap();
        // Another workspace in the same data folder must not be included.
        store::create_workspace(&data, "other", "Other", "Sam", "correct horse", FAST).unwrap();
        Command::new(git_binary().unwrap()).args(["init", "-q", "--bare"]).arg(&remote).status().unwrap();
        let settings = |config: &Path| {
            let mut s = load(config).workspaces.get("workspace_personal").cloned().unwrap_or_default();
            s.git_remote = remote.display().to_string();
            s
        };

        let first = run(&data, &config, "workspace_personal", &settings(&config), false).unwrap();
        assert!(first.git.as_ref().unwrap().pushed, "{:?}", first.errors);
        let files = git(&remote, &["ls-tree", "-r", "--name-only", "main"]);
        assert!(files.contains("workspace_personal/workspace.json") && files.contains("workspace_personal/manifest.enc"));
        assert!(!files.contains(".cache") && !files.contains("workspace_other"), "{files}");

        // Unchanged: nothing to push.
        let again = run(&data, &config, "workspace_personal", &settings(&config), false).unwrap();
        assert!(!again.git.unwrap().pushed);

        // Changed: a new snapshot replaces the old one; still one commit, no history.
        write_post(&data, "hello");
        let second = run(&data, &config, "workspace_personal", &settings(&config), false).unwrap();
        assert!(second.git.as_ref().unwrap().pushed);
        assert_eq!(git(&remote, &["rev-list", "--count", "main"]), "1");
        assert_ne!(second.git.unwrap().commit, first.git.unwrap().commit);

        // A snapshot pushed from elsewhere isn't overwritten unless forced.
        let elsewhere = git(&remote, &["commit-tree", "main^{tree}", "-m", "from another computer"]);
        git(&remote, &["update-ref", "refs/heads/main", &elsewhere]);
        write_post(&data, "again");
        let refused = run(&data, &config, "workspace_personal", &settings(&config), false).unwrap();
        assert!(refused.git.is_none() && refused.errors[0].contains("didn't push"), "{:?}", refused.errors);
        let forced = run(&data, &config, "workspace_personal", &settings(&config), true).unwrap();
        assert!(forced.git.unwrap().pushed);
        assert_eq!(git(&remote, &["rev-list", "--count", "main"]), "1");
        assert!(load(&config).workspaces["workspace_personal"].last_git_at.is_some());
    }

    #[test]
    fn backups_dedupe_prune_and_restore() {
        let tmp = tempfile::tempdir().unwrap();
        let (data, backups) = (tmp.path().join("data"), tmp.path().join("Google Drive/My Diary"));
        fs::create_dir_all(&data).unwrap();
        store::create_workspace(&data, "", "Personal", "Alex", "correct horse", FAST).unwrap();
        let settings = WorkspaceSync { backup_dir: backups.display().to_string(), keep: 2, ..Default::default() };
        assert!(backup(&data, "workspace_personal", &WorkspaceSync { backup_dir: "relative/path".into(), ..Default::default() }).is_err());

        let first = backup(&data, "workspace_personal", &settings).unwrap();
        assert!(first.snapshot.is_some() && first.new_files > 0);
        assert_eq!(backup(&data, "workspace_personal", &settings).unwrap().snapshot, None, "no changes, no snapshot");

        write_post(&data, "first post");
        let second = backup(&data, "workspace_personal", &settings).unwrap();
        assert!(second.new_files < first.new_files + 3, "unchanged files are stored once");
        write_post(&data, "second post");
        std::thread::sleep(std::time::Duration::from_millis(5));
        let third = backup(&data, "workspace_personal", &settings).unwrap();
        assert_eq!(third.pruned, 1, "keeps the newest two");
        let list = list_backups(&settings.backup_dir, "workspace_personal").unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].name, third.snapshot.clone().unwrap(), "newest first");

        // Restore the older one as a new workspace: it opens, with what it had then.
        let restored = restore_backup(&data, "workspace_personal", &settings, &list[1].name).unwrap();
        assert!(restored.starts_with("workspace_personal_restored_"));
        let ws = store::open_workspace(&data, &restored, "correct horse").unwrap();
        assert_eq!(ws.posts.len(), 1);
        assert_eq!(ws.manifest.owner_profile_id, store::open_workspace(&data, "workspace_personal", "correct horse").unwrap().manifest.owner_profile_id);
        assert!(restore_backup(&data, "workspace_personal", &settings, "../etc").is_err());
    }

    #[test]
    fn ssh_uses_the_workspace_key() {
        assert_eq!(ssh_command(""), "ssh -o BatchMode=yes");
        let home = std::env::var("HOME").unwrap();
        assert_eq!(ssh_command("~/.ssh/id_work"), format!("ssh -i '{home}/.ssh/id_work' -o IdentitiesOnly=yes -o BatchMode=yes -F /dev/null"));
        assert_eq!(ssh_command("/k/it's"), "ssh -i '/k/it'\\''s' -o IdentitiesOnly=yes -o BatchMode=yes -F /dev/null");
    }

    #[test]
    fn timestamp_names_sort_by_time() {
        assert_eq!(timestamp_name(0), "19700101-000000-000");
        assert_eq!(timestamp_name(1_791_890_102_123), "20261013-111502-123");
        assert!(timestamp_name(1_791_890_102_123) < timestamp_name(1_791_890_102_124));
    }
}
