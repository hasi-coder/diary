//! Tauri IPC commands. The unlocked workspace lives only in [`AppState`].

use std::path::PathBuf;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

use crate::error::{Error, Result};
use crate::model::*;
use crate::mcp;
use crate::sync;
use crate::store::{self, Workspace};

pub struct AppState {
    pub root: PathBuf,
    pub workspace: Mutex<Option<Workspace>>,
    /// Recent agent (MCP) calls, for Settings. Memory only.
    pub agent_log: mcp::AgentLog,
    /// The agent endpoint, while agent access is on and the journal unlocked.
    pub mcp: Mutex<Option<mcp::McpServer>>,
    /// Per-device settings (Save & Sync), outside any workspace.
    pub config_dir: PathBuf,
}

impl AppState {
    pub fn new(root: PathBuf) -> Self {
        Self { root, workspace: Mutex::new(None), agent_log: mcp::AgentLog::default(), mcp: Mutex::new(None), config_dir: sync::config_dir() }
    }

    pub(crate) fn with_workspace<T>(&self, f: impl FnOnce(&mut Workspace) -> Result<T>) -> Result<T> {
        let mut guard = self.workspace.lock().unwrap_or_else(|e| e.into_inner());
        f(guard.as_mut().ok_or(Error::Locked)?)
    }

    fn install(&self, ws: Workspace) -> Snapshot {
        let snapshot = ws.snapshot();
        *self.workspace.lock().unwrap_or_else(|e| e.into_inner()) = Some(ws);
        snapshot
    }
}

/// Runs the (deliberately slow) Argon2id work off the async executor.
async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| Error::Invalid(format!("background task failed: {e}")))?
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<WorkspaceInfo>> {
    store::list_workspaces(&state.root)
}

#[tauri::command]
pub async fn create_workspace(
    state: State<'_, AppState>,
    folder: String,
    name: String,
    owner_name: String,
    password: String,
) -> Result<Snapshot> {
    let password = Zeroizing::new(password);
    let root = state.root.clone();
    let ws =
        blocking(move || store::create_workspace(&root, &folder, &name, &owner_name, &password, store::DEFAULT_KDF)).await?;
    Ok(state.install(ws))
}

#[tauri::command]
pub async fn unlock_workspace(app: AppHandle, state: State<'_, AppState>, id: String, password: String) -> Result<Snapshot> {
    let password = Zeroizing::new(password);
    let root = state.root.clone();
    let ws = blocking(move || store::open_workspace(&root, &id, &password)).await?;
    let snapshot = state.install(ws);
    // Agents can't connect until the journal is unlocked; a busy port isn't fatal here.
    if let Err(e) = sync_agent_server(&app) {
        state.agent_log.push("server", e.to_string(), false);
    }
    Ok(snapshot)
}

/// Drops the decrypted cache; the data key is zeroized on drop.
#[tauri::command]
pub fn lock_workspace(state: State<'_, AppState>) {
    let closed = state.workspace.lock().unwrap_or_else(|e| e.into_inner()).take().map(|ws| ws.id.clone());
    *state.mcp.lock().unwrap_or_else(|e| e.into_inner()) = None;
    // Save & Sync on lock, in the background: once locked nothing writes, and no key is needed.
    if let Some(id) = closed {
        let settings = sync::load(&state.config_dir).workspaces.get(&id).cloned().unwrap_or_default();
        if settings.on_lock && (!settings.backup_dir.trim().is_empty() || !settings.git_remote.trim().is_empty()) {
            let (root, config) = (state.root.clone(), state.config_dir.clone());
            std::thread::spawn(move || {
                if let Err(e) = sync::run(&root, &config, &id, &settings, false) {
                    let _ = sync::update(&config, &id, |s| s.last_error = e.to_string());
                }
            });
        }
    }
}

#[tauri::command]
pub fn get_snapshot(state: State<'_, AppState>) -> Result<Snapshot> {
    state.with_workspace(|ws| Ok(ws.snapshot()))
}

#[tauri::command]
pub fn list_posts(state: State<'_, AppState>, filter: Option<PostFilter>) -> Result<Vec<Post>> {
    state.with_workspace(|ws| Ok(ws.query_posts(&filter.unwrap_or_default())))
}

