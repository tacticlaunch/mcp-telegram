# Channel / DM digest

Produce a summary of recent messages in a peer. Useful for "what did I miss in @channel" or "summarize the last 24h with @friend".

## Recipe

### 1. Pick window

Decide how far back to read. Either by count (`--limit 200`) or by date (`--min-date <unix-sec>`).

```bash
since=$(date -v -1d +%s)   # 24h ago, macOS. Linux: date -d '1 day ago' +%s
mcp-tg search @channel "" --min-date "$since" --limit 200 > batch.json
```

Or just by count:

```bash
mcp-tg messages @channel --limit 100 > batch.json
```

### 2. Extract what you need

```bash
jq '.[] | {id, date, from: .fromId, text}' batch.json > simple.json
```

For media-heavy channels filter media out for summarization (they pollute the prompt):

```bash
jq '[.[] | select(.text != "")]' simple.json > textonly.json
```

### 3. Summarize

Read `textonly.json`, generate a digest. Format suggestion:

```
# @channel — last 24h (47 messages)

## Top threads
1. [link to msg 12345] — gist
2. ...

## Mentions worth following up
- @user asked X
- Quote from msg 12346: "..."

## Action items
- ...
```

Include message ids so the user can `mcp-tg get @channel <id>` to jump.

### 4. Optional — pin or react

If a digest is noteworthy, save it to `me` and tag it:

```bash
mcp-tg send me "📰 @channel digest 2026-05-17 ..." | jq -r '.id' > digest_id
mcp-tg react me "$(cat digest_id)" 📰
```

## Multi-channel daily

Loop the recipe over a list of channels:

```bash
for ch in @ainews @hn_bot @python_news; do
  mcp-tg messages "$ch" --limit 30 > "batch_${ch}.json"
done
# read all, generate single morning brief
```

## Don't

- Don't `mark-read` until the user has actually consumed the digest. Otherwise you destroy their unread state.
- Don't fetch giant `--limit 200` runs on every group blindly. Telegram rate-limits — back off if you see `FLOOD_WAIT_X` errors.
