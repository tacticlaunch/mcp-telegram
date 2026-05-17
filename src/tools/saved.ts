import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeMessage,
  safeStringify,
} from './_helpers.js';

/** Build a Reaction TL object from either an emoji string or a custom-emoji id. */
function buildReaction(args: { emoji?: string; customEmojiId?: string }): any {
  if (args.customEmojiId) return new Api.ReactionCustomEmoji({ documentId: bigInt(args.customEmojiId) });
  return new Api.ReactionEmoji({ emoticon: args.emoji ?? '' });
}

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'get_saved_reaction_tags',
    {
      title: 'List Saved-Messages reaction tags',
      description:
        'Return all reaction-tags the user has set on Saved Messages, with their custom titles ' +
        'and per-tag message counts. Premium feature; works only on the `me` peer.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z
          .string()
          .optional()
          .describe('Scope tags to a saved-dialog (forwarded-from peer). Omit for global Saved tags.'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const params: any = { hash: bigInt(0) as any };
      if (args.peer) {
        const entity = await client.getEntity(parsePeer(args.peer));
        params.peer = (await client.getInputEntity(entity)) as any;
      }
      const result: any = await client.invoke(new Api.messages.GetSavedReactionTags(params));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'update_saved_reaction_tag',
    {
      title: 'Rename a Saved-Messages reaction tag',
      description:
        'Set or clear the custom title of a Saved-Messages reaction-tag. Pass `title` to rename, omit to clear. ' +
        'Premium feature.',
      inputSchema: {
        accountId: z.string().optional(),
        emoji: z.string().optional().describe('Emoji tag, e.g. "🧠". Either this or customEmojiId required.'),
        customEmojiId: z.string().optional().describe('Custom-emoji document id'),
        title: z.string().optional().describe('Tag name. Omit to clear.'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const reaction = buildReaction(args);
      await client.invoke(new Api.messages.UpdateSavedReactionTag({ reaction, title: args.title }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'get_default_tag_reactions',
    {
      title: 'List default Saved-tag reactions',
      description: 'Server-suggested default emoji set for Saved-Messages tagging.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.GetDefaultTagReactions({ hash: bigInt(0) as any }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'search_saved_messages',
    {
      title: 'Search Saved Messages (with tag filter)',
      description:
        'Search inside Saved Messages (`me`). Combine free-text `query` with `tagEmoji` and/or `tagCustomEmojiIds` ' +
        'to filter by reaction-tag. Newest first.',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().optional(),
        tagEmoji: z.array(z.string()).optional().describe('Emoji tags to match, e.g. ["🧠","📚"]'),
        tagCustomEmojiIds: z.array(z.string()).optional().describe('Custom-emoji tag document ids'),
        savedPeer: z
          .string()
          .optional()
          .describe('Filter to a Saved-Messages sub-dialog (the original sender peer)'),
        minDate: z.number().int().optional(),
        maxDate: z.number().int().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const mePeer = await client.getInputEntity('me');
      const reactions: any[] = [];
      for (const e of args.tagEmoji ?? []) reactions.push(new Api.ReactionEmoji({ emoticon: e }));
      for (const id of args.tagCustomEmojiIds ?? [])
        reactions.push(new Api.ReactionCustomEmoji({ documentId: bigInt(id) }));
      const params: any = {
        peer: mePeer as any,
        q: args.query ?? '',
        filter: new Api.InputMessagesFilterEmpty(),
        minDate: args.minDate ?? 0,
        maxDate: args.maxDate ?? 0,
        offsetId: 0,
        addOffset: 0,
        limit: args.limit ?? 50,
        maxId: 0,
        minId: 0,
        hash: bigInt(0) as any,
      };
      if (reactions.length) params.savedReaction = reactions;
      if (args.savedPeer) {
        const entity = await client.getEntity(parsePeer(args.savedPeer));
        params.savedPeerId = (await client.getInputEntity(entity)) as any;
      }
      const result: any = await client.invoke(new Api.messages.Search(params));
      const messages = (result.messages ?? []).map(serializeMessage);
      return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
    }
  );

  reg(
    'get_saved_dialogs',
    {
      title: 'List Saved-Messages sub-dialogs',
      description:
        'List the forum-style sub-dialogs inside Saved Messages — each grouping forwards from one origin peer.',
      inputSchema: {
        accountId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        excludePinned: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.messages.GetSavedDialogs({
          excludePinned: args.excludePinned,
          offsetDate: 0,
          offsetId: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          limit: args.limit ?? 50,
          hash: bigInt(0) as any,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'get_saved_history',
    {
      title: 'List messages in a Saved sub-dialog',
      description: 'Fetch messages inside one Saved-Messages sub-dialog (filtered by original sender peer).',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Original sender peer (the saved sub-dialog id / @username)'),
        limit: z.number().int().positive().max(100).optional(),
        offsetId: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.peer));
      const inputPeer = await client.getInputEntity(entity);
      const result: any = await client.invoke(
        new Api.messages.GetSavedHistory({
          peer: inputPeer as any,
          offsetId: args.offsetId ?? 0,
          offsetDate: 0,
          addOffset: 0,
          limit: args.limit ?? 50,
          maxId: 0,
          minId: 0,
          hash: bigInt(0) as any,
        })
      );
      const messages = (result.messages ?? []).map(serializeMessage);
      return { content: [{ type: 'text', text: JSON.stringify(messages, null, 2) }] };
    }
  );

  regWrite(
    'delete_saved_history',
    {
      annotations: { destructiveHint: true, openWorldHint: true },
      title: 'Delete a Saved sub-dialog history',
      description:
        'Wipe all messages in one Saved-Messages sub-dialog (forwards from a single origin peer). Irreversible.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Original sender peer to clear from Saved Messages'),
        maxId: z.number().int().optional().describe('Only delete messages up to this id (inclusive).'),
        minDate: z.number().int().optional(),
        maxDate: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.peer));
      const inputPeer = await client.getInputEntity(entity);
      const result: any = await client.invoke(
        new Api.messages.DeleteSavedHistory({
          peer: inputPeer as any,
          maxId: args.maxId ?? 0,
          minDate: args.minDate,
          maxDate: args.maxDate,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'toggle_saved_dialog_pin',
    {
      title: 'Pin or unpin a Saved sub-dialog',
      description: 'Pin/unpin one of the forum-style sub-dialogs inside Saved Messages.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Original sender peer of the saved sub-dialog'),
        pinned: z.boolean().optional().describe('true to pin, false/omit to unpin'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.peer));
      const inputPeer = await client.getInputEntity(entity);
      await client.invoke(
        new Api.messages.ToggleSavedDialogPin({
          pinned: args.pinned,
          peer: new Api.InputDialogPeer({ peer: inputPeer as any }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );
}
