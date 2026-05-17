<p align="center">
  <img width="20%" src="assets/logo.png" alt="mcp-telegram" />
</p>
<p align="center">
  <h1 align="center">mcp-telegram</h1>
</p>
<p align="center">
  <b>Telegram MCP server</b> for Claude, Codex, Cursor, Claude Code, VS Code, Cline, Windsurf, and other MCP clients. Real Telegram user account via MTProto, browser-based local sign-in, 100+ tools.
</p>
<div align="center">

[![npm version](https://badgen.net/npm/v/mcp-telegram)](https://www.npmjs.com/package/mcp-telegram)
[![License](https://img.shields.io/npm/l/mcp-telegram)](https://github.com/beautyfree/mcp-telegram/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

</div>

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects [Claude Desktop](https://claude.ai), [Codex CLI](https://github.com/openai/codex), [Cursor](https://cursor.com), [Claude Code](https://claude.ai/code), VS Code, Cline, Windsurf, Goose, and any other MCP-compatible client to a real Telegram user account via [MTProto](https://core.telegram.org/mtproto)—so your agent can read, search, send, moderate, and manage Telegram chats from chat or automated tool calls instead of clicking through the Telegram UI.

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

<details>
<summary><b>Codex CLI</b> (<code>~/.codex/config.toml</code>) — <a href="https://github.com/openai/codex">install</a></summary>

```toml
[mcp_servers.telegram]
command = "npx"
args = ["-y", "mcp-telegram"]
env = { TELEGRAM_API_ID = "123456", TELEGRAM_API_HASH = "abc..." }
```
</details>

## First-time sign in

Ask your agent:

> Sign in to my Telegram.

The agent calls the `login` tool. A browser tab opens. Enter your phone number, the SMS code, and 2FA password if you have one. The tab shows a green checkmark — you can close it. The session is now stored locally and the agent can read your Telegram.

To add another account, ask the agent to call `login` again.

## Tools

102 tools covering the full Telegram user-account surface. Common ones below; the rest are grouped under collapsibles. Every tool accepts an optional `accountId` (omit when only one account is signed in). `peer` accepts a numeric chat id, an `@username`, or the literal `"me"` (Saved Messages).

**Top of the menu:**

| Tool | What it does |
| --- | --- |
| `login` | Open the browser-based sign-in flow. Adds an account. |
| `list_accounts` | List signed-in accounts. |
| `list_dialogs` | List dialogs/chats/channels. Filters: `unread`, `archived`, `ignorePinned`, `folder`, `limit`. |
| `list_messages` | List messages in a dialog. Newest first. |
| `search_messages` | Search inside one dialog: `query`, `filter` (photos/videos/url/voice/...), `fromUser`, date range. |
| `search_global` | Search across every chat you have. |
| `search_dialogs` | Find dialogs by name/title/username substring. |
| `send_message` | Send text. Supports `replyTo`, `topMsgId`, `parseMode`, `schedule`, `silent`. |
| `send_file` | Send a file (local path or `https://` URL). Pass an array for an album. |
| `download_media` | Save the media on a message to disk. |
| `transcribe_message` | Transcribe a voice/video note (Premium). |
| `invoke_mtproto` | Call any raw MTProto method by name. Auto-resolves `peer`/`channel`/`user` strings. |

<details>
<summary><b>Sessions (local)</b> (4)</summary>

These are local-only: they manage which Telegram sessions live in `~/.mcp-telegram/` and the settings UI. No Telegram API call beyond the sign-in flow itself.

| Tool | What it does |
| --- | --- |
| `list_accounts` | List signed-in accounts. |
| `login` | Browser-based sign-in. Adds an account. |
| `logout` | Drop a local session and revoke it on Telegram. |
| `open_settings` | Open the local settings page (tool surface + read-only). |

</details>

<details>
<summary><b>Profile</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `get_me` | Return the profile of the authenticated user. |
| `update_profile` | Change own first/last name and bio. |
| `update_my_username` | Set or clear own `@username`. |
| `set_birthday` | Set the account birthday. |
| `set_profile_photo` | Upload a new avatar (local path or URL). |

</details>

<details>
<summary><b>Dialog discovery</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `list_dialogs` | List dialogs. Filters: `unread`, `archived`, `ignorePinned`, `folder`, `limit`. |
| `search_dialogs` | Find dialogs by name/title/username substring. |
| `resolve_username` | Resolve `@username` to a user/channel/chat entity. |
| `list_folders` | List custom dialog folders (chat filters). |
| `list_contacts` | List contacts. |

</details>

<details>
<summary><b>Messages — read & search</b> (6)</summary>

| Tool | What it does |
| --- | --- |
| `list_messages` | List messages in a dialog. |
| `search_messages` | Search inside one dialog (text, type filter, sender, date range). |
| `search_global` | Search across every chat. |
| `get_message` | Fetch one or more messages by id. |
| `get_message_reactions` | Get reactions on messages. |
| `mark_as_read` | Mark messages read up to an id. |

</details>

<details>
<summary><b>Messages — write</b> (8)</summary>

| Tool | What it does |
| --- | --- |
| `send_message` | Send text. |
| `edit_message` | Edit a previously sent message. |
| `delete_messages` | Delete by id (optionally revoke for all). |
| `forward_messages` | Forward messages between dialogs. |
| `pin_message` / `unpin_message` | Pin / unpin in a dialog. |
| `send_reaction` | Set reactions on a message. |
| `send_message_to_phone` | Send to a phone number, auto-creates a temporary contact. |

</details>

<details>
<summary><b>Media</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `send_file` | Send a file (path or URL). Albums via array. |
| `download_media` | Save a message's media to disk. |
| `download_profile_photo` | Save a peer's avatar to disk. |
| `transcribe_message` | Transcribe voice/video (Premium). |

</details>

<details>
<summary><b>Polls</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `send_poll` | Send a poll. Supports quiz, multiple-choice, anonymous, close period. |
| `vote_poll` | Cast a vote. |
| `close_poll` | Finalize a poll. |
| `get_poll_results` | Fetch tally. |

</details>

<details>
<summary><b>Reactions</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `send_reaction` | Set emoji reactions on a message. |
| `get_message_reactions` | Read reactions. |
| `set_default_reaction` | Set account-wide default. |

</details>

<details>
<summary><b>Stories</b> (6)</summary>

| Tool | What it does |
| --- | --- |
| `list_stories` | Feed of contacts' stories. |
| `get_peer_stories` | One peer's stories. |
| `send_story` | Post a story (photo or video). |
| `delete_story` | Delete own stories. |
| `view_story` | Mark stories viewed. |
| `get_story_viewers` | List who viewed your story. |

</details>

<details>
<summary><b>Channel / group moderation</b> (11)</summary>

| Tool | What it does |
| --- | --- |
| `ban_user` | Full ban (optional `untilDate`). |
| `unban_user` | Lift restrictions. |
| `restrict_user` | Apply a custom rights mask. |
| `promote_admin` | Grant admin rights (with rank). |
| `demote_admin` | Strip admin rights. |
| `invite_user` | Add users to a channel/supergroup. |
| `kick_participant` | Kick from chat/channel. |
| `get_participant` | Single participant info. |
| `list_participants` | Members with filter (admins/banned/bots/...) and substring search. |
| `delete_user_history` | Remove every message by a user. |
| `get_admin_log` | Recent admin events with event-type filter. |

</details>

<details>
<summary><b>Channel / group settings</b> (12)</summary>

| Tool | What it does |
| --- | --- |
| `edit_title` | Change title (works for channels, supergroups, and basic groups). |
| `edit_about` | Change description. |
| `edit_photo` | Change avatar (path or URL). |
| `update_username` | Set/clear public `@username`. |
| `check_username` | Check availability. |
| `set_slow_mode` | Set slow-mode seconds. |
| `toggle_signatures` | Author signatures on channel posts. |
| `toggle_pre_history_hidden` | Hide history from new members. |
| `toggle_join_request` | Require admin approval to join. |
| `leave_channel` | Leave a channel/supergroup. |
| `get_channel_info` | Extended info (about, counts, linked chat, slow-mode). |
| `get_user_info` | Extended user info (bio, common chats). |

</details>

<details>
<summary><b>Channel / group lifecycle</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `create_channel` | New broadcast channel or supergroup (optional forum mode). |
| `delete_channel` | Permanently delete. |
| `migrate_chat` | Basic group → supergroup. |
| `transfer_ownership` | Hand over creator rights (requires 2FA password). |

</details>

<details>
<summary><b>Invite links</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `create_invite_link` | New link with optional expiry, usage cap, join-request gate. |
| `list_invite_links` | List active or revoked links. |
| `revoke_invite_link` | Revoke a specific link. |
| `list_invite_joiners` | List users that joined via a link. |

</details>

<details>
<summary><b>Forum topics</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `list_topics` | List forum topics. |
| `create_topic` | Create a new topic. |
| `edit_topic` | Rename, re-icon, close, hide. |

</details>

<details>
<summary><b>Drafts</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `save_draft` | Save a draft for a dialog. |
| `clear_draft` | Drop the draft for a dialog. |
| `list_drafts` | List all dialog drafts. |

</details>

<details>
<summary><b>Notifications</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `mute_peer` | Mute a chat (optional `untilDate`). |
| `unmute_peer` | Unmute. |
| `get_notify_settings` | Read settings. |
| `set_notify_settings` | Update mute, previews, sound, story-mute. |

</details>

<details>
<summary><b>Folders (chat filters)</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `create_folder` | New folder with include/exclude rules. |
| `edit_folder` | Replace folder rules. |
| `delete_folder` | Remove a folder. |
| `reorder_folders` | Set display order. |

</details>

<details>
<summary><b>Contacts</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `list_contacts` | All contacts. |
| `add_contact` | Add a user to contacts. |
| `delete_contact` | Remove users from contacts. |
| `search_contacts` | Search contacts + global directory. |

</details>

<details>
<summary><b>Privacy & blocking</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `block_user` / `unblock_user` | Block / unblock. |
| `list_blocked` | Block list. |
| `get_privacy` | Read a privacy key. |
| `set_privacy` | Update a privacy key (mode + allow/disallow lists). |

</details>

<details>
<summary><b>Stickers</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `get_my_stickers` | Installed sticker sets. |
| `install_sticker_set` | Install by short name. |
| `add_recent_sticker` | Pin a sticker to recent. |

</details>

<details>
<summary><b>Premium boosts</b> (2)</summary>

| Tool | What it does |
| --- | --- |
| `get_my_boosts` | List your boost slots. |
| `apply_boost` | Apply slots to a channel. |

</details>

<details>
<summary><b>Bots & raw MTProto</b> (2)</summary>

| Tool | What it does |
| --- | --- |
| `get_inline_bot_results` | Run an inline bot query. |
| `invoke_mtproto` | Call any MTProto method by qualified name (e.g. `messages.SendMessage`, `stories.GetAllStories`). String values for `peer`/`channel`/`user`/`fromPeer`/`toPeer`/`bot`/`chat` are auto-resolved to InputPeer / InputUser. |

</details>

### Gating which tools are exposed

Three env vars, applied in order:

| Variable | Effect |
| --- | --- |
| `MCP_TELEGRAM_READONLY=1` | Hide every destructive / mutating tool. |
| `MCP_TELEGRAM_TOOLS=name1,name2,prefix*` | Strict allowlist — only these tools register. |
| `MCP_TELEGRAM_DISABLE=name1,prefix*` | Blocklist applied after the allowlist. |

Examples:

```bash
MCP_TELEGRAM_READONLY=1                                    # read-only agent
MCP_TELEGRAM_TOOLS='login,list*,search*,get*'              # discovery-only
MCP_TELEGRAM_DISABLE='delete*,ban*,kick*,create_channel,delete_channel,transfer_ownership,invokeMtproto'  # safer write set
```

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | yes | — | From my.telegram.org/apps. If unset, the auth page prompts for it and saves to `state.json`. |
| `TELEGRAM_API_HASH` | yes | — | Same as above. |
| `MCP_TELEGRAM_HOME` | no | `~/.mcp-telegram` | State + per-account session storage. |
| `MCP_TELEGRAM_DOWNLOADS` | no | `$MCP_TELEGRAM_HOME/downloads` | Where `download_media` / `download_profile_photo` save files. |
| `MCP_TELEGRAM_READONLY` | no | — | Set to `1`/`true`/`yes` to hide every destructive tool. |
| `MCP_TELEGRAM_TOOLS` | no | — | Strict allowlist. Comma-separated tool names; supports `prefix*` wildcards. If set, anything not matched is hidden. |
| `MCP_TELEGRAM_DISABLE` | no | — | Blocklist applied after the allowlist. Same syntax. |
| `LOG_LEVEL` | no | `info` | `debug` for verbose stderr. |

### Choosing which tools the agent sees

The three gating vars stack — `MCP_TELEGRAM_READONLY` → `MCP_TELEGRAM_TOOLS` → `MCP_TELEGRAM_DISABLE`.

```bash
# Read-only agent — every mutating tool is hidden
MCP_TELEGRAM_READONLY=1

# Discovery-only — only login + the list/search/get tools
MCP_TELEGRAM_TOOLS='login,list*,search*,get*,resolveUsername'

# Allow writes but keep destructive ones away from the agent
MCP_TELEGRAM_DISABLE='delete*,ban*,kick*,create_channel,delete_channel,transfer_ownership,invokeMtproto'

# Specific surface: read + send/edit only
MCP_TELEGRAM_TOOLS='login,list_accounts,list_dialogs,list_messages,search_messages,search_global,send_message,editMessage'
```

In an MCP client config, drop these into the same `env` block as `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`. To verify, re-open your client — the tools the server advertises are exactly the ones registered after the gates run.

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

---

<details>
<summary>Also known as</summary>

Telegram MCP · MCP Telegram · Telegram MCP server · Telegram for Claude · Telegram for Cursor · Telegram for Claude Code · Telegram for VS Code · Telegram for Codex · Telegram for Cline · Telegram for Windsurf · Telegram for AI agents · Telegram MTProto MCP · Telegram user-account MCP · Telegram automation MCP · Model Context Protocol Telegram · MCP server Telegram · gramjs MCP

</details>
