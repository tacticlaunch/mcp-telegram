import { Api, TelegramClient } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

import { listAccounts, getAccount } from '../state.js';
import { clientForAccount, TelegramAuthError } from '../telegram.js';

// Downloads land under the shared Telegram-agent home, unless explicitly
// overridden via MCP_TELEGRAM_DOWNLOADS (legacy) or TELEGRAM_AGENT_DOWNLOADS.
// Default resolves through the same priority as state.ts: env override →
// new `~/.telegram-agent/` → legacy `~/.mcp-telegram/` fallback.
function resolveDownloadsDir(): string {
  const override = process.env.TELEGRAM_AGENT_DOWNLOADS || process.env.MCP_TELEGRAM_DOWNLOADS;
  if (override) return override;
  const homeOverride = process.env.TELEGRAM_AGENT_HOME || process.env.MCP_TELEGRAM_HOME;
  if (homeOverride) return join(homeOverride, 'downloads');
  const home = homedir();
  const next = join(home, '.telegram-agent');
  const legacy = join(home, '.mcp-telegram');
  const base = !existsSync(next) && existsSync(legacy) ? legacy : next;
  return join(base, 'downloads');
}

export const downloadsDir = resolveDownloadsDir();

export function ensureDownloadsDir(): string {
  if (!existsSync(downloadsDir)) mkdirSync(downloadsDir, { recursive: true });
  return downloadsDir;
}

/**
 * Accept either a numeric peer id (string of digits) or a @username.
 * `"me"` is passed through — gram.js recognizes it as the Saved Messages
 * alias for the current user.
 */
export function parsePeer(s: string): any {
  const t = s.trim();
  if (t === 'me') return t;
  if (/^-?\d+$/.test(t)) return bigInt(t);
  return t.replace(/^@/, '');
}

/**
 * Materialize a file argument for upload:
 * - `https://...` → fetched into a temp file
 * - everything else is treated as a local path
 */
export async function resolveFileArg(p: string): Promise<string> {
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

/** Resolve "namespace.Class" → constructor on the `Api` namespace. */
export function resolveApiClass(name: string): any {
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
 * Recursively replace known entity-like string fields in a params object
 * with the resolved InputPeer/InputUser. Lets agents pass `"@nick"` or
 * `"me"` instead of full Api objects to the raw bridge.
 */
export async function hydrateApiParams(client: TelegramClient, params: any): Promise<any> {
  if (params == null || typeof params !== 'object') return params;
  if (Array.isArray(params)) return Promise.all(params.map((v) => hydrateApiParams(client, v)));
  const ENTITY_KEYS = new Set(['peer', 'channel', 'user', 'fromPeer', 'toPeer', 'bot', 'chat']);
  const out: any = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && ENTITY_KEYS.has(k)) {
      const entity = await client.getEntity(parsePeer(v));
      out[k] = await client.getInputEntity(entity);
    } else {
      out[k] = await hydrateApiParams(client, v);
    }
  }
  return out;
}

/** JSON.stringify with BigInteger → string coercion so API responses serialize. */
export function safeStringify(obj: any): string {
  return JSON.stringify(
    obj,
    (_k, v) => {
      if (
        v &&
        typeof v === 'object' &&
        typeof v.toString === 'function' &&
        'value' in v &&
        (v as any).constructor?.name === 'Integer'
      ) {
        return v.toString();
      }
      if (typeof v === 'bigint') return v.toString();
      return v;
    },
    2
  );
}

/**
 * Decide which signed-in Telegram account a tool call should run against.
 *
 * Throws with actionable guidance when ambiguous so the agent can fix
 * it without a stack trace.
 */
export function resolveAccountId(explicit?: string): string {
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

export async function safeClient(accountId: string): Promise<TelegramClient> {
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

export const MESSAGE_FILTER = {
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

export const MessageFilterEnum = z.enum(
  Object.keys(MESSAGE_FILTER) as [keyof typeof MESSAGE_FILTER, ...Array<keyof typeof MESSAGE_FILTER>]
);

export const ParseMode = z.enum(['plain', 'markdown', 'html']).optional();

/** Extract a numeric id string from a TL Peer object (PeerUser/PeerChat/PeerChannel). */
function peerIdString(p: any): string | undefined {
  if (!p) return undefined;
  return (
    p.userId?.toString?.() ??
    p.chatId?.toString?.() ??
    p.channelId?.toString?.() ??
    undefined
  );
}

export function serializeMessage(m: any) {
  return {
    id: m.id,
    date: m.date,
    text: m.message ?? '',
    out: m.out,
    fromId: peerIdString(m.fromId),
    peerId: peerIdString(m.peerId),
    replyTo: m.replyTo?.replyToMsgId,
    mediaType: m.media?.className,
    views: m.views,
    forwards: m.forwards,
  };
}

export function serializeEntity(e: any) {
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
