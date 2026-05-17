import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

export interface ClientRecord {
  id: string;
  redirect_uris: string[];
  client_name?: string;
  created_at: number;
}

export interface AccountRecord {
  id: string;
  phone: string;
  username?: string;
  telegram_id?: string;
  created_at: number;
}

export interface TokenRecord {
  token: string;
  client_id: string;
  account_id: string;
  created_at: number;
}

interface StateShape {
  version: 1;
  port: number;
  clients: Record<string, ClientRecord>;
  accounts: Record<string, AccountRecord>;
  tokens: Record<string, TokenRecord>;
}

const baseDir = process.env.MCP_TELEGRAM_HOME || join(homedir(), '.mcp-telegram');
const stateFile = join(baseDir, 'state.json');
export const sessionsDir = join(baseDir, 'sessions');

function pickRandomPort(): number {
  // 49152-65535 is the IANA dynamic range
  return 49152 + Math.floor(Math.random() * (65535 - 49152));
}

function defaultState(): StateShape {
  return {
    version: 1,
    port: pickRandomPort(),
    clients: {},
    accounts: {},
    tokens: {},
  };
}

let cache: StateShape | null = null;

function ensureDirs(): void {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
}

export function loadState(): StateShape {
  if (cache) return cache;
  ensureDirs();
  if (!existsSync(stateFile)) {
    cache = defaultState();
    saveState();
    return cache;
  }
  const raw = readFileSync(stateFile, 'utf-8');
  cache = JSON.parse(raw) as StateShape;
  return cache;
}

export function saveState(): void {
  if (!cache) return;
  ensureDirs();
  writeFileSync(stateFile, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function getPort(): number {
  const override = process.env.PORT;
  if (override) return parseInt(override, 10);
  return loadState().port;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function getClient(id: string): ClientRecord | undefined {
  return loadState().clients[id];
}

export function registerClient(input: Omit<ClientRecord, 'id' | 'created_at'>): ClientRecord {
  const state = loadState();
  const record: ClientRecord = {
    id: newId('client'),
    redirect_uris: input.redirect_uris,
    client_name: input.client_name,
    created_at: Date.now(),
  };
  state.clients[record.id] = record;
  saveState();
  return record;
}

export function getAccount(id: string): AccountRecord | undefined {
  return loadState().accounts[id];
}

export function listAccounts(): AccountRecord[] {
  return Object.values(loadState().accounts);
}

export function upsertAccount(input: Omit<AccountRecord, 'created_at'> & { created_at?: number }): AccountRecord {
  const state = loadState();
  const existing = state.accounts[input.id];
  const record: AccountRecord = {
    ...input,
    created_at: existing?.created_at ?? Date.now(),
  };
  state.accounts[input.id] = record;
  saveState();
  return record;
}

export function deleteAccount(id: string): void {
  const state = loadState();
  delete state.accounts[id];
  for (const [t, rec] of Object.entries(state.tokens)) {
    if (rec.account_id === id) delete state.tokens[t];
  }
  saveState();
}

export function issueToken(client_id: string, account_id: string): TokenRecord {
  const state = loadState();
  const token = newOpaqueToken();
  const record: TokenRecord = { token, client_id, account_id, created_at: Date.now() };
  state.tokens[token] = record;
  saveState();
  return record;
}

export function getToken(token: string): TokenRecord | undefined {
  return loadState().tokens[token];
}

export function revokeToken(token: string): void {
  const state = loadState();
  delete state.tokens[token];
  saveState();
}

export function revokeTokensForAccount(account_id: string): void {
  const state = loadState();
  for (const [t, rec] of Object.entries(state.tokens)) {
    if (rec.account_id === account_id) delete state.tokens[t];
  }
  saveState();
}
