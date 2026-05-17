# Cold/warm DM outreach campaigns

Send personalized messages to a list of peers with hard limits, cooldowns, and explicit approval at each step.

## Hard rules

Read every rule before starting.

1. **Never send without showing the message preview to the user first.** "Preview before send" is the contract.
2. **Daily cap**: default 20 sends/day per account. Telegram flags more as spam.
3. **Cooldown**: min 30 sec between two sends to *different* peers. Min 24h before re-messaging the *same* peer.
4. **Personalize**: each message must reference something specific to the recipient. No identical messages to >1 peer.
5. **Log everything**: `mcp-tg send` returns the message id — save it.
6. **No bots, no channels** — DMs to users only. Channels have admins who'll mute/ban you.
7. **Stop on first complaint** or `FLOOD_WAIT` error. Don't try to work around the rate limit.

## Plan structure

Before any send, produce a plan and ask the user to approve:

```json
{
  "campaign": "<short name>",
  "account": "<accountId>",
  "daily_cap": 20,
  "cooldown_sec": 30,
  "peers": [
    {
      "peer": "@target1",
      "personalization": "they wrote X in @channel last week",
      "draft": "Hey N, saw your point about X..."
    },
    ...
  ]
}
```

## Per-peer flow

For each peer in the batch:

1. **Resolve** — confirm peer exists and isn't already a contact:
   ```bash
   mcp-tg resolve @target | jq '{id, username, bot, premium, verified}'
   ```
   If `bot: true` — skip. Don't DM bots.

2. **Context check** — pull last few exchanges (if any) to avoid repeating yourself:
   ```bash
   mcp-tg messages @target --limit 20
   ```

3. **Preview** — show the draft to the user. Wait for approval.

4. **Send** — only after approval. Save the returned id:
   ```bash
   mcp-tg send @target "<personalized text>" | jq '.id'
   ```

5. **Log** to a file with timestamp, peer, message id.

6. **Cooldown** — `sleep 30` (or whatever the plan says).

## Detecting trouble

Watch stderr. Stop the campaign on:

- `PEER_FLOOD` — Telegram has flagged your account. Don't send to anyone for 24h.
- `FLOOD_WAIT_X` — back off X seconds, then resume.
- `USER_PRIVACY_RESTRICTED` — that user blocks non-contacts. Skip them.
- `USER_IS_BLOCKED` — they blocked you. Stop messaging that peer.
- `CHAT_WRITE_FORBIDDEN` — you can't write there. Skip.

## What goes in a "good" personalized DM

- A specific reference (their recent post, a project of theirs, a mutual context). Generic "I loved your work" reads as spam.
- A clear ask in one sentence. Demos beat questions.
- Length: 1–3 sentences. Long DMs from strangers get muted.
- No links in the first message — clients flag those as spam.

## Reporting

After a batch, output a summary table for the user:

```
Sent: 18 / 20 planned
Errors: 1 PEER_FLOOD (stopped early)
Skipped: 1 (bot)
Open replies after 24h: check tomorrow with `mcp-tg messages <peer> --limit 5`
```

## Don't

- Don't loop a campaign script that sends faster than the cooldown. The CLI doesn't throttle for you.
- Don't reuse the same draft template for ≥2 peers. That's the textbook spam signal.
- Don't run two campaigns from the same account in parallel.
- Don't DM accounts that explicitly said "no DMs" in their bio.
