pub mod commands;
pub mod crypto;
pub mod error;
pub mod media;
pub mod migrate;
pub mod model;
pub mod record;
pub mod search;
pub mod store;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(commands::AppState::new(store::data_root()))
        .invoke_handler(tauri::generate_handler![
            commands::list_workspaces,
            commands::create_workspace,
            commands::unlock_workspace,
            commands::lock_workspace,
            commands::get_snapshot,
            commands::list_posts,
            commands::save_profile,
            commands::delete_profile,
            commands::save_post,
            commands::delete_post,
            commands::save_item,
            commands::delete_item,
            commands::run_migration,
            commands::stage_media,
            commands::discard_media,
            commands::search,
            commands::get_post,
        ])
        // Serves decrypted attachments to the webview; see media.rs.
        .register_asynchronous_uri_scheme_protocol("journal", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move || {
                responder.respond(media::serve(&app.state::<commands::AppState>(), &request))
            });
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
