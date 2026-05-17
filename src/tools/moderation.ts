import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

const BannedRights = z
  .object({
    viewMessages: z.boolean().optional(),
    sendMessages: z.boolean().optional(),
    sendMedia: z.boolean().optional(),
    sendStickers: z.boolean().optional(),
    sendGifs: z.boolean().optional(),
    sendGames: z.boolean().optional(),
    sendInline: z.boolean().optional(),
    embedLinks: z.boolean().optional(),
    sendPolls: z.boolean().optional(),
    changeInfo: z.boolean().optional(),
    inviteUsers: z.boolean().optional(),
    pinMessages: z.boolean().optional(),
    manageTopics: z.boolean().optional(),
    untilDate: z.number().int().optional().describe('Unix seconds, 0 = forever'),
  })
  .strict();

const AdminRights = z
  .object({
    changeInfo: z.boolean().optional(),
    postMessages: z.boolean().optional(),
    editMessages: z.boolean().optional(),
    deleteMessages: z.boolean().optional(),
    banUsers: z.boolean().optional(),
    inviteUsers: z.boolean().optional(),
    pinMessages: z.boolean().optional(),
    addAdmins: z.boolean().optional(),
    anonymous: z.boolean().optional(),
    manageCall: z.boolean().optional(),
    manageTopics: z.boolean().optional(),
    postStories: z.boolean().optional(),
    editStories: z.boolean().optional(),
    deleteStories: z.boolean().optional(),
  })
  .strict();

const ParticipantFilter = z.enum(['recent', 'admins', 'kicked', 'banned', 'bots', 'contacts']);

function fullBanRights(untilDate = 0): any {
  return new Api.ChatBannedRights({
    viewMessages: true,
    sendMessages: true,
    sendMedia: true,
    sendStickers: true,
    sendGifs: true,
    sendGames: true,
    sendInline: true,
    embedLinks: true,
    sendPolls: true,
    changeInfo: true,
    inviteUsers: true,
    pinMessages: true,
    manageTopics: true,
    untilDate,
  });
}

