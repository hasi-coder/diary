#!/usr/bin/env python3
"""Call a My Diary MCP tool from the command line (for agents without an MCP client).

    python3 mcp_call.py <tool> '<json arguments>'
    python3 mcp_call.py --list

The token comes from MY_DIARY_MCP_TOKEN, or the file ~/.my-diary-agent-token
(or MY_DIARY_MCP_TOKEN_FILE).

Talks to the running app's agent endpoint (Settings > Agent access):
MY_DIARY_MCP_URL, default http://127.0.0.1:47615/mcp. Prints the tool's
JSON result; exits 1 if the tool reported an error. Standard library only.
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = os.environ.get("MY_DIARY_MCP_URL", "http://127.0.0.1:47615/mcp")
TOKEN_FILE = os.path.expanduser(os.environ.get("MY_DIARY_MCP_TOKEN_FILE", "~/.my-diary-agent-token"))


def read_token():
    """The token from the environment, or from a private file (so it never goes through chat)."""
    if os.environ.get("MY_DIARY_MCP_TOKEN"):
        return os.environ["MY_DIARY_MCP_TOKEN"].strip()
    try:
        with open(TOKEN_FILE) as f:
            return f.read().strip()
    except OSError:
        return ""


TOKEN = read_token()


def rpc(method, params=None, id_=1):
    body = {"jsonrpc": "2.0", "method": method, "params": params or {}}
    if id_ is not None:
        body["id"] = id_
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST", headers={"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            text = r.read().decode()
            return json.loads(text) if text.strip() else None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except ValueError:
            pass
        sys.exit(f"My Diary refused the request (HTTP {e.code}): {detail}")
    except urllib.error.URLError as e:
        sys.exit(f"Can't reach My Diary at {URL} ({e.reason}). Open the app, unlock the journal and turn on Agent access in Settings.")


def main():
    if not TOKEN:
        sys.exit(f"No token: set MY_DIARY_MCP_TOKEN, or save it to {TOKEN_FILE} (chmod 600). It's in My Diary > Settings > Agent access.")
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "mcp_call.py", "version": "1"}})
    rpc("notifications/initialized", id_=None)
    if sys.argv[1] == "--list":
        tools = rpc("tools/list", id_=2)["result"]["tools"]
        for t in tools:
            print(f"{t['name']}: {t['description']}")
        return
    args = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
    response = rpc("tools/call", {"name": sys.argv[1], "arguments": args}, id_=3)
    if "error" in response:
        sys.exit(response["error"]["message"])
    result = response["result"]
    print(json.dumps(result.get("structuredContent", result), indent=2, ensure_ascii=False))
    if result.get("isError"):
        sys.exit(1)


if __name__ == "__main__":
    main()
