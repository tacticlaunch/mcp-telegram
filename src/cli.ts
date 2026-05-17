#!/usr/bin/env node
/**
 * mcp-tg — Telegram CLI that backs the `telegram` agent-skill bundle
 * shipped alongside the MCP server.
 *
 * Design goals:
 *   • JSON-first output (parseable by skills/agents)
 *   • Reuses ~/.mcp-telegram state + browser-login from the MCP server
 *   • Zero context cost when idle — the agent only loads the skill markdown
 *     when it matches the user's intent
 *
 * To run the MCP server: `mcp-tg mcp`  (or the legacy `mcp-telegram` bin).
 */
import { config as dotenvConfig } from 'dotenv';
import { Api } from 'telegram';
import bigInt from 'big-integer';

import { listAccounts } from './state.js';
import { clientForAccount, logoutAccount, TelegramAuthError } from './telegram.js';
import { runBrowserLogin } from './auth-browser.js';
import {
  parsePeer,
  resolveAccountId,
  safeClient,
  serializeMessage,
  serializeEntity,
  safeStringify,
  MESSAGE_FILTER,
  resolveFileArg,
  ensureDownloadsDir,
  resolveApiClass,
  hydrateApiParams,
} from './tools/_helpers.js';
import { logger } from './logger.js';
import { runInstall, runUninstall, runDoctor } from './cli-install.js';

dotenvConfig();

// ─── arg parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

function flagStr(flags: ParsedArgs['flags'], key: string): string | undefined {
  const v = flags[key];
  if (typeof v === 'string') return v;
  return undefined;
}

function flagNum(flags: ParsedArgs['flags'], key: string): number | undefined {
  const v = flagStr(flags, key);
  return v === undefined ? undefined : Number(v);
}

