import { Api, TelegramClient } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer } from './_helpers.js';

async function buildDialogFilter(client: TelegramClient, args: any): Promise<any> {
  const resolve = async (list?: string[]): Promise<any[]> => {
    if (!list?.length) return [];
    return Promise.all(list.map(async (p) => (await client.getInputEntity(parsePeer(p))) as any));
  };
  return new Api.DialogFilter({
    id: args.id,
    title: new Api.TextWithEntities({ text: args.title, entities: [] }) as any,
    contacts: args.includeContacts,
    nonContacts: args.includeNonContacts,
    groups: args.includeGroups,
    broadcasts: args.includeChannels,
    bots: args.includeBots,
    excludeMuted: args.excludeMuted,
    excludeRead: args.excludeRead,
    excludeArchived: args.excludeArchived,
    pinnedPeers: await resolve(args.pinnedPeers),
    includePeers: await resolve(args.includePeers),
    excludePeers: await resolve(args.excludePeers),
  });
}

const FolderFields = {
  title: z.string().min(1).max(12),
  includeContacts: z.boolean().optional(),
  includeNonContacts: z.boolean().optional(),
  includeGroups: z.boolean().optional(),
  includeChannels: z.boolean().optional(),
  includeBots: z.boolean().optional(),
  excludeMuted: z.boolean().optional(),
  excludeRead: z.boolean().optional(),
  excludeArchived: z.boolean().optional(),
  pinnedPeers: z.array(z.string()).optional(),
  includePeers: z.array(z.string()).optional(),
  excludePeers: z.array(z.string()).optional(),
};

export function register({ regWrite }: ToolContext): void {
  regWrite(
    'createFolder',
    {
      title: 'Create a dialog folder',
      description: 'Create a new dialog folder (chat filter). `id` is auto-assigned to the next free slot 2..255.',
      inputSchema: FolderFields,
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const existing: any = await client.invoke(new Api.messages.GetDialogFilters());
      const used = new Set<number>((existing.filters ?? existing).map((f: any) => f.id));
      let id = 2;
      while (used.has(id)) id++;
      const filter = await buildDialogFilter(client, { ...args, id });
      await client.invoke(new Api.messages.UpdateDialogFilter({ id, filter }));
      return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
    }
  );

  regWrite(
    'editFolder',
    {
      title: 'Edit a dialog folder',
      description: 'Replace the rules of an existing folder. `id` is required.',
      inputSchema: { id: z.number().int(), ...FolderFields },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const filter = await buildDialogFilter(client, args);
      await client.invoke(new Api.messages.UpdateDialogFilter({ id: args.id, filter }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'deleteFolder',
    {
      title: 'Delete a dialog folder',
      description: 'Remove a folder by id.',
      inputSchema: { accountId: z.string().optional(), id: z.number().int() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.messages.UpdateDialogFilter({ id: args.id }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'reorderFolders',
    {
      title: 'Reorder dialog folders',
      description: 'Set the display order of folders by passing the list of ids in the desired sequence.',
      inputSchema: {
        accountId: z.string().optional(),
        order: z.array(z.number().int()).min(1),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.messages.UpdateDialogFiltersOrder({ order: args.order }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
