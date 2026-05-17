import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomBytes } from 'crypto';
import open from 'open';

import { renderAuthPage } from './auth-page.js';
import { listAccounts } from './state.js';
import {
  loginStart,
  loginSubmitCode,
  loginSubmitPassword,
} from './telegram.js';
import { AccountRecord } from './state.js';
import { logger } from './logger.js';

/**
 * Run a one-shot login flow in the browser.
 *
 * Spins up an ephemeral HTTP server on 127.0.0.1, opens the default
 * browser to the local auth page, drives the Telegram phone/code/2FA
 * flow against it, and resolves once the user finishes (or rejects on
 * timeout / explicit cancel).
 */
export function runBrowserLogin(opts: { timeoutMs?: number } = {}): Promise<AccountRecord> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const authId = randomBytes(16).toString('base64url');

  return new Promise<AccountRecord>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
      // Give the browser tab a moment to render the success state and
      // for any in-flight response to flush before we tear down.
      setTimeout(shutdown, 1500);
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
      settle(() => reject(new Error('Login timed out')));
    }, timeoutMs);

    function shutdown() {
      clearTimeout(timer);
      server.close();
    }

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        return settle(() => reject(new Error('Failed to obtain a local port')));
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const authUrl = `${baseUrl}/`;
      logger.info(`Opening browser for Telegram login: ${authUrl}`);
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
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderAuthPage(authId, accounts));
      }

      if (req.method !== 'POST') {
        return sendJson(res, 404, { error: 'not_found' });
      }

      const body = await readJsonBody(req);
      if (body.auth_id !== authId) {
        return sendJson(res, 400, { error: 'invalid_session' });
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
          settle(() => resolve(result.account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-password') {
        if (!body.password) return sendJson(res, 400, { error: 'password is required' });
        try {
          const { account } = await loginSubmitPassword(authId, String(body.password));
          settle(() => resolve(account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/use-account') {
        const id = String(body.account_id || '');
        const account = listAccounts().find((a) => a.id === id);
        if (!account) return sendJson(res, 404, { error: 'account not found' });
        settle(() => resolve(account));
        return sendJson(res, 200, { redirect: '/done' });
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
