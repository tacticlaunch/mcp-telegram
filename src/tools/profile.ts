import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, resolveFileArg, safeStringify } from './_helpers.js';

export function register({ regWrite }: ToolContext): void {
  regWrite(
    'update_profile',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
    'update_my_username',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Update own @username',
      description: 'Set or clear (empty string) own public username.',
      inputSchema: { accountId: z.string().optional(), username: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      await client.invoke(new Api.account.UpdateUsername({ username: args.username.replace(/^@/, '') }));
      return { content: [{ type: 'text', text: 'ok' }] };
    }
  );

  regWrite(
    'set_birthday',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
    'set_profile_photo',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Set own profile photo',
      description: 'Upload a new profile photo from a local path or URL.',
      inputSchema: { accountId: z.string().optional(), path: z.string() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const resolvedPath = await resolveFileArg(args.path);
      const uploaded = await client.uploadFile({ file: resolvedPath as any, workers: 1 } as any);
      const result: any = await client.invoke(new Api.photos.UploadProfilePhoto({ file: uploaded as any }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );
}
