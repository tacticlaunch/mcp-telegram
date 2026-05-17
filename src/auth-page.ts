/**
 * Inline HTML for the local Telegram authorization page.
 *
 * Served by `GET /authorize` after we've parked the PKCE parameters into
 * an in-memory session and dropped a cookie. The page drives the flow
 * entirely from the browser by POSTing to internal endpoints.
 */
export function renderAuthPage(authSessionId: string, accounts: { id: string; phone: string; username?: string }[]): string {
  const accountsJson = JSON.stringify(accounts);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorize Telegram</title>
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
    :root { --bg: #f5f6f8; --card: #ffffff; --fg: #1a1a1a; --muted: #6a6f7a; --input: #f0f1f4; --border: #d8dbe2; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; }
  .card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 28px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); }
  h1 { margin: 0 0 4px; font-size: 22px; }
  p.lede { margin: 0 0 20px; color: var(--muted); }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input { width: 100%; padding: 11px 12px; background: var(--input); color: var(--fg); border: 1px solid var(--border); border-radius: 10px; font-size: 15px; outline: none; }
  input:focus { border-color: var(--accent); }
  button { width: 100%; padding: 11px 12px; margin-top: 14px; border: 0; border-radius: 10px; background: var(--accent); color: white; font-size: 15px; font-weight: 600; cursor: pointer; }
  button[disabled] { opacity: 0.6; cursor: not-allowed; }
  .row { display: flex; gap: 10px; }
  .row > button.secondary { background: transparent; color: var(--accent); border: 1px solid var(--border); }
  .err { margin-top: 12px; padding: 10px 12px; background: rgba(255,92,92,0.1); color: var(--danger); border-radius: 10px; font-size: 13px; display: none; }
  .err.show { display: block; }
  .accounts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
  .account { display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--input); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: border-color .12s; }
  .account:hover { border-color: var(--accent); }
  .account .who { display: flex; flex-direction: column; }
  .account .who b { font-size: 14px; }
  .account .who span { font-size: 12px; color: var(--muted); }
  .hint { font-size: 12px; color: var(--muted); margin-top: 16px; text-align: center; }
  .step { display: none; }
  .step.active { display: block; }
  .success { text-align: center; padding: 20px 0; }
  .success .check { width: 56px; height: 56px; border-radius: 50%; background: var(--accent); color: white; display: grid; place-items: center; margin: 0 auto 14px; font-size: 28px; }
</style>
</head>
<body>
<div class="card">
  <div id="step-pick" class="step active">
    <h1>Authorize Telegram</h1>
    <p class="lede">Pick an existing account or add a new one.</p>
    <div class="accounts" id="accounts"></div>
    <button id="add-new">Add new account</button>
  </div>

  <div id="step-phone" class="step">
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
    <p class="lede">Enter your cloud password.</p>
    <label for="password">Password</label>
    <input id="password" type="password" autocomplete="current-password" />
    <button id="submit-password">Continue</button>
    <div class="err" id="err-password"></div>
  </div>

  <div id="step-done" class="step">
    <div class="success">
      <div class="check">&check;</div>
      <h1>Authorized</h1>
      <p class="lede">Redirecting back to your agent…</p>
    </div>
  </div>

  <p class="hint">Local session · nothing leaves your machine</p>
</div>

<script>
  const AUTH_ID = ${JSON.stringify(authSessionId)};
  const accounts = ${accountsJson};

  const $ = (id) => document.getElementById(id);
  const show = (id) => {
    document.querySelectorAll('.step').forEach(el => el.classList.remove('active'));
    $(id).classList.add('active');
  };
  const showErr = (id, msg) => { const el = $(id); el.textContent = msg; el.classList.add('show'); };
  const clearErr = (id) => { $(id).classList.remove('show'); };

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
    if (accounts.length === 0) {
      // skip the picker; go straight to phone entry
      show('step-phone');
    }
  }

  async function pickExisting(accountId) {
    const r = await fetch('/authorize/use-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ auth_id: AUTH_ID, account_id: accountId }) });
    if (!r.ok) { alert('Failed to use account'); return; }
    const { redirect } = await r.json();
    finish(redirect);
  }

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
      if (body.redirect) finish(body.redirect);
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
      if (body.redirect) finish(body.redirect);
    } finally {
      $('submit-password').disabled = false;
    }
  };

  function finish(redirect) {
    show('step-done');
    setTimeout(() => { window.location = redirect; }, 600);
  }

  renderAccounts();
</script>
</body>
</html>`;
}
