import { Api } from 'telegram';
import { z } from 'zod';
import { join } from 'path';

import type { ToolContext } from './_registry.js';
import {
  resolveAccountId,
  safeClient,
  parsePeer,
  serializeMessage,
  resolveFileArg,
  ensureDownloadsDir,
  downloadsDir,
  safeStringify,
} from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
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
        ? await Promise.all(args.path.map((p: string) => resolveFileArg(p)))
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
      description: `Download the media attached to a message. Files land in ${downloadsDir} (override with MCP_TELEGRAM_DOWNLOADS env). Returns the absolute path.`,
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
      inputSchema: { accountId: z.string().optional(), peer: z.string() },
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

  void safeStringify;
}
