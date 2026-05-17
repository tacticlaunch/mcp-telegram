import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import bigInt from 'big-integer';

import { clientForAccount, TelegramAuthError } from './telegram.js';

/**
 * Build a per-account `McpServer` instance.
 *
 * One server per authenticated bearer — tools close over the account id
 * so each request operates on the right Telegram session.
 */
export function buildMcpServer(accountId: string): McpServer {
  const server = new McpServer({
    name: 'mcp-telegram',
    version: '1.0.0',
  });

  server.registerTool(
    'listDialogs',
    {
      title: 'List dialogs',
      description: 'List available Telegram dialogs, chats, and channels for the authorized account.',
      inputSchema: {
        unread: z.boolean().optional().describe('Show only unread dialogs'),
        archived: z.boolean().optional().describe('Include archived dialogs'),
        ignorePinned: z.boolean().optional().describe('Ignore pinned dialogs'),
        limit: z.number().int().positive().max(200).optional().describe('Max dialogs to return (default 50)'),
      },
    },
    async (args) => {
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
        dialogId: z.string().describe('ID of the dialog (from listDialogs)'),
        limit: z.number().int().positive().max(200).optional().describe('Max messages to return (default 50)'),
      },
    },
    async (args) => {
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

  return server;
}

async function safeClient(accountId: string) {
  try {
    return await clientForAccount(accountId);
  } catch (err) {
    if (err instanceof TelegramAuthError) {
      throw new Error(`Telegram session expired for account ${accountId}. Re-authorize via the MCP client.`);
    }
    throw err;
  }
}
