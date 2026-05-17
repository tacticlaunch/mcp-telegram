import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  resolveApiClass,
  hydrateApiParams,
  safeStringify,
} from './_helpers.js';

export function register({ regWrite }: ToolContext): void {
  regWrite(
    'invokeMtproto',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Invoke a raw MTProto method',
      description:
        'Call any Telegram API method by its qualified name (e.g. `messages.SendMessage`, `channels.GetFullChannel`, `stories.GetAllStories`). ' +
        'String values for fields named peer/channel/user/fromPeer/toPeer/bot/chat are auto-resolved to InputPeer/InputUser. ' +
        'Use this only when no dedicated tool fits — the API surface is huge and there are no per-method safety checks.',
      inputSchema: {
        accountId: z.string().optional(),
        method: z.string().describe('Qualified MTProto method/class name, e.g. "messages.SendMessage"'),
        params: z.record(z.any()).optional().describe('Parameters object for the method constructor'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const ApiClass = resolveApiClass(args.method);
      const hydrated = await hydrateApiParams(client, args.params ?? {});
      const instance = new ApiClass(hydrated);
      const result: any = await client.invoke(instance);
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
