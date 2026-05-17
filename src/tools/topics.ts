import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'list_topics',
    {
      title: 'List forum topics',
      description: 'List topics in a supergroup with forum mode enabled.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: channel as any,
          q: args.query,
          offsetDate: 0,
          offsetId: 0,
          offsetTopic: 0,
          limit: args.limit ?? 50,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'create_topic',
    {
      title: 'Create a forum topic',
      description: 'Create a new topic in a forum-enabled supergroup.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        title: z.string().min(1).max(128),
        iconColor: z.number().int().optional().describe('Decimal RGB color (e.g. 0x6FB9F0)'),
        iconEmojiId: z.string().optional().describe('Custom emoji document id'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.channels.CreateForumTopic({
          channel: channel as any,
          title: args.title,
          iconColor: args.iconColor,
          iconEmojiId: args.iconEmojiId ? bigInt(args.iconEmojiId) : undefined,
          randomId: bigInt(Date.now()),
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'edit_topic',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Edit a forum topic',
      description: 'Rename / re-icon / close / hide a topic.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        topicId: z.number().int(),
        title: z.string().min(1).max(128).optional(),
        iconEmojiId: z.string().optional(),
        closed: z.boolean().optional(),
        hidden: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.EditForumTopic({
          channel: channel as any,
          topicId: args.topicId,
          title: args.title,
          iconEmojiId: args.iconEmojiId ? bigInt(args.iconEmojiId) : undefined,
          closed: args.closed,
          hidden: args.hidden,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
