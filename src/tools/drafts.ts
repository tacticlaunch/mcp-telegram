import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'saveDraft',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Save a message draft',
      description: 'Save a draft for a dialog. Pass empty `text` to clear it.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        text: z.string(),
        replyTo: z.number().int().optional(),
        topMsgId: z.number().int().optional(),
        noWebpage: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.messages.SaveDraft({
          peer: inputPeer as any,
          message: args.text,
          replyTo: args.replyTo
            ? new Api.InputReplyToMessage({ replyToMsgId: args.replyTo, topMsgId: args.topMsgId })
            : undefined,
          noWebpage: args.noWebpage,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'clearDraft',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Clear a draft',
      description: 'Equivalent to `saveDraft` with an empty text.',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.messages.SaveDraft({ peer: inputPeer as any, message: '' }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'listDrafts',
    {
      title: 'List all drafts',
      description: 'Return all dialog drafts the user has across chats.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.GetAllDrafts());
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
