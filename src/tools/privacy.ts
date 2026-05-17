import { Api } from 'telegram';
import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { resolveAccountId, safeClient, parsePeer, safeStringify } from './_helpers.js';

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

export function register({ reg, regWrite }: ToolContext): void {
  regWrite(
    'block_user',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
      title: 'Block a user',
      description: 'Block a user from contacting you.',
      inputSchema: { accountId: z.string().optional(), user: z.string() },
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
    'unblock_user',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
    'list_blocked',
    {
      title: 'List blocked users',
      description: 'List users currently on the block list.',
      inputSchema: { accountId: z.string().optional(), limit: z.number().int().positive().max(200).optional() },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.contacts.GetBlocked({ offset: 0, limit: args.limit ?? 50 }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  reg(
    'get_privacy',
    {
      title: 'Get a privacy setting',
      description: 'Return current rules for one privacy key.',
      inputSchema: { accountId: z.string().optional(), key: PrivacyKey },
    },
    async (args: any) => {
      const accountId = resolveAccountId(args.accountId);
      const client = await safeClient(accountId);
      const result: any = await client.invoke(new Api.account.GetPrivacy({ key: buildPrivacyKey(args.key) }));
      return { content: [{ type: 'text', text: safeStringify(result) }] };
    }
  );

  regWrite(
    'set_privacy',
    {
      annotations: {"idempotentHint":true,"openWorldHint":true},
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
}
