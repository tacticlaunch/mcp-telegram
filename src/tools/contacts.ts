import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeEntity,
  safeStringify,
} from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'list_contacts',
    {
      title: 'List own contacts',
      description: 'List all users in the contact book.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
      const users = (result.users ?? []).map(serializeEntity);
      return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
    }
  );

  regWrite(
    'add_contact',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Add a contact',
      description: 'Add a user to your contacts.',
      inputSchema: {
        accountId: z.string().optional(),
        user: z.string(),
        firstName: z.string().max(64),
        lastName: z.string().max(64).optional(),
        phone: z.string().optional().describe('Required for phone-based contact lookup'),
        addPhonePrivacyException: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const input = await client.getInputEntity(parsePeer(args.user));
      const result: any = await client.invoke(
        new Api.contacts.AddContact({
          id: input as any,
          firstName: args.firstName,
          lastName: args.lastName ?? '',
          phone: args.phone ?? '',
          addPhonePrivacyException: args.addPhonePrivacyException,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'delete_contact',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Delete contacts',
      description: 'Remove one or more users from the contact book.',
      inputSchema: {
        accountId: z.string().optional(),
        users: z.array(z.string()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const ids = await Promise.all(
        (args.users as string[]).map(async (u) => (await client.getInputEntity(parsePeer(u))) as any)
      );
      const result: any = await client.invoke(new Api.contacts.DeleteContacts({ id: ids }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'search_contacts',
    {
      title: 'Search contacts and global directory',
      description: 'Search users/chats/channels by a query (matches name, username, and indexed text).',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.contacts.Search({ q: args.query, limit: args.limit ?? 20 })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