#[tauri::command]
pub fn save_profile(state: State<'_, AppState>, input: ProfileInput) -> Result<Profile> {
    state.with_workspace(|ws| ws.save_profile(input))
}

#[tauri::command]
pub fn delete_profile(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.delete_profile(&id))
}

#[tauri::command]
pub fn save_post(state: State<'_, AppState>, input: PostInput) -> Result<Post> {
    state.with_workspace(|ws| ws.save_post(input))
}

#[tauri::command]
pub fn delete_post(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.delete_post(&id))
}

#[tauri::command]
pub fn save_item(state: State<'_, AppState>, input: ItemInput) -> Result<Item> {
    state.with_workspace(|ws| ws.save_item(input))
}

#[tauri::command]
pub fn delete_item(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.delete_item(&id))
}

#[tauri::command]
pub fn save_series(state: State<'_, AppState>, input: SeriesInput) -> Result<Series> {
    state.with_workspace(|ws| ws.save_series(input))
}

#[tauri::command]
pub fn delete_series(state: State<'_, AppState>, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.delete_series(&id))
}

/// Rewrites files still stored in an older format, then returns the fresh snapshot.
#[tauri::command]
pub fn run_migration(state: State<'_, AppState>) -> Result<Snapshot> {
    state.with_workspace(|ws| {
        ws.run_migration()?;
        Ok(ws.snapshot())
    })
}

/// Stages an upload. The file bytes arrive as the raw IPC body; the original
/// file name comes base64-encoded (UTF-8) in the `x-file-name` header.
#[tauri::command]
pub fn stage_media(state: State<'_, AppState>, request: Request<'_>) -> Result<MediaRef> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Invalid("Expected the file as a binary body.".into()));
    };
    let name = request
        .headers()
        .get("x-file-name")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| B64.decode(v).ok())
        .and_then(|v| String::from_utf8(v).ok())
        .unwrap_or_default();
    state.with_workspace(|ws| ws.stage_media(&name, bytes.clone()))
}

/// Drops staged uploads that won't be saved (e.g. a cancelled draft).
#[tauri::command]
pub fn discard_media(state: State<'_, AppState>, ids: Vec<String>) -> Result<()> {
    state.with_workspace(|ws| {
        ws.discard_media(&ids);
        Ok(())
    })
}

/// Full-text search across posts, profiles and items.
#[tauri::command]
pub fn search(state: State<'_, AppState>, query: String, limit: Option<usize>) -> Result<SearchResults> {
    state.with_workspace(|ws| Ok(ws.search(&query, limit.unwrap_or(20).min(200))))
}

#[tauri::command]
pub fn get_post(state: State<'_, AppState>, id: String) -> Result<Post> {
    state.with_workspace(|ws| ws.posts.get(&id).cloned().ok_or_else(|| Error::NotFound(format!("post {id}"))))
}

/// Changes the password, optionally rotating the data key (see `Workspace::change_password`).
#[tauri::command]
pub async fn change_password(app: AppHandle, current: String, new_password: String, rotate_key: bool) -> Result<PasswordChange> {
    let (current, new_password) = (Zeroizing::new(current), Zeroizing::new(new_password));
    blocking(move || {
        app.state::<AppState>()
            .with_workspace(|ws| ws.change_password(&current, &new_password, rotate_key, store::DEFAULT_KDF))
    })
    .await
}

#[tauri::command]
pub fn set_profile_photo(state: State<'_, AppState>, profile_id: String, slot: PhotoSlot, media_id: Option<String>) -> Result<Profile> {
    state.with_workspace(|ws| ws.set_profile_photo(&profile_id, slot, media_id))
}

#[tauri::command]
pub fn set_cover_position(state: State<'_, AppState>, profile_id: String, position: u8) -> Result<Profile> {
    state.with_workspace(|ws| ws.set_cover_position(&profile_id, position))
}

/// Stages a copy of a photo already in the journal, e.g. to use as a profile picture.
#[tauri::command]
pub fn stage_media_copy(state: State<'_, AppState>, media_id: String) -> Result<MediaRef> {
    state.with_workspace(|ws| ws.stage_media_copy(&media_id))
}

