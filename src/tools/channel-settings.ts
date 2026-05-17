import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  resolveFileArg,
  serializeEntity,
  safeStringify,
} from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'edit_title',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Change the title of a chat/channel',
      description: 'Set a new title. Works for channels, supergroups, and basic groups.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        title: z.string().min(1).max(128),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity: any = await client.getEntity(parsePeer(args.peer));
      if (entity?.megagroup || entity?.broadcast) {
        const channel = await client.getInputEntity(entity);
        await client.invoke(new Api.channels.EditTitle({ channel: channel as any, title: args.title }));
      } else {
        await client.invoke(new Api.messages.EditChatTitle({ chatId: entity.id, title: args.title }));
      }
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'edit_about',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Change the description / about text',
      description: 'Set the description of a channel/supergroup. Max 255 chars.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        about: z.string().max(255),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.messages.EditChatAbout({ peer: inputPeer as any, about: args.about }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'edit_photo',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Change chat / channel avatar',
      description: 'Upload a new avatar photo from a local path or URL.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), path: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const resolvedPath = await resolveFileArg(args.path);
      const uploaded = await client.uploadFile({ file: resolvedPath as any, workers: 1 } as any);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.EditPhoto({
          channel: channel as any,
          photo: new Api.InputChatUploadedPhoto({ file: uploaded as any }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'update_username',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Set / change channel public @username',
      description: 'Assign a new public username. Pass an empty string to clear it.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), username: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const ok = await client.invoke(
        new Api.channels.UpdateUsername({ channel: channel as any, username: args.username.replace(/^@/, '') })
      );
      return { content: [{ type: 'text', text: JSON.stringify({ ok }) }] };
    }
  );

  reg(
    'check_username',
    {
      title: 'Check if a username is available',
      description: 'Verify whether a desired channel/supergroup username is free.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), username: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const available = await client.invoke(
        new Api.channels.CheckUsername({ channel: channel as any, username: args.username.replace(/^@/, '') })
      );
      return { content: [{ type: 'text', text: JSON.stringify({ available }) }] };
    }
  );

  regWrite(
    'set_slow_mode',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Set slow-mode delay',
      description:
        'Limit how often non-admins can post. Allowed values: 0 (off), 10, 30, 60, 300, 900, 3600 seconds.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        seconds: z.number().int().min(0),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.ToggleSlowMode({ channel: channel as any, seconds: args.seconds }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'toggle_signatures',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Toggle author signatures on channel posts',
      description: 'Broadcast channels only.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), enabled: z.boolean() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.ToggleSignatures({ channel: channel as any, enabled: args.enabled } as any)
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'toggle_pre_history_hidden',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Hide / show history for new members',
      description: 'Supergroups only. When enabled, new members cannot see history before they joined.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), enabled: z.boolean() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.TogglePreHistoryHidden({ channel: channel as any, enabled: args.enabled })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'toggle_join_request',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Toggle join-request requirement',
      description: 'When enabled, new members must be approved by an admin.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), enabled: z.boolean() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.ToggleJoinRequest({ channel: channel as any, enabled: args.enabled })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'leave_channel',
    {
      annotations: {"destructiveHint":true,"openWorldHint":true},
      title: 'Leave a channel/supergroup',
      description: 'Leave the channel. Use `delete_channel` to also remove it (creator only).',
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.LeaveChannel({ channel: channel as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'get_channel_info',
    {
      title: 'Get full channel/supergroup info',
      description: 'Return extended info for a channel or supergroup (about, participants count, linked chat, slow mode).',
      inputSchema: { accountId: z.string().optional(), channel: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.channel));
      const full: any = await client.invoke(new Api.channels.GetFullChannel({ channel: entity as any }));
      const c = full.chats?.[0] ?? entity;
      const f = full.fullChat;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...serializeEntity(c),
                about: f?.about,
                participantsCount: f?.participantsCount,
                adminsCount: f?.adminsCount,
                kickedCount: f?.kickedCount,
                bannedCount: f?.bannedCount,
                linkedChatId: f?.linkedChatId?.toString?.(),
                slowmodeSeconds: f?.slowmodeSeconds,
                canViewParticipants: f?.canViewParticipants,
                canViewStats: f?.canViewStats,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  reg(
    'get_user_info',
    {
      title: 'Get full user info',
      description: 'Return extended profile info (bio, common chats count, etc.) for a user.',
      inputSchema: { accountId: z.string().optional(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.user));
      const full: any = await client.invoke(new Api.users.GetFullUser({ id: entity as any }));
      const u = full.users?.[0] ?? entity;
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...serializeEntity(u),
                about: full.fullUser?.about,
                commonChatsCount: full.fullUser?.commonChatsCount,
                blocked: full.fullUser?.blocked,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  void safeStringify;
}
