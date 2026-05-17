export interface CredentialsHint {
  source: 'env' | 'stored' | 'missing';
  api_id_masked?: string;
}

export interface EnvSnapshot {
  TELEGRAM_API_ID?: string;
  TELEGRAM_API_HASH?: string;
  MCP_TELEGRAM_HOME?: string;
  LOG_LEVEL?: string;
}

export interface PackageMeta {
  name: string;
  version: string;
  repoUrl?: string;
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}
function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function renderAuthPage(
  authSessionId: string,
  accounts: { id: string; phone: string; username?: string }[],
  creds: CredentialsHint,
  env: EnvSnapshot,
  pkg: PackageMeta
): string {
  const brandLink = pkg.repoUrl
    ? `<a href="${escapeAttr(pkg.repoUrl)}" target="_blank" rel="noopener">${escapeText(pkg.name)}</a>`
    : escapeText(pkg.name);
  const accountsJson = JSON.stringify(accounts);
  const credsJson = JSON.stringify(creds);
  const envJson = JSON.stringify(env);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mcp-telegram</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #0e1014;
    --card: #161a21;
    --fg: #e6e6e6;
    --muted: #8a8f99;
    --accent: #2aabee;
    --danger: #ff5c5c;
    --input: #1d222b;
    --border: #2a2f38;
  }
  @media (prefers-color-scheme: light) {
    :root { --bg: #f5f6f8; --card: #ffffff; --fg: #1a1a1a; --muted: #6a6f7a; --input: #f5f6f8; --border: #e3e5ea; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px;
    display: grid; place-items: center;
    background: var(--bg); color: var(--fg);
    font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .wrap { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .header { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .logo { width: 56px; height: 56px; object-fit: contain; }
  .brand-line { font-size: 12px; color: var(--muted); letter-spacing: 0.02em; margin: 0; }
  .brand-line b { color: var(--fg); font-weight: 600; }
  .brand-line a { color: var(--fg); }
  .safety { font-size: 11px; color: var(--muted); opacity: 0.65; margin: 0; text-align: center; max-width: 320px; line-height: 1.5; }
  .card {
    width: 100%;
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    display: flex; flex-direction: column;
  }
  .body { padding: 18px; }
  .step { display: none; flex-direction: column; gap: 12px; }
  .step.active { display: flex; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  p.lede { margin: -6px 0 2px; color: var(--muted); font-size: 13px; }
  input {
    width: 100%; padding: 10px 12px;
    background: var(--input); color: var(--fg);
    border: 1px solid var(--border); border-radius: 8px;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: var(--accent); }
  button {
    width: 100%; padding: 10px 12px;
    border: 0; border-radius: 8px;
    background: var(--accent); color: white;
    font-size: 14px; font-weight: 600; cursor: pointer;
  }
  button[disabled] { opacity: 0.5; cursor: not-allowed; }
  button.ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); }
  button.ghost:hover { border-color: var(--accent); color: var(--accent); }
  .err {
    padding: 8px 10px;
    background: rgba(255,92,92,0.1); color: var(--danger);
    border-radius: 8px; font-size: 12.5px;
    display: none;
  }
  .err.show { display: block; }
  .accounts { display: flex; flex-direction: column; gap: 6px; }
  .account {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 12px;
    background: var(--input); border: 1px solid var(--border); border-radius: 8px;
    cursor: pointer;
  }
  .account:hover { border-color: var(--accent); }
  .account .who { display: flex; flex-direction: column; gap: 2px; }
  .account .who b { font-size: 13px; font-weight: 500; }
  .account .who span { font-size: 12px; color: var(--muted); }
  .account .chev { color: var(--muted); font-size: 16px; line-height: 1; }
  .success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 0 4px; }
  .success .check {
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--accent); color: white;
    display: grid; place-items: center; font-size: 22px;
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .foot {
    padding: 10px 18px;
    border-top: 1px solid var(--border);
    font-size: 12px;
  }
  details summary {
    color: var(--muted); cursor: pointer; user-select: none;
    list-style: none; display: flex; align-items: center; gap: 6px;
  }
  details summary::-webkit-details-marker { display: none; }
  details summary::before { content: "▸"; display: inline-block; transition: transform .15s; }
  details[open] summary::before { transform: rotate(90deg); }
  .envs {
    margin-top: 10px;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px;
    display: flex; flex-direction: column;
  }
  .env-row {
    display: grid; grid-template-columns: max-content 1fr;
    gap: 12px; padding: 4px 0;
    align-items: baseline;
  }
  .env-row + .env-row { border-top: 1px dashed var(--border); }
  .env-key { color: var(--muted); }
  .env-val { color: var(--fg); word-break: break-all; text-align: right; }
  .env-val.unset { color: var(--muted); font-style: italic; }
</style>
</head>
<body>
<div class="wrap">
<div class="header">
  <img class="logo" src="/logo.png" alt="" />
  <p class="brand-line"><b>${brandLink}</b> &middot; local sign-in &middot; <code>127.0.0.1</code></p>
</div>
<div class="card">
  <div class="body">
    <div id="step-creds" class="step">
      <h1>API credentials</h1>
      <p class="lede">Get them at <a href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org/apps</a>. Saved to <code>~/.mcp-telegram</code>.</p>
      <input id="api_id" inputmode="numeric" placeholder="api_id" />
      <input id="api_hash" placeholder="api_hash" />
      <button id="save-creds">Continue</button>
      <div class="err" id="err-creds"></div>
    </div>

    <div id="step-pick" class="step">
      <h1>Sign in</h1>
      <p class="lede">Pick an account or add a new one.</p>
      <div class="accounts" id="accounts"></div>
      <button id="add-new" class="ghost">Add account</button>
    </div>

    <div id="step-phone" class="step">
      <h1>Phone</h1>
      <p class="lede">Include country code.</p>
      <input id="phone" type="tel" autocomplete="tel" placeholder="+12025550123" />
      <button id="send-code">Send code</button>
      <div class="err" id="err-phone"></div>
    </div>

    <div id="step-code" class="step">
      <h1>Code</h1>
      <p class="lede">Sent to <span id="phone-echo"></span>.</p>
      <input id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="12345" />
      <button id="submit-code">Continue</button>
      <div class="err" id="err-code"></div>
    </div>

    <div id="step-password" class="step">
      <h1>2FA password</h1>
      <p class="lede">Your Telegram cloud password.</p>
      <input id="password" type="password" autocomplete="current-password" placeholder="••••••••" />
      <button id="submit-password">Continue</button>
      <div class="err" id="err-password"></div>
    </div>

    <div id="step-done" class="step">
      <div class="success">
        <div class="check">&check;</div>
        <h1>Done</h1>
        <p class="lede">You can close this tab.</p>
      </div>
    </div>
  </div>

  <div class="foot">
    <details>
      <summary>Environment</summary>
      <div class="envs" id="env-table"></div>
    </details>
  </div>
</div>
<p class="safety">Everything runs on your machine. Inputs go directly to Telegram's MTProto servers, nothing is sent anywhere else.</p>
</div>

<script>
  const AUTH_ID = ${JSON.stringify(authSessionId)};
  const accounts = ${accountsJson};
  let creds = ${credsJson};
  const env = ${envJson};

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
  };
  const showErr = (id, msg) => { const el = $(id); el.textContent = msg; el.classList.add('show'); };
  const clearErr = (id) => { $(id).classList.remove('show'); };

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderAccounts() {
    const wrap = $('accounts');
    wrap.innerHTML = '';
    for (const a of accounts) {
      const div = document.createElement('div');
      div.className = 'account';
      const label = a.username ? '@' + a.username : a.phone;
      div.innerHTML = '<div class="who"><b>' + escapeHtml(label) + '</b><span>' + escapeHtml(a.phone) + '</span></div><span class="chev">&rsaquo;</span>';
      div.onclick = () => pickExisting(a.id);
      wrap.appendChild(div);
    }
  }

  function renderEnvTable() {
    const keys = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'MCP_TELEGRAM_HOME', 'LOG_LEVEL'];
    $('env-table').innerHTML = keys.map((k) => {
      const v = env[k];
      const val = v == null
        ? '<span class="env-val unset">unset</span>'
        : '<span class="env-val">' + escapeHtml(v) + '</span>';
      return '<div class="env-row"><span class="env-key">' + k + '</span>' + val + '</div>';
    }).join('');
  }

  function startFlow() {
    renderAccounts();
    renderEnvTable();
    if (creds.source === 'missing') return show('step-creds');
    if (accounts.length === 0) return show('step-phone');
    show('step-pick');
  }

  async function pickExisting(accountId) {
    const r = await fetch('/authorize/use-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, account_id: accountId }) });
    if (!r.ok) return alert('Failed to use account');
    finish();
  }

  $('save-creds').onclick = async () => {
    clearErr('err-creds');
    const api_id = $('api_id').value.trim();
    const api_hash = $('api_hash').value.trim();
    if (!api_id || !api_hash) return showErr('err-creds', 'Both fields required');
    $('save-creds').disabled = true;
    try {
      const r = await fetch('/authorize/save-credentials', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, api_id, api_hash }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return showErr('err-creds', body.error || 'Failed');
      creds = { source: 'stored' };
      show(accounts.length === 0 ? 'step-phone' : 'step-pick');
    } finally { $('save-creds').disabled = false; }
  };

  $('add-new').onclick = () => show('step-phone');

  $('send-code').onclick = async () => {
    clearErr('err-phone');
    const phone = $('phone').value.trim();
    if (!phone) return showErr('err-phone', 'Phone required');
    $('send-code').disabled = true;
    try {
      const r = await fetch('/authorize/login-start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, phone }) });
      if (!r.ok) {
        const { error } = await r.json().catch(() => ({ error: 'Failed' }));
        return showErr('err-phone', error || 'Failed');
      }
      $('phone-echo').textContent = phone;
      show('step-code');
    } finally { $('send-code').disabled = false; }
  };

  $('submit-code').onclick = async () => {
    clearErr('err-code');
    const code = $('code').value.trim();
    if (!code) return showErr('err-code', 'Code required');
    $('submit-code').disabled = true;
    try {
      const r = await fetch('/authorize/login-code', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, code }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-code', body.error || 'Failed');
      if (body.status === 'password_needed') return show('step-password');
      finish();
    } finally { $('submit-code').disabled = false; }
  };

  $('submit-password').onclick = async () => {
    clearErr('err-password');
    const password = $('password').value;
    if (!password) return showErr('err-password', 'Password required');
    $('submit-password').disabled = true;
    try {
      const r = await fetch('/authorize/login-password', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, password }) });
      const body = await r.json();
      if (!r.ok) return showErr('err-password', body.error || 'Failed');
      finish();
    } finally { $('submit-password').disabled = false; }
  };

  function finish() { show('step-done'); }

  startFlow();
</script>
</body>
</html>`;
}
