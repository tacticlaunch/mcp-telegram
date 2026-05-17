import express, { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';

import {
  getPort,
  registerClient,
  getClient,
  issueToken,
  getToken,
  listAccounts,
  getAccount,
  upsertAccount,
  revokeToken,
} from './state.js';
import {
  createAuthorizeSession,
  getAuthorizeSession,
  dropAuthorizeSession,
  issueAuthCode,
  consumeAuthCode,
  verifyPkce,
} from './oauth.js';
import { loginStart, loginSubmitCode, loginSubmitPassword } from './telegram.js';
import { renderAuthPage } from './auth-page.js';
import { buildMcpServer } from './mcp-server.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { logger } from './logger.js';

const COOKIE_NAME = 'mcp_auth_sid';

export async function start(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: false }));

  const port = getPort();
  const host = process.env.HOST || '127.0.0.1';
  const issuer = `http://${host}:${port}`;

  // -- discovery --------------------------------------------------------

  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json({
      resource: `${issuer}/mcp`,
      authorization_servers: [issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['telegram'],
    });
  });

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['telegram'],
    });
  });

  // -- dynamic client registration (RFC 7591) ---------------------------

  app.post('/register', (req, res) => {
    const body = req.body ?? {};
    const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (redirect_uris.length === 0) {
      return res.status(400).json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' });
    }
    const client = registerClient({
      redirect_uris,
      client_name: typeof body.client_name === 'string' ? body.client_name : undefined,
    });
    res.status(201).json({
      client_id: client.id,
      redirect_uris: client.redirect_uris,
      client_name: client.client_name,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    });
  });

  // -- authorize (browser) ----------------------------------------------

  app.get('/authorize', (req, res) => {
    const client_id = String(req.query.client_id || '');
    const redirect_uri = String(req.query.redirect_uri || '');
    const response_type = String(req.query.response_type || '');
    const code_challenge = String(req.query.code_challenge || '');
    const code_challenge_method = String(req.query.code_challenge_method || '');
    const state = req.query.state ? String(req.query.state) : undefined;

    const client = getClient(client_id);
    if (!client) return res.status(400).send('Unknown client_id');
    if (!client.redirect_uris.includes(redirect_uri)) return res.status(400).send('redirect_uri not registered');
    if (response_type !== 'code') return res.status(400).send('Only response_type=code is supported');
    if (!code_challenge) return res.status(400).send('code_challenge is required');
    if (code_challenge_method !== 'S256') return res.status(400).send('Only S256 PKCE is supported');

    const session = createAuthorizeSession({
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method: 'S256',
    });
    setCookie(res, COOKIE_NAME, session.id);

    const accounts = listAccounts().map((a) => ({ id: a.id, phone: a.phone, username: a.username }));
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(renderAuthPage(session.id, accounts));
  });

  // The auth page POSTs these to drive the Telegram MTProto flow.
  app.post('/authorize/login-start', async (req, res) => {
    const session = sessionFromBody(req);
    if (!session) return res.status(400).json({ error: 'invalid_session' });
    const phone = String(req.body.phone || '').trim();
    if (!phone) return res.status(400).json({ error: 'phone is required' });
    try {
      await loginStart(session.id, phone);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/authorize/login-code', async (req, res) => {
    const session = sessionFromBody(req);
    if (!session) return res.status(400).json({ error: 'invalid_session' });
    const code = String(req.body.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code is required' });
    try {
      const result = await loginSubmitCode(session.id, code);
      if (result.status === 'password_needed') return res.json({ status: 'password_needed' });
      const authCode = issueAuthCode(session, result.accountId);
      session.account_id = result.accountId;
      res.json({ redirect: buildRedirect(session.redirect_uri, authCode.code, session.state) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/authorize/login-password', async (req, res) => {
    const session = sessionFromBody(req);
    if (!session) return res.status(400).json({ error: 'invalid_session' });
    const password = String(req.body.password || '');
    if (!password) return res.status(400).json({ error: 'password is required' });
    try {
      const { accountId } = await loginSubmitPassword(session.id, password);
      const authCode = issueAuthCode(session, accountId);
      session.account_id = accountId;
      res.json({ redirect: buildRedirect(session.redirect_uri, authCode.code, session.state) });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post('/authorize/use-account', (req, res) => {
    const session = sessionFromBody(req);
    if (!session) return res.status(400).json({ error: 'invalid_session' });
    const account_id = String(req.body.account_id || '');
    const account = getAccount(account_id);
    if (!account) return res.status(404).json({ error: 'account not found' });
    const authCode = issueAuthCode(session, account_id);
    session.account_id = account_id;
    res.json({ redirect: buildRedirect(session.redirect_uri, authCode.code, session.state) });
  });

  // -- token ------------------------------------------------------------

  app.post('/token', (req, res) => {
    const grant_type = String(req.body.grant_type || '');
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    const code = String(req.body.code || '');
    const code_verifier = String(req.body.code_verifier || '');
    const client_id = String(req.body.client_id || '');
    const redirect_uri = String(req.body.redirect_uri || '');

    const record = consumeAuthCode(code);
    if (!record) return res.status(400).json({ error: 'invalid_grant' });
    if (record.client_id !== client_id) return res.status(400).json({ error: 'invalid_grant' });
    if (record.redirect_uri !== redirect_uri) return res.status(400).json({ error: 'invalid_grant' });
    if (!verifyPkce(code_verifier, record.code_challenge, 'S256')) {
      return res.status(400).json({ error: 'invalid_grant' });
    }
    const token = issueToken(record.client_id, record.account_id);
    res.json({
      access_token: token.token,
      token_type: 'Bearer',
      // No expires_in: lifetime is tied to the underlying Telegram session.
    });
  });

  // -- MCP endpoint -----------------------------------------------------

  app.all('/mcp', async (req, res) => {
    const auth = req.header('authorization');
    if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
      return unauthorized(res, issuer);
    }
    const tokenStr = auth.slice(7).trim();
    const tokenRec = getToken(tokenStr);
    if (!tokenRec) return unauthorized(res, issuer);

    await handleMcp(req, res, tokenRec.account_id);
  });

  // -- root index for sanity ------------------------------------------

  app.get('/', (_req, res) => {
    res.json({
      name: 'mcp-telegram',
      version: '1.0.0',
      mcp_endpoint: `${issuer}/mcp`,
      authorization_endpoint: `${issuer}/authorize`,
      protected_resource_metadata: `${issuer}/.well-known/oauth-protected-resource`,
    });
  });

  // -- error guard ------------------------------------------------------

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error('Unhandled error', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  app.listen(port, host, () => {
    logger.info(`mcp-telegram running at ${issuer}`);
    logger.info(`MCP endpoint:    ${issuer}/mcp`);
    logger.info(`Add to client:   ${issuer}/mcp  (it will auto-discover the auth server)`);
  });

  // helpers ----------------------------------------------------------------

  function sessionFromBody(req: Request) {
    const auth_id = String(req.body?.auth_id || '');
    const cookieId = readCookie(req, COOKIE_NAME);
    const id = auth_id || cookieId;
    if (!id) return undefined;
    return getAuthorizeSession(id);
  }
}

function setCookie(res: Response, name: string, value: string): void {
  res.setHeader('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900`);
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === name) return v;
  }
  return undefined;
}

function buildRedirect(redirect_uri: string, code: string, state?: string): string {
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

function unauthorized(res: Response, issuer: string): void {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer realm="mcp-telegram", resource_metadata="${issuer}/.well-known/oauth-protected-resource"`
  );
  res.status(401).json({ error: 'unauthorized' });
}

// -- MCP transport bridge --------------------------------------------------

/**
 * Each request is handled by a fresh `StreamableHTTPServerTransport` in
 * stateless mode. The `McpServer` for the account is reused so tool
 * registrations don't get rebuilt on every call.
 */

const mcpServers = new Map<string, ReturnType<typeof buildMcpServer>>();

async function handleMcp(req: Request, res: Response, accountId: string): Promise<void> {
  let server = mcpServers.get(accountId);
  if (!server) {
    server = buildMcpServer(accountId);
    mcpServers.set(accountId, server);
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — one transport per request
  });

  res.on('close', () => {
    transport.close().catch(() => undefined);
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

// quiet the linter — randomBytes is referenced for future use of nonces
void randomBytes;
// upsertAccount/revokeToken kept exported for admin tooling later
void upsertAccount;
void revokeToken;
