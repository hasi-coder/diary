#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `my-diary --mcp-stdio`: a stdio MCP server for coding agents, relaying to
    // the running app's agent endpoint (see mcp.rs). No window.
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp-stdio") {
        my_diary_lib::mcp::stdio_bridge();
        return;
    }
    // `my-diary --sync <workspace_id> [--force]`: Save & Sync from a terminal.
    if args.iter().any(|a| a == "--sync") {
        std::process::exit(my_diary_lib::sync::cli(&args));
    }
    my_diary_lib::run();
}
