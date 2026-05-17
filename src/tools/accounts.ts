import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { listAccounts } from '../state.js';
import { logoutAccount } from '../telegram.js';
import { runBrowserLogin } from '../auth-browser.js';
import { resolveAccountId, safeClient, serializeEntity } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'listAccounts',
    {
      title: 'List Telegram accounts',
      description: 'Return the Telegram accounts currently signed in on this machine.',
      inputSchema: {},
    },
    async () => {
      const accounts = listAccounts().map((a) => ({ id: a.id, phone: a.phone, username: a.username }));
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
}
