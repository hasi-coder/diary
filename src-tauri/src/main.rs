#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `my-diary --mcp-stdio`: a stdio MCP server for coding agents, relaying to
    // the running app's agent endpoint (see mcp.rs). No window.
    if std::env::args().any(|a| a == "--mcp-stdio") {
        my_diary_lib::mcp::stdio_bridge();
        return;
    }
    my_diary_lib::run();
}
