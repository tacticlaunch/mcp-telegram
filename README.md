# mcp-telegram

[![npm version](https://img.shields.io/npm/v/mcp-telegram.svg)](https://www.npmjs.com/package/mcp-telegram)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

A local Model Context Protocol (MCP) server that lets AI agents (Claude, Cursor, VS Code, Codex, etc.) read your Telegram via MTProto. The server runs on `127.0.0.1`, speaks Streamable HTTP, and implements the [MCP authorization spec](https://modelcontextprotocol.io/specification/draft/basic/authorization.md) so adding it to a client shows the native **Authorize** button — no CLI logins, no env-var session paths.

Multi-account: each Telegram account is a separate authorization in the client.

> [!WARNING]
> This server signs in as a real Telegram user (not a bot) via MTProto. Sessions and OAuth tokens live in `~/.mcp-telegram/`. Treat that directory like a password.

## How it works

```
┌──────────────┐   1. add MCP URL    ┌─────────────────────────┐
│  AI client   │ ───────────────────▶ http://127.0.0.1:PORT/mcp│
│ (Claude/…)   │ ◀── 401 + WWW-Auth ─│  mcp-telegram daemon    │
│              │                     │                         │
│ shows        │   2. browser pops   │  • OAuth 2.1 AS (PKCE)  │
│ "Authorize"  │ ───────────────────▶│  • Telegram login page  │
│ button       │ ◀── code + token ── │  • MTProto session store│
└──────────────┘                     └─────────────────────────┘
```

The local daemon is the OAuth Authorization Server, Protected Resource, and MCP transport at the same time. Clients discover everything through standard well-known metadata.

## Prerequisites

1. Node.js `>=20`
2. Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps) — `api_id` and `api_hash`

## Quickstart

### 1. Run the daemon

```bash
TELEGRAM_API_ID=123456 TELEGRAM_API_HASH=abc... npx -y mcp-telegram
```

On first run, a port in the dynamic range is picked and persisted to `~/.mcp-telegram/state.json`. The MCP URL is printed on startup, e.g.:

```
mcp-telegram running at http://127.0.0.1:54321
MCP endpoint:    http://127.0.0.1:54321/mcp
```

Keep the process running. On macOS, you'll typically wrap this in a `launchd` plist; on Linux, in a `systemd --user` unit. A sample `launchd` plist is in [`examples/`](examples/).

### 2. Add the endpoint to your MCP client

Use the URL the daemon printed. No env vars in the client config — auth is handled by the browser flow.

<details>
<summary><b>Claude Desktop</b> (<code>claude_desktop_config.json</code>)</summary>

```json
{
  "mcpServers": {
    "telegram": {
      "url": "http://127.0.0.1:54321/mcp"
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b> (<code>~/.cursor/mcp.json</code>)</summary>

```json
{
  "mcpServers": {
    "telegram": {
      "url": "http://127.0.0.1:54321/mcp"
    }
  }
}
```
</details>

<details>
<summary><b>VS Code</b> (<code>.vscode/mcp.json</code>)</summary>

```json
{
  "servers": {
    "telegram": {
      "type": "http",
      "url": "http://127.0.0.1:54321/mcp"
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add --transport http telegram http://127.0.0.1:54321/mcp
```
</details>

### 3. Authorize

In your MCP client the server now shows as **Not authorized** with an Authorize button. Click it:

1. A browser tab opens the local auth page.
2. Pick an existing account or **Add new account**.
3. Enter phone → SMS code → 2FA password (if you have one).
4. The tab closes itself. The client now has a bearer token for that Telegram account.

To connect a second account, add the server again in the client with a different name and authorize the new account.

### 4. Use it

> List my unread Telegram chats and summarize the last 20 messages in each.

## Tools

| Tool | Description |
| --- | --- |
| `listDialogs` | List dialogs, chats, channels. Filters: `unread`, `archived`, `ignorePinned`, `limit`. |
| `listMessages` | List messages in a dialog. Params: `dialogId`, `limit`. Newest first. |

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | yes | — | From my.telegram.org/apps |
| `TELEGRAM_API_HASH` | yes | — | From my.telegram.org/apps |
| `PORT` | no | random, persisted | Override only if you must pin a port |
| `HOST` | no | `127.0.0.1` | Don't bind to `0.0.0.0` unless you know what you're doing |
| `MCP_TELEGRAM_HOME` | no | `~/.mcp-telegram` | State, sessions, registered clients, tokens |
| `LOG_LEVEL` | no | `info` | `debug` for verbose |

## Data layout

```
~/.mcp-telegram/
├── state.json          port, registered OAuth clients, accounts, bearer tokens
└── sessions/
    └── <account_id>/   per-account MTProto session
```

Tokens are revoked automatically when an account is logged out. If a Telegram session is invalidated server-side, the next MCP call returns an error; the client should re-trigger the OAuth flow.

## Development

```bash
git clone https://github.com/tacticlaunch/mcp-telegram
cd mcp-telegram
npm install
echo "TELEGRAM_API_ID=...\nTELEGRAM_API_HASH=..." > .env
npm run dev
```

Layout:

```
src/
├── index.ts          bin entry — starts the daemon
├── server.ts         express app: OAuth + MCP transport
├── mcp-server.ts     McpServer factory + tools
├── telegram.ts       MTProto client + login state machine
├── oauth.ts          PKCE, auth codes, browser sessions
├── auth-page.ts      inline HTML for the authorize page
├── state.ts          persistent state in ~/.mcp-telegram/
└── logger.ts
```

## Security notes

- The daemon binds to `127.0.0.1` by default. Anything that can reach loopback on your machine can talk to it — including other local users. On shared hosts, restrict accordingly.
- OAuth tokens are opaque bearers stored in `~/.mcp-telegram/state.json` (mode `0600`). Their lifetime is the lifetime of the underlying Telegram session.
- The auth page lives on the loopback HTTP server, no TLS. Telegram credentials never leave your machine; they go from browser → loopback → MTProto.

## License

MIT — see [LICENSE](LICENSE).
