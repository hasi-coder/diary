pub mod commands;
pub mod crypto;
pub mod error;
pub mod migrate;
pub mod model;
pub mod record;
pub mod store;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
