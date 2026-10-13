//! End to end: an agent launches `my-diary --mcp-stdio` and speaks MCP over
//! stdio; the bridge relays to the app's HTTP endpoint.

use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::Arc;

use my_diary_lib::commands::AppState;
use my_diary_lib::mcp;
use my_diary_lib::model::AgentAccess;
use my_diary_lib::store::{self, KdfCost};
use serde_json::{json, Value};

#[test]
fn stdio_bridge_relays_to_the_app() {
    let root = tempfile::tempdir().unwrap();
    let mut ws = store::create_workspace(root.path(), "", "Personal", "Alex", "correct horse", KdfCost { memory_kib: 1024, iterations: 1, parallelism: 1 }).unwrap();
    let token = mcp::new_token();
    ws.save_agent_access(Some(AgentAccess { enabled: true, port: 0, token: token.clone() })).unwrap();
    let state = Arc::new(AppState::new(root.path().to_path_buf()));
    *state.workspace.lock().unwrap() = Some(ws);
    let shared = state.clone();
    let server = mcp::start(0, Box::new(move |f| f(&shared))).unwrap();

    let mut child = Command::new(env!("CARGO_BIN_EXE_my-diary"))
        .arg("--mcp-stdio")
        .env("MY_DIARY_MCP_URL", format!("http://127.0.0.1:{}/mcp", server.port))
        .env("MY_DIARY_MCP_TOKEN", &token)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = BufReader::new(child.stdout.take().unwrap());
    let mut ask = |msg: Value| -> Option<Value> {
        writeln!(stdin, "{msg}").unwrap();
        stdin.flush().unwrap();
        msg.get("id")?; // notifications get no reply
        let mut line = String::new();
        stdout.read_line(&mut line).unwrap();
        Some(serde_json::from_str(&line).unwrap())
    };

    let init = ask(json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": mcp::PROTOCOL_VERSION, "capabilities": {}, "clientInfo": { "name": "test", "version": "1" } } })).unwrap();
    assert_eq!(init["result"]["serverInfo"]["name"], "my-diary");
    assert!(ask(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
    let created = ask(json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": { "name": "create_page", "arguments": { "name": "Corner Bakery", "category": "Bakery" } } })).unwrap();
    assert_eq!(created["result"]["isError"], false, "{created}");
    let pages = ask(json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "list_pages", "arguments": {} } })).unwrap();
    assert_eq!(pages["result"]["structuredContent"]["pages"][0]["name"], "Corner Bakery");

    // Locked: the bridge answers with a clear error instead of hanging.
    *state.workspace.lock().unwrap() = None;
    let locked = ask(json!({ "jsonrpc": "2.0", "id": 4, "method": "tools/list" })).unwrap();
    assert!(locked["error"]["message"].as_str().unwrap().contains("locked"), "{locked}");

    drop(stdin);
    child.wait().unwrap();
    server.stop();
}