function flagBool(flags: ParsedArgs['flags'], key: string): boolean | undefined {
  const v = flags[key];
  if (v === undefined) return undefined;
  if (typeof v === 'boolean') return v;
  const s = v.toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function flagList(flags: ParsedArgs['flags'], key: string): string[] | undefined {
  const v = flagStr(flags, key);
  if (v === undefined) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function flagNumList(flags: ParsedArgs['flags'], key: string): number[] | undefined {
  const v = flagList(flags, key);
  return v?.map((s) => Number(s));
}

// ─── output ──────────────────────────────────────────────────────────

function print(value: any): void {
  process.stdout.write(safeStringify(value) + '\n');
}

function ok(extra?: Record<string, any>): void {
  print({ ok: true, ...(extra ?? {}) });
}

function fail(message: string, code = 1): never {
  process.stderr.write(JSON.stringify({ ok: false, error: message }) + '\n');
  process.exit(code);
}

// ─── peer + entity helpers ───────────────────────────────────────────

function need(args: string[], i: number, name: string): string {
  if (args[i] === undefined) fail(`Missing argument: <${name}>`);
  return args[i];
}

async function inputPeerOf(client: any, peer: string): Promise<any> {
  const entity = await client.getEntity(parsePeer(peer));
  return client.getInputEntity(entity);
}

function serializeDialog(d: any) {
  return {
    id: d.id?.toString(),
    name: d.name,
    title: d.title,
    unreadCount: d.unreadCount,
    date: d.date,
    pinned: d.pinned,
    archived: d.folderId !== undefined,
  };
}

// ─── command table ───────────────────────────────────────────────────

type Cmd = (args: string[], flags: ParsedArgs['flags']) => Promise<void>;
interface CmdGroup {
  [k: string]: Cmd | CmdGroup;
}

// Each command resolves an account + client itself so we can pass
// `--account` per call without a global session.
async function withClient<T>(
  flags: ParsedArgs['flags'],
  fn: (client: any, accountId: string) => Promise<T>
): Promise<T> {
  const accountId = resolveAccountId(flagStr(flags, 'account'));
  const client = await safeClient(accountId);
  return fn(client, accountId);
}

const commands: CmdGroup = {
  // ── sessions ────────────────────────────────────────────────────
  async login() {
    const account = await runBrowserLogin();
    print({ ok: true, account });
  },
  async logout(args: string[]) {
    const id = need(args, 0, 'accountId');
    await logoutAccount(id);
    ok({ accountId: id });
  },
  async accounts() {
    print(listAccounts().map((a) => ({ id: a.id, phone: a.phone, username: a.username })));
  },
  async me(_: string[], flags: ParsedArgs["flags"]) {
    await withClient(flags, async (client) => {
      const me = await client.getMe();
      print(serializeEntity(me));
    });
  },

  // ── dialogs ─────────────────────────────────────────────────────
  async dialogs(_: string[], flags: ParsedArgs["flags"]) {
    await withClient(flags, async (client) => {
      const dialogs = await client.getDialogs({
        archived: flagBool(flags, 'archived') ?? false,
        ignorePinned: flagBool(flags, 'ignore-pinned') ?? false,
        folder: flagNum(flags, 'folder'),
        limit: flagNum(flags, 'limit') ?? 50,
      });
      const unread = flagBool(flags, 'unread');
      const filtered = unread ? dialogs.filter((d: any) => (d.unreadCount ?? 0) > 0) : dialogs;
      print(filtered.map(serializeDialog));
    });
  },
  'search-dialogs': async (args: string[], flags: ParsedArgs["flags"]) => {
    const query = need(args, 0, 'query');
    await withClient(flags, async (client) => {
      const q = query.toLowerCase();
      const matches: any[] = [];
      const limit = flagNum(flags, 'limit') ?? 20;
      for await (const d of client.iterDialogs({})) {
        const hay = `${d.name ?? ''} ${d.title ?? ''} ${(d.entity as any)?.username ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          matches.push(serializeDialog(d));
          if (matches.length >= limit) break;
        }
      }
      print(matches);
    });
  },
  resolve: async (args: string[], flags: ParsedArgs["flags"]) => {
    const username = need(args, 0, 'username');
    await withClient(flags, async (client) => {
      const entity = await client.getEntity(parsePeer(username));
      print(serializeEntity(entity));
    });
  },

  // ── messages ────────────────────────────────────────────────────
  messages: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    await withClient(flags, async (client) => {
      const msgs = await client.getMessages(parsePeer(peer), { limit: flagNum(flags, 'limit') ?? 50 });
      print(msgs.map(serializeMessage));
    });
  },
  search: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const query = args[1];
    await withClient(flags, async (client) => {
      const opts: any = {
        limit: flagNum(flags, 'limit') ?? 50,
        reverse: flagBool(flags, 'reverse') ?? false,
      };
      if (query) opts.search = query;
      const filter = flagStr(flags, 'filter');
      if (filter) opts.filter = (MESSAGE_FILTER as any)[filter]?.() ?? undefined;
      const fromUser = flagStr(flags, 'from-user');
      if (fromUser) opts.fromUser = parsePeer(fromUser);
      const maxDate = flagNum(flags, 'max-date');
      if (maxDate) opts.offsetDate = maxDate;
      const msgs = await client.getMessages(parsePeer(peer), opts);
      const minDate = flagNum(flags, 'min-date');
      const out = minDate ? msgs.filter((m: any) => (m.date ?? 0) >= minDate) : msgs;
      print(out.map(serializeMessage));
    });
  },
  'search-global': async (args: string[], flags: ParsedArgs["flags"]) => {
    const query = need(args, 0, 'query');
    await withClient(flags, async (client) => {
      const filter = flagStr(flags, 'filter');
      const result: any = await client.invoke(
        new Api.messages.SearchGlobal({
          q: query,
          filter: filter ? (MESSAGE_FILTER as any)[filter]() : new Api.InputMessagesFilterEmpty(),
          minDate: flagNum(flags, 'min-date') ?? 0,
          maxDate: flagNum(flags, 'max-date') ?? 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
          limit: flagNum(flags, 'limit') ?? 50,
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
        return { ...serializeMessage(m), peer: serializeEntity(peer) };
      });
      print(payload);
    });
  },
  get: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const ids = args
      .slice(1)
      .flatMap((s) => s.split(','))
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
    if (ids.length === 0) fail('Provide at least one message id');
    await withClient(flags, async (client) => {
      const msgs = await client.getMessages(parsePeer(peer), { ids });
      print(msgs.map(serializeMessage));
    });
  },
  send: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const text = need(args, 1, 'text');
    await withClient(flags, async (client) => {
      const msg = await client.sendMessage(parsePeer(peer), {
        message: text,
        replyTo: flagNum(flags, 'reply-to'),
        silent: flagBool(flags, 'silent'),
        parseMode: flagStr(flags, 'parse-mode') as any,
      });
      print(serializeMessage(msg));
    });
  },
  edit: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const id = Number(need(args, 1, 'messageId'));
    const text = need(args, 2, 'text');
    await withClient(flags, async (client) => {
      const msg = await client.editMessage(parsePeer(peer), {
        message: id,
        text,
        parseMode: flagStr(flags, 'parse-mode') as any,
      });
      print(serializeMessage(msg));
    });
  },
  delete: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const ids = args
      .slice(1)
      .flatMap((s) => s.split(','))
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n));
    if (ids.length === 0) fail('Provide at least one message id');
    await withClient(flags, async (client) => {
      await client.deleteMessages(parsePeer(peer), ids, { revoke: flagBool(flags, 'revoke') ?? true });
      ok({ deleted: ids.length });
    });
  },
  forward: async (_: string[], flags: ParsedArgs["flags"]) => {
    const from = flagStr(flags, 'from');
    const to = flagStr(flags, 'to');
    const ids = flagNumList(flags, 'ids');
    if (!from || !to || !ids || ids.length === 0) {
      fail('forward requires --from <peer> --to <peer> --ids 1,2,3');
    }
    await withClient(flags, async (client) => {
      const res = await client.forwardMessages(parsePeer(to!), {
        fromPeer: parsePeer(from!),
        messages: ids!,
        silent: flagBool(flags, 'silent'),
      });
      print(Array.isArray(res) ? res.map(serializeMessage) : serializeMessage(res));
    });
  },
  pin: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const id = Number(need(args, 1, 'messageId'));
    await withClient(flags, async (client) => {
      await client.pinMessage(parsePeer(peer), id, {
        notify: flagBool(flags, 'notify'),
        pmOneSide: flagBool(flags, 'pm-one-side'),
      } as any);
      ok();
    });
  },
  unpin: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const id = Number(need(args, 1, 'messageId'));
    await withClient(flags, async (client) => {
      await client.unpinMessage(parsePeer(peer), id);
      ok();
    });
  },
  react: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const id = Number(need(args, 1, 'messageId'));
    const emojis = args.slice(2);
    const customIds = flagList(flags, 'custom-emoji-ids') ?? [];
    if (emojis.length === 0 && customIds.length === 0) {
      // empty reaction list = clear
    }
    await withClient(flags, async (client) => {
      const inputPeer = await inputPeerOf(client, peer);
      const reaction: any[] = [];
      for (const e of emojis) reaction.push(new Api.ReactionEmoji({ emoticon: e }));
      for (const cid of customIds)
        reaction.push(new Api.ReactionCustomEmoji({ documentId: bigInt(cid) }));
      await client.invoke(
        new Api.messages.SendReaction({
          peer: inputPeer,
          msgId: id,
          reaction,
          big: flagBool(flags, 'big'),
          addToRecent: flagBool(flags, 'add-to-recent'),
        })
      );
      ok();
    });
  },
  'mark-read': async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    await withClient(flags, async (client) => {
      await client.markAsRead(parsePeer(peer), flagNum(flags, 'max-id'));
      ok();
    });
  },

  // ── media ───────────────────────────────────────────────────────
  'send-file': async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const paths = args.slice(1);
    if (paths.length === 0) fail('Provide at least one file path or URL');
    await withClient(flags, async (client) => {
      const resolved = await Promise.all(paths.map((p) => resolveFileArg(p)));
      const file = resolved.length === 1 ? resolved[0] : resolved;
      const msg = await client.sendFile(parsePeer(peer), {
        file,
        caption: flagStr(flags, 'caption'),
        voiceNote: flagBool(flags, 'voice'),
        forceDocument: flagBool(flags, 'as-document'),
        silent: flagBool(flags, 'silent'),
        replyTo: flagNum(flags, 'reply-to'),
      } as any);
      const out = Array.isArray(msg) ? (msg as any[]).map(serializeMessage) : serializeMessage(msg);
      print(out);
    });
  },
  download: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    const messageId = Number(need(args, 1, 'messageId'));
    await withClient(flags, async (client, accountId) => {
      const [message] = await client.getMessages(parsePeer(peer), { ids: [messageId] });
      if (!message || !message.media) fail('No media on that message');
      const dir = ensureDownloadsDir();
      const outPath = `${dir}/${accountId}_${messageId}`;
      const result = await client.downloadMedia(message as any, { outputFile: outPath } as any);
      print({ path: typeof result === 'string' ? result : outPath });
    });
  },

  // ── saved messages (premium tags) ───────────────────────────────
  saved: {
    async tags(_: string[], flags: ParsedArgs["flags"]) {
      await withClient(flags, async (client) => {
        const result: any = await client.invoke(
          new Api.messages.GetSavedReactionTags({ hash: bigInt(0) as any })
        );
        print(result);
      });
    },
    async 'tag-rename'(args: string[], flags: ParsedArgs["flags"]) {
      const emoji = need(args, 0, 'emoji');
      const title = args[1];
      await withClient(flags, async (client) => {
        const reaction = new Api.ReactionEmoji({ emoticon: emoji });
        await client.invoke(new Api.messages.UpdateSavedReactionTag({ reaction, title }));
        ok({ emoji, title: title ?? null });
      });
    },
    async 'default-tags'(_: string[], flags: ParsedArgs["flags"]) {
      await withClient(flags, async (client) => {
        const result: any = await client.invoke(
          new Api.messages.GetDefaultTagReactions({ hash: bigInt(0) as any })
        );
        print(result);
      });
    },
    async search(_: string[], flags: ParsedArgs["flags"]) {
      const tags = flagList(flags, 'tag') ?? [];
      const customIds = flagList(flags, 'tag-custom') ?? [];
      await withClient(flags, async (client) => {
        const mePeer = await client.getInputEntity('me');
        const reactions: any[] = [];
        for (const e of tags) reactions.push(new Api.ReactionEmoji({ emoticon: e }));
        for (const id of customIds)
          reactions.push(new Api.ReactionCustomEmoji({ documentId: bigInt(id) }));
        const params: any = {
          peer: mePeer,
          q: flagStr(flags, 'query') ?? '',
          filter: new Api.InputMessagesFilterEmpty(),
          minDate: flagNum(flags, 'min-date') ?? 0,
          maxDate: flagNum(flags, 'max-date') ?? 0,
          offsetId: 0,
          addOffset: 0,
          limit: flagNum(flags, 'limit') ?? 50,
          maxId: 0,
          minId: 0,
          hash: bigInt(0) as any,
        };
        if (reactions.length) params.savedReaction = reactions;
        const savedPeer = flagStr(flags, 'saved-peer');
        if (savedPeer) params.savedPeerId = await inputPeerOf(client, savedPeer);
        const result: any = await client.invoke(new Api.messages.Search(params));
        print((result.messages ?? []).map(serializeMessage));
      });
    },
    async dialogs(_: string[], flags: ParsedArgs["flags"]) {
      await withClient(flags, async (client) => {
        const result: any = await client.invoke(
          new Api.messages.GetSavedDialogs({
            excludePinned: flagBool(flags, 'exclude-pinned'),
            offsetDate: 0,
            offsetId: 0,
            offsetPeer: new Api.InputPeerEmpty(),
            limit: flagNum(flags, 'limit') ?? 50,
            hash: bigInt(0) as any,
          })
        );
        print(result);
      });
    },
    async history(args: string[], flags: ParsedArgs["flags"]) {
      const peer = need(args, 0, 'peer');
      await withClient(flags, async (client) => {
        const inputPeer = await inputPeerOf(client, peer);
        const result: any = await client.invoke(
          new Api.messages.GetSavedHistory({
            peer: inputPeer,
            offsetId: flagNum(flags, 'offset-id') ?? 0,
            offsetDate: 0,
            addOffset: 0,
            limit: flagNum(flags, 'limit') ?? 50,
            maxId: 0,
            minId: 0,
            hash: bigInt(0) as any,
          })
        );
        print((result.messages ?? []).map(serializeMessage));
      });
    },
    async 'delete-history'(args: string[], flags: ParsedArgs["flags"]) {
      const peer = need(args, 0, 'peer');
      await withClient(flags, async (client) => {
        const inputPeer = await inputPeerOf(client, peer);
        const result: any = await client.invoke(
          new Api.messages.DeleteSavedHistory({
            peer: inputPeer,
            maxId: flagNum(flags, 'max-id') ?? 0,
            minDate: flagNum(flags, 'min-date'),
            maxDate: flagNum(flags, 'max-date'),
          })
        );
        print(result);
      });
    },
    async 'toggle-pin'(args: string[], flags: ParsedArgs["flags"]) {
      const peer = need(args, 0, 'peer');
      await withClient(flags, async (client) => {
        const inputPeer = await inputPeerOf(client, peer);
        await client.invoke(
          new Api.messages.ToggleSavedDialogPin({
            pinned: flagBool(flags, 'pinned'),
            peer: new Api.InputDialogPeer({ peer: inputPeer }),
          })
        );
        ok();
      });
    },
  },

  // ── channel info / participants ─────────────────────────────────
  info: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    await withClient(flags, async (client) => {
      const entity = await client.getEntity(parsePeer(peer));
      print(serializeEntity(entity));
    });
  },
  participants: async (args: string[], flags: ParsedArgs["flags"]) => {
    const peer = need(args, 0, 'peer');
    await withClient(flags, async (client) => {
      const list = await client.getParticipants(parsePeer(peer), {
        limit: flagNum(flags, 'limit') ?? 100,
        search: flagStr(flags, 'search'),
      });
      print(list.map(serializeEntity));
    });
  },

  // ── raw bridge ──────────────────────────────────────────────────
  invoke: async (args: string[], flags: ParsedArgs["flags"]) => {
    const className = need(args, 0, 'Namespace.Class');
    const ParamsRaw = flagStr(flags, 'params') ?? '{}';
    let params: any;
    try {
      params = JSON.parse(ParamsRaw);
    } catch (err) {
      fail(`Invalid --params JSON: ${(err as Error).message}`);
    }
    await withClient(flags, async (client) => {
      const Ctor = resolveApiClass(className);
      const hydrated = await hydrateApiParams(client, params);
      const inst = new Ctor(hydrated);
      const result = await client.invoke(inst);
      print(result);
    });
  },

  // ── installer ───────────────────────────────────────────────────
  install: async (args: string[]) => {
    const target = args[0];
    await runInstall(target);
  },
  uninstall: async (args: string[]) => {
    const target = args[0];
    await runUninstall(target);
  },
  doctor: async () => {
    await runDoctor();
  },

  // ── mcp server (delegates to existing entry) ────────────────────
  mcp: async () => {
    await import('./index.js');
  },

  help: async () => {
    printHelp();
  },
  version: async () => {
    print({ version: VERSION });
  },
};

const VERSION = '3.0.0';

const HELP = `mcp-tg ${VERSION} — Telegram CLI for AI agents

USAGE
  mcp-tg <command> [args] [--flag value] [--account <id>]
  mcp-tg <group> <command> [args]

SESSIONS
  login                           Open browser to sign in
  logout <accountId>              Drop a session
  accounts                        List signed-in accounts
  me                              Profile of current account

DIALOGS
  dialogs                         [--unread] [--archived] [--folder N] [--limit N]
  search-dialogs <query>          [--limit N]
  resolve <@username|id>          Look up an entity

MESSAGES
  messages <peer>                 [--limit N]
  search <peer> [query]           [--filter X] [--from-user U] [--min-date T] [--max-date T] [--limit N] [--reverse]
  search-global <query>           [--filter X] [--limit N]
  get <peer> <id[,id...]>
  send <peer> <text>              [--reply-to N] [--silent] [--parse-mode markdown|html]
  edit <peer> <id> <text>
  delete <peer> <id[,id...]>      [--revoke false]
  forward --from <peer> --to <peer> --ids 1,2,3 [--silent]
  pin <peer> <id>                 [--notify] [--pm-one-side]
  unpin <peer> <id>
  react <peer> <id> <emoji...>    [--custom-emoji-ids id,id] [--big] [--add-to-recent]
  mark-read <peer>                [--max-id N]

MEDIA
  send-file <peer> <path|url...>  [--caption X] [--voice] [--as-document] [--silent] [--reply-to N]
  download <peer> <id>            → JSON {"path": "..."}

SAVED MESSAGES (Premium reaction-tags)
  saved tags                      List tag reactions + custom titles
  saved tag-rename <emoji> [title]  Rename tag (omit title to clear)
  saved default-tags              Default emoji set
  saved search [--tag emoji ...] [--query X] [--limit N] [--saved-peer P]
  saved dialogs                   [--exclude-pinned] [--limit N]
  saved history <peer>            [--offset-id N] [--limit N]
  saved delete-history <peer>     [--max-id N] [--min-date T] [--max-date T]
  saved toggle-pin <peer>         [--pinned true|false]

CHANNELS
  info <peer>
  participants <peer>             [--limit N] [--search X]

RAW
  invoke <Namespace.Class> --params '{...}'   Call any MTProto method

PLUGIN INSTALL
  install [claude|codex|cursor|all]   Install skill bundle (auto-detect if omitted)
  uninstall [client]                  Remove skill bundle
  doctor                              Show detected clients + install state

SERVER
  mcp                              Run the MCP stdio server (same as 'mcp-telegram')

OUTPUT
  All commands print JSON to stdout. Errors go to stderr as {"ok": false, "error": "..."}.

ACCOUNT SELECTION
  Pass --account <id> if you have multiple signed-in accounts. Otherwise the
  single signed-in account is used (or you'll get an error listing options).
`;

function printHelp(): void {
  process.stdout.write(HELP);
}

// ─── dispatch ────────────────────────────────────────────────────────

async function dispatch(argv: string[]): Promise<void> {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printHelp();
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    print({ version: VERSION });
    return;
  }

  // Walk into nested groups (e.g. `saved tags`).
  let cur: any = commands;
  let consumed = 0;
  for (let i = 0; i < argv.length && !argv[i].startsWith('--'); i++) {
    const tok = argv[i];
    if (typeof cur === 'object' && cur !== null && tok in cur) {
      cur = cur[tok];
      consumed++;
      if (typeof cur === 'function') break;
    } else {
      break;
    }
  }

  if (typeof cur !== 'function') {
    fail(`Unknown command: ${argv.slice(0, consumed + 1).join(' ') || '(none)'}. Run 'mcp-tg help'.`);
  }

  const rest = argv.slice(consumed);
  const parsed = parseArgs(rest);
  try {
    await (cur as Cmd)(parsed.positional, parsed.flags);
  } catch (err) {
    if (err instanceof TelegramAuthError) {
      fail(`Session expired for ${err.accountId}. Run 'mcp-tg login' to re-authorize.`);
    }
    fail((err as Error).message ?? String(err));
  }
}

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
  fail(err.message);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason as Error);
  fail((reason as Error)?.message ?? String(reason));
});

dispatch(process.argv.slice(2))
  .then(() => {
    // The MCP entry runs forever; everything else should exit cleanly so
    // gram.js's persistent WebSocket doesn't keep the process alive.
    if (process.argv[2] !== 'mcp' && process.argv[2] !== 'login') process.exit(0);
  })
  .catch((err) => {
    fail((err as Error).message ?? String(err));
  });
