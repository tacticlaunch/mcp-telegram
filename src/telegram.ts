import { Api, TelegramClient } from 'telegram';
import { StoreSession } from 'telegram/sessions/index.js';
import { computeCheck } from 'telegram/Password.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

import {
  sessionsDir,
  AccountRecord,
  getAccount,
  upsertAccount,
  deleteAccount,
  getStoredCredentials,
} from './state.js';
import { logger } from './logger.js';

export type CredentialsSource = 'env' | 'stored' | 'missing';

export function credentialsStatus(): { source: CredentialsSource; api_id_masked?: string } {
  const envId = process.env.TELEGRAM_API_ID;
  const envHash = process.env.TELEGRAM_API_HASH;
  if (envId && envHash) return { source: 'env', api_id_masked: mask(envId) };
  const stored = getStoredCredentials();
  if (stored) return { source: 'stored', api_id_masked: mask(stored.api_id) };
  return { source: 'missing' };
}

function mask(s: string): string {
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${s.slice(0, 2)}${'*'.repeat(Math.max(s.length - 4, 1))}${s.slice(-2)}`;
}

function apiCreds(): { apiId: number; apiHash: string } {
  const envId = process.env.TELEGRAM_API_ID;
  const envHash = process.env.TELEGRAM_API_HASH;
  if (envId && envHash) return { apiId: parseInt(envId, 10), apiHash: envHash };
  const stored = getStoredCredentials();
  if (stored) return { apiId: parseInt(stored.api_id, 10), apiHash: stored.api_hash };
  throw new Error(
    'Telegram API credentials are not configured. Set TELEGRAM_API_ID + TELEGRAM_API_HASH in the env, or enter them during sign-in.'
  );
}

function sessionPathFor(accountId: string): string {
  const dir = join(sessionsDir, accountId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const clientCache = new Map<string, TelegramClient>();

export class TelegramAuthError extends Error {
  constructor(public accountId: string, message: string) {
    super(message);
    this.name = 'TelegramAuthError';
  }
}

export async function clientForAccount(accountId: string): Promise<TelegramClient> {
  const cached = clientCache.get(accountId);
  if (cached) return cached;

  const { apiId, apiHash } = apiCreds();
  const session = new StoreSession(sessionPathFor(accountId));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  if (!(await client.isUserAuthorized())) {
    clientCache.delete(accountId);
    throw new TelegramAuthError(accountId, `Telegram session expired for account ${accountId}`);
  }
  clientCache.set(accountId, client);
  return client;
}

export async function logoutAccount(accountId: string): Promise<void> {
  try {
    const client = await clientForAccount(accountId);
    await client.invoke(new Api.auth.LogOut());
  } catch (err) {
    logger.warn(`Logout RPC failed for ${accountId}: ${(err as Error).message}`);
  }
  clientCache.delete(accountId);
  deleteAccount(accountId);
}

/**
 * In-memory login state machine — one entry per browser tab driving the
 * auth flow.
 */
interface PendingLogin {
  phone: string;
  client: TelegramClient;
  phoneCodeHash?: string;
  passwordSrp?: Api.account.Password;
}

const pending = new Map<string, PendingLogin>();

export async function loginStart(authId: string, phone: string): Promise<void> {
  const { apiId, apiHash } = apiCreds();
  const session = new StoreSession(join(sessionsDir, `_pending_${authId}`));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
  await client.connect();
  const result = await client.sendCode({ apiId, apiHash }, phone);
  pending.set(authId, { phone, client, phoneCodeHash: result.phoneCodeHash });
}

export type LoginCodeResult =
  | { status: 'ok'; account: AccountRecord }
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
    const account = await finalizeLogin(authId, entry);
    pending.delete(authId);
    return { status: 'ok', account };
  } catch (err) {
    if ((err as any).errorMessage === 'SESSION_PASSWORD_NEEDED') {
      entry.passwordSrp = await entry.client.invoke(new Api.account.GetPassword());
      return { status: 'password_needed' };
    }
    throw err;
  }
}

export async function loginSubmitPassword(authId: string, password: string): Promise<{ account: AccountRecord }> {
  const entry = pending.get(authId);
  if (!entry || !entry.passwordSrp) throw new Error('No password challenge for this session');
  const passSrpCheck = await computeCheck(entry.passwordSrp, password);
  await entry.client.invoke(new Api.auth.CheckPassword({ password: passSrpCheck }));
  const account = await finalizeLogin(authId, entry);
  pending.delete(authId);
  return { account };
}

async function finalizeLogin(authId: string, entry: PendingLogin): Promise<AccountRecord> {
  const me = await entry.client.getMe();
  const telegramId = (me as any)?.id?.toString();
  const username = (me as any)?.username as string | undefined;
  const accountId = telegramId || `acct_${Date.now()}`;

  // Promote the pending session to its permanent location.
  const finalDir = sessionPathFor(accountId);
  const { apiId, apiHash } = apiCreds();
  const finalSession = new StoreSession(finalDir);
  await finalSession.load();
  const src = entry.client.session as any;
  (finalSession as any).setDC?.(src.dcId, src.serverAddress, src.port);
  (finalSession as any).setAuthKey?.(src.authKey);
  await finalSession.save();

  await entry.client.disconnect();

  const promoted = new TelegramClient(finalSession, apiId, apiHash, { connectionRetries: 5 });
  await promoted.connect();
  clientCache.set(accountId, promoted);

  void authId; // pending dir is left on disk; harmless, can be GC'd later
  return upsertAccount({ id: accountId, phone: entry.phone, username, telegram_id: telegramId });
}

export function getAccountSafe(id: string): AccountRecord | undefined {
  return getAccount(id);
}
