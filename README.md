<p align="center">
  <img width="20%" src="assets/logo.png" alt="mcp-telegram" />
</p>
<p align="center">
  <h1 align="center">mcp-telegram</h1>
</p>
<p align="center">
  Telegram in your AI agent. MCP server for the user account API (MTProto), with browser-based sign-in and 100+ tools.
</p>
<div align="center">

[![npm version](https://badgen.net/npm/v/mcp-telegram)](https://www.npmjs.com/package/mcp-telegram)
[![License](https://img.shields.io/npm/l/mcp-telegram)](https://github.com/beautyfree/mcp-telegram/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

</div>

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects [Cursor](https://cursor.com), [Claude Desktop](https://claude.ai), and any other MCP client to a real Telegram account via [MTProto](https://core.telegram.org/mtproto)—so your agent can read, search, send, moderate, and manage chats from chat or automated tool calls instead of clicking through the Telegram UI.

**Use it to:** read dialogs and search messages globally · send/edit/forward/react/poll · download media and transcribe voice notes · moderate channels (ban/restrict/promote, invite links, slow-mode, admin log, forum topics) · manage stories, contacts, drafts, notifications, folders, privacy · or fall through to the raw MTProto bridge for anything else. All against a single signed-in user account—no bot required.

> [!WARNING]
> This server signs in as a real Telegram user (not a bot). Sessions live in `~/.mcp-telegram/`. Treat that directory like a password.

## Prerequisites

1. Node.js `>=20`
2. Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps) — `api_id` and `api_hash`

## Install

**Option A — automatic, all clients:**

```bash
npx add-mcp mcp-telegram \
  --env TELEGRAM_API_ID=123456 \
  --env TELEGRAM_API_HASH=abc...
```

`add-mcp` (from Neon) writes the correct config for Claude Desktop, Claude Code, Cursor, VS Code, Codex, Gemini CLI, Cline, Zed, Goose, OpenCode, and others. Pick the client in the interactive prompt.

> [!IMPORTANT]
> Both env vars are required. Get them from [my.telegram.org/apps](https://my.telegram.org/apps).

**Option B — manual config:**

<details>
<summary><b>Claude Desktop</b> (<code>claude_desktop_config.json</code>)</summary>

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["-y", "mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "123456",
        "TELEGRAM_API_HASH": "abc..."
      }
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
      "command": "npx",
      "args": ["-y", "mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "123456",
        "TELEGRAM_API_HASH": "abc..."
      }
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
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-telegram"],
      "env": {
        "TELEGRAM_API_ID": "123456",
        "TELEGRAM_API_HASH": "abc..."
      }
    }
  }
}
```
</details>

<details>
<summary><b>Claude Code</b></summary>

```bash
claude mcp add telegram \
  -e TELEGRAM_API_ID=123456 \
  -e TELEGRAM_API_HASH=abc... \
  -- npx -y mcp-telegram
```
</details>

## First-time sign in

Ask your agent:

> Sign in to my Telegram.

The agent calls the `login` tool. A browser tab opens. Enter your phone number, the SMS code, and 2FA password if you have one. The tab shows a green checkmark — you can close it. The session is now stored locally and the agent can read your Telegram.

To add another account, ask the agent to call `login` again.

## Tools

| Tool | Description |
| --- | --- |
| `login` | Open the browser-based sign-in flow. Returns the newly authorized account. |
| `listAccounts` | List Telegram accounts signed in on this machine. |
| `logout` | Drop the local session and revoke it on Telegram. Requires `accountId`. |
| `listDialogs` | List dialogs/chats/channels. Filters: `unread`, `archived`, `ignorePinned`, `limit`. |
| `listMessages` | List messages in a dialog. Params: `dialogId`, `limit`. Newest first. |

Every read tool accepts an optional `accountId`. Omit it when only one account is signed in.

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | yes | — | From my.telegram.org/apps |
| `TELEGRAM_API_HASH` | yes | — | From my.telegram.org/apps |
| `MCP_TELEGRAM_HOME` | no | `~/.mcp-telegram` | State + per-account session storage |
| `LOG_LEVEL` | no | `info` | `debug` for verbose stderr |

## Data layout

```
~/.mcp-telegram/
├── state.json          known accounts (no secrets in here)
└── sessions/
    └── <account_id>/   per-account MTProto session
```

If a Telegram session is invalidated server-side (logged out from another device, password rotated, etc.), the next tool call returns an error telling the agent to call `login` to re-authorize.

## Development

```bash
git clone https://github.com/beautyfree/mcp-telegram
cd mcp-telegram
npm install
echo "TELEGRAM_API_ID=...\nTELEGRAM_API_HASH=..." > .env
npm run dev
```

Layout:

```
src/
├── index.ts           bin entry — stdio MCP server, tool registrations
├── telegram.ts        MTProto client + login state machine
├── auth-browser.ts    ephemeral HTTP server that drives the browser flow
├── auth-page.ts       inline HTML for the auth page
├── state.ts           persistent state in ~/.mcp-telegram/
└── logger.ts
```

## License

MIT — see [LICENSE](LICENSE).
