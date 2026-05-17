/**
 * Inline HTML for the local Telegram authorization page.
 *
 * Served by the ephemeral HTTP server bound to 127.0.0.1. Everything
 * happens against this loopback origin — no third-party requests.
 */
export interface CredentialsHint {
  source: 'env' | 'stored' | 'missing';
  api_id_masked?: string;
}

export function renderAuthPage(
  authSessionId: string,
  accounts: { id: string; phone: string; username?: string }[],
  creds: CredentialsHint
): string {
  const accountsJson = JSON.stringify(accounts);
  const credsJson = JSON.stringify(creds);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mcp-telegram · Sign in to Telegram</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #0e1014;
    --card: #161a21;
    --fg: #e6e6e6;
    --muted: #8a8f99;
    --accent: #2aabee;
    --accent-soft: rgba(42,171,238,0.12);
    --danger: #ff5c5c;
    --input: #1d222b;
    --border: #2a2f38;
    --good: #38c172;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f5f6f8; --card: #ffffff; --fg: #1a1a1a; --muted: #6a6f7a; --input: #f0f1f4; --border: #d8dbe2; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
  .card { width: 100%; max-width: 420px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
  header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  header .logo { width: 28px; height: 28px; border-radius: 8px; background: var(--accent); display: grid; place-items: center; color: white; font-weight: 700; }
  header h2 { margin: 0; font-size: 14px; color: var(--muted); font-weight: 500; letter-spacing: 0.02em; }
  .privacy { display: flex; align-items: center; gap: 8px; padding: 8px 12px; margin-bottom: 18px; background: var(--accent-soft); color: var(--accent); border-radius: 8px; font-size: 12.5px; }
  .privacy svg { flex-shrink: 0; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  p.lede { margin: 0 0 18px; color: var(--muted); }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input { width: 100%; padding: 11px 12px; background: var(--input); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; font-size: 15px; outline: none; }
  input:focus { border-color: var(--accent); }
  button { width: 100%; padding: 11px 12px; margin-top: 14px; border: 0; border-radius: 10px; background: var(--accent); color: white; font-size: 15px; font-weight: 600; cursor: pointer; }
  button[disabled] { opacity: 0.6; cursor: not-allowed; }
  .row { display: flex; gap: 10px; }
  .err { margin-top: 12px; padding: 10px 12px; background: rgba(255,92,92,0.1); color: var(--danger); border-radius: 10px; font-size: 13px; display: none; }
  .err.show { display: block; }
  .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px; background: var(--input); color: var(--muted); border: 1px solid var(--border); border-radius: 999px; font-size: 12px; margin-bottom: 12px; }
  .badge.good { color: var(--good); border-color: rgba(56,193,114,0.4); }
  .accounts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
  .account { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--input); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: border-color .12s; }
  .account:hover { border-color: var(--accent); }
  .account .who { display: flex; flex-direction: column; }
  .account .who b { font-size: 14px; }
  .account .who span { font-size: 12px; color: var(--muted); }
  .footer { font-size: 11.5px; color: var(--muted); margin-top: 18px; text-align: center; line-height: 1.5; }
  .footer code { background: var(--input); padding: 1px 5px; border-radius: 4px; font-size: 11px; }
  .step { display: none; }
  .step.active { display: block; }
  .success { text-align: center; padding: 20px 0; }
  .success .check { width: 56px; height: 56px; border-radius: 50%; background: var(--accent); color: white; display: grid; place-items: center; margin: 0 auto 14px; font-size: 28px; }
  .help-link { color: var(--accent); text-decoration: none; }
  .help-link:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="card">
  <header>
    <div class="logo">mt</div>
    <h2>mcp-telegram &middot; local sign-in</h2>
  </header>
  <div class="privacy">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span>Running locally on this machine. Nothing leaves your computer except calls to Telegram.</span>
  </div>

  <div id="step-creds" class="step">
    <h1>API credentials</h1>
    <p class="lede">Get an <code>api_id</code> and <code>api_hash</code> from <a class="help-link" href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org/apps</a>. They will be saved to <code>~/.mcp-telegram/state.json</code>.</p>
    <label for="api_id">api_id</label>
    <input id="api_id" inputmode="numeric" placeholder="123456" />
    <label for="api_hash" style="margin-top:12px">api_hash</label>
    <input id="api_hash" placeholder="0123456789abcdef…" />
    <button id="save-creds">Save and continue</button>
    <div class="err" id="err-creds"></div>
  </div>

  <div id="step-pick" class="step">
    <div id="creds-badge"></div>
    <h1>Sign in to Telegram</h1>
    <p class="lede">Pick an existing account or add a new one.</p>
    <div class="accounts" id="accounts"></div>
    <button id="add-new">Add new account</button>
  </div>

  <div id="step-phone" class="step">
    <div id="creds-badge-2"></div>
    <h1>Add Telegram account</h1>
    <p class="lede">Enter your phone number with country code.</p>
    <label for="phone">Phone</label>
    <input id="phone" type="tel" autocomplete="tel" placeholder="+12025550123" />
    <button id="send-code">Send code</button>
    <div class="err" id="err-phone"></div>
  </div>

  <div id="step-code" class="step">
    <h1>Enter login code</h1>
    <p class="lede">We sent a code to <span id="phone-echo"></span>.</p>
    <label for="code">Code</label>
    <input id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="12345" />
    <button id="submit-code">Continue</button>
    <div class="err" id="err-code"></div>
  </div>

  <div id="step-password" class="step">
    <h1>Two-factor password</h1>
    <p class="lede">Enter your Telegram cloud password.</p>
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" />
    <button id="submit-password">Continue</button>
    <div class="err" id="err-password"></div>
  </div>

  <div id="step-done" class="step">
    <div class="success">
      <div class="check">&check;</div>
      <h1>Authorized</h1>
      <p class="lede">You can close this tab and return to your agent.</p>
    </div>
  </div>

  <p class="footer">
    This page is part of <b>mcp-telegram</b>, an MCP server that lets your AI agent read Telegram.<br/>
    Your agent opened this tab. Everything you type is sent only to <code>127.0.0.1</code> on your machine and forwarded to Telegram's official MTProto API.
  </p>
</div>

<script>
  const AUTH_ID = ${JSON.stringify(authSessionId)};
  const accounts = ${accountsJson};
  let creds = ${credsJson};

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
  };
  const showErr = (id, msg) => { const el = $(id); el.textContent = msg; el.classList.add('show'); };
  const clearErr = (id) => { $(id).classList.remove('show'); };

  function renderCredsBadge(targetIds) {
    const text = creds.source === 'env'
      ? 'API credentials loaded from environment'
      : creds.source === 'stored'
        ? 'API credentials saved locally (api_id ' + (creds.api_id_masked || '••••') + ')'
        : '';
    for (const id of targetIds) {
      const el = $(id);
      if (!el) continue;
      el.innerHTML = text ? '<span class="badge good">&check; ' + text + '</span>' : '';
    }
  }

  function renderAccounts() {
    const wrap = $('accounts');
    wrap.innerHTML = '';
    for (const a of accounts) {
      const div = document.createElement('div');
      div.className = 'account';
      div.innerHTML = '<div class="who"><b>' + (a.username ? '@' + a.username : a.phone) + '</b><span>' + a.phone + '</span></div><span style="color:var(--muted)">&rsaquo;</span>';
      div.onclick = () => pickExisting(a.id);
      wrap.appendChild(div);
    }
  }

  function startFlow() {
    renderCredsBadge(['creds-badge', 'creds-badge-2']);
    if (creds.source === 'missing') return show('step-creds');
    if (accounts.length === 0) return show('step-phone');
    show('step-pick');
  }

  async function pickExisting(accountId) {
    const r = await fetch('/authorize/use-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, account_id: accountId }) });
    if (!r.ok) { alert('Failed to use account'); return; }
    finish();
  }

  $('save-creds').onclick = async () => {
    clearErr('err-creds');
    const api_id = $('api_id').value.trim();
    const api_hash = $('api_hash').value.trim();
    if (!api_id || !api_hash) return showErr('err-creds', 'Both fields are required');
    $('save-creds').disabled = true;
    try {
      const r = await fetch('/authorize/save-credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, api_id, api_hash }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return showErr('err-creds', body.error || 'Failed to save');
      creds = { source: 'stored', api_id_masked: api_id.length > 4 ? api_id.slice(0,2) + '*'.repeat(api_id.length-4) + api_id.slice(-2) : '****' };
      renderCredsBadge(['creds-badge', 'creds-badge-2']);
      if (accounts.length === 0) show('step-phone');
      else show('step-pick');
    } finally {
      $('save-creds').disabled = false;
    }
  };

  $('add-new').onclick = () => show('step-phone');

  $('send-code').onclick = async () => {
    clearErr('err-phone');
    const phone = $('phone').value.trim();
    if (!phone) return showErr('err-phone', 'Phone is required');
    $('send-code').disabled = true;
    try {
      const r = await fetch('/authorize/login-start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, phone }) });
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: 'Failed to send code' }));
        return showErr('err-phone', error || 'Failed to send code');
      }
      $('phone-echo').textContent = phone;
      show('step-code');
    } finally {
      $('send-code').disabled = false;
    }
  };

  $('submit-code').onclick = async () => {
    clearErr('err-code');
    const code = $('code').value.trim();
    if (!code) return showErr('err-code', 'Code is required');
    $('submit-code').disabled = true;
    try {
      const r = await fetch('/authorize/login-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, code }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-code', body.error || 'Failed');
      if (body.status === 'password_needed') return show('step-password');
      finish();
    } finally {
      $('submit-code').disabled = false;
    }
  };

  $('submit-password').onclick = async () => {
    clearErr('err-password');
    const password = $('password').value;
    if (!password) return showErr('err-password', 'Password is required');
    $('submit-password').disabled = true;
    try {
      const r = await fetch('/authorize/login-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, password }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-password', body.error || 'Failed');
      finish();
    } finally {
      $('submit-password').disabled = false;
    }
  };

  function finish() {
    show('step-done');
  }

  startFlow();
</script>
</body>
</html>`;
}
