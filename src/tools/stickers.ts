import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'getMyStickers',
    {
      title: 'List installed sticker sets',
      description: "Return the user's installed sticker sets.",
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.GetAllStickers({ hash: bigInt(0) }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'installStickerSet',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Install a sticker set',
      description: 'Install a sticker set by its short name (e.g. "AnimatedEmojies").',
      inputSchema: {
        accountId: z.string().optional(),
        shortName: z.string(),
        archived: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.messages.InstallStickerSet({
          stickerset: new Api.InputStickerSetShortName({ shortName: args.shortName }),
          archived: args.archived ?? false,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'addRecentSticker',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Add a sticker to recent',
      description: 'Pin a sticker to the recently used list. Use `unsave: true` to remove it.',
      inputSchema: {
        accountId: z.string().optional(),
        documentId: z.string(),
        accessHash: z.string(),
        unsave: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(
        new Api.messages.SaveRecentSticker({
          id: new Api.InputDocument({
            id: bigInt(args.documentId),
            accessHash: bigInt(args.accessHash),
            fileReference: Buffer.alloc(0),
          }),
          unsave: args.unsave ?? false,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
