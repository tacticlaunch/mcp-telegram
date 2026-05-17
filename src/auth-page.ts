export interface CredentialsHint {
  source: 'env' | 'stored' | 'missing';
  api_id_masked?: string;
}

export interface EnvSnapshot {
  TELEGRAM_API_ID?: string;
  TELEGRAM_API_HASH?: string;
  TELEGRAM_AGENT_HOME?: string;
  LOG_LEVEL?: string;
}

export interface PackageMeta {
  name: string;
  version: string;
  repoUrl?: string;
}

export interface SettingsSnapshot {
  readonly: { source: 'env' | 'stored' | 'default'; value: 'true' | 'false' };
  tools: { source: 'env' | 'stored' | 'default'; value: string };
  disable: { source: 'env' | 'stored' | 'default'; value: string };
}

export interface ToolEntry { name: string; desc: string; mutating?: boolean; required?: boolean; }
export interface ToolGroup { id: string; title: string; tools: ToolEntry[]; }

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
  pkg: PackageMeta,
  settings: SettingsSnapshot,
  catalog: ToolGroup[],
  initialStep: 'login' | 'settings' = 'login'
): string {
  const brandLink = pkg.repoUrl
    ? `<a href="${escapeAttr(pkg.repoUrl)}" target="_blank" rel="noopener noreferrer">${escapeText(pkg.name)}</a>`
    : escapeText(pkg.name);
  const logoHtml = pkg.repoUrl
    ? `<a class="logo-link" href="${escapeAttr(pkg.repoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeAttr(pkg.name)} repository"><img class="logo" src="/logo.png" alt="${escapeAttr(pkg.name)}" /></a>`
    : `<img class="logo" src="/logo.png" alt="${escapeAttr(pkg.name)}" />`;
  const accountsJson = JSON.stringify(accounts);
  const credsJson = JSON.stringify(creds);
  const envJson = JSON.stringify(env);
  const settingsJson = JSON.stringify(settings);
  const catalogJson = JSON.stringify(catalog);
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
  .wrap { width: 100%; max-width: 360px; display: flex; flex-direction: column; gap: 14px; align-items: center; transition: max-width .15s ease; }
  body.wide .wrap { max-width: 1100px; }
  body.settings-only .card { display: none; }
  .header { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .logo { width: 56px; height: 56px; object-fit: contain; display: block; }
  .logo-link { display: inline-block; line-height: 0; border-radius: 8px; transition: transform .12s; }
  .logo-link:hover { transform: scale(1.05); }
  .logo-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
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
  /* ── settings card ─────────────────────────────────────────────── */
  .settings {
    width: 100%;
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    display: flex; flex-direction: column; overflow: hidden;
  }
  .settings.hidden { display: none; }
  .settings-top {
    padding: 18px 22px; border-bottom: 1px solid var(--border);
    display: grid; grid-template-columns: 1fr auto; gap: 14px; align-items: center;
  }
  .settings-top h2 { margin: 0; font-size: 18px; font-weight: 600; }
  .settings-top .lede { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
  .settings-summary { font-size: 12px; color: var(--muted); padding: 5px 10px; background: var(--input); border-radius: 8px; white-space: nowrap; }
  .settings-meta {
    padding: 12px 22px; border-bottom: 1px solid var(--border);
    display: flex; flex-wrap: wrap; gap: 14px 22px; align-items: center;
  }
  .setting-head { display: flex; align-items: center; gap: 8px; }
  .setting-name { font-size: 13px; font-weight: 500; color: var(--fg); }
  .setting-source { font-size: 11px; color: var(--muted); }
  .setting-source.env { color: var(--accent); }
  .toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--fg); cursor: pointer; }
  .toggle input { width: auto; }
  .env-pinned {
    flex: 1 1 260px;
    padding: 8px 12px; background: var(--input); border: 1px solid var(--border);
    border-radius: 8px; font-size: 12px; color: var(--muted);
  }
  .env-pinned.hidden { display: none; }
  .env-pinned code { background: transparent; color: var(--fg); padding: 0; }
  .settings-toolbar {
    padding: 12px 22px; border-bottom: 1px solid var(--border);
    display: flex; gap: 8px; align-items: center;
  }
  .settings-toolbar input {
    flex: 1 1 auto; min-width: 0; width: auto;
    padding: 9px 12px; font-size: 13px;
  }
  .settings-toolbar button { width: auto; flex: 0 0 auto; }
  button.mini { padding: 9px 14px; margin: 0; font-size: 12.5px; font-weight: 500; }
  .tool-group-actions button { width: auto; }
  #tool-groups {
    padding: 18px 22px;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    overflow-y: auto;
    max-height: min(60vh, 720px);
  }
  .tool-group {
    border: 1px solid var(--border); border-radius: 10px; background: var(--input);
    display: flex; flex-direction: column;
  }
  .tool-group.empty { display: none; }
  .tool-group-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px; gap: 8px;
    border-bottom: 1px solid var(--border);
  }
  .tool-group-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  .tool-group-count { color: var(--muted); font-size: 11.5px; font-weight: 400; }
  .tool-group-actions { display: flex; gap: 4px; }
  .tool-group-actions button { padding: 3px 8px; margin: 0; font-size: 11px; background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 6px; cursor: pointer; }
  .tool-group-actions button:hover { color: var(--accent); border-color: var(--accent); }
  .tool-list { padding: 6px 8px 8px; display: flex; flex-direction: column; gap: 1px; }
  .tool-item { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 4px 6px; min-width: 0; border-radius: 6px; }
  .tool-item:hover { background: rgba(127,127,127,0.06); }
  .tool-item input { width: auto; margin: 0; flex-shrink: 0; }
  .tool-item label { cursor: pointer; flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .tool-item .tool-name { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 12px; color: var(--fg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tool-item .tool-desc { color: var(--muted); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tool-item.hidden { display: none; }
  .tool-item.muted-by-ro { opacity: 0.4; }
  .tool-item.muted-by-ro .tool-name { text-decoration: line-through; }
  .badge-required {
    display: inline-block; margin-left: 6px; padding: 1px 6px;
    background: rgba(42,171,238,0.15); color: var(--accent);
    border-radius: 4px; font-size: 9.5px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.04em;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    vertical-align: middle;
  }
  .tool-item[data-required="1"] .tool-name { font-weight: 500; }
  .setting-source:empty { display: none; }
  input[type="checkbox"][disabled] + label,
  .tool-item input[disabled] ~ label { opacity: 0.5; cursor: not-allowed; }
  .settings-footer {
    padding: 12px 22px; border-top: 1px solid var(--border);
    display: flex; gap: 12px; align-items: center;
  }
  .settings-msg { flex: 1; font-size: 12px; color: var(--muted); min-height: 16px; }
  .settings-msg.ok { color: var(--accent); }
  .settings-msg.err { color: var(--danger); }
  .settings-footer button { width: auto; padding: 9px 18px; margin: 0; font-size: 13px; }
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
  ${logoHtml}
  <p class="brand-line"><b>${brandLink}</b> &middot; local sign-in</p>
</div>
<div class="card">
  <div class="body">
    <div id="step-creds" class="step">
      <h1>API credentials</h1>
      <p class="lede">Get them at <a href="https://my.telegram.org/apps" target="_blank" rel="noopener">my.telegram.org/apps</a>. Saved to <code>~/.telegram-agent</code>.</p>
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
        <div class="check" id="done-check">&check;</div>
        <h1 id="done-title">Signed in</h1>
        <p class="lede" id="done-lede">Configure which tools the agent sees, then close this tab.</p>
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

<div id="settings-card" class="settings hidden">
  <div class="settings-top">
    <div>
      <h2>Tool surface</h2>
      <p class="lede">Pick which tools the agent sees. Restart your MCP client after saving.</p>
    </div>
    <div class="settings-summary" id="settings-summary"></div>
  </div>

  <div class="settings-meta">
    <label class="toggle">
      <input id="set-readonly" type="checkbox" />
      <span class="setting-name">Read-only mode</span>
      <span class="setting-source" id="src-readonly"></span>
    </label>
    <div id="env-pinned" class="env-pinned hidden">
      Per-tool selection is pinned by <code>MCP_TELEGRAM_TOOLS</code> / <code>MCP_TELEGRAM_DISABLE</code> in the environment. Unset them to edit here.
    </div>
  </div>

  <div class="settings-toolbar">
    <input id="tool-filter" type="search" placeholder="Filter tools by name…" />
    <button id="select-all" class="ghost mini">Select all</button>
    <button id="select-none" class="ghost mini">Select none</button>
  </div>

  <div id="tool-groups"></div>

  <div class="settings-footer">
    <div class="settings-msg" id="settings-msg"></div>
    <button id="close-tab" class="ghost">Close</button>
    <button id="save-settings">Save</button>
  </div>
</div>

<p class="safety">Everything runs on your machine. Inputs go directly to Telegram's MTProto servers, nothing is sent anywhere else.</p>
</div>

<script>
  const AUTH_ID = ${JSON.stringify(authSessionId)};
  const accounts = ${accountsJson};
  let creds = ${credsJson};
  const env = ${envJson};
  let settings = ${settingsJson};
  const TOOL_CATALOG = ${catalogJson};
  const INITIAL_STEP = ${JSON.stringify(initialStep)};

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
    const keys = ['TELEGRAM_API_ID', 'TELEGRAM_API_HASH', 'TELEGRAM_AGENT_HOME', 'LOG_LEVEL'];
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
    if (r.status === 401) {
      const body = await r.json().catch(() => ({}));
      if (body.error === 'session_expired') {
        if (body.phone) {
          $('phone').value = body.phone;
          $('phone-echo').textContent = body.phone;
        }
        showErr('err-phone', 'Session expired — sign in again to refresh.');
        return show('step-phone');
      }
    }
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

  function finish() {
    show('step-done');
    document.body.classList.add('wide');
    $('settings-card').classList.remove('hidden');
    renderSettings();
  }

  function sourceLabel(s) {
    return s.source === 'env' ? 'set via env (locked)' :
           s.source === 'stored' ? 'saved locally' : '';
  }

  /**
   * Parse a comma-separated env-style tool selector into a matcher.
   * Supports literal names and \`prefix*\` wildcards.
   */
  function parseSelector(str) {
    const explicit = new Set();
    const prefixes = [];
    for (const raw of (str || '').split(',')) {
      const t = raw.trim();
      if (!t) continue;
      if (t.endsWith('*')) prefixes.push(t.slice(0, -1));
      else explicit.add(t);
    }
    return { explicit, prefixes, empty: !explicit.size && !prefixes.length };
  }
  function matches(name, sel) {
    if (sel.explicit.has(name)) return true;
    return sel.prefixes.some((p) => name.startsWith(p));
  }

  /** Compute current enabled set from settings (env-or-stored values). */
  function computeEnabled() {
    const allow = parseSelector(settings.tools.value);
    const deny = parseSelector(settings.disable.value);
    const enabled = new Set();
    for (const g of TOOL_CATALOG) {
      for (const t of g.tools) {
        if (!allow.empty && !matches(t.name, allow)) continue;
        if (!deny.empty && matches(t.name, deny)) continue;
        enabled.add(t.name);
      }
    }
    return enabled;
  }

  function toolsLocked() {
    return settings.tools.source === 'env' || settings.disable.source === 'env';
  }

  function escapeHtmlAttr(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function renderSettings() {
    const setSrc = (id, src) => {
      const el = $(id);
      el.textContent = sourceLabel(src);
      el.classList.toggle('env', src.source === 'env');
    };
    setSrc('src-readonly', settings.readonly);

    $('set-readonly').checked = settings.readonly.value === 'true';
    $('set-readonly').disabled = settings.readonly.source === 'env';

    const locked = toolsLocked();
    $('env-pinned').classList.toggle('hidden', !locked);

    const enabled = computeEnabled();
    const wrap = $('tool-groups');
    wrap.innerHTML = '';
    for (const g of TOOL_CATALOG) {
      const card = document.createElement('div');
      card.className = 'tool-group';
      card.dataset.groupId = g.id;

      const onCount = g.tools.filter((t) => enabled.has(t.name)).length;
      const total = g.tools.length;

      const head = document.createElement('div');
      head.className = 'tool-group-head';
      head.innerHTML =
        '<div class="tool-group-title">' + escapeHtmlAttr(g.title) +
        ' <span class="tool-group-count" data-count>(' + onCount + '/' + total + ')</span></div>' +
        '<div class="tool-group-actions">' +
          '<button type="button" data-action="all">All</button>' +
          '<button type="button" data-action="none">None</button>' +
        '</div>';
      card.appendChild(head);

      const list = document.createElement('div');
      list.className = 'tool-list';
      for (const t of g.tools) {
        const id = 'tool-' + t.name;
        const item = document.createElement('div');
        item.className = 'tool-item';
        item.dataset.tool = t.name;
        if (t.mutating) item.dataset.mutating = '1';
        if (t.required) item.dataset.required = '1';
        const isChecked = t.required || enabled.has(t.name);
        const isDisabled = t.required || locked;
        const requiredBadge = t.required
          ? ' <span class="badge-required" title="Required — disabling this would lock you out of managing the install">required</span>'
          : '';
        item.innerHTML =
          '<input type="checkbox" id="' + id + '" ' + (isChecked ? 'checked' : '') +
            (isDisabled ? ' disabled' : '') + ' />' +
          '<label for="' + id + '">' +
            '<span class="tool-name">' + escapeHtmlAttr(t.name) + requiredBadge + '</span>' +
            '<span class="tool-desc">' + escapeHtmlAttr(t.desc) + '</span>' +
          '</label>';
        list.appendChild(item);
      }
      card.appendChild(list);
      wrap.appendChild(card);

      head.querySelector('[data-action="all"]').onclick = (e) => {
        e.preventDefault();
        if (locked) return;
        list.querySelectorAll('input[type="checkbox"]:not([disabled])').forEach((cb) => { cb.checked = true; });
        updateGroupCount(card);
        updateSummary();
      };
      head.querySelector('[data-action="none"]').onclick = (e) => {
        e.preventDefault();
        if (locked) return;
        // Required tools stay checked — they can't be disabled.
        list.querySelectorAll('.tool-item:not([data-required="1"]) input[type="checkbox"]:not([disabled])').forEach((cb) => { cb.checked = false; });
        updateGroupCount(card);
        updateSummary();
      };
      list.addEventListener('change', () => { updateGroupCount(card); updateSummary(); });
    }
    applyReadonlyState();
  }

  function updateGroupCount(card) {
    const total = card.querySelectorAll('input[type="checkbox"]').length;
    const on = card.querySelectorAll('input[type="checkbox"]:checked').length;
    card.querySelector('[data-count]').textContent = '(' + on + '/' + total + ')';
  }

  function updateSummary() {
    const all = document.querySelectorAll('#tool-groups input[type="checkbox"]');
    const on = document.querySelectorAll('#tool-groups input[type="checkbox"]:checked');
    const ro = $('set-readonly').checked;
    const mutedByRo = ro
      ? document.querySelectorAll('#tool-groups .tool-item[data-mutating="1"]').length
      : 0;
    const effective = ro
      ? Array.from(on).filter((cb) => !cb.closest('.tool-item').dataset.mutating).length
      : on.length;
    $('settings-summary').textContent =
      effective + ' / ' + all.length + ' tools enabled' +
      (mutedByRo ? ' · ' + mutedByRo + ' hidden by read-only' : '');
  }

  /**
   * Reflect the read-only toggle in the per-tool grid: mutating tools
   * become disabled (and visually greyed) without losing their stored
   * checked state, so unticking read-only restores the previous
   * selection.
   */
  function applyReadonlyState() {
    const ro = $('set-readonly').checked;
    const toolsAreLocked = toolsLocked();
    for (const item of document.querySelectorAll('#tool-groups .tool-item[data-mutating="1"]')) {
      const cb = item.querySelector('input[type="checkbox"]');
      const isRequired = item.dataset.required === '1';
      cb.disabled = toolsAreLocked || ro || isRequired;
      item.classList.toggle('muted-by-ro', ro);
    }
    updateSummary();
  }

  $('set-readonly').addEventListener('change', applyReadonlyState);

  $('tool-filter').oninput = (e) => {
    const q = e.target.value.trim().toLowerCase();
    for (const card of document.querySelectorAll('.tool-group')) {
      let any = false;
      for (const item of card.querySelectorAll('.tool-item')) {
        const hit = !q || item.dataset.tool.toLowerCase().includes(q);
        item.classList.toggle('hidden', !hit);
        if (hit) any = true;
      }
      card.classList.toggle('empty', !any);
    }
  };

  $('select-all').onclick = () => {
    if (toolsLocked()) return;
    document.querySelectorAll('#tool-groups input[type="checkbox"]:not([disabled])').forEach((cb) => { cb.checked = true; });
    for (const card of document.querySelectorAll('.tool-group')) updateGroupCount(card);
    updateSummary();
  };
  $('select-none').onclick = () => {
    if (toolsLocked()) return;
    // Required tools stay checked.
    document.querySelectorAll('#tool-groups .tool-item:not([data-required="1"]) input[type="checkbox"]:not([disabled])').forEach((cb) => { cb.checked = false; });
    for (const card of document.querySelectorAll('.tool-group')) updateGroupCount(card);
    updateSummary();
  };

  function settingsMsg(text, kind) {
    const el = $('settings-msg');
    el.textContent = text;
    el.classList.remove('ok', 'err');
    if (kind) el.classList.add(kind);
  }

  /**
   * Turn the checked state of every tool checkbox into the smallest
   * env-style selector pair (allowlist / blocklist) that produces the
   * same enabled set.
   *
   * - all enabled  → both empty (default)
   * - all disabled → impossible to express via env; we set tools='_none'
   *                  which matches nothing, equivalent to disabling everything
   * - more enabled than disabled → blocklist of the disabled ones
   * - otherwise → allowlist of the enabled ones
   */
  function checkboxesToSelectors() {
    // Required tools are forced on by the server regardless of selectors,
    // so we ignore them when computing the smallest selector pair.
    const onNames = [];
    const offNames = [];
    for (const item of document.querySelectorAll('#tool-groups .tool-item')) {
      if (item.dataset.required === '1') continue;
      const cb = item.querySelector('input[type="checkbox"]');
      if (cb.checked) onNames.push(item.dataset.tool);
      else offNames.push(item.dataset.tool);
    }
    if (offNames.length === 0) return { tools: '', disable: '' };
    if (onNames.length === 0) return { tools: '_none', disable: '' };
    if (offNames.length <= onNames.length) {
      return { tools: '', disable: offNames.join(',') };
    }
    return { tools: onNames.join(','), disable: '' };
  }

  $('save-settings').onclick = async () => {
    settingsMsg('Saving…');
    $('save-settings').disabled = true;
    try {
      const sel = checkboxesToSelectors();
      const payload = {
        auth_id: AUTH_ID,
        readonly: $('set-readonly').checked,
        // Only send fields the user can actually edit; the server keeps
        // env-locked values untouched anyway, but we avoid sending stale data.
        tools: settings.tools.source === 'env' ? undefined : sel.tools,
        disable: settings.disable.source === 'env' ? undefined : sel.disable,
      };
      const r = await fetch('/authorize/save-settings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return settingsMsg(body.error || 'Failed to save', 'err');
      settings = body.snapshot || settings;
      renderSettings();
      settingsMsg('Saved. Restart your MCP client to apply.', 'ok');
    } finally {
      $('save-settings').disabled = false;
    }
  };

  $('close-tab').onclick = async () => {
    try {
      await fetch('/authorize/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auth_id: AUTH_ID }),
      });
    } catch {/* ignore — server may already be shutting down */}
    window.close();
  };

  // Settings-only entry: skip auth flow, go straight to the settings card.
  if (INITIAL_STEP === 'settings') {
    document.body.classList.add('settings-only');
    renderEnvTable();
    finish();
  } else {
    startFlow();
  }
</script>
</body>
</html>`;
}
