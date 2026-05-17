import { z } from 'zod';

import type { ToolContext } from './_registry.js';
import { listAccounts } from '../state.js';
import { logoutAccount } from '../telegram.js';
import { runBrowserLogin, runBrowserSettings } from '../auth-browser.js';
import { resolveAccountId, safeClient, serializeEntity } from './_helpers.js';

export function register({ reg, regWrite }: ToolContext): void {
  reg(
    'list_accounts',
    {
      // No openWorldHint — purely reads local state.
      annotations: { readOnlyHint: true },
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
      // Adds a session — neither read-only nor destructive, but touches external services.
      annotations: { openWorldHint: true },
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
      annotations: { destructiveHint: true, openWorldHint: true },
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
    'get_me',
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

  reg(
    'open_settings',
    {
      // Spawns a local browser tab — touches external state (file system,
      // browser process) but is otherwise read-only from Telegram's view.
      annotations: { openWorldHint: true },
      title: 'Open the mcp-telegram settings page',
      description:
        'Open a local browser tab where the user can toggle read-only mode and edit ' +
        'the tool allowlist / blocklist. Resolves when the user closes the tab. ' +
        'Changes are persisted to ~/.telegram-agent/state.json; the MCP client must ' +
        'be restarted to pick them up. Env vars (MCP_TELEGRAM_READONLY / TOOLS / DISABLE) ' +
        'override stored values and are shown as locked in the UI.',
      inputSchema: {},
    },
    async () => {
      await runBrowserSettings();
      return {
        content: [
          {
            type: 'text',
            text: 'Settings page closed. Restart your MCP client to apply any changes.',
          },
        ],
      };
    }
  );
}
