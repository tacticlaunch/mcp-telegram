---
name: telegram
description: Read and operate on a real Telegram account — list dialogs, search messages globally, send/edit/forward/react, manage Saved Messages with reaction tags (Premium), moderate channels, download media, post stories. Triggers on mentions of Telegram, чаты, каналы, Saved Messages, peer names like @channel, or any request to send a Telegram message, tag/categorize saved items, search across chats, or moderate a group.
---

# Telegram

Operates a real Telegram user account (not a bot) through the `mcp-tg` CLI. Every command prints JSON to stdout — pipe through `jq` for filtering.

## Setup check

If `mcp-tg accounts` returns `[]`, run `mcp-tg login` once (opens a local browser). After that the session is cached in `~/.mcp-telegram/`. All later commands reuse it.

## Quick map

- **Read** — `dialogs`, `messages`, `search`, `search-global`, `get`, `resolve`
- **Write** — `send`, `edit`, `delete`, `forward`, `pin`, `unpin`, `react`, `mark-read`
- **Media** — `send-file`, `download`
- **Saved (Premium tags)** — `saved tags`, `saved tag-rename`, `saved search`, `saved dialogs`, `saved history`, `saved delete-history`, `saved toggle-pin`
- **Channels** — `info`, `participants`
- **Raw** — `invoke <Namespace.Class> --params '{...}'` for any MTProto method not surfaced above

Run `mcp-tg help` for the full flag reference. For specific workflows read the matching file under `references/`:

- `references/cli-reference.md` — exhaustive command/flag list with examples
- `references/saved-tags.md` — categorize Saved Messages with reaction-tags (Premium)
- `references/digest.md` — batch summary of a channel or DM
- `references/moderation.md` — bans, restrictions, admin-rights bitmasks
- `references/outreach.md` — careful cold/warm DM campaigns with caps + cooldowns

Only read those files when the task matches — they aren't needed for one-off lookups.

## Peer syntax

Anywhere a `<peer>` is accepted:

- `@username` — public username
- `me` — Saved Messages (own user)
- numeric id (string of digits, may be negative for chats/channels)

## Always-true defaults

- Output is JSON. Parse with `jq`. If parsing fails, the command printed an error to stderr — read it.
- Errors look like `{"ok": false, "error": "..."}` and exit code != 0.
- For multi-account installs, pass `--account <id>` (get the id from `mcp-tg accounts`).
- Mutating commands have no `--dry-run`. For destructive ops (`delete`, `delete-history`, `kick`, `ban`), confirm with the user before running unless they explicitly said "yes do it".

## Common patterns

### "Find that link about X in Telegram"

```bash
mcp-tg search-global "X" --limit 50 | jq '.[] | {date, peer: .peer.title, text}'
```

### "Read the last N messages from @channel"

```bash
mcp-tg messages @channel --limit 50 | jq '.[] | {date, text}'
```

### "Tag and categorize my Saved Messages by topic"

See `references/saved-tags.md`. Premium-only feature.

### "Summarize what happened in @channel today"

See `references/digest.md`.

### "Send a message"

```bash
mcp-tg send @friend "hello"
mcp-tg send @friend "long *markdown*" --parse-mode markdown --reply-to 12345
```

### "Send a file or album"

```bash
mcp-tg send-file @friend ./photo.jpg --caption "look"
mcp-tg send-file @friend ./a.jpg ./b.jpg ./c.jpg   # album
```

## What this skill does NOT do

- Real-time push (new-message subscription). For that you need the MCP server (`mcp-tg mcp`) or `invoke` with a long-poll method.
- Bot API operations (this is the user MTProto API; for bots use the Telegram Bot API directly).
- Stickers/Voice transcription require Telegram Premium on the signed-in account.

## When to fall back to MCP

If you need the agent's tool-call protocol (e.g. ChatGPT web Apps SDK, hosted runtimes without a shell), run `mcp-tg mcp` and connect via stdio MCP. Skill-based usage is preferred — it saves ~12k tokens of context — but MCP remains available for clients without `Bash`.
