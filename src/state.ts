import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AccountRecord {
  id: string;
  phone: string;
  username?: string;
  telegram_id?: string;
  created_at: number;
}

export interface ApiCredentials {
  api_id: string;
  api_hash: string;
}

/**
 * Tool-surface gates persisted to disk. Mirror of the
 * `MCP_TELEGRAM_READONLY` / `MCP_TELEGRAM_TOOLS` / `MCP_TELEGRAM_DISABLE`
 * env vars. Env always takes precedence at runtime; these stored values
 * are the fallback when an env var is unset.
 */
export interface Settings {
  readonly?: boolean;
  tools?: string;
  disable?: string;
}

interface StateShape {
  version: 1;
  accounts: Record<string, AccountRecord>;
  credentials?: ApiCredentials;
  settings?: Settings;
}

const baseDir = process.env.MCP_TELEGRAM_HOME || join(homedir(), '.mcp-telegram');
const stateFile = join(baseDir, 'state.json');
export const sessionsDir = join(baseDir, 'sessions');

let cache: StateShape | null = null;

function ensureDirs(): void {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true });
  if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true });
}

function defaultState(): StateShape {
  return { version: 1, accounts: {} };
}

export function loadState(): StateShape {
  if (cache) return cache;
  ensureDirs();
  if (!existsSync(stateFile)) {
    cache = defaultState();
    saveState();
    return cache;
  }
  cache = JSON.parse(readFileSync(stateFile, 'utf-8')) as StateShape;
  return cache;
}

export function saveState(): void {
  if (!cache) return;
  ensureDirs();
  writeFileSync(stateFile, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function listAccounts(): AccountRecord[] {
  return Object.values(loadState().accounts);
}

export function getAccount(id: string): AccountRecord | undefined {
  return loadState().accounts[id];
}

export function upsertAccount(input: Omit<AccountRecord, 'created_at'> & { created_at?: number }): AccountRecord {
  const state = loadState();
  const existing = state.accounts[input.id];
  const record: AccountRecord = { ...input, created_at: existing?.created_at ?? Date.now() };
  state.accounts[input.id] = record;
  saveState();
  return record;
}

export function deleteAccount(id: string): void {
  const state = loadState();
  delete state.accounts[id];
  saveState();
}

export function getStoredCredentials(): ApiCredentials | undefined {
  return loadState().credentials;
}

export function setStoredCredentials(creds: ApiCredentials): void {
  const state = loadState();
  state.credentials = creds;
  saveState();
}

export function getStoredSettings(): Settings | undefined {
  return loadState().settings;
}

export function setStoredSettings(s: Settings): void {
  const state = loadState();
  state.settings = {
    readonly: s.readonly,
    tools: s.tools?.trim() || undefined,
    disable: s.disable?.trim() || undefined,
  };
  saveState();
}
