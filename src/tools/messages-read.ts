import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeMessage,
  serializeEntity,
  MESSAGE_FILTER,
  MessageFilterEnum,
  safeStringify,
} from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'listMessages',
    {
      title: 'List messages',
      description: 'List messages in a dialog. Newest first.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const messages = await client.getMessages(parsePeer(args.peer), { limit: args.limit ?? 50 });
      return { content: [{ type: 'text', text: JSON.stringify(messages.map(serializeMessage), null, 2) }] };
    }
  );

  reg(
    'searchMessages',
    {
      title: 'Search messages in a dialog',
      description:
        'Search messages within one dialog. Supports text substring, type filter (photos/links/etc), ' +
        'sender filter, and date range. Newest first unless reverse=true.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        query: z.string().optional().describe('Substring to match in the message text'),
        filter: MessageFilterEnum.optional().describe('Media/content type filter'),
        fromUser: z
          .string()
          .optional()
          .describe('Username (@nick) or numeric id of the sender to filter by'),
        minDate: z.number().int().optional().describe('Unix seconds — exclude messages older than this'),
        maxDate: z.number().int().optional().describe('Unix seconds — exclude messages newer than this'),
        reverse: z.boolean().optional().describe('Oldest first when true'),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const opts: any = { limit: args.limit ?? 50, reverse: args.reverse ?? false };
      if (args.query) opts.search = args.query;
      if (args.filter) opts.filter = MESSAGE_FILTER[args.filter as keyof typeof MESSAGE_FILTER]();
      if (args.fromUser) opts.fromUser = parsePeer(args.fromUser);
      // gram.js exposes maxDate via offsetDate (newer-than cutoff).
      // minDate isn't a direct option — we post-filter the returned page.
      if (args.maxDate) opts.offsetDate = args.maxDate;
      const messages = await client.getMessages(parsePeer(args.peer), opts);
      const out = args.minDate ? messages.filter((m) => (m.date ?? 0) >= args.minDate!) : messages;
      return { content: [{ type: 'text', text: JSON.stringify(out.map(serializeMessage), null, 2) }] };
    }
  );

  reg(
    'searchGlobal',
    {
      title: 'Search messages across all dialogs',
      description: 'Search messages across every chat the user is in. Useful for "find that link about X".',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1),
        filter: MessageFilterEnum.optional(),
        minDate: z.number().int().optional(),
        maxDate: z.number().int().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.messages.SearchGlobal({
          q: args.query,
          filter: args.filter
            ? MESSAGE_FILTER[args.filter as keyof typeof MESSAGE_FILTER]()
            : new Api.InputMessagesFilterEmpty(),
          minDate: args.minDate ?? 0,
          maxDate: args.maxDate ?? 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit: args.limit ?? 50,
        })
      );
      const chats = new Map<string, any>();
      for (const c of result.chats ?? []) chats.set(c.id?.toString(), c);
      for (const u of result.users ?? []) chats.set(u.id?.toString(), u);
      const payload = (result.messages ?? []).map((m: any) => {
        const peerId =
          m.peerId?.userId?.toString?.() ?? m.peerId?.chatId?.toString?.() ?? m.peerId?.channelId?.toString?.();
        const peer = peerId ? chats.get(peerId) : undefined;
        return { ...serializeMessage(m), peer: serializeEntity(peer) };
      });
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  reg(
    'getMessage',
    {
      title: 'Get message by id',
      description: 'Fetch one or several messages from a dialog by their ids.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        ids: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const messages = await client.getMessages(parsePeer(args.peer), { ids: args.ids });
      return { content: [{ type: 'text', text: JSON.stringify(messages.map(serializeMessage), null, 2) }] };
    }
  );

  regWrite(
    'markAsRead',
    {
      title: 'Mark dialog as read',
      description: 'Mark a dialog (and optionally up to a specific message id) as read.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        maxId: z.number().int().optional().describe('Mark messages up to this id (inclusive). Omit to mark all.'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.markAsRead(parsePeer(args.peer), args.maxId);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  void safeStringify; // exported for symmetry with other modules
}
