import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

function buildReactions(args: { emoji?: string[]; customEmojiIds?: string[] }): any[] {
  const out: any[] = [];
  for (const e of args.emoji ?? []) out.push(new Api.ReactionEmoji({ emoticon: e }));
  for (const id of args.customEmojiIds ?? []) out.push(new Api.ReactionCustomEmoji({ documentId: bigInt(id) }));
  return out;
}

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'sendReaction',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'React to a message',
      description: 'Set one or more reactions on a message. Pass an empty reaction list to remove existing reactions.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        emoji: z.array(z.string()).optional().describe('Standard emoji reactions, e.g. ["👍","🔥"]'),
        customEmojiIds: z.array(z.string()).optional().describe('Custom emoji document ids'),
        big: z.boolean().optional().describe('Animated "big" reaction'),
        addToRecent: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.messages.SendReaction({
          peer: inputPeer as any,
          msgId: args.messageId,
          reaction: buildReactions(args),
          big: args.big,
          addToRecent: args.addToRecent,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getMessageReactions',
    {
      title: 'Get reactions on messages',
      description: 'Fetch the current reactions for one or more messages in a dialog.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageIds: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetMessagesReactions({ peer: inputPeer as any, id: args.messageIds })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'setDefaultReaction',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Set the account-wide default reaction',
      description: 'Set the quick reaction emoji shown on long-press in clients.',
      inputSchema: {
        accountId: z.string().optional(),
        emoji: z.string().optional(),
        customEmojiId: z.string().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const reaction = args.customEmojiId
        ? new Api.ReactionCustomEmoji({ documentId: bigInt(args.customEmojiId) })
        : new Api.ReactionEmoji({ emoticon: args.emoji ?? '👍' });
      await client.invoke(new Api.messages.SetDefaultReaction({ reaction }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