function emptyBanRights(): any {
  return new Api.ChatBannedRights({ untilDate: 0 });
}

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'banUser',
    {
      title: 'Ban a user from a channel/supergroup',
      description: 'Fully ban a user. Pass `untilDate` (unix seconds) to time-limit the ban; default is forever.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
        untilDate: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const participant = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditBanned({
          channel: channel as any,
          participant: participant as any,
          bannedRights: fullBanRights(args.untilDate ?? 0),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'unbanUser',
    {
      title: 'Lift a ban / restriction',
      description: 'Remove all restrictions for a user.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const participant = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditBanned({
          channel: channel as any,
          participant: participant as any,
          bannedRights: emptyBanRights(),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'restrictUser',
    {
      title: 'Restrict a user with a custom rights mask',
      description: 'Set specific restrictions. `true` for a field means the user CANNOT do that action.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
        rights: BannedRights,
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const participant = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditBanned({
          channel: channel as any,
          participant: participant as any,
          bannedRights: new Api.ChatBannedRights({ untilDate: 0, ...args.rights }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'promoteAdmin',
    {
      title: 'Promote a user to admin',
      description: 'Grant admin rights. Pass only the fields you want enabled; omitted fields default to false.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
        rights: AdminRights,
        rank: z.string().max(16).optional().describe('Custom admin badge text'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const userEntity = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditAdmin({
          channel: channel as any,
          userId: userEntity as any,
          adminRights: new Api.ChatAdminRights({ ...args.rights }),
          rank: args.rank ?? '',
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'demoteAdmin',
    {
      title: 'Strip admin rights',
      description: 'Remove all admin rights from a user.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const userEntity = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditAdmin({
          channel: channel as any,
          userId: userEntity as any,
          adminRights: new Api.ChatAdminRights({}),
          rank: '',
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'inviteUser',
    {
      title: 'Invite a user to a channel/supergroup',
      description: 'Add a user (or list of users) to a channel or supergroup.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        users: z.array(z.string()).min(1).max(50).describe('User ids or @usernames'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const inputs = await Promise.all(
        (args.users as string[]).map(async (u) => (await client.getInputEntity(parsePeer(u))) as any)
      );
      await client.invoke(new Api.channels.InviteToChannel({ channel: channel as any, users: inputs }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getParticipant',
    {
      title: 'Get a single participant',
      description: 'Return role, rights, and join date for one user in a channel/supergroup.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const participant = await client.getInputEntity(parsePeer(args.user));
      const result: any = await client.invoke(
        new Api.channels.GetParticipant({ channel: channel as any, participant: participant as any })
      );
      return { content: [{ type: 'text', text: safeStringify(result.participant) }] };
    }
  );

  reg(
    'listParticipants',
    {
      title: 'List participants of a group or channel',
      description:
        'List members of a group, supergroup, or channel. Optional filter (admins/kicked/banned/bots) and substring search.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        filter: ParticipantFilter.optional(),
        search: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      let filter: any;
      switch (args.filter) {
        case 'admins':
          filter = new Api.ChannelParticipantsAdmins();
          break;
        case 'kicked':
          filter = new Api.ChannelParticipantsKicked({ q: args.search ?? '' });
          break;
        case 'banned':
          filter = new Api.ChannelParticipantsBanned({ q: args.search ?? '' });
          break;
        case 'bots':
          filter = new Api.ChannelParticipantsBots();
          break;
        case 'contacts':
          filter = new Api.ChannelParticipantsContacts({ q: args.search ?? '' });
          break;
        case 'recent':
        default:
          filter = args.search
            ? new Api.ChannelParticipantsSearch({ q: args.search })
            : new Api.ChannelParticipantsRecent();
      }
      const participants = await client.getParticipants(parsePeer(args.peer), {
        filter,
        search: args.search,
        limit: args.limit ?? 100,
      } as any);
      const payload = (participants as any[]).map((p) => ({
        id: p.id?.toString?.(),
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        bot: p.bot,
        premium: p.premium,
        verified: p.verified,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  regWrite(
    'deleteUserHistory',
    {
      title: 'Delete all messages by a user in a chat',
      description: 'Wipe every message a given user has posted in the channel/supergroup.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const userEntity = await client.getInputEntity(parsePeer(args.user));
      const result: any = await client.invoke(
        new Api.channels.DeleteParticipantHistory({ channel: channel as any, participant: userEntity as any })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'kickParticipant',
    {
      title: 'Kick a participant',
      description: 'Remove a user from a chat/channel. Requires admin rights.',
      inputSchema: { accountId: z.string().optional(), peer: z.string(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.kickParticipant(parsePeer(args.peer), parsePeer(args.user));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getAdminLog',
    {
      title: 'Get the admin action log',
      description:
        'Return recent admin events. Set fields in `events` to `true` to include those categories; ' +
        'leave empty to include everything.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        query: z.string().optional().describe('Substring filter on event text'),
        events: z
          .object({
            join: z.boolean().optional(),
            leave: z.boolean().optional(),
            invite: z.boolean().optional(),
            ban: z.boolean().optional(),
            unban: z.boolean().optional(),
            kick: z.boolean().optional(),
            unkick: z.boolean().optional(),
            promote: z.boolean().optional(),
            demote: z.boolean().optional(),
            info: z.boolean().optional(),
            settings: z.boolean().optional(),
            pinned: z.boolean().optional(),
            edit: z.boolean().optional(),
            delete: z.boolean().optional(),
            groupCall: z.boolean().optional(),
            invites: z.boolean().optional(),
            send: z.boolean().optional(),
            forums: z.boolean().optional(),
          })
          .optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const eventsFilter = args.events ? new Api.ChannelAdminLogEventsFilter(args.events) : undefined;
      const result: any = await client.invoke(
        new Api.channels.GetAdminLog({
          channel: channel as any,
          q: args.query ?? '',
          eventsFilter,
          maxId: bigInt(0),
          minId: bigInt(0),
          limit: args.limit ?? 50,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
