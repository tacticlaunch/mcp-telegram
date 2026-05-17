import { Api, TelegramClient } from 'telegram';
import { StoreSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

import { sessionsDir, AccountRecord, getAccount, upsertAccount, revokeTokensForAccount, deleteAccount } from './state.js';
import { logger } from './logger.js';

function apiCreds(): { apiId: number; apiHash: string } {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  if (!apiId || !apiHash) {
    throw new Error('TELEGRAM_API_ID and TELEGRAM_API_HASH must be set in the environment');
  }
  return { apiId: parseInt(apiId, 10), apiHash };
}

function sessionPathFor(accountId: string): string {
  const dir = join(sessionsDir, accountId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const clientCache = new Map<string, TelegramClient>();

export async function clientForAccount(accountId: string): Promise<TelegramClient> {
  const cached = clientCache.get(accountId);
  if (cached) return cached;

  const { apiId, apiHash } = apiCreds();
  const session = new StoreSession(sessionPathFor(accountId));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  if (!(await client.isUserAuthorized())) {
    clientCache.delete(accountId);
    throw new TelegramAuthError(accountId, 'Telegram session is not authorized');
  }
  clientCache.set(accountId, client);
  return client;
}

export class TelegramAuthError extends Error {
  constructor(public accountId: string, message: string) {
    super(message);
    this.name = 'TelegramAuthError';
  }
}

export async function logoutAccount(accountId: string): Promise<void> {
  try {
    const client = await clientForAccount(accountId);
    await client.invoke(new Api.auth.LogOut());
  } catch (err) {
    logger.warn(`Logout RPC failed for ${accountId}: ${(err as Error).message}`);
  }
  clientCache.delete(accountId);
  revokeTokensForAccount(accountId);
  deleteAccount(accountId);
}

/**
 * Login flow — state machine across HTTP requests.
 *
 * Each pending login is keyed by `auth_id` (opaque) and lives only in
 * memory. Once authorized, an `AccountRecord` is persisted and the
 * client is cached under that account id.
 */

interface PendingLogin {
  phone: string;
  client: TelegramClient;
  phoneCodeHash?: string;
  awaitingPassword?: boolean;
  passwordSrp?: Api.account.Password;
  finished?: boolean;
  accountId?: string;
}

const pending = new Map<string, PendingLogin>();

export async function loginStart(authId: string, phone: string): Promise<void> {
  const { apiId, apiHash } = apiCreds();
  // Temporary in-memory session — promoted to disk after auth.
  const session = new StoreSession(join(sessionsDir, `_pending_${authId}`));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
  await client.connect();

  const result = await client.sendCode({ apiId, apiHash }, phone);
  pending.set(authId, { phone, client, phoneCodeHash: result.phoneCodeHash });
}

export type LoginCodeResult =
  | { status: 'ok'; accountId: string }
  | { status: 'password_needed' };

export async function loginSubmitCode(authId: string, code: string): Promise<LoginCodeResult> {
  const entry = pending.get(authId);
  if (!entry || !entry.phoneCodeHash) throw new Error('Login session not found');

  try {
    await entry.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: entry.phone,
        phoneCodeHash: entry.phoneCodeHash,
        phoneCode: code,
      })
    );
    const accountId = await finalizeLogin(entry);
    pending.delete(authId);
    return { status: 'ok', accountId };
  } catch (err) {
    if ((err as any).errorMessage === 'SESSION_PASSWORD_NEEDED') {
      const passSrp = await entry.client.invoke(new Api.account.GetPassword());
      entry.awaitingPassword = true;
      entry.passwordSrp = passSrp;
      return { status: 'password_needed' };
    }
    throw err;
  }
}

export async function loginSubmitPassword(authId: string, password: string): Promise<{ accountId: string }> {
  const entry = pending.get(authId);
  if (!entry || !entry.passwordSrp) throw new Error('No password challenge for this session');

  const passSrpCheck = await computeCheck(entry.passwordSrp, password);
  await entry.client.invoke(new Api.auth.CheckPassword({ password: passSrpCheck }));
  const accountId = await finalizeLogin(entry);
  pending.delete(authId);
  return { accountId };
}

async function finalizeLogin(entry: PendingLogin): Promise<string> {
  const me = await entry.client.getMe();
  const telegramId = (me as any)?.id?.toString();
  const username = (me as any)?.username as string | undefined;
  const accountId = telegramId || `acct_${Date.now()}`;

  // Migrate session from `_pending_<authId>` to permanent dir
  const finalDir = sessionPathFor(accountId);
  const { apiId, apiHash } = apiCreds();
  const finalSession = new StoreSession(finalDir);
  // copy session string
  const sessionString = (entry.client.session as any).save?.() ?? (entry.client.session as StoreSession).save();
  await finalSession.load();
  (finalSession as any).setDC?.(
    (entry.client.session as any).dcId,
    (entry.client.session as any).serverAddress,
    (entry.client.session as any).port
  );
  (finalSession as any).setAuthKey?.((entry.client.session as any).authKey);
  await finalSession.save();
  void sessionString;

  // Replace cached client
  await entry.client.disconnect();
  const promoted = new TelegramClient(finalSession, apiId, apiHash, { connectionRetries: 5 });
  await promoted.connect();
  clientCache.set(accountId, promoted);

  upsertAccount({
    id: accountId,
    phone: entry.phone,
    username,
    telegram_id: telegramId,
  });

  return accountId;
}

export function getAccountSafe(id: string): AccountRecord | undefined {
  return getAccount(id);
}
