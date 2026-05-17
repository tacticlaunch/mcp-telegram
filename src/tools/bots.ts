import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

export function register({ reg }: ToolContext): void {
  reg(
    'getInlineBotResults',
    {
      title: 'Query an inline bot',
      description: 'Run an inline bot query (the `@bot query` form) and return the results.',
      inputSchema: {
        accountId: z.string().optional(),
        bot: z.string(),
        peer: z.string().default('me').describe('Where the results would be sent — affects allowed result types'),
        query: z.string(),
        offset: z.string().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const botInput = await client.getInputEntity(parsePeer(args.bot));
      const peerInput = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetInlineBotResults({
          bot: botInput as any,
          peer: peerInput as any,
          query: args.query,
          offset: args.offset ?? '',
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