#[tauri::command]
pub fn save_relation(state: State<'_, AppState>, profile_id: String, input: RelationInput) -> Result<Profile> {
    state.with_workspace(|ws| ws.save_relation(&profile_id, input))
}

#[tauri::command]
pub fn delete_relation(state: State<'_, AppState>, profile_id: String, relation_id: String) -> Result<Profile> {
    state.with_workspace(|ws| ws.delete_relation(&profile_id, &relation_id))
}

#[tauri::command]
pub fn set_photo_tags(state: State<'_, AppState>, post_id: String, media_id: String, tags: Vec<PhotoTag>) -> Result<Post> {
    state.with_workspace(|ws| ws.set_photo_tags(&post_id, &media_id, tags))
}

// ---- Trash ----

#[tauri::command]
pub fn list_trash(state: State<'_, AppState>) -> Result<Vec<TrashEntry>> {
    state.with_workspace(|ws| Ok(ws.list_trash()))
}

#[tauri::command]
pub fn restore_from_trash(state: State<'_, AppState>, kind: String, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.restore(&kind, &id))
}

#[tauri::command]
pub fn purge_from_trash(state: State<'_, AppState>, kind: String, id: String) -> Result<()> {
    state.with_workspace(|ws| ws.purge(&kind, &id))
}

#[tauri::command]
pub fn empty_trash(state: State<'_, AppState>) -> Result<usize> {
    state.with_workspace(|ws| ws.empty_trash())
}

// ---- Agent access (MCP) ----

/// Agent access as Settings shows it.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAccessView {
    pub enabled: bool,
    pub port: u16,
    pub token: String,
    pub running: bool,
    pub url: String,
    /// This app's executable, for the stdio bridge (`--mcp-stdio`).
    pub executable: String,
    pub log: Vec<mcp::AgentEvent>,
}

fn agent_view(state: &AppState) -> Result<AgentAccessView> {
    let access = state.with_workspace(|ws| Ok(ws.manifest.agent.clone()))?;
    let running = state.mcp.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|s| s.port);
    let port = access.as_ref().map_or(mcp::DEFAULT_PORT, |a| a.port);
    Ok(AgentAccessView {
        enabled: access.as_ref().is_some_and(|a| a.enabled),
        port,
        token: access.map(|a| a.token).unwrap_or_default(),
        running: running == Some(port),
        url: format!("http://127.0.0.1:{port}/mcp"),
        executable: std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default(),
        log: state.agent_log.recent(),
    })
}

/// Starts, restarts or stops the endpoint to match the workspace's settings.
pub(crate) fn sync_agent_server(app: &AppHandle) -> Result<()> {
    let state = app.state::<AppState>();
    let wanted = state.with_workspace(|ws| Ok(ws.manifest.agent.clone().filter(|a| a.enabled))).ok().flatten();
    let mut slot = state.mcp.lock().unwrap_or_else(|e| e.into_inner());
    match wanted {
        None => *slot = None,
        Some(access) if slot.as_ref().map(|s| s.port) != Some(access.port) => {
            *slot = None;
            let handle = app.clone();
            *slot = Some(mcp::start(access.port, Box::new(move |f| f(&handle.state::<AppState>())))?);
        }
        Some(_) => {}
    }
    Ok(())
}

#[tauri::command]
pub fn get_agent_access(state: State<'_, AppState>) -> Result<AgentAccessView> {
    agent_view(&state)
}

/// Turns agent access on or off (and sets its port). The first time, a token is made.
#[tauri::command]
pub fn set_agent_access(app: AppHandle, state: State<'_, AppState>, enabled: bool, port: Option<u16>) -> Result<AgentAccessView> {
    state.with_workspace(|ws| {
        let current = ws.manifest.agent.clone();
        let access = AgentAccess {
            enabled,
            port: port.filter(|p| *p >= 1024).or(current.as_ref().map(|a| a.port)).unwrap_or(mcp::DEFAULT_PORT),
            token: current.map(|a| a.token).filter(|t| !t.is_empty()).unwrap_or_else(mcp::new_token),
        };
        ws.save_agent_access(Some(access))
    })?;
    sync_agent_server(&app)?;
    agent_view(&state)
}

