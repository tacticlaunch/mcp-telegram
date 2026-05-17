import { Api } from 'telegram';
import { z } from 'zod';
import bigInt from 'big-integer';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeMessage,
  serializeEntity,
  ParseMode,
} from './_helpers.js';

export function register({ regWrite }: ToolContext): void {
  regWrite(
    'sendMessage',
    {
      title: 'Send a message',
      description:
        'Send a text message to a dialog. Supports reply, forum topic, silent, scheduled delivery, and parse mode.',
      inputSchema: {
        accountId: z.string().optional(),
        peer: z.string().describe('Dialog id or @username'),
        text: z.string().min(1),
        replyTo: z.number().int().optional().describe('Message id to reply to'),
        topMsgId: z.number().int().optional().describe('Forum topic root message id'),
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
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
      annotations: {"destructiveHint":true,"openWorldHint":true},
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
      return { content: [{ type: 'text', text: JSON.stringify((forwarded as any[]).map(serializeMessage), null, 2) }] };
    }
  );

  regWrite(
    'pinMessage',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
      if (!user) throw new Error('Telegram could not resolve a user for that phone number.');
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
          { type: 'text', text: JSON.stringify({ sent: serializeMessage(msg), user: serializeEntity(user) }, null, 2) },
        ],
      };
    }
  );
}
