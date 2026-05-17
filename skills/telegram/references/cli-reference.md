# mcp-tg — Full CLI reference

Every command prints JSON to stdout. Errors → stderr as `{"ok": false, "error": "..."}` and exit code != 0. Add `--account <id>` for multi-account installs.

## Sessions

| Command | Notes |
|---|---|
| `mcp-tg login` | Opens a browser tab for phone → code → 2FA. Persists session to `~/.mcp-telegram/`. |
| `mcp-tg logout <accountId>` | Drops the session locally + revokes server-side. |
| `mcp-tg accounts` | `[{ id, phone, username }]`. |
| `mcp-tg me` | Returns the authenticated user record. |

## Dialogs

```
mcp-tg dialogs [--unread] [--archived] [--folder N] [--ignore-pinned] [--limit N]
mcp-tg search-dialogs <query> [--limit N]
mcp-tg resolve <@username|id>
```

Output shape (dialogs): `[{ id, name, title, unreadCount, date, pinned, archived }]`

## Messages — read

```
mcp-tg messages <peer> [--limit N]
mcp-tg search <peer> [query]
  [--filter photos|videos|photoVideo|documents|music|voice|roundVideo|roundVoice|gif|url|geo|contacts|chatPhotos|myMentions|pinned]
  [--from-user @user] [--min-date <unixSec>] [--max-date <unixSec>]
  [--limit N] [--reverse]
mcp-tg search-global <query> [--filter X] [--min-date T] [--max-date T] [--limit N]
mcp-tg get <peer> <id[,id...]>
```

## Messages — write

```
mcp-tg send <peer> <text> [--reply-to N] [--silent] [--parse-mode markdown|html]
mcp-tg edit <peer> <id> <text> [--parse-mode markdown|html]
mcp-tg delete <peer> <id[,id...]> [--revoke false]
mcp-tg forward --from <peer> --to <peer> --ids 1,2,3 [--silent]
mcp-tg pin <peer> <id> [--notify] [--pm-one-side]
mcp-tg unpin <peer> <id>
mcp-tg react <peer> <id> <emoji...> [--custom-emoji-ids id,id] [--big] [--add-to-recent]
mcp-tg mark-read <peer> [--max-id N]
```

`react` with no emoji clears existing reactions. Multiple emoji = multi-react (Premium).

## Media

```
mcp-tg send-file <peer> <path-or-url...>
  [--caption X] [--voice] [--as-document] [--silent] [--reply-to N]
mcp-tg download <peer> <messageId>
```

`send-file` accepts multiple paths/URLs — they're sent as one album (max 10). HTTPS URLs are fetched into a temp file first.

`download` writes the file to `~/.mcp-telegram/downloads/` (override via `MCP_TELEGRAM_DOWNLOADS`) and prints `{"path": "..."}`.

## Saved Messages

```
mcp-tg saved tags
mcp-tg saved tag-rename <emoji> [title]      # omit title to clear
mcp-tg saved default-tags
mcp-tg saved search [--tag emoji ...] [--tag-custom id,id] [--query X]
                    [--saved-peer P] [--limit N] [--min-date T] [--max-date T]
mcp-tg saved dialogs [--exclude-pinned] [--limit N]
mcp-tg saved history <peer> [--offset-id N] [--limit N]
mcp-tg saved delete-history <peer> [--max-id N] [--min-date T] [--max-date T]
mcp-tg saved toggle-pin <peer> [--pinned true|false]
```

Tagging a Saved message = react on it: `mcp-tg react me <msg-id> 🧠`. Then `mcp-tg saved search --tag 🧠` returns everything tagged that way.

## Channels

```
mcp-tg info <peer>
mcp-tg participants <peer> [--limit N] [--search X]
```

For full channel admin/moderation surface (ban, restrict, promote, invite-link management, slow-mode, etc.) — use the MCP server (`mcp-tg mcp`) or the raw bridge below. CLI MVP covers read-only inspection.

## Raw MTProto

```
mcp-tg invoke <Namespace.Class> --params '<json>'
```

Examples:

```
mcp-tg invoke messages.GetStickers --params '{"emoticon": "👍", "hash": "0"}'
mcp-tg invoke channels.GetFullChannel --params '{"channel": "@telegram"}'
```

Entity-like string fields (`peer`, `channel`, `user`, `bot`, `chat`, `fromPeer`, `toPeer`) are auto-hydrated from `@username` / numeric / `me`.

## Plugin install

```
mcp-tg install                 # auto-detect Claude Code + Codex CLI
mcp-tg install claude          # specific
mcp-tg install codex
mcp-tg install cursor          # generates .mdc adapter in ./.cursor/rules
mcp-tg install all
mcp-tg uninstall [client]
mcp-tg doctor                  # JSON: which clients detected, where installed
```

## MCP server

```
mcp-tg mcp                     # same as legacy `mcp-telegram` bin
```

Use when an agent client doesn't support skills (web Apps SDK, hosted runtimes without Bash).