/// A new token: agents configured with the old one stop working.
#[tauri::command]
pub fn regenerate_agent_token(state: State<'_, AppState>) -> Result<AgentAccessView> {
    state.with_workspace(|ws| {
        let access = ws.manifest.agent.clone().map(|a| AgentAccess { token: mcp::new_token(), ..a });
        ws.save_agent_access(access)
    })?;
    agent_view(&state)
}

// ---- Save & Sync ----

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncView {
    pub workspace: String,
    pub settings: sync::WorkspaceSync,
    pub git_available: bool,
}

fn current_id(state: &AppState) -> Result<String> {
    state.with_workspace(|ws| Ok(ws.id.clone()))
}

#[tauri::command]
pub fn get_sync_settings(state: State<'_, AppState>) -> Result<SyncView> {
    let id = current_id(&state)?;
    let settings = sync::load(&state.config_dir).workspaces.get(&id).cloned().unwrap_or_default();
    Ok(SyncView { workspace: id, settings, git_available: sync::git_available() })
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSettingsInput {
    pub git_remote: String,
    pub git_branch: String,
    #[serde(default)]
    pub ssh_key: String,
    pub backup_dir: String,
    pub keep: u32,
    pub on_lock: bool,
}

#[tauri::command]
pub fn save_sync_settings(state: State<'_, AppState>, input: SyncSettingsInput) -> Result<SyncView> {
    let id = current_id(&state)?;
    let remote = input.git_remote.trim().to_string();
    if !(remote.is_empty() || remote.starts_with("https://") || remote.starts_with("git@") || remote.starts_with("ssh://") || remote.starts_with('/') || remote.starts_with("file://")) {
        return Err(Error::Invalid("Use an https://, git@ or ssh:// remote.".into()));
    }
    let settings = sync::update(&state.config_dir, &id, |s| {
        // A different remote or branch: whatever this device pushed before doesn't count there.
        if s.git_remote != remote || s.git_branch.trim() != input.git_branch.trim() {
            s.last_pushed_commit.clear();
        }
        s.git_remote = remote;
        s.git_branch = input.git_branch.trim().to_string();
        s.ssh_key = input.ssh_key.trim().to_string();
        s.backup_dir = input.backup_dir.trim().to_string();
        s.keep = input.keep.clamp(1, 1000);
        s.on_lock = input.on_lock;
    })?;
    Ok(SyncView { workspace: id, settings, git_available: sync::git_available() })
}

/// Save & Sync now: backup folder, then git. `force` overwrites a remote snapshot
/// this device didn't push.
#[tauri::command]
pub async fn sync_now(app: AppHandle, force: bool) -> Result<sync::SyncReport> {
    blocking(move || {
        let state = app.state::<AppState>();
        let (id, settings, prepared) = {
            // Hold the workspace still while files are copied and staged.
            let guard = state.workspace.lock().unwrap_or_else(|e| e.into_inner());
            let id = guard.as_ref().ok_or(Error::Locked)?.id.clone();
            let settings = sync::load(&state.config_dir).workspaces.get(&id).cloned().unwrap_or_default();
            let prepared = sync::prepare(&state.root, &state.config_dir, &id, &settings)?;
            (id, settings, prepared)
        };
        sync::finish(&state.config_dir, &id, &settings, prepared, force)
    })
    .await
}

#[tauri::command]
pub fn list_backups(state: State<'_, AppState>) -> Result<Vec<sync::BackupInfo>> {
    let id = current_id(&state)?;
    let settings = sync::load(&state.config_dir).workspaces.get(&id).cloned().unwrap_or_default();
    sync::list_backups(&settings.backup_dir, &id)
}

/// Restores a backup as a new workspace; returns its id (open it from the unlock screen).
#[tauri::command]
pub fn restore_backup(state: State<'_, AppState>, name: String) -> Result<String> {
    let id = current_id(&state)?;
    let settings = sync::load(&state.config_dir).workspaces.get(&id).cloned().unwrap_or_default();
    sync::restore_backup(&state.root, &id, &settings, &name)
}
