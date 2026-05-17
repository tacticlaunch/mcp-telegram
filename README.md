<p align="center">
  <img width="20%" src="assets/logo.png" alt="mcp-telegram" />
</p>
<p align="center">
  <h1 align="center">mcp-telegram</h1>
</p>
<p align="center">
  <b>Telegram MCP server</b> for Claude, Cursor, Claude Code, VS Code, Codex, Cline, Windsurf, and other MCP clients. Real Telegram user account via MTProto, browser-based local sign-in, 100+ tools.
</p>
<div align="center">

[![npm version](https://badgen.net/npm/v/mcp-telegram)](https://www.npmjs.com/package/mcp-telegram)
[![License](https://img.shields.io/npm/l/mcp-telegram)](https://github.com/beautyfree/mcp-telegram/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

</div>

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that connects [Cursor](https://cursor.com), [Claude Desktop](https://claude.ai), [Claude Code](https://claude.ai/code), VS Code, Codex, Cline, Windsurf, Goose, and any other MCP-compatible client to a real Telegram user account via [MTProto](https://core.telegram.org/mtproto)—so your agent can read, search, send, moderate, and manage Telegram chats from chat or automated tool calls instead of clicking through the Telegram UI.

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

102 tools covering the full Telegram user-account surface. Common ones below; the rest are grouped under collapsibles. Every tool accepts an optional `accountId` (omit when only one account is signed in). `peer` accepts a numeric chat id, an `@username`, or the literal `"me"` (Saved Messages).

**Top of the menu:**

| Tool | What it does |
| --- | --- |
| `login` | Open the browser-based sign-in flow. Adds an account. |
| `listAccounts` | List signed-in accounts. |
| `listDialogs` | List dialogs/chats/channels. Filters: `unread`, `archived`, `ignorePinned`, `folder`, `limit`. |
| `listMessages` | List messages in a dialog. Newest first. |
| `searchMessages` | Search inside one dialog: `query`, `filter` (photos/videos/url/voice/...), `fromUser`, date range. |
| `searchGlobal` | Search across every chat you have. |
| `searchDialogs` | Find dialogs by name/title/username substring. |
| `sendMessage` | Send text. Supports `replyTo`, `topMsgId`, `parseMode`, `schedule`, `silent`. |
| `sendFile` | Send a file (local path or `https://` URL). Pass an array for an album. |
| `downloadMedia` | Save the media on a message to disk. |
| `transcribeMessage` | Transcribe a voice/video note (Premium). |
| `invokeMtproto` | Call any raw MTProto method by name. Auto-resolves `peer`/`channel`/`user` strings. |

<details>
<summary><b>Sessions (local)</b> (4)</summary>

These are local-only: they manage which Telegram sessions live in `~/.mcp-telegram/` and the settings UI. No Telegram API call beyond the sign-in flow itself.

| Tool | What it does |
| --- | --- |
| `listAccounts` | List signed-in accounts. |
| `login` | Browser-based sign-in. Adds an account. |
| `logout` | Drop a local session and revoke it on Telegram. |
| `openSettings` | Open the local settings page (tool surface + read-only). |

</details>

<details>
<summary><b>Profile</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `getMe` | Return the profile of the authenticated user. |
| `updateProfile` | Change own first/last name and bio. |
| `updateMyUsername` | Set or clear own `@username`. |
| `setBirthday` | Set the account birthday. |
| `setProfilePhoto` | Upload a new avatar (local path or URL). |

</details>

<details>
<summary><b>Dialog discovery</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `listDialogs` | List dialogs. Filters: `unread`, `archived`, `ignorePinned`, `folder`, `limit`. |
| `searchDialogs` | Find dialogs by name/title/username substring. |
| `resolveUsername` | Resolve `@username` to a user/channel/chat entity. |
| `listFolders` | List custom dialog folders (chat filters). |
| `listContacts` | List contacts. |

</details>

<details>
<summary><b>Messages — read & search</b> (6)</summary>

| Tool | What it does |
| --- | --- |
| `listMessages` | List messages in a dialog. |
| `searchMessages` | Search inside one dialog (text, type filter, sender, date range). |
| `searchGlobal` | Search across every chat. |
| `getMessage` | Fetch one or more messages by id. |
| `getMessageReactions` | Get reactions on messages. |
| `markAsRead` | Mark messages read up to an id. |

</details>

<details>
<summary><b>Messages — write</b> (8)</summary>

| Tool | What it does |
| --- | --- |
| `sendMessage` | Send text. |
| `editMessage` | Edit a previously sent message. |
| `deleteMessages` | Delete by id (optionally revoke for all). |
| `forwardMessages` | Forward messages between dialogs. |
| `pinMessage` / `unpinMessage` | Pin / unpin in a dialog. |
| `sendReaction` | Set reactions on a message. |
| `sendMessageToPhone` | Send to a phone number, auto-creates a temporary contact. |

</details>

<details>
<summary><b>Media</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `sendFile` | Send a file (path or URL). Albums via array. |
| `downloadMedia` | Save a message's media to disk. |
| `downloadProfilePhoto` | Save a peer's avatar to disk. |
| `transcribeMessage` | Transcribe voice/video (Premium). |

</details>

<details>
<summary><b>Polls</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `sendPoll` | Send a poll. Supports quiz, multiple-choice, anonymous, close period. |
| `votePoll` | Cast a vote. |
| `closePoll` | Finalize a poll. |
| `getPollResults` | Fetch tally. |

</details>

<details>
<summary><b>Reactions</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `sendReaction` | Set emoji reactions on a message. |
| `getMessageReactions` | Read reactions. |
| `setDefaultReaction` | Set account-wide default. |

</details>

<details>
<summary><b>Stories</b> (6)</summary>

| Tool | What it does |
| --- | --- |
| `listStories` | Feed of contacts' stories. |
| `getPeerStories` | One peer's stories. |
| `sendStory` | Post a story (photo or video). |
| `deleteStory` | Delete own stories. |
| `viewStory` | Mark stories viewed. |
| `getStoryViewers` | List who viewed your story. |

</details>

<details>
<summary><b>Channel / group moderation</b> (11)</summary>

| Tool | What it does |
| --- | --- |
| `banUser` | Full ban (optional `untilDate`). |
| `unbanUser` | Lift restrictions. |
| `restrictUser` | Apply a custom rights mask. |
| `promoteAdmin` | Grant admin rights (with rank). |
| `demoteAdmin` | Strip admin rights. |
| `inviteUser` | Add users to a channel/supergroup. |
| `kickParticipant` | Kick from chat/channel. |
| `getParticipant` | Single participant info. |
| `listParticipants` | Members with filter (admins/banned/bots/...) and substring search. |
| `deleteUserHistory` | Remove every message by a user. |
| `getAdminLog` | Recent admin events with event-type filter. |

</details>

<details>
<summary><b>Channel / group settings</b> (12)</summary>

| Tool | What it does |
| --- | --- |
| `editTitle` | Change title (works for channels, supergroups, and basic groups). |
| `editAbout` | Change description. |
| `editPhoto` | Change avatar (path or URL). |
| `updateUsername` | Set/clear public `@username`. |
| `checkUsername` | Check availability. |
| `setSlowMode` | Set slow-mode seconds. |
| `toggleSignatures` | Author signatures on channel posts. |
| `togglePreHistoryHidden` | Hide history from new members. |
| `toggleJoinRequest` | Require admin approval to join. |
| `leaveChannel` | Leave a channel/supergroup. |
| `getChannelInfo` | Extended info (about, counts, linked chat, slow-mode). |
| `getUserInfo` | Extended user info (bio, common chats). |

</details>

<details>
<summary><b>Channel / group lifecycle</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `createChannel` | New broadcast channel or supergroup (optional forum mode). |
| `deleteChannel` | Permanently delete. |
| `migrateChat` | Basic group → supergroup. |
| `transferOwnership` | Hand over creator rights (requires 2FA password). |

</details>

<details>
<summary><b>Invite links</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `createInviteLink` | New link with optional expiry, usage cap, join-request gate. |
| `listInviteLinks` | List active or revoked links. |
| `revokeInviteLink` | Revoke a specific link. |
| `listInviteJoiners` | List users that joined via a link. |

</details>

<details>
<summary><b>Forum topics</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `listTopics` | List forum topics. |
| `createTopic` | Create a new topic. |
| `editTopic` | Rename, re-icon, close, hide. |

</details>

<details>
<summary><b>Drafts</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `saveDraft` | Save a draft for a dialog. |
| `clearDraft` | Drop the draft for a dialog. |
| `listDrafts` | List all dialog drafts. |

</details>

<details>
<summary><b>Notifications</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `mutePeer` | Mute a chat (optional `untilDate`). |
| `unmutePeer` | Unmute. |
| `getNotifySettings` | Read settings. |
| `setNotifySettings` | Update mute, previews, sound, story-mute. |

</details>

<details>
<summary><b>Folders (chat filters)</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `createFolder` | New folder with include/exclude rules. |
| `editFolder` | Replace folder rules. |
| `deleteFolder` | Remove a folder. |
| `reorderFolders` | Set display order. |

</details>

<details>
<summary><b>Contacts</b> (4)</summary>

| Tool | What it does |
| --- | --- |
| `listContacts` | All contacts. |
| `addContact` | Add a user to contacts. |
| `deleteContact` | Remove users from contacts. |
| `searchContacts` | Search contacts + global directory. |

</details>

<details>
<summary><b>Privacy & blocking</b> (5)</summary>

| Tool | What it does |
| --- | --- |
| `blockUser` / `unblockUser` | Block / unblock. |
| `listBlocked` | Block list. |
| `getPrivacy` | Read a privacy key. |
| `setPrivacy` | Update a privacy key (mode + allow/disallow lists). |

</details>

<details>
<summary><b>Stickers</b> (3)</summary>

| Tool | What it does |
| --- | --- |
| `getMyStickers` | Installed sticker sets. |
| `installStickerSet` | Install by short name. |
| `addRecentSticker` | Pin a sticker to recent. |

</details>

<details>
<summary><b>Premium boosts</b> (2)</summary>

| Tool | What it does |
| --- | --- |
| `getMyBoosts` | List your boost slots. |
| `applyBoost` | Apply slots to a channel. |

</details>

<details>
<summary><b>Bots & raw MTProto</b> (2)</summary>

| Tool | What it does |
| --- | --- |
| `getInlineBotResults` | Run an inline bot query. |
| `invokeMtproto` | Call any MTProto method by qualified name (e.g. `messages.SendMessage`, `stories.GetAllStories`). String values for `peer`/`channel`/`user`/`fromPeer`/`toPeer`/`bot`/`chat` are auto-resolved to InputPeer / InputUser. |

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
MCP_TELEGRAM_DISABLE='delete*,ban*,kick*,createChannel,deleteChannel,transferOwnership,invokeMtproto'  # safer write set
```

## Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `TELEGRAM_API_ID` | yes | — | From my.telegram.org/apps. If unset, the auth page prompts for it and saves to `state.json`. |
| `TELEGRAM_API_HASH` | yes | — | Same as above. |
| `MCP_TELEGRAM_HOME` | no | `~/.mcp-telegram` | State + per-account session storage. |
| `MCP_TELEGRAM_DOWNLOADS` | no | `$MCP_TELEGRAM_HOME/downloads` | Where `downloadMedia` / `downloadProfilePhoto` save files. |
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
MCP_TELEGRAM_DISABLE='delete*,ban*,kick*,createChannel,deleteChannel,transferOwnership,invokeMtproto'

# Specific surface: read + send/edit only
MCP_TELEGRAM_TOOLS='login,listAccounts,listDialogs,listMessages,searchMessages,searchGlobal,sendMessage,editMessage'
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
