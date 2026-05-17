import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeEntity,
} from './_helpers.js';

export function register({ reg }: ToolContext): void {
  reg(
    'listDialogs',
    {
      title: 'List dialogs',
      description: 'List available Telegram dialogs, chats and channels for the chosen account.',
      inputSchema: {
        accountId: z.string().optional(),
        unread: z.boolean().optional().describe('Only return dialogs with unread messages'),
        archived: z.boolean().optional().describe('Include archived dialogs'),
        ignorePinned: z.boolean().optional().describe('Ignore pinned dialogs'),
        folder: z.number().int().optional().describe('Folder id; 0 = no folder, 1 = archived'),
        limit: z.number().int().positive().max(200).optional().describe('Max dialogs (default 50)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const dialogs = await client.getDialogs({
        archived: args.archived ?? false,
        ignorePinned: args.ignorePinned ?? false,
        folder: args.folder,
        limit: args.limit ?? 50,
      });
      const filtered = args.unread ? dialogs.filter((d) => (d.unreadCount ?? 0) > 0) : dialogs;
      const payload = filtered.map((d) => ({
        id: d.id?.toString(),
        name: d.name,
        title: d.title,
        unreadCount: d.unreadCount,
        date: d.date,
        pinned: d.pinned,
        archived: d.folderId !== undefined,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  reg(
    'searchDialogs',
    {
      title: 'Search dialogs',
      description: 'Find dialogs by a substring against their name/title/username.',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1).describe('Substring to match (case-insensitive)'),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const q = args.query.toLowerCase();
      const matches: any[] = [];
      for await (const d of client.iterDialogs({})) {
        const hay = `${d.name ?? ''} ${d.title ?? ''} ${(d.entity as any)?.username ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          matches.push({
            id: d.id?.toString(),
            name: d.name,
            title: d.title,
            unreadCount: d.unreadCount,
            pinned: d.pinned,
          });
          if (matches.length >= (args.limit ?? 20)) break;
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    }
  );

  reg(
    'resolveUsername',
    {
      title: 'Resolve a Telegram username',
      description: 'Look up a user, channel, or chat by @username.',
      inputSchema: {
        accountId: z.string().optional(),
        username: z.string().describe('With or without the leading @'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.username));
      return { content: [{ type: 'text', text: JSON.stringify(serializeEntity(entity), null, 2) }] };
    }
  );

  reg(
    'listFolders',
    {
      title: 'List custom dialog folders',
      description: 'Return the user-defined folders (a.k.a. chat filters) with their inclusion rules.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.GetDialogFilters());
      const filters = result.filters ?? result;
      const payload = (filters as any[]).map((f) => ({
        id: f.id,
        title: f.title?.text ?? f.title,
        contacts: f.contacts,
        nonContacts: f.nonContacts,
        groups: f.groups,
        broadcasts: f.broadcasts,
        bots: f.bots,
        excludeMuted: f.excludeMuted,
        excludeRead: f.excludeRead,
        excludeArchived: f.excludeArchived,
        pinnedPeersCount: f.pinnedPeers?.length,
        includePeersCount: f.includePeers?.length,
        excludePeersCount: f.excludePeers?.length,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );
}
