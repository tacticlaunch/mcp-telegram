import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  resolveFileArg,
  safeStringify,
} from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'listStories',
    {
      title: 'List active stories from contacts',
      description: "Return the stories feed (other users' active stories).",
      inputSchema: {
        accountId: z.string().optional(),
        hidden: z.boolean().optional().describe('List archived (hidden) stories'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.stories.GetAllStories({ hidden: args.hidden }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'getPeerStories',
    {
      title: "Get a peer's stories",
      description: 'Return active stories posted by one peer.',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(new Api.stories.GetPeerStories({ peer: inputPeer as any }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'sendStory',
    {
      title: 'Post a story',
      description: 'Publish a story (photo or video) on the chosen peer. Visibility defaults to "everyone".',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().default('me'),
        path: z.string().describe('Local path or URL to the image/video'),
        caption: z.string().max(2048).optional(),
        period: z
          .union([z.literal(21600), z.literal(43200), z.literal(86400), z.literal(172800)])
          .optional()
          .describe('Lifetime seconds; default 86400 (24h)'),
        pinned: z.boolean().optional(),
        noForwards: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const resolvedPath = await resolveFileArg(args.path);
      const uploaded = await client.uploadFile({ file: resolvedPath as any, workers: 1 } as any);
      const isVideo = /\.(mp4|mov|webm)$/i.test(resolvedPath);
      const media = isVideo
        ? new Api.InputMediaUploadedDocument({
            file: uploaded as any,
            mimeType: 'video/mp4',
            attributes: [
              new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true }),
            ],
          })
        : new Api.InputMediaUploadedPhoto({ file: uploaded as any });
      const result: any = await client.invoke(
        new Api.stories.SendStory({
          peer: inputPeer as any,
          media,
          caption: args.caption,
          privacyRules: [new Api.InputPrivacyValueAllowAll()],
          randomId: bigInt(Date.now()),
          pinned: args.pinned,
          noforwards: args.noForwards,
          period: args.period,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'deleteStory',
    {
      title: 'Delete one or more stories',
      description: 'Remove stories you previously posted.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().default('me'),
        storyIds: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.stories.DeleteStories({ peer: inputPeer as any, id: args.storyIds })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'viewStory',
    {
      title: 'Mark stories as viewed',
      description: 'Increment view counters for the given stories.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        storyIds: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.stories.IncrementStoryViews({ peer: inputPeer as any, id: args.storyIds }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getStoryViewers',
    {
      title: 'List viewers of a story',
      description: 'Show who has viewed a story you posted.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().default('me'),
        storyId: z.number().int(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.stories.GetStoryViewsList({
          peer: inputPeer as any,
          id: args.storyId,
          q: args.query,
          offset: '',
          limit: args.limit ?? 50,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
