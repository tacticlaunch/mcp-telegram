import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'getMyBoosts',
    {
      title: 'Get own boost slots',
      description: 'Return the current boost slots the user has available across channels.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.premium.GetMyBoosts());
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'applyBoost',
    {
      title: 'Apply boost slots to a channel',
      description: 'Apply one or more boost slots to a channel.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        slots: z.array(z.number().int()).min(1),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.premium.ApplyBoost({ peer: inputPeer as any, slots: args.slots })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
