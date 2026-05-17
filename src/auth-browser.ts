import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import open from 'open';

import { renderAuthPage } from './auth-page.js';
import { TOOL_CATALOG } from './tool-catalog.js';
import {
  listAccounts,
  setStoredCredentials,
  getStoredSettings,
  setStoredSettings,
} from './state.js';
import {
  loginStart,
  loginSubmitCode,
  loginSubmitPassword,
  credentialsStatus,
  clientForAccount,
  TelegramAuthError,
} from './telegram.js';
import { AccountRecord } from './state.js';
import { logger } from './logger.js';

function loadPkgMeta(): { name: string; version: string; repoUrl?: string } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8'));
    let repoUrl: string | undefined = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repoUrl) {
      repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
    }
    return { name: pkg.name, version: pkg.version, repoUrl };
  } catch {
    return { name: 'mcp-telegram', version: '0.0.0' };
  }
}

const pkgMeta = loadPkgMeta();

interface SettingsField {
  source: 'env' | 'stored' | 'default';
  value: string;
}
interface SettingsSnapshot {
  readonly: SettingsField & { value: 'true' | 'false' };
  tools: SettingsField;
  disable: SettingsField;
}

/**
 * Build a snapshot of the gating settings that the page can render.
 *
 * For each field: env wins; otherwise fall back to state.json; otherwise
 * report "default". `source` lets the UI lock the field when env is the
 * authority (so users know where to change it).
 */
function settingsSnapshot(): SettingsSnapshot {
  const stored = getStoredSettings();
  const pick = (envName: string, storedVal: string | undefined): SettingsField => {
    const env = process.env[envName];
    if (env !== undefined && env !== '') return { source: 'env', value: env };
    if (storedVal) return { source: 'stored', value: storedVal };
    return { source: 'default', value: '' };
  };
  const readonlyEnv = process.env.MCP_TELEGRAM_READONLY;
  const readonly: SettingsSnapshot['readonly'] = (() => {
    if (readonlyEnv !== undefined && readonlyEnv !== '') {
      const truthy = ['1', 'true', 'yes'].includes(readonlyEnv.toLowerCase());
      return { source: 'env', value: truthy ? 'true' : 'false' };
    }
    if (stored?.readonly !== undefined) return { source: 'stored', value: stored.readonly ? 'true' : 'false' };
    return { source: 'default', value: 'false' };
  })();
  return {
    readonly,
    tools: pick('MCP_TELEGRAM_TOOLS', stored?.tools),
    disable: pick('MCP_TELEGRAM_DISABLE', stored?.disable),
  };
}

/**
 * Run a one-shot login flow in the browser.
 *
 * Spins up an ephemeral HTTP server on 127.0.0.1, opens the default
 * browser to the local auth page, drives the Telegram phone/code/2FA
 * flow against it, and resolves once the user finishes (or rejects on
 * timeout / explicit cancel).
 */
type PageMode = 'login' | 'settings';

export function runBrowserLogin(opts: { timeoutMs?: number } = {}): Promise<AccountRecord> {
  return runBrowserPage('login', opts) as Promise<AccountRecord>;
}

export function runBrowserSettings(opts: { timeoutMs?: number } = {}): Promise<void> {
  return runBrowserPage('settings', opts) as Promise<void>;
}

