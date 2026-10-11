//! Tauri IPC commands. The unlocked workspace lives only in [`AppState`].

use std::path::PathBuf;
use std::sync::Mutex;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;
use zeroize::Zeroizing;

use crate::error::{Error, Result};
use crate::model::*;
use crate::store::{self, Workspace};

pub struct AppState {
    pub root: PathBuf,
    pub workspace: Mutex<Option<Workspace>>,
}

impl AppState {
    pub fn new(root: PathBuf) -> Self {
        Self { root, workspace: Mutex::new(None) }
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
pub async fn unlock_workspace(state: State<'_, AppState>, id: String, password: String) -> Result<Snapshot> {
    let password = Zeroizing::new(password);
    let root = state.root.clone();
    let ws = blocking(move || store::open_workspace(&root, &id, &password)).await?;
    Ok(state.install(ws))
}

/// Drops the decrypted cache; the data key is zeroized on drop.
#[tauri::command]
pub fn lock_workspace(state: State<'_, AppState>) {
    *state.workspace.lock().unwrap_or_else(|e| e.into_inner()) = None;
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
