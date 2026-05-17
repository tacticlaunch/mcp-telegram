import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'mutePeer',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Mute a peer',
      description: 'Mute a chat. Without `untilDate`, mutes forever.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), untilDate: z.number().int().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.account.UpdateNotifySettings({
          peer: new Api.InputNotifyPeer({ peer: inputPeer as any }),
          settings: new Api.InputPeerNotifySettings({
            muteUntil: args.untilDate ?? Math.floor(Date.now() / 1000) + 100 * 365 * 24 * 3600,
          }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'unmutePeer',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Unmute a peer',
      description: 'Clear a mute on a chat.',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.account.UpdateNotifySettings({
          peer: new Api.InputNotifyPeer({ peer: inputPeer as any }),
          settings: new Api.InputPeerNotifySettings({ muteUntil: 0 }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getNotifySettings',
    {
      title: 'Get notification settings',
      description: 'Return notification settings for a peer.',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.account.GetNotifySettings({ peer: new Api.InputNotifyPeer({ peer: inputPeer as any }) })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'setNotifySettings',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Update notification settings',
      description: 'Update notify settings for a peer (sound, show preview, mute, story mute).',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        muteUntil: z.number().int().optional(),
        showPreviews: z.boolean().optional(),
        silent: z.boolean().optional(),
        storiesMuted: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.account.UpdateNotifySettings({
          peer: new Api.InputNotifyPeer({ peer: inputPeer as any }),
          settings: new Api.InputPeerNotifySettings({
            muteUntil: args.muteUntil,
            showPreviews: args.showPreviews,
            silent: args.silent,
            storiesMuted: args.storiesMuted,
          }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
