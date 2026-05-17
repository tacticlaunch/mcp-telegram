# mcp-telegram

[![npm version](https://img.shields.io/npm/v/mcp-telegram.svg)](https://www.npmjs.com/package/mcp-telegram)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

A Model Context Protocol (MCP) server that exposes your Telegram account to AI agents over MTProto. Lets Claude, Cursor, Codex, Cline, VS Code, and other MCP clients read your dialogs and messages.

> [!WARNING]
> This server signs in to a real Telegram user account using MTProto, not the Bot API. Treat the generated session file like a password — anyone with it can read your chats. Never share it, and never commit it to a repo.

## Features

- Read-only access to Telegram dialogs and messages
- MTProto auth (full user account, not limited to bots)
- Local session persistence, sign in once
- stdio and SSE transports
- One-command install into any MCP client via `add-mcp`

## Available tools

| Tool | Description |
| --- | --- |
| `listDialogs` | List dialogs, chats, channels. Filters: `unread`, `archived`, `ignorePinned`. |
| `listMessages` | List messages in a dialog. Params: `dialogId`, `unread`, `limit`. Newest first. |

## Prerequisites

1. Node.js `>=20`
2. Telegram API credentials from [my.telegram.org/apps](https://my.telegram.org/apps) — you need `api_id` and `api_hash`
3. A phone number registered with Telegram

## Quickstart

### 1. Sign in to Telegram (once)

```bash
TELEGRAM_API_ID=123456 TELEGRAM_API_HASH=abc... npx -y mcp-telegram sign-in
```

Enter your phone number, the SMS code, and your 2FA password if prompted. A session file is written to `mcp_telegram_session/` in the current directory.

> [!IMPORTANT]
> Run sign-in from the directory you intend to launch the MCP server from, or set an absolute `cwd` in your client config (see below). The session file must be reachable at runtime.

### 2. Add the server to your MCP client

**Option A — automatic, all clients:**

```bash
npx add-mcp mcp-telegram
```

`add-mcp` (from Neon) writes the correct config for Claude Desktop, Claude Code, Cursor, VS Code, Codex, Gemini CLI, Cline, Zed, Goose, OpenCode, and others. Pass env vars with `--env`:

```bash
npx add-mcp mcp-telegram \
  --env TELEGRAM_API_ID=123456 \
  --env TELEGRAM_API_HASH=abc...
```

**Option B — manual config:**

<details>
<summary><b>Claude Desktop</b> (<code>claude_desktop_config.json</code>)</summary>

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["-y", "mcp-telegram", "mcp"],
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
  -- npx -y mcp-telegram mcp
```
</details>

<details>
<summary><b>Cursor</b> (<code>~/.cursor/mcp.json</code>)</summary>

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["-y", "mcp-telegram", "mcp"],
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
      "args": ["-y", "mcp-telegram", "mcp"],
      "env": {
        "TELEGRAM_API_ID": "123456",
        "TELEGRAM_API_HASH": "abc..."
      }
    }
  }
}
```
</details>

### 3. Use it

Ask your agent something like:

> List my unread Telegram chats and summarize the last 20 messages in each.

## CLI reference

```
mcp-telegram sign-in              Interactive Telegram login
mcp-telegram mcp [options]        Start the MCP server
mcp-telegram logout               Drop the saved session

Options for `mcp`:
  -t, --transport <type>    stdio | sse  (default: stdio)
  -p, --port <number>       SSE port      (default: 3000)
  -e, --endpoint <path>     SSE endpoint  (default: mcp)
```

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | yes | — | From my.telegram.org/apps |
| `TELEGRAM_API_HASH` | yes | — | From my.telegram.org/apps |
| `TRANSPORT_TYPE` | no | `stdio` | `stdio` or `sse` |
| `PORT` | no | `3000` | SSE only |
| `ENDPOINT` | no | `mcp` | SSE only |
| `LOG_LEVEL` | no | `info` | `debug`, `info`, `warn`, `error` |

Set them in a `.env` file or pass through your MCP client config (see snippets above).

## Running over SSE

```bash
TELEGRAM_API_ID=... TELEGRAM_API_HASH=... \
  npx -y mcp-telegram mcp --transport sse --port 3000
```

The server listens on `http://localhost:3000/mcp`. Point any SSE-capable MCP client at that URL.

## Development

```bash
git clone https://github.com/tacticlaunch/mcp-telegram
cd mcp-telegram
npm install
cp .env.example .env   # fill in TELEGRAM_API_ID and TELEGRAM_API_HASH
npm run build
npm run start
```

Useful scripts:

```bash
npm run dev       # run from source with ts-node
npm run inspect   # open fastmcp inspector for the tools
npm run lint
npm run test
```

### Project layout

```
src/
├── config.ts            # env-driven config
├── index.ts             # CLI entry (sign-in, mcp, logout)
├── mcp.ts               # FastMCP server factory
├── lib/telegram.ts      # MTProto client + session handling
├── tools/               # MCP tool implementations
│   ├── listDialogs.ts
│   └── listMessages.ts
└── utils/               # logger, error handler
```

## Troubleshooting

> [!TIP]
> If the client reports the server as "disconnected" right after launch, the most common causes are: missing `TELEGRAM_API_ID` / `TELEGRAM_API_HASH`, a session file that lives in a different directory, or a `console.log` somewhere writing to stdout (which corrupts the stdio JSON-RPC stream).

- **`AUTH_KEY_UNREGISTERED` / session invalid** — run `mcp-telegram logout`, then `sign-in` again.
- **Session not found at runtime** — the session is stored relative to the process cwd. Either launch the client from the same directory you signed in from, or move `mcp_telegram_session/` next to where the MCP server starts.
- **2FA password required** — the `sign-in` flow prompts for it interactively; run it in a real terminal, not through the MCP client.

## License

MIT — see [LICENSE](LICENSE).
