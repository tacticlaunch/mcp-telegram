import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Api, TelegramClient } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

import { listAccounts, getAccount } from './state.js';
import { clientForAccount, logoutAccount, TelegramAuthError } from './telegram.js';
import { runBrowserLogin } from './auth-browser.js';

const downloadsDir = process.env.MCP_TELEGRAM_DOWNLOADS || join(process.env.MCP_TELEGRAM_HOME || join(homedir(), '.mcp-telegram'), 'downloads');

function isReadonly(): boolean {
  const v = (process.env.MCP_TELEGRAM_READONLY ?? '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/**
 * Parse a comma-separated tool selector.
 *
 * Each entry is either a literal tool name or a `prefix*` wildcard.
 * Returns `null` if the env is empty/unset so callers can short-circuit
 * the "no filter" case without allocating.
 */
interface ToolSelector {
  explicit: Set<string>;
  prefixes: string[];
}

function parseToolList(env: string | undefined): ToolSelector | null {
  if (!env || !env.trim()) return null;
  const explicit = new Set<string>();
  const prefixes: string[] = [];
  for (const raw of env.split(',')) {
    const t = raw.trim();
    if (!t) continue;
    if (t.endsWith('*')) prefixes.push(t.slice(0, -1));
    else explicit.add(t);
  }
  return { explicit, prefixes };
}

function selectorMatches(name: string, s: ToolSelector): boolean {
  if (s.explicit.has(name)) return true;
  return s.prefixes.some((p) => name.startsWith(p));
}

function ensureDownloadsDir(): string {
  if (!existsSync(downloadsDir)) mkdirSync(downloadsDir, { recursive: true });
  return downloadsDir;
}

/**
 * Accept either a numeric peer id (string of digits) or a @username.
 * The gram.js client's high-level methods take both forms.
 *
 * "me" is a Telegram-recognized alias for the current user's "Saved
 * Messages" chat; we pass it through untouched so callers can use it.
 */
function parsePeer(s: string): any {
  const t = s.trim();
  if (t === 'me') return t;
  if (/^-?\d+$/.test(t)) return bigInt(t);
  return t.replace(/^@/, '');
}

/**
 * Materialize a file argument for `sendFile`.
 *
 * - `https://...` URL → fetched into a temp file (gram.js can't take a
 *   raw URL directly).
 * - Anything else is treated as a local path and passed straight through.
 */
async function resolveFileArg(p: string): Promise<string> {
  if (/^https?:\/\//i.test(p)) {
    const r = await fetch(p);
    if (!r.ok) throw new Error(`Failed to fetch ${p}: HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = (p.split('?')[0].split('.').pop() || 'bin').slice(0, 8);
    const out = join(tmpdir(), `mcp-tg-${randomBytes(6).toString('hex')}.${ext}`);
    writeFileSync(out, buf);
    return out;
  }
  return p;
}

/**
 * Resolve a string like "messages.SendMessage" to the corresponding
 * constructor on the `Api` namespace.
 */
function resolveApiClass(name: string): any {
  const parts = name.split('.');
  let cur: any = Api;
  for (const p of parts) {
    if (!cur || cur[p] == null) throw new Error(`Unknown MTProto class: ${name}`);
    cur = cur[p];
  }
  if (typeof cur !== 'function') throw new Error(`${name} is not a constructor`);
  return cur;
}

/**
 * Recursively walk the params for an MTProto call and replace known
 * entity-like fields (peer, channel, user, fromId, etc.) with the
 * resolved InputPeer/InputUser equivalent. Keeps the bridge ergonomic
 * for agents that pass `"@username"` or `"me"` instead of full Api
 * objects.
 */
async function hydrateApiParams(client: TelegramClient, params: any): Promise<any> {
  if (params == null || typeof params !== 'object') return params;
  if (Array.isArray(params)) return Promise.all(params.map((v) => hydrateApiParams(client, v)));
  const ENTITY_KEYS = new Set(['peer', 'channel', 'user', 'fromPeer', 'toPeer', 'bot', 'chat']);
  const out: any = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && ENTITY_KEYS.has(k)) {
      const entity = await client.getEntity(parsePeer(v));
      out[k] =
        k === 'channel' ? await client.getInputEntity(entity)
        : k === 'user' || k === 'bot' ? await client.getInputEntity(entity)
        : await client.getInputEntity(entity);
    } else {
      out[k] = await hydrateApiParams(client, v);
    }
  }
  return out;
}

/**
 * Replace BigInteger instances in API responses with their string
 * representation so they survive JSON.stringify.
 */
function safeStringify(obj: any): string {
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (v && typeof v === 'object' && typeof v.toString === 'function' && 'value' in v && (v as any).constructor?.name === 'Integer') {
        return v.toString();
      }
      if (typeof v === 'bigint') return v.toString();
      return v;
    },
    2
  );
}

/**
 * Resolve which Telegram account a tool call should run against.
 */
function resolveAccountId(explicit?: string): string {
  if (explicit) {
    if (!getAccount(explicit)) throw new Error(`Unknown account: ${explicit}. Call listAccounts first.`);
    return explicit;
  }
  const accounts = listAccounts();
  if (accounts.length === 0) {
    throw new Error('No Telegram accounts are signed in. Call the `login` tool first.');
  }
  if (accounts.length > 1) {
    throw new Error(
      `Multiple accounts available: ${accounts.map((a) => a.username || a.phone).join(', ')}. Pass \`accountId\`.`
    );
  }
  return accounts[0].id;
}

async function safeClient(accountId: string): Promise<TelegramClient> {
  try {
    return await clientForAccount(accountId);
  } catch (err) {
    if (err instanceof TelegramAuthError) {
      throw new Error(
        `Telegram session for ${accountId} is no longer valid. Call \`login\` to re-authorize, or \`logout\` to remove the account.`
      );
    }
    throw err;
  }
}

const MESSAGE_FILTER = {
  photos: () => new Api.InputMessagesFilterPhotos(),
  videos: () => new Api.InputMessagesFilterVideo(),
  photoVideo: () => new Api.InputMessagesFilterPhotoVideo(),
  documents: () => new Api.InputMessagesFilterDocument(),
  music: () => new Api.InputMessagesFilterMusic(),
  voice: () => new Api.InputMessagesFilterVoice(),
  roundVideo: () => new Api.InputMessagesFilterRoundVideo(),
  roundVoice: () => new Api.InputMessagesFilterRoundVoice(),
  gif: () => new Api.InputMessagesFilterGif(),
  url: () => new Api.InputMessagesFilterUrl(),
  geo: () => new Api.InputMessagesFilterGeo(),
  contacts: () => new Api.InputMessagesFilterContacts(),
  chatPhotos: () => new Api.InputMessagesFilterChatPhotos(),
  myMentions: () => new Api.InputMessagesFilterMyMentions(),
  pinned: () => new Api.InputMessagesFilterPinned(),
} as const;

const MessageFilterEnum = z.enum(
  Object.keys(MESSAGE_FILTER) as [keyof typeof MESSAGE_FILTER, ...Array<keyof typeof MESSAGE_FILTER>]
);

function serializeMessage(m: any) {
  return {
    id: m.id,
    date: m.date,
    text: m.message ?? '',
    out: m.out,
    fromId: m.fromId?.toString?.(),
    peerId: m.peerId?.userId?.toString?.() ?? m.peerId?.chatId?.toString?.() ?? m.peerId?.channelId?.toString?.(),
    replyTo: m.replyTo?.replyToMsgId,
    mediaType: m.media?.className,
    views: m.views,
    forwards: m.forwards,
  };
}

function serializeEntity(e: any) {
  if (!e) return null;
  if (e.className?.startsWith?.('User') || 'firstName' in e) {
    return {
      kind: 'user',
      id: e.id?.toString?.(),
      username: e.username,
      firstName: e.firstName,
      lastName: e.lastName,
      phone: e.phone,
      bot: e.bot,
      verified: e.verified,
      premium: e.premium,
    };
  }
  if ('megagroup' in e || 'broadcast' in e) {
    return {
      kind: e.broadcast ? 'channel' : 'supergroup',
      id: e.id?.toString?.(),
      title: e.title,
      username: e.username,
      verified: e.verified,
      participantsCount: e.participantsCount,
    };
  }
  return {
    kind: 'chat',
    id: e.id?.toString?.(),
    title: e.title,
    participantsCount: e.participantsCount,
  };
}

/**
 * Behavioural hints surfaced to the MCP client per RFC.
 *
 * - `readOnlyHint`        : tool only reads state
 * - `destructiveHint`     : tool may permanently destroy data
 * - `idempotentHint`      : repeating the call is safe
 * - `openWorldHint`       : tool touches external services / non-local state
 */
const ANN: Record<string, { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean }> = {
  listAccounts: { readOnlyHint: true },
  login: { openWorldHint: true },
  logout: { destructiveHint: true, openWorldHint: true },
  getMe: { readOnlyHint: true, openWorldHint: true },
  listDialogs: { readOnlyHint: true, openWorldHint: true },
  searchDialogs: { readOnlyHint: true, openWorldHint: true },
  listMessages: { readOnlyHint: true, openWorldHint: true },
  searchMessages: { readOnlyHint: true, openWorldHint: true },
  searchGlobal: { readOnlyHint: true, openWorldHint: true },
  getMessage: { readOnlyHint: true, openWorldHint: true },
  resolveUsername: { readOnlyHint: true, openWorldHint: true },
  markAsRead: { idempotentHint: true, openWorldHint: true },
  sendMessage: { openWorldHint: true },
  editMessage: { idempotentHint: true, openWorldHint: true },
  deleteMessages: { destructiveHint: true, openWorldHint: true },
  forwardMessages: { openWorldHint: true },
  pinMessage: { idempotentHint: true, openWorldHint: true },
  unpinMessage: { idempotentHint: true, openWorldHint: true },
  sendFile: { openWorldHint: true },
  downloadMedia: { readOnlyHint: true, openWorldHint: true },
  downloadProfilePhoto: { readOnlyHint: true, openWorldHint: true },
  listParticipants: { readOnlyHint: true, openWorldHint: true },
  getUserInfo: { readOnlyHint: true, openWorldHint: true },
  getChannelInfo: { readOnlyHint: true, openWorldHint: true },
  kickParticipant: { destructiveHint: true, openWorldHint: true },
  listFolders: { readOnlyHint: true, openWorldHint: true },
  transcribeMessage: { readOnlyHint: true, openWorldHint: true },
  sendMessageToPhone: { openWorldHint: true },
  invokeMtproto: { destructiveHint: true, openWorldHint: true },
  // ── channel/group management
  banUser: { destructiveHint: true, openWorldHint: true },
  unbanUser: { idempotentHint: true, openWorldHint: true },
  restrictUser: { destructiveHint: true, openWorldHint: true },
  promoteAdmin: { idempotentHint: true, openWorldHint: true },
  demoteAdmin: { idempotentHint: true, openWorldHint: true },
  inviteUser: { idempotentHint: true, openWorldHint: true },
  getParticipant: { readOnlyHint: true, openWorldHint: true },
  deleteUserHistory: { destructiveHint: true, openWorldHint: true },
  editTitle: { idempotentHint: true, openWorldHint: true },
  editAbout: { idempotentHint: true, openWorldHint: true },
  leaveChannel: { destructiveHint: true, openWorldHint: true },
  createInviteLink: { openWorldHint: true },
  listInviteLinks: { readOnlyHint: true, openWorldHint: true },
  revokeInviteLink: { destructiveHint: true, openWorldHint: true },
  listInviteJoiners: { readOnlyHint: true, openWorldHint: true },
  updateUsername: { idempotentHint: true, openWorldHint: true },
  checkUsername: { readOnlyHint: true, openWorldHint: true },
  setSlowMode: { idempotentHint: true, openWorldHint: true },
  toggleSignatures: { idempotentHint: true, openWorldHint: true },
  togglePreHistoryHidden: { idempotentHint: true, openWorldHint: true },
  toggleJoinRequest: { idempotentHint: true, openWorldHint: true },
  editPhoto: { idempotentHint: true, openWorldHint: true },
  getAdminLog: { readOnlyHint: true, openWorldHint: true },
  listTopics: { readOnlyHint: true, openWorldHint: true },
  createTopic: { openWorldHint: true },
  editTopic: { idempotentHint: true, openWorldHint: true },
  createChannel: { openWorldHint: true },
  deleteChannel: { destructiveHint: true, openWorldHint: true },
  migrateChat: { destructiveHint: true, openWorldHint: true },
  transferOwnership: { destructiveHint: true, openWorldHint: true },
  // ── reactions
  sendReaction: { idempotentHint: true, openWorldHint: true },
  getMessageReactions: { readOnlyHint: true, openWorldHint: true },
  setDefaultReaction: { idempotentHint: true, openWorldHint: true },
  // ── polls
  sendPoll: { openWorldHint: true },
  votePoll: { openWorldHint: true },
  closePoll: { idempotentHint: true, openWorldHint: true },
  getPollResults: { readOnlyHint: true, openWorldHint: true },
  // ── stories
  listStories: { readOnlyHint: true, openWorldHint: true },
  getPeerStories: { readOnlyHint: true, openWorldHint: true },
  sendStory: { openWorldHint: true },
  deleteStory: { destructiveHint: true, openWorldHint: true },
  viewStory: { idempotentHint: true, openWorldHint: true },
  getStoryViewers: { readOnlyHint: true, openWorldHint: true },
  // ── self profile
  updateProfile: { idempotentHint: true, openWorldHint: true },
  updateMyUsername: { idempotentHint: true, openWorldHint: true },
  setBirthday: { idempotentHint: true, openWorldHint: true },
  setProfilePhoto: { idempotentHint: true, openWorldHint: true },
  // ── privacy / blocking
  blockUser: { idempotentHint: true, openWorldHint: true },
  unblockUser: { idempotentHint: true, openWorldHint: true },
  listBlocked: { readOnlyHint: true, openWorldHint: true },
  getPrivacy: { readOnlyHint: true, openWorldHint: true },
  setPrivacy: { idempotentHint: true, openWorldHint: true },
  // ── contacts
  listContacts: { readOnlyHint: true, openWorldHint: true },
  addContact: { idempotentHint: true, openWorldHint: true },
  deleteContact: { destructiveHint: true, openWorldHint: true },
  searchContacts: { readOnlyHint: true, openWorldHint: true },
  // ── drafts
  saveDraft: { idempotentHint: true, openWorldHint: true },
  clearDraft: { idempotentHint: true, openWorldHint: true },
  listDrafts: { readOnlyHint: true, openWorldHint: true },
  // ── notifications
  mutePeer: { idempotentHint: true, openWorldHint: true },
  unmutePeer: { idempotentHint: true, openWorldHint: true },
  getNotifySettings: { readOnlyHint: true, openWorldHint: true },
  setNotifySettings: { idempotentHint: true, openWorldHint: true },
  // ── folders mgmt
  createFolder: { openWorldHint: true },
  editFolder: { idempotentHint: true, openWorldHint: true },
  deleteFolder: { destructiveHint: true, openWorldHint: true },
  reorderFolders: { idempotentHint: true, openWorldHint: true },
  // ── stickers
  getMyStickers: { readOnlyHint: true, openWorldHint: true },
  installStickerSet: { idempotentHint: true, openWorldHint: true },
  addRecentSticker: { idempotentHint: true, openWorldHint: true },
  // ── boosts
  getMyBoosts: { readOnlyHint: true, openWorldHint: true },
  applyBoost: { openWorldHint: true },
  // ── bots
  getInlineBotResults: { readOnlyHint: true, openWorldHint: true },
};

export function registerTools(server: McpServer): void {
  const readonly = isReadonly();
  const allow = parseToolList(process.env.MCP_TELEGRAM_TOOLS);
  const deny = parseToolList(process.env.MCP_TELEGRAM_DISABLE);

  /**
   * Apply allow/deny filters on top of the read-only gate.
   *
   * - `MCP_TELEGRAM_TOOLS=a,b,send*` — strict allowlist (anything else is skipped)
   * - `MCP_TELEGRAM_DISABLE=delete*,kickParticipant` — blocklist applied afterwards
   */
  function isEnabled(name: string): boolean {
    if (allow && !selectorMatches(name, allow)) return false;
    if (deny && selectorMatches(name, deny)) return false;
    return true;
  }

  /** Register a read-only / non-mutating tool. Annotations attached from ANN. */
  function reg(name: string, config: any, handler: any) {
    if (!isEnabled(name)) return undefined as any;
    return server.registerTool(name, { ...config, annotations: ANN[name] }, handler);
  }
  /** Register a destructive tool — silently skipped in read-only mode. */
  function regWrite(name: string, config: any, handler: any) {
    if (readonly) return undefined as any;
    if (!isEnabled(name)) return undefined as any;
    return server.registerTool(name, { ...config, annotations: ANN[name] }, handler);
  }

  // ── auth / account management ──────────────────────────────────────

  reg(
    'listAccounts',
    {
      title: 'List Telegram accounts',
      description: 'Return the Telegram accounts currently signed in on this machine.',
      inputSchema: {},
    },
    async () => {
      const accounts = listAccounts().map((a) => ({
        id: a.id,
        phone: a.phone,
        username: a.username,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(accounts, null, 2) }] };
    }
  );

  reg(
    'login',
    {
      title: 'Sign in to Telegram',
      description:
        'Open a browser window where the user signs in to Telegram (phone → code → 2FA). ' +
        'Resolves once the user finishes. Use this when no account is signed in or to add another one.',
      inputSchema: {},
    },
    async () => {
      const account = await runBrowserLogin();
      return {
        content: [
          {
            type: 'text',
            text: `Signed in as ${account.username ? '@' + account.username : account.phone} (id: ${account.id})`,
          },
        ],
      };
    }
  );

  regWrite(
    'logout',
    {
      title: 'Sign out of Telegram',
      description: 'Drop the local session for an account and revoke it on the Telegram side.',
      inputSchema: { accountId: z.string().describe('Account id (from listAccounts)') },
    },
    async (args: any) => {
      await logoutAccount(args.accountId);
      return { content: [{ type: 'text', text: `Signed out of ${args.accountId}` }] };
    }
  );

  reg(
    'getMe',
    {
      title: 'Get current user',
      description: 'Return the profile of the authenticated user for the chosen account.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const me = await client.getMe();
      return { content: [{ type: 'text', text: JSON.stringify(serializeEntity(me), null, 2) }] };
    }
  );

  // ── dialog discovery ───────────────────────────────────────────────

  reg(
    'listDialogs',
    {
      title: 'List dialogs',
      description: 'List available Telegram dialogs, chats and channels for the chosen account.',
      inputSchema: {
        accountId: z.string().optional(),
        unread: z.boolean().optional().describe('Only return dialogs with unread messages'),
        archived: z.boolean().optional().describe('Include archived dialogs'),
        ignorePinned: z.boolean().optional().describe('Ignore pinned dialogs'),
        folder: z.number().int().optional().describe('Folder id; 0 = no folder, 1 = archived'),
        limit: z.number().int().positive().max(200).optional().describe('Max dialogs (default 50)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const dialogs = await client.getDialogs({
        archived: args.archived ?? false,
        ignorePinned: args.ignorePinned ?? false,
        folder: args.folder,
        limit: args.limit ?? 50,
      });
      const filtered = args.unread ? dialogs.filter((d) => (d.unreadCount ?? 0) > 0) : dialogs;
      const payload = filtered.map((d) => ({
        id: d.id?.toString(),
        name: d.name,
        title: d.title,
        unreadCount: d.unreadCount,
        date: d.date,
        pinned: d.pinned,
        archived: d.folderId !== undefined,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  reg(
    'searchDialogs',
    {
      title: 'Search dialogs',
      description: 'Find dialogs by a substring against their name/title/username.',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1).describe('Substring to match (case-insensitive)'),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const q = args.query.toLowerCase();
      const matches: any[] = [];
      for await (const d of client.iterDialogs({})) {
        const hay = `${d.name ?? ''} ${d.title ?? ''} ${(d.entity as any)?.username ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          matches.push({
            id: d.id?.toString(),
            name: d.name,
            title: d.title,
            unreadCount: d.unreadCount,
            pinned: d.pinned,
          });
          if (matches.length >= (args.limit ?? 20)) break;
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }] };
    }
  );

  // ── messages ───────────────────────────────────────────────────────

  reg(
    'listMessages',
    {
      title: 'List messages',
      description: 'List messages in a dialog. Newest first.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const messages = await client.getMessages(parsePeer(args.peer), { limit: args.limit ?? 50 });
      return { content: [{ type: 'text', text: JSON.stringify(messages.map(serializeMessage), null, 2) }] };
    }
  );

  reg(
    'searchMessages',
    {
      title: 'Search messages in a dialog',
      description:
        'Search messages within one dialog. Supports text substring, type filter (photos/links/etc), ' +
        'sender filter, and date range. Newest first unless reverse=true.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        query: z.string().optional().describe('Substring to match in the message text'),
        filter: MessageFilterEnum.optional().describe('Media/content type filter'),
        fromUser: z
          .string()
          .optional()
          .describe('Username (@nick) or numeric id of the sender to filter by'),
        minDate: z.number().int().optional().describe('Unix seconds — exclude messages older than this'),
        maxDate: z.number().int().optional().describe('Unix seconds — exclude messages newer than this'),
        reverse: z.boolean().optional().describe('Oldest first when true'),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const opts: any = { limit: args.limit ?? 50, reverse: args.reverse ?? false };
      if (args.query) opts.search = args.query;
      if (args.filter) opts.filter = MESSAGE_FILTER[args.filter as keyof typeof MESSAGE_FILTER]();
      if (args.fromUser) opts.fromUser = parsePeer(args.fromUser);
      // gram.js exposes maxDate via offsetDate (newer-than cutoff).
      // minDate isn't a direct option — we post-filter the returned page.
      if (args.maxDate) opts.offsetDate = args.maxDate;
      const messages = await client.getMessages(parsePeer(args.peer), opts);
      const out = args.minDate
        ? messages.filter((m) => (m.date ?? 0) >= args.minDate!)
        : messages;
      return { content: [{ type: 'text', text: JSON.stringify(out.map(serializeMessage), null, 2) }] };
    }
  );

  reg(
    'searchGlobal',
    {
      title: 'Search messages across all dialogs',
      description: 'Search messages across every chat the user is in. Useful for "find that link about X".',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1),
        filter: MessageFilterEnum.optional(),
        minDate: z.number().int().optional(),
        maxDate: z.number().int().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.messages.SearchGlobal({
          q: args.query,
          filter: args.filter ? MESSAGE_FILTER[args.filter as keyof typeof MESSAGE_FILTER]() : new Api.InputMessagesFilterEmpty(),
          minDate: args.minDate ?? 0,
          maxDate: args.maxDate ?? 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit: args.limit ?? 50,
        })
      );
      const chats = new Map<string, any>();
      for (const c of result.chats ?? []) chats.set(c.id?.toString(), c);
      for (const u of result.users ?? []) chats.set(u.id?.toString(), u);
      const payload = (result.messages ?? []).map((m: any) => {
        const peerId =
          m.peerId?.userId?.toString?.() ??
          m.peerId?.chatId?.toString?.() ??
          m.peerId?.channelId?.toString?.();
        const peer = peerId ? chats.get(peerId) : undefined;
        return {
          ...serializeMessage(m),
          peer: serializeEntity(peer),
        };
      });
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  reg(
    'getMessage',
    {
      title: 'Get message by id',
      description: 'Fetch one or several messages from a dialog by their ids.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        ids: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const messages = await client.getMessages(parsePeer(args.peer), { ids: args.ids });
      return { content: [{ type: 'text', text: JSON.stringify(messages.map(serializeMessage), null, 2) }] };
    }
  );

  // ── entities ───────────────────────────────────────────────────────

  reg(
    'resolveUsername',
    {
      title: 'Resolve a Telegram username',
      description: 'Look up a user, channel, or chat by @username.',
      inputSchema: {
        accountId: z.string().optional(),
        username: z.string().describe('With or without the leading @'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(args.username.replace(/^@/, ''));
      return { content: [{ type: 'text', text: JSON.stringify(serializeEntity(entity), null, 2) }] };
    }
  );

  // ── read state ─────────────────────────────────────────────────────

  regWrite(
    'markAsRead',
    {
      title: 'Mark dialog as read',
      description: 'Mark a dialog (and optionally up to a specific message id) as read.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        maxId: z.number().int().optional().describe('Mark messages up to this id (inclusive). Omit to mark all.'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.markAsRead(parsePeer(args.peer), args.maxId);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── write: send / edit / delete / forward / pin ────────────────────

  const ParseMode = z.enum(['plain', 'markdown', 'html']).optional();

  regWrite(
    'sendMessage',
    {
      title: 'Send a message',
      description: 'Send a text message to a dialog. Supports reply, forum topic, silent, scheduled delivery, and parse mode.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        text: z.string().min(1),
        replyTo: z.number().int().optional().describe('Message id to reply to'),
        topMsgId: z.number().int().optional().describe('Forum topic root message id (for posting into a topic)'),
        silent: z.boolean().optional(),
        parseMode: ParseMode,
        linkPreview: z.boolean().optional(),
        schedule: z.number().int().optional().describe('Unix seconds — send at this time instead of now'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const msg = await client.sendMessage(parsePeer(args.peer), {
        message: args.text,
        replyTo: args.replyTo,
        topMsgId: args.topMsgId,
        silent: args.silent,
        parseMode: args.parseMode === 'plain' ? undefined : args.parseMode,
        linkPreview: args.linkPreview,
        schedule: args.schedule,
      });
      return { content: [{ type: 'text', text: JSON.stringify(serializeMessage(msg), null, 2) }] };
    }
  );

  regWrite(
    'editMessage',
    {
      title: 'Edit a message',
      description: 'Edit the text of a previously sent message.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        text: z.string().min(1),
        parseMode: ParseMode,
        linkPreview: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const msg = await client.editMessage(parsePeer(args.peer), {
        message: args.messageId,
        text: args.text,
        parseMode: args.parseMode === 'plain' ? undefined : args.parseMode,
        linkPreview: args.linkPreview,
      });
      return { content: [{ type: 'text', text: JSON.stringify(serializeMessage(msg), null, 2) }] };
    }
  );

  regWrite(
    'deleteMessages',
    {
      title: 'Delete messages',
      description: 'Delete messages by id. `revoke` (default true) deletes for all participants where possible.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageIds: z.array(z.number().int()).min(1).max(100),
        revoke: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.deleteMessages(parsePeer(args.peer), args.messageIds, { revoke: args.revoke ?? true });
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'forwardMessages',
    {
      title: 'Forward messages',
      description: 'Forward messages from one dialog to another.',
      inputSchema: {
        accountId: z.string().optional(),
        fromPeer: z.string(),
        messageIds: z.array(z.number().int()).min(1).max(100),
        toPeer: z.string(),
        silent: z.boolean().optional(),
        dropAuthor: z.boolean().optional().describe('Hide the original author'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const forwarded = await client.forwardMessages(parsePeer(args.toPeer), {
        fromPeer: parsePeer(args.fromPeer),
        messages: args.messageIds,
        silent: args.silent,
        dropAuthor: args.dropAuthor,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify((forwarded as any[]).map(serializeMessage), null, 2) }],
      };
    }
  );

  regWrite(
    'pinMessage',
    {
      title: 'Pin a message',
      description: 'Pin a message in the dialog.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        silent: z.boolean().optional(),
        pmOneSide: z.boolean().optional().describe('In PMs, pin only on your side (default false)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.pinMessage(parsePeer(args.peer), args.messageId, {
        notify: !args.silent,
        pmOneside: args.pmOneSide,
      } as any);
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'unpinMessage',
    {
      title: 'Unpin a message',
      description: 'Unpin a specific message, or pass no id to unpin everything in the dialog.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      if (args.messageId != null) {
        await client.unpinMessage(parsePeer(args.peer), args.messageId);
      } else {
        await (client as any).unpinMessage(parsePeer(args.peer));
      }
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── media ──────────────────────────────────────────────────────────

  regWrite(
    'sendFile',
    {
      title: 'Send a file',
      description:
        'Upload and send one or more files. Each path may be an absolute local path or an `https://` URL. ' +
        'Passing multiple paths sends them as an album.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        path: z
          .union([z.string(), z.array(z.string()).min(1).max(10)])
          .describe('Local path, URL, or array of those for an album'),
        caption: z.string().optional(),
        asPhoto: z.boolean().optional(),
        asVoice: z.boolean().optional(),
        silent: z.boolean().optional(),
        replyTo: z.number().int().optional(),
        topMsgId: z.number().int().optional().describe('Forum topic root message id'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const resolved = Array.isArray(args.path)
        ? await Promise.all(args.path.map(resolveFileArg))
        : await resolveFileArg(args.path);
      const msg = await client.sendFile(parsePeer(args.peer), {
        file: resolved,
        caption: args.caption,
        forceDocument: args.asPhoto || args.asVoice ? (false as const) : undefined,
        voiceNote: args.asVoice,
        silent: args.silent,
        replyTo: args.replyTo,
        topMsgId: args.topMsgId,
      } as any);
      const out = Array.isArray(msg) ? (msg as any[]).map(serializeMessage) : serializeMessage(msg);
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }
  );

  reg(
    'downloadMedia',
    {
      title: 'Download media from a message',
      description:
        `Download the media attached to a message. Files land in ${downloadsDir} (override with MCP_TELEGRAM_DOWNLOADS env). Returns the absolute path.`,
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const [message] = await client.getMessages(parsePeer(args.peer), { ids: [args.messageId] });
      if (!message || !message.media) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: 'No media on that message' }) }] };
      }
      const dir = ensureDownloadsDir();
      const outPath = join(dir, `${accountId}_${args.messageId}`);
      const result = await client.downloadMedia(message as any, { outputFile: outPath } as any);
      const path = typeof result === 'string' ? result : outPath;
      return { content: [{ type: 'text', text: JSON.stringify({ path }, null, 2) }] };
    }
  );

  reg(
    'downloadProfilePhoto',
    {
      title: 'Download a profile photo',
      description: `Download the profile photo of a user/chat/channel. Saved under ${downloadsDir}.`,
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const dir = ensureDownloadsDir();
      const outPath = join(dir, `${accountId}_avatar_${args.peer.replace(/[^A-Za-z0-9_-]/g, '_')}`);
      const result = await client.downloadProfilePhoto(parsePeer(args.peer), { outputFile: outPath } as any);
      const path = typeof result === 'string' ? result : outPath;
      return { content: [{ type: 'text', text: JSON.stringify({ path }, null, 2) }] };
    }
  );

  // ── group/channel info ─────────────────────────────────────────────

  const ParticipantFilter = z.enum(['recent', 'admins', 'kicked', 'banned', 'bots', 'contacts']);

  reg(
    'listParticipants',
    {
      title: 'List participants of a group or channel',
      description: 'List members of a group, supergroup, or channel. Optional filter (admins/kicked/banned/bots) and substring search.',
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
        case 'admins': filter = new Api.ChannelParticipantsAdmins(); break;
        case 'kicked': filter = new Api.ChannelParticipantsKicked({ q: args.search ?? '' }); break;
        case 'banned': filter = new Api.ChannelParticipantsBanned({ q: args.search ?? '' }); break;
        case 'bots': filter = new Api.ChannelParticipantsBots(); break;
        case 'contacts': filter = new Api.ChannelParticipantsContacts({ q: args.search ?? '' }); break;
        case 'recent':
        default: filter = args.search ? new Api.ChannelParticipantsSearch({ q: args.search }) : new Api.ChannelParticipantsRecent();
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

  reg(
    'getUserInfo',
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

  reg(
    'getChannelInfo',
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

  regWrite(
    'kickParticipant',
    {
      title: 'Kick a participant',
      description: 'Remove a user from a chat/channel. Requires admin rights.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.kickParticipant(parsePeer(args.peer), parsePeer(args.user));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── folders ────────────────────────────────────────────────────────

  reg(
    'listFolders',
    {
      title: 'List custom dialog folders',
      description: 'Return the user-defined folders (a.k.a. chat filters) with their inclusion rules.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.GetDialogFilters());
      const filters = result.filters ?? result;
      const payload = (filters as any[]).map((f) => ({
        id: f.id,
        title: f.title?.text ?? f.title,
        contacts: f.contacts,
        nonContacts: f.nonContacts,
        groups: f.groups,
        broadcasts: f.broadcasts,
        bots: f.bots,
        excludeMuted: f.excludeMuted,
        excludeRead: f.excludeRead,
        excludeArchived: f.excludeArchived,
        pinnedPeersCount: f.pinnedPeers?.length,
        includePeersCount: f.includePeers?.length,
        excludePeersCount: f.excludePeers?.length,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  // ── transcription ──────────────────────────────────────────────────

  reg(
    'transcribeMessage',
    {
      title: 'Transcribe a voice/video message',
      description:
        'Request a transcription of a voice note or video message. Requires a Telegram Premium account. ' +
        'The response may be pending — re-call to poll, passing the same message id.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const entity = await client.getEntity(parsePeer(args.peer));
      const inputPeer = await client.getInputEntity(entity);
      const result: any = await client.invoke(
        new Api.messages.TranscribeAudio({ peer: inputPeer as any, msgId: args.messageId })
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                pending: result.pending,
                text: result.text,
                transcriptionId: result.transcriptionId?.toString?.(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── send by phone (auto-contact) ───────────────────────────────────

  regWrite(
    'sendMessageToPhone',
    {
      title: 'Send a message to a phone number',
      description:
        'Send a Telegram message to someone identified only by their phone number. ' +
        'The phone is briefly added to contacts (Telegram requires this), the message is sent, ' +
        'then the contact entry is removed by default. Phone must include country code (e.g. +12025550123).',
      inputSchema: {
        accountId: z.string().optional(),
        phone: z.string().regex(/^\+?\d[\d\s()-]{6,}$/),
        text: z.string().min(1),
        firstName: z.string().optional().describe('Name used for the temporary contact entry'),
        lastName: z.string().optional(),
        keepContact: z.boolean().optional().describe('Do not remove the contact afterwards (default false)'),
        parseMode: ParseMode,
        silent: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const cleanPhone = args.phone.replace(/[^\d]/g, '');
      const imported: any = await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: bigInt(Date.now()),
              phone: cleanPhone,
              firstName: args.firstName || 'mcp-telegram',
              lastName: args.lastName || '',
            }),
          ],
        })
      );
      const user = imported.users?.[0];
      if (!user) {
        throw new Error('Telegram could not resolve a user for that phone number.');
      }
      const msg = await client.sendMessage(user as any, {
        message: args.text,
        parseMode: args.parseMode === 'plain' ? undefined : args.parseMode,
        silent: args.silent,
      });
      if (!args.keepContact) {
        try {
          await client.invoke(new Api.contacts.DeleteContacts({ id: [user as any] }));
        } catch {
          /* best-effort cleanup */
        }
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sent: serializeMessage(msg),
                user: serializeEntity(user),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── raw MTProto bridge ─────────────────────────────────────────────

  regWrite(
    'invokeMtproto',
    {
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

  // ── channel/group management ───────────────────────────────────────

  const BannedRights = z.object({
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
  }).strict();

  const AdminRights = z.object({
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
  }).strict();

  /** Build ChatBannedRights with all "send*" flags forbidden (full mute/ban). */
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

  // ─── Tier 1: member moderation ──────────────────────────────────

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
        new Api.channels.EditBanned({ channel: channel as any, participant: participant as any, bannedRights: fullBanRights(args.untilDate ?? 0) })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'unbanUser',
    {
      title: 'Lift a ban / restriction',
      description: 'Remove all restrictions for a user.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const participant = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(
        new Api.channels.EditBanned({ channel: channel as any, participant: participant as any, bannedRights: emptyBanRights() })
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
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
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
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
      },
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

  regWrite(
    'deleteUserHistory',
    {
      title: "Delete all messages by a user in a chat",
      description: 'Wipe every message a given user has posted in the channel/supergroup.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        user: z.string(),
      },
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
    'editTitle',
    {
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
    'editAbout',
    {
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
    'leaveChannel',
    {
      title: 'Leave a channel/supergroup',
      description: 'Leave the channel. Use `deleteChannel` to also remove it (creator only).',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.LeaveChannel({ channel: channel as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ─── Tier 2: invite links ───────────────────────────────────────

  regWrite(
    'createInviteLink',
    {
      title: 'Create an invite link',
      description: 'Generate a new invite link with optional expiry, usage cap, and join-request gate.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        expireDate: z.number().int().optional().describe('Unix seconds — link expires at this time'),
        usageLimit: z.number().int().positive().optional(),
        requestNeeded: z.boolean().optional().describe('Require admin approval to join'),
        title: z.string().max(32).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.ExportChatInvite({
          peer: inputPeer as any,
          expireDate: args.expireDate,
          usageLimit: args.usageLimit,
          requestNeeded: args.requestNeeded,
          title: args.title,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'listInviteLinks',
    {
      title: 'List invite links',
      description: 'List all invite links the current user can see in a chat.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        revoked: z.boolean().optional().describe('List revoked links instead of active ones'),
        adminId: z.string().optional().describe('Filter by issuing admin'),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const adminInput = args.adminId
        ? await client.getInputEntity(parsePeer(args.adminId))
        : await client.getInputEntity('me');
      const result: any = await client.invoke(
        new Api.messages.GetExportedChatInvites({
          peer: inputPeer as any,
          adminId: adminInput as any,
          revoked: args.revoked,
          limit: args.limit ?? 30,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'revokeInviteLink',
    {
      title: 'Revoke an invite link',
      description: 'Permanently revoke a previously generated invite link.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        link: z.string().describe('The invite link URL (e.g. https://t.me/+abc...)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.EditExportedChatInvite({
          peer: inputPeer as any,
          link: args.link,
          revoked: true,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'listInviteJoiners',
    {
      title: 'List users that joined via an invite link',
      description: 'List users that joined a chat through a specific invite link.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        link: z.string().optional().describe('Specific invite link; omit to list all joiners'),
        requested: z.boolean().optional().describe('List pending join requests instead'),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetChatInviteImporters({
          peer: inputPeer as any,
          link: args.link,
          requested: args.requested,
          limit: args.limit ?? 50,
          offsetDate: 0,
          offsetUser: new Api.InputUserEmpty(),
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  // ─── Tier 3: settings ───────────────────────────────────────────

  regWrite(
    'updateUsername',
    {
      title: 'Set / change channel public @username',
      description: 'Assign a new public username. Pass an empty string to clear it.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        username: z.string(),
      },
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
    'checkUsername',
    {
      title: 'Check if a username is available',
      description: 'Verify whether a desired channel/supergroup username is free.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        username: z.string(),
      },
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
    'setSlowMode',
    {
      title: 'Set slow-mode delay',
      description: 'Limit how often non-admins can post. Allowed values: 0 (off), 10, 30, 60, 300, 900, 3600 seconds.',
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
    'toggleSignatures',
    {
      title: 'Toggle author signatures on channel posts',
      description: 'Broadcast channels only.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        enabled: z.boolean(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.ToggleSignatures({ channel: channel as any, enabled: args.enabled } as any));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'togglePreHistoryHidden',
    {
      title: 'Hide / show history for new members',
      description: 'Supergroups only. When enabled, new members cannot see history before they joined.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        enabled: z.boolean(),
      },
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
    'toggleJoinRequest',
    {
      title: 'Toggle join-request requirement',
      description: 'When enabled, new members must be approved by an admin.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        enabled: z.boolean(),
      },
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
    'editPhoto',
    {
      title: 'Change chat / channel avatar',
      description: 'Upload a new avatar photo from a local path or URL.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        path: z.string(),
      },
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

  // ─── Tier 4: audit + forum topics ───────────────────────────────

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

  reg(
    'listTopics',
    {
      title: 'List forum topics',
      description: 'List topics in a supergroup with forum mode enabled.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        query: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.channels.GetForumTopics({
          channel: channel as any,
          q: args.query,
          offsetDate: 0,
          offsetId: 0,
          offsetTopic: 0,
          limit: args.limit ?? 50,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'createTopic',
    {
      title: 'Create a forum topic',
      description: 'Create a new topic in a forum-enabled supergroup.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        title: z.string().min(1).max(128),
        iconColor: z.number().int().optional().describe('Decimal RGB color (e.g. 0x6FB9F0)'),
        iconEmojiId: z.string().optional().describe('Custom emoji document id'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.channels.CreateForumTopic({
          channel: channel as any,
          title: args.title,
          iconColor: args.iconColor,
          iconEmojiId: args.iconEmojiId ? bigInt(args.iconEmojiId) : undefined,
          randomId: bigInt(Date.now()),
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'editTopic',
    {
      title: 'Edit a forum topic',
      description: 'Rename / re-icon / close / hide a topic.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        topicId: z.number().int(),
        title: z.string().min(1).max(128).optional(),
        iconEmojiId: z.string().optional(),
        closed: z.boolean().optional(),
        hidden: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.channels.EditForumTopic({
          channel: channel as any,
          topicId: args.topicId,
          title: args.title,
          iconEmojiId: args.iconEmojiId ? bigInt(args.iconEmojiId) : undefined,
          closed: args.closed,
          hidden: args.hidden,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ─── Tier 5: heavy (create / delete / migrate / transfer) ──────

  regWrite(
    'createChannel',
    {
      title: 'Create a channel or supergroup',
      description: 'Create a broadcast channel (`broadcast: true`) or a supergroup (`megagroup: true`).',
      inputSchema: {
        accountId: z.string().optional(),
        title: z.string().min(1).max(128),
        about: z.string().max(255).optional(),
        broadcast: z.boolean().optional(),
        megagroup: z.boolean().optional(),
        forum: z.boolean().optional().describe('Enable forum/topics mode (supergroups only)'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      if (!args.broadcast && !args.megagroup) {
        throw new Error('Pass either `broadcast: true` or `megagroup: true`.');
      }
      const result: any = await client.invoke(
        new Api.channels.CreateChannel({
          broadcast: args.broadcast,
          megagroup: args.megagroup,
          forum: args.forum,
          title: args.title,
          about: args.about ?? '',
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'deleteChannel',
    {
      title: 'Delete a channel or supergroup',
      description: 'Permanently delete the channel. Creator only.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(new Api.channels.DeleteChannel({ channel: channel as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'migrateChat',
    {
      title: 'Migrate a basic group to a supergroup',
      description: 'One-way migration. Returns the new supergroup id in the resulting updates.',
      inputSchema: {
        accountId: z.string().optional(),
        chatId: z.string().describe('Basic group chat id'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.messages.MigrateChat({ chatId: bigInt(args.chatId) }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'transferOwnership',
    {
      title: 'Transfer channel ownership',
      description:
        'Transfer creator rights to another user. Requires the account 2FA password (Telegram enforces this).',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        newOwner: z.string(),
        password: z.string().describe('Current account 2FA cloud password'),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const channel = await client.getInputEntity(parsePeer(args.peer));
      const userInput = await client.getInputEntity(parsePeer(args.newOwner));
      const passSrp: any = await client.invoke(new Api.account.GetPassword());
      const { computeCheck } = await import('telegram/Password.js');
      const passSrpCheck = await computeCheck(passSrp, args.password);
      await client.invoke(
        new Api.channels.EditCreator({
          channel: channel as any,
          userId: userInput as any,
          password: passSrpCheck,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── reactions ──────────────────────────────────────────────────────

  function buildReactions(args: { emoji?: string[]; customEmojiIds?: string[] }): any[] {
    const out: any[] = [];
    for (const e of args.emoji ?? []) out.push(new Api.ReactionEmoji({ emoticon: e }));
    for (const id of args.customEmojiIds ?? []) out.push(new Api.ReactionCustomEmoji({ documentId: bigInt(id) }));
    return out;
  }

  regWrite(
    'sendReaction',
    {
      title: 'React to a message',
      description: 'Set one or more reactions on a message. Pass an empty reaction list to remove existing reactions.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        emoji: z.array(z.string()).optional().describe('Standard emoji reactions, e.g. ["👍","🔥"]'),
        customEmojiIds: z.array(z.string()).optional().describe('Custom emoji document ids'),
        big: z.boolean().optional().describe('Animated "big" reaction'),
        addToRecent: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      await client.invoke(
        new Api.messages.SendReaction({
          peer: inputPeer as any,
          msgId: args.messageId,
          reaction: buildReactions(args),
          big: args.big,
          addToRecent: args.addToRecent,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getMessageReactions',
    {
      title: 'Get reactions on messages',
      description: 'Fetch the current reactions for one or more messages in a dialog.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageIds: z.array(z.number().int()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetMessagesReactions({ peer: inputPeer as any, id: args.messageIds })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'setDefaultReaction',
    {
      title: 'Set the account-wide default reaction',
      description: 'Set the quick reaction emoji shown on long-press in clients.',
      inputSchema: {
        accountId: z.string().optional(),
        emoji: z.string().optional(),
        customEmojiId: z.string().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const reaction = args.customEmojiId
        ? new Api.ReactionCustomEmoji({ documentId: bigInt(args.customEmojiId) })
        : new Api.ReactionEmoji({ emoticon: args.emoji ?? '👍' });
      await client.invoke(new Api.messages.SetDefaultReaction({ reaction }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── polls ──────────────────────────────────────────────────────────

  regWrite(
    'sendPoll',
    {
      title: 'Send a poll',
      description:
        'Send a poll. For a quiz, set `quiz: true` and `correctAnswerIndex` (0-based). ' +
        'Use `closePeriod` (seconds) or `closeDate` (unix seconds) to auto-close.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        question: z.string().min(1).max(255),
        answers: z.array(z.string().min(1).max(100)).min(2).max(10),
        anonymous: z.boolean().optional().default(true),
        multipleChoice: z.boolean().optional(),
        quiz: z.boolean().optional(),
        correctAnswerIndex: z.number().int().optional(),
        solution: z.string().optional().describe('Explanation shown after a quiz answer'),
        closePeriod: z.number().int().positive().optional(),
        closeDate: z.number().int().positive().optional(),
        replyTo: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const pollAnswers = (args.answers as string[]).map(
        (text, i) =>
          new Api.PollAnswer({
            text: new Api.TextWithEntities({ text, entities: [] }),
            option: Buffer.from([i]),
          })
      );
      const poll = new Api.Poll({
        id: bigInt(0),
        question: new Api.TextWithEntities({ text: args.question, entities: [] }),
        answers: pollAnswers,
        closed: false,
        publicVoters: args.anonymous === false,
        multipleChoice: args.multipleChoice,
        quiz: args.quiz,
        closePeriod: args.closePeriod,
        closeDate: args.closeDate,
      });
      const media = new Api.InputMediaPoll({
        poll,
        correctAnswers:
          args.quiz && args.correctAnswerIndex != null ? [Buffer.from([args.correctAnswerIndex])] : undefined,
        solution: args.solution,
        solutionEntities: args.solution ? [] : undefined,
      });
      const result: any = await client.invoke(
        new Api.messages.SendMedia({
          peer: inputPeer as any,
          media,
          message: '',
          randomId: bigInt(Date.now()),
          replyTo: args.replyTo ? new Api.InputReplyToMessage({ replyToMsgId: args.replyTo }) : undefined,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'votePoll',
    {
      title: 'Vote in a poll',
      description: 'Cast a vote on a poll by the index(es) of the chosen options.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
        answerIndexes: z.array(z.number().int().nonnegative()).min(1),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const options = (args.answerIndexes as number[]).map((i) => Buffer.from([i]));
      const result: any = await client.invoke(
        new Api.messages.SendVote({ peer: inputPeer as any, msgId: args.messageId, options })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'closePoll',
    {
      title: 'Close an active poll',
      description: 'Finalize a poll so no further votes are accepted.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const closedPoll = new Api.Poll({
        id: bigInt(0),
        question: new Api.TextWithEntities({ text: '', entities: [] }),
        answers: [],
        closed: true,
      });
      await client.invoke(
        new Api.messages.EditMessage({
          peer: inputPeer as any,
          id: args.messageId,
          media: new Api.InputMediaPoll({ poll: closedPoll }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'getPollResults',
    {
      title: 'Get poll results',
      description: 'Fetch the current vote tally for a poll message.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        messageId: z.number().int(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const inputPeer = await client.getInputEntity(parsePeer(args.peer));
      const result: any = await client.invoke(
        new Api.messages.GetPollResults({ peer: inputPeer as any, msgId: args.messageId })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  // ── stories ────────────────────────────────────────────────────────

  reg(
    'listStories',
    {
      title: 'List active stories from contacts',
      description: 'Return the stories feed (other users\' active stories).',
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
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
      },
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
        period: z.union([z.literal(21600), z.literal(43200), z.literal(86400), z.literal(172800)]).optional().describe('Lifetime seconds; default 86400 (24h)'),
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
            attributes: [new Api.DocumentAttributeVideo({ duration: 0, w: 0, h: 0, supportsStreaming: true })],
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

  // ── self profile ───────────────────────────────────────────────────

  regWrite(
    'updateProfile',
    {
      title: 'Update own profile (name, bio)',
      description: 'Change own first name, last name, or about. Omitted fields are left untouched.',
      inputSchema: {
        accountId: z.string().optional(),
        firstName: z.string().max(64).optional(),
        lastName: z.string().max(64).optional(),
        about: z.string().max(70).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(
        new Api.account.UpdateProfile({
          firstName: args.firstName,
          lastName: args.lastName,
          about: args.about,
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'updateMyUsername',
    {
      title: 'Update own @username',
      description: 'Set or clear (empty string) own public username.',
      inputSchema: {
        accountId: z.string().optional(),
        username: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.account.UpdateUsername({ username: args.username.replace(/^@/, '') }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'setBirthday',
    {
      title: 'Set birthday on profile',
      description: 'Set the account birthday. Year is optional.',
      inputSchema: {
        accountId: z.string().optional(),
        day: z.number().int().min(1).max(31),
        month: z.number().int().min(1).max(12),
        year: z.number().int().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(
        new Api.account.UpdateBirthday({
          birthday: new Api.Birthday({ day: args.day, month: args.month, year: args.year }),
        })
      );
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'setProfilePhoto',
    {
      title: 'Set own profile photo',
      description: 'Upload a new profile photo from a local path or URL.',
      inputSchema: {
        accountId: z.string().optional(),
        path: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const resolvedPath = await resolveFileArg(args.path);
      const uploaded = await client.uploadFile({ file: resolvedPath as any, workers: 1 } as any);
      const result: any = await client.invoke(
        new Api.photos.UploadProfilePhoto({ file: uploaded as any })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  // ── privacy / blocking ─────────────────────────────────────────────

  regWrite(
    'blockUser',
    {
      title: 'Block a user',
      description: 'Block a user from contacting you.',
      inputSchema: {
        accountId: z.string().optional(),
        user: z.string(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const input = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(new Api.contacts.Block({ id: input as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'unblockUser',
    {
      title: 'Unblock a user',
      description: 'Lift a previous block.',
      inputSchema: { accountId: z.string().optional(), user: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const input = await client.getInputEntity(parsePeer(args.user));
      await client.invoke(new Api.contacts.Unblock({ id: input as any }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  reg(
    'listBlocked',
    {
      title: 'List blocked users',
      description: 'List users currently on the block list.',
      inputSchema: {
        accountId: z.string().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.contacts.GetBlocked({ offset: 0, limit: args.limit ?? 50 }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  const PrivacyKey = z.enum([
    'statusTimestamp',
    'chatInvite',
    'phoneCall',
    'phoneP2P',
    'forwards',
    'profilePhoto',
    'phoneNumber',
    'addedByPhone',
    'voiceMessages',
    'about',
    'birthday',
  ]);

  function buildPrivacyKey(name: string): any {
    switch (name) {
      case 'statusTimestamp': return new Api.InputPrivacyKeyStatusTimestamp();
      case 'chatInvite': return new Api.InputPrivacyKeyChatInvite();
      case 'phoneCall': return new Api.InputPrivacyKeyPhoneCall();
      case 'phoneP2P': return new Api.InputPrivacyKeyPhoneP2P();
      case 'forwards': return new Api.InputPrivacyKeyForwards();
      case 'profilePhoto': return new Api.InputPrivacyKeyProfilePhoto();
      case 'phoneNumber': return new Api.InputPrivacyKeyPhoneNumber();
      case 'addedByPhone': return new Api.InputPrivacyKeyAddedByPhone();
      case 'voiceMessages': return new Api.InputPrivacyKeyVoiceMessages();
      case 'about': return new Api.InputPrivacyKeyAbout();
      case 'birthday': return new Api.InputPrivacyKeyBirthday();
      default: throw new Error(`Unknown privacy key: ${name}`);
    }
  }

  reg(
    'getPrivacy',
    {
      title: 'Get a privacy setting',
      description: 'Return current rules for one privacy key.',
      inputSchema: {
        accountId: z.string().optional(),
        key: PrivacyKey,
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.account.GetPrivacy({ key: buildPrivacyKey(args.key) }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'setPrivacy',
    {
      title: 'Set a privacy setting',
      description:
        'Replace the privacy rules for a key. `mode` chooses the base policy; `allowUsers`/`disallowUsers` add user-id exceptions.',
      inputSchema: {
        accountId: z.string().optional(),
        key: PrivacyKey,
        mode: z.enum(['everyone', 'contacts', 'closeFriends', 'premium', 'nobody']),
        allowUsers: z.array(z.string()).optional(),
        disallowUsers: z.array(z.string()).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const rules: any[] = [];
      switch (args.mode) {
        case 'everyone': rules.push(new Api.InputPrivacyValueAllowAll()); break;
        case 'contacts': rules.push(new Api.InputPrivacyValueAllowContacts()); break;
        case 'closeFriends': rules.push(new Api.InputPrivacyValueAllowCloseFriends()); break;
        case 'premium': rules.push(new Api.InputPrivacyValueAllowPremium()); break;
        case 'nobody': rules.push(new Api.InputPrivacyValueDisallowAll()); break;
      }
      if (args.allowUsers?.length) {
        const ids = await Promise.all(
          (args.allowUsers as string[]).map(async (u) => (await client.getInputEntity(parsePeer(u))) as any)
        );
        rules.push(new Api.InputPrivacyValueAllowUsers({ users: ids }));
      }
      if (args.disallowUsers?.length) {
        const ids = await Promise.all(
          (args.disallowUsers as string[]).map(async (u) => (await client.getInputEntity(parsePeer(u))) as any)
        );
        rules.push(new Api.InputPrivacyValueDisallowUsers({ users: ids }));
      }
      const result: any = await client.invoke(
        new Api.account.SetPrivacy({ key: buildPrivacyKey(args.key), rules })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  // ── contacts ───────────────────────────────────────────────────────

  reg(
    'listContacts',
    {
      title: 'List own contacts',
      description: 'List all users in the contact book.',
      inputSchema: { accountId: z.string().optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }));
      const users = (result.users ?? []).map(serializeEntity);
      return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
    }
  );

  regWrite(
    'addContact',
    {
      title: 'Add a contact',
      description: 'Add a user to your contacts.',
      inputSchema: {
        accountId: z.string().optional(),
        user: z.string(),
        firstName: z.string().max(64),
        lastName: z.string().max(64).optional(),
        phone: z.string().optional().describe('Required for phone-based contact lookup'),
        addPhonePrivacyException: z.boolean().optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const input = await client.getInputEntity(parsePeer(args.user));
      const result: any = await client.invoke(
        new Api.contacts.AddContact({
          id: input as any,
          firstName: args.firstName,
          lastName: args.lastName ?? '',
          phone: args.phone ?? '',
          addPhonePrivacyException: args.addPhonePrivacyException,
        })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'deleteContact',
    {
      title: 'Delete contacts',
      description: 'Remove one or more users from the contact book.',
      inputSchema: {
        accountId: z.string().optional(),
        users: z.array(z.string()).min(1).max(100),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const ids = await Promise.all(
        (args.users as string[]).map(async (u) => (await client.getInputEntity(parsePeer(u))) as any)
      );
      const result: any = await client.invoke(new Api.contacts.DeleteContacts({ id: ids }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'searchContacts',
    {
      title: 'Search contacts and global directory',
      description: 'Search users/chats/channels by a query (matches name, username, and indexed text).',
      inputSchema: {
        accountId: z.string().optional(),
        query: z.string().min(1),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(
        new Api.contacts.Search({ q: args.query, limit: args.limit ?? 20 })
      );
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  // ── drafts ─────────────────────────────────────────────────────────

  regWrite(
    'saveDraft',
    {
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

  // ── notifications ──────────────────────────────────────────────────

  regWrite(
    'mutePeer',
    {
      title: 'Mute a peer',
      description: 'Mute a chat. Without `untilDate`, mutes forever.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string(),
        untilDate: z.number().int().optional(),
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

  // ── folders mgmt ───────────────────────────────────────────────────

  /** Build the gram.js DialogFilter payload from a slim user-facing config. */
  async function buildDialogFilter(client: TelegramClient, args: any): Promise<any> {
    const resolve = async (list?: string[]): Promise<any[]> => {
      if (!list?.length) return [];
      return Promise.all(list.map(async (p) => (await client.getInputEntity(parsePeer(p))) as any));
    };
    return new Api.DialogFilter({
      id: args.id,
      title: new Api.TextWithEntities({ text: args.title, entities: [] }) as any,
      contacts: args.includeContacts,
      nonContacts: args.includeNonContacts,
      groups: args.includeGroups,
      broadcasts: args.includeChannels,
      bots: args.includeBots,
      excludeMuted: args.excludeMuted,
      excludeRead: args.excludeRead,
      excludeArchived: args.excludeArchived,
      pinnedPeers: await resolve(args.pinnedPeers),
      includePeers: await resolve(args.includePeers),
      excludePeers: await resolve(args.excludePeers),
    });
  }

  const FolderFields = {
    title: z.string().min(1).max(12),
    includeContacts: z.boolean().optional(),
    includeNonContacts: z.boolean().optional(),
    includeGroups: z.boolean().optional(),
    includeChannels: z.boolean().optional(),
    includeBots: z.boolean().optional(),
    excludeMuted: z.boolean().optional(),
    excludeRead: z.boolean().optional(),
    excludeArchived: z.boolean().optional(),
    pinnedPeers: z.array(z.string()).optional(),
    includePeers: z.array(z.string()).optional(),
    excludePeers: z.array(z.string()).optional(),
  };

  regWrite(
    'createFolder',
    {
      title: 'Create a dialog folder',
      description: 'Create a new dialog folder (chat filter). `id` is auto-assigned to the next free slot 2..255.',
      inputSchema: FolderFields,
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const existing: any = await client.invoke(new Api.messages.GetDialogFilters());
      const used = new Set<number>((existing.filters ?? existing).map((f: any) => f.id));
      let id = 2;
      while (used.has(id)) id++;
      const filter = await buildDialogFilter(client, { ...args, id });
      await client.invoke(new Api.messages.UpdateDialogFilter({ id, filter }));
      return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
    }
  );

  regWrite(
    'editFolder',
    {
      title: 'Edit a dialog folder',
      description: 'Replace the rules of an existing folder. `id` is required.',
      inputSchema: { id: z.number().int(), ...FolderFields },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const filter = await buildDialogFilter(client, args);
      await client.invoke(new Api.messages.UpdateDialogFilter({ id: args.id, filter }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'deleteFolder',
    {
      title: 'Delete a dialog folder',
      description: 'Remove a folder by id.',
      inputSchema: { accountId: z.string().optional(), id: z.number().int() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.messages.UpdateDialogFilter({ id: args.id }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'reorderFolders',
    {
      title: 'Reorder dialog folders',
      description: 'Set the display order of folders by passing the list of ids in the desired sequence.',
      inputSchema: {
        accountId: z.string().optional(),
        order: z.array(z.number().int()).min(1),
      },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.messages.UpdateDialogFiltersOrder({ order: args.order }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  // ── stickers ───────────────────────────────────────────────────────

  reg(
    'getMyStickers',
    {
      title: 'List installed sticker sets',
      description: 'Return the user\'s installed sticker sets.',
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

  // ── premium boosts ─────────────────────────────────────────────────

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

  // ── bots ───────────────────────────────────────────────────────────

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
