import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ regWrite }: ToolContext): void {
  regWrite(
    'create_channel',
    {
      title: 'Create a channel or supergroup',
      description: 'Create a broadcast channel (`broadcast: true`) or a supergroup (`megagroup: true`).',
      inputSchema: {
        accountId: z.string().optional(),
        title: z.string().min(1).max(128),
        about: z.string().max(255).optional(),
        broadcast: z.boolean().optional(),
        megagroup: z.boolean().optional(),
        forum: z.boolean().optional().describe('Enable forum/topics mode (supergroups only)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      if (!args.broadcast && !args.megagroup) {
        throw new Error('Pass either `broadcast: true` or `megagroup: true`.');
      }
      const result: any = await client.invoke(
        new Api.channels.CreateChannel({
          broadcast: args.broadcast,
          megagroup: args.megagroup,
          forum: args.forum,
          title: args.title,
          about: args.about ?? '',
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'delete_channel',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Delete a channel or supergroup',
      description: 'Permanently delete the channel. Creator only.',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.DeleteChannel({ channel: channel as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'migrate_chat',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Migrate a basic group to a supergroup',
      description: 'One-way migration. Returns the new supergroup id in the resulting updates.',
      inputSchema: {
        accountId: z.string().optional(),
        chatId: z.string().describe('Basic group chat id'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.MigrateChat({ chatId: bigInt(args.chatId) }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'transfer_ownership',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Transfer channel ownership',
      description:
        'Transfer creator rights to another user. Requires the account 2FA password (Telegram enforces this).',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        newOwner: z.string(),
        password: z.string().describe('Current account 2FA cloud password'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const userInput = await client.getInputEntity(parsePeer(args.newOwner));
      const passSrp: any = await client.invoke(new Api.account.GetPassword());
      const { computeCheck } = await import('telegram/Password.js');
      const passSrpCheck = await computeCheck(passSrp, args.password);
      await client.invoke(
        new Api.channels.EditCreator({
          channel: channel as any,
          userId: userInput as any,
          password: passSrpCheck,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
