# Saved Messages — reaction tags (Premium)

Telegram Premium lets you put a reaction on a Saved Message; that reaction becomes a *tag*. Tagged messages are filterable by tag and tags can be renamed (so 🧠 can mean "AI", 📚 = "Books", etc).

## Concept

- The peer is always `me` (your own user).
- Each Saved Message can carry one or more reactions.
- A reaction acts as a tag. Tag rename = give that emoji a custom display title.
- Filtering by tag = `messages.Search` with `savedReaction` set.

Without Premium: you can still read Saved Messages, but reactions on `me` won't persist as tags and `saved search --tag` will return empty.

## Workflow — categorize an inbox

Goal: take the last N unread Saved Messages, classify each by topic, apply a tag, surface a per-tag count.

### 1. Read current tag scheme

```bash
mcp-tg saved tags
```

Returns server-stored tags with `count` and `title`. If empty, you're starting fresh. Optionally seed names:

```bash
mcp-tg saved tag-rename 🧠 "AI"
mcp-tg saved tag-rename 📚 "Books"
mcp-tg saved tag-rename 💼 "Work"
mcp-tg saved tag-rename 🍳 "Recipes"
mcp-tg saved tag-rename 🔧 "Tools"
mcp-tg saved tag-rename 🎬 "Watch later"
```

### 2. Pull a batch

```bash
mcp-tg messages me --limit 100 | jq '.[] | {id, date, text, mediaType}'
```

### 3. Classify and tag

For each message, decide an emoji from the scheme (or invent a new one and rename it later). Then:

```bash
mcp-tg react me <messageId> <emoji>
```

Batch a list with a shell loop:

```bash
while read id emoji; do mcp-tg react me "$id" "$emoji"; done <<EOF
12345 🧠
12346 📚
12347 🍳
EOF
```

### 4. Verify per-tag pulls

```bash
mcp-tg saved search --tag 🧠 --limit 20
mcp-tg saved search --tag 📚 --query "rust"   # text + tag
```

### 5. Get counts

```bash
mcp-tg saved tags | jq '.tags[] | {emoji: .reaction.emoticon, count, title}'
```

## Multi-tag search

```bash
mcp-tg saved search --tag 🧠 --tag 📚 --limit 50
```

Returns messages tagged with either tag (OR semantics on the server side as of MTProto layer 178+).

## Clearing tags

Remove all reactions on a message = `react` with no emoji:

```bash
mcp-tg react me <messageId>
```

Clear a tag's custom title (revert to bare emoji):

```bash
mcp-tg saved tag-rename 🧠
```

## Saved sub-dialogs (forum mode)

Telegram now groups Saved Messages into sub-dialogs by original sender. `mcp-tg saved dialogs` lists them; `mcp-tg saved history <origin-peer>` reads one. Useful for "show me everything I forwarded from @hackernews".

## Don't

- Don't react on messages that aren't yours in `me` — they get forwarded sender's avatar but the reaction is still local-to-you. Should be safe but unusual.
- Don't `saved delete-history` without explicit user confirmation. Irreversible.
