import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'createInviteLink',
    {
      title: 'Create an invite link',
      description: 'Generate a new invite link with optional expiry, usage cap, and join-request gate.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        expireDate: z.number().int().optional().describe('Unix seconds — link expires at this time'),
        usageLimit: z.number().int().positive().optional(),
        requestNeeded: z.boolean().optional().describe('Require admin approval to join'),
        title: z.string().max(32).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.ExportChatInvite({
          peer: inputPeer as any,
          expireDate: args.expireDate,
          usageLimit: args.usageLimit,
          requestNeeded: args.requestNeeded,
          title: args.title,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'listInviteLinks',
    {
      title: 'List invite links',
      description: 'List all invite links the current user can see in a chat.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        revoked: z.boolean().optional().describe('List revoked links instead of active ones'),
        adminId: z.string().optional().describe('Filter by issuing admin'),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const adminInput = args.adminId
        ? await client.getInputEntity(parsePeer(args.adminId))
        : await client.getInputEntity('me');
      const result: any = await client.invoke(
        new Api.messages.GetExportedChatInvites({
          peer: inputPeer as any,
          adminId: adminInput as any,
          revoked: args.revoked,
          limit: args.limit ?? 30,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'revokeInviteLink',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Revoke an invite link',
      description: 'Permanently revoke a previously generated invite link.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        link: z.string().describe('The invite link URL (e.g. https://t.me/+abc...)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.EditExportedChatInvite({
          peer: inputPeer as any,
          link: args.link,
          revoked: true,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'listInviteJoiners',
    {
      title: 'List users that joined via an invite link',
      description: 'List users that joined a chat through a specific invite link.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        link: z.string().optional().describe('Specific invite link; omit to list all joiners'),
        requested: z.boolean().optional().describe('List pending join requests instead'),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetChatInviteImporters({
          peer: inputPeer as any,
          link: args.link,
          requested: args.requested,
          limit: args.limit ?? 50,
          offsetDate: 0,
          offsetUser: new Api.InputUserEmpty(),
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
