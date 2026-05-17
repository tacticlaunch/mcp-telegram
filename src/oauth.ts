import { createHash, randomBytes } from 'crypto';

import { newOpaqueToken } from './state.js';

/**
 * Authorization-code records (in-memory; short-lived).
 *
 * Each record links an authenticated browser session to the OAuth client
 * that initiated it, plus the PKCE challenge that the token exchange
 * must satisfy.
 */
export interface AuthCodeRecord {
  code: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  account_id: string;
  state?: string;
  created_at: number;
  expires_at: number;
}

const codes = new Map<string, AuthCodeRecord>();

/**
 * Browser-side login sessions (in-memory; cookie-scoped).
 *
 * Tracks where the user is in the Telegram flow so the same browser tab
 * can hand state between `/authorize`, code-submit and password-submit
 * fetch calls.
 */
export interface AuthorizeSession {
  id: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  created_at: number;
  account_id?: string;
}

const sessions = new Map<string, AuthorizeSession>();

export function createAuthorizeSession(input: Omit<AuthorizeSession, 'id' | 'created_at'>): AuthorizeSession {
  const id = randomBytes(16).toString('base64url');
  const record: AuthorizeSession = { id, created_at: Date.now(), ...input };
  sessions.set(id, record);
  return record;
}

export function getAuthorizeSession(id: string): AuthorizeSession | undefined {
  return sessions.get(id);
}

export function dropAuthorizeSession(id: string): void {
  sessions.delete(id);
}

export function issueAuthCode(session: AuthorizeSession, account_id: string): AuthCodeRecord {
  const code = newOpaqueToken();
  const record: AuthCodeRecord = {
    code,
    client_id: session.client_id,
    redirect_uri: session.redirect_uri,
    code_challenge: session.code_challenge,
    code_challenge_method: session.code_challenge_method,
    state: session.state,
    account_id,
    created_at: Date.now(),
    expires_at: Date.now() + 60_000,
  };
  codes.set(code, record);
  return record;
}

export function consumeAuthCode(code: string): AuthCodeRecord | undefined {
  const record = codes.get(code);
  if (!record) return undefined;
  codes.delete(code);
  if (record.expires_at < Date.now()) return undefined;
  return record;
}

export function verifyPkce(verifier: string, challenge: string, method: 'S256'): boolean {
  if (method !== 'S256') return false;
  const hash = createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}