function runBrowserPage(mode: PageMode, opts: { timeoutMs?: number }): Promise<AccountRecord | void> {
  // The HTTP server lives this long total — long enough that the user
  // can inspect/edit settings after a successful auth before the tab
  // becomes dead.
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const authId = randomBytes(16).toString('base64url');

  return new Promise<AccountRecord | void>((resolve, reject) => {
    let serverClosed = false;
    let promiseSettled = false;

    /**
     * Resolve/reject the runBrowserLogin promise.
     *
     * Decoupled from shutdown — once the user finishes auth, the agent
     * can proceed immediately, but the HTTP server keeps running so the
     * user can interact with the settings UI on the same tab.
     */
    const settlePromise = (fn: () => void) => {
      if (promiseSettled) return;
      promiseSettled = true;
      fn();
    };

    const shutdown = () => {
      if (serverClosed) return;
      serverClosed = true;
      clearTimeout(timer);
      server.close();
    };

    const server = createServer(async (req, res) => {
      try {
        await route(req, res);
      } catch (err) {
        logger.error('auth-browser handler crashed', err);
        sendJson(res, 500, { error: (err as Error).message });
      }
    });

    const timer = setTimeout(() => {
      if (mode === 'settings') {
        // In settings mode, hitting the timeout just means the user
        // walked away — that's not a failure.
        settlePromise(() => resolve(undefined));
      } else {
        settlePromise(() => reject(new Error('Login timed out')));
      }
      shutdown();
    }, timeoutMs);

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        return settlePromise(() => reject(new Error('Failed to obtain a local port')));
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const authUrl = `${baseUrl}/`;
      logger.info(
        mode === 'settings'
          ? `Opening settings page: ${authUrl}`
          : `Opening browser for Telegram login: ${authUrl}`
      );
      try {
        await open(authUrl);
      } catch (err) {
        logger.warn(`Failed to auto-open the browser. Open this URL manually: ${authUrl}`);
      }
    });

    async function route(req: IncomingMessage, res: ServerResponse) {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/authorize')) {
        const accounts = listAccounts().map((a) => ({ id: a.id, phone: a.phone, username: a.username }));
        const creds = credentialsStatus();
        const env = {
          TELEGRAM_API_ID: process.env.TELEGRAM_API_ID,
          TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH,
          MCP_TELEGRAM_HOME: process.env.MCP_TELEGRAM_HOME,
          LOG_LEVEL: process.env.LOG_LEVEL,
        };
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(
          renderAuthPage(authId, accounts, creds, env, pkgMeta, settingsSnapshot(), TOOL_CATALOG, mode)
        );
      }

      if (req.method === 'GET' && url.pathname === '/logo.png') {
        try {
          const here = dirname(fileURLToPath(import.meta.url));
          const logo = readFileSync(join(here, '..', 'assets', 'logo.png'));
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
          return res.end(logo);
        } catch {
          return sendJson(res, 404, { error: 'logo not found' });
        }
      }

      if (req.method !== 'POST') {
        return sendJson(res, 404, { error: 'not_found' });
      }

      const body = await readJsonBody(req);
      if (body.auth_id !== authId) {
        return sendJson(res, 400, { error: 'invalid_session' });
      }

      if (url.pathname === '/authorize/save-credentials') {
        const status = credentialsStatus();
        if (status.source === 'env') {
          return sendJson(res, 400, {
            error: 'TELEGRAM_API_ID/TELEGRAM_API_HASH are set in the environment and take precedence. Unset them to edit here.',
          });
        }
        const api_id = String(body.api_id || '').trim();
        const api_hash = String(body.api_hash || '').trim();
        if (!/^\d+$/.test(api_id)) return sendJson(res, 400, { error: 'api_id must be numeric' });
        if (api_hash.length < 16) return sendJson(res, 400, { error: 'api_hash looks too short' });
        setStoredCredentials({ api_id, api_hash });
        return sendJson(res, 200, { ok: true });
      }

      if (url.pathname === '/authorize/login-start') {
        if (!body.phone) return sendJson(res, 400, { error: 'phone is required' });
        try {
          await loginStart(authId, String(body.phone));
          return sendJson(res, 200, { ok: true });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-code') {
        if (!body.code) return sendJson(res, 400, { error: 'code is required' });
        try {
          const result = await loginSubmitCode(authId, String(body.code));
          if (result.status === 'password_needed') {
            return sendJson(res, 200, { status: 'password_needed' });
          }
          settlePromise(() => resolve(result.account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-password') {
        if (!body.password) return sendJson(res, 400, { error: 'password is required' });
        try {
          const { account } = await loginSubmitPassword(authId, String(body.password));
          settlePromise(() => resolve(account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/use-account') {
        const id = String(body.account_id || '');
        const account = listAccounts().find((a) => a.id === id);
        if (!account) return sendJson(res, 404, { error: 'account not found' });
        try {
          const client = await clientForAccount(id);
          await client.getMe();
        } catch (err) {
          if (err instanceof TelegramAuthError) {
            return sendJson(res, 401, {
              error: 'session_expired',
              phone: account.phone,
              username: account.username,
            });
          }
          return sendJson(res, 500, { error: (err as Error).message });
        }
        settlePromise(() => resolve(account));
        return sendJson(res, 200, { redirect: '/done' });
      }

      if (url.pathname === '/authorize/save-settings') {
        const current = settingsSnapshot();
        const next: { readonly?: boolean; tools?: string; disable?: string } = {};

        // For each field: accept the page's value only when env doesn't
        // own it; otherwise keep whatever was already stored.
        if (current.readonly.source === 'env') {
          // Leave whatever was stored before — env wins anyway.
          next.readonly = getStoredSettings()?.readonly;
        } else if (typeof body.readonly === 'boolean') {
          next.readonly = body.readonly;
        }
        if (current.tools.source === 'env') {
          next.tools = getStoredSettings()?.tools;
        } else if (typeof body.tools === 'string') {
          next.tools = body.tools;
        }
        if (current.disable.source === 'env') {
          next.disable = getStoredSettings()?.disable;
        } else if (typeof body.disable === 'string') {
          next.disable = body.disable;
        }
        setStoredSettings(next);
        return sendJson(res, 200, { ok: true, snapshot: settingsSnapshot() });
      }

      if (url.pathname === '/authorize/close') {
        sendJson(res, 200, { ok: true });
        // In settings-only mode the promise is still pending — resolve it
        // here so the calling tool returns cleanly.
        if (mode === 'settings') settlePromise(() => resolve(undefined));
        // Give the response a moment to flush before we tear down.
        setTimeout(shutdown, 200);
        return;
      }

      return sendJson(res, 404, { error: 'not_found' });
    }
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return {};
  }
}
