#!/usr/bin/env node

import { config as dotenvConfig } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import bigInt from 'big-integer';

import { listAccounts, getAccount } from './state.js';
import { clientForAccount, logoutAccount, TelegramAuthError } from './telegram.js';
import { runBrowserLogin } from './auth-browser.js';
import { logger } from './logger.js';

dotenvConfig();

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', reason as Error);
});

/**
 * Resolve which Telegram account a tool call should run against.
 *
 * - If `accountId` is supplied, use it.
 * - Else if exactly one account is signed in, use that.
 * - Else throw with guidance — the agent should call `listAccounts`
 *   or `login` to disambiguate.
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

async function main(): Promise<void> {
  const server = new McpServer({ name: 'mcp-telegram', version: '1.0.0' });

  server.registerTool(
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

  server.registerTool(
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

  server.registerTool(
    'logout',
    {
      title: 'Sign out of Telegram',
      description: 'Drop the local session for an account and revoke it on the Telegram side.',
      inputSchema: {
        accountId: z.string().describe('Account id (from listAccounts)'),
      },
    },
    async ({ accountId }) => {
      await logoutAccount(accountId);
      return { content: [{ type: 'text', text: `Signed out of ${accountId}` }] };
    }
  );

  server.registerTool(
    'listDialogs',
    {
      title: 'List dialogs',
      description: 'List available Telegram dialogs, chats and channels for the chosen account.',
      inputSchema: {
        accountId: z.string().optional().describe('Account id (omit if only one is signed in)'),
        unread: z.boolean().optional().describe('Only return dialogs with unread messages'),
        archived: z.boolean().optional().describe('Include archived dialogs'),
        ignorePinned: z.boolean().optional().describe('Ignore pinned dialogs'),
        limit: z.number().int().positive().max(200).optional().describe('Max dialogs to return (default 50)'),
      },
    },
    async (args) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const dialogs = await client.getDialogs({
        archived: args.archived ?? false,
        ignorePinned: args.ignorePinned ?? false,
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

  server.registerTool(
    'listMessages',
    {
      title: 'List messages',
      description: 'List messages in a given dialog. Newest first.',
      inputSchema: {
        accountId: z.string().optional().describe('Account id (omit if only one is signed in)'),
        dialogId: z.string().describe('Dialog id from listDialogs'),
        limit: z.number().int().positive().max(200).optional().describe('Max messages (default 50)'),
      },
    },
    async (args) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const messages = await client.getMessages(bigInt(args.dialogId), {
        limit: args.limit ?? 50,
      });
      const payload = messages.map((m) => ({
        id: m.id,
        date: m.date,
        text: m.message,
        out: m.out,
        from: m.fromId?.toString?.(),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('mcp-telegram (stdio) ready');
}

async function safeClient(accountId: string) {
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

main().catch((err) => {
  logger.error('Fatal error in stdio entry', err);
  process.exit(1);
});
