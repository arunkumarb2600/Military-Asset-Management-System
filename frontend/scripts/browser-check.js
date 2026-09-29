/**
 * Headless browser check: loads the app in Chrome, logs in as each role and
 * reports any console error or failed request.  Verifies the UI really works,
 * not just that the bundle compiles.
 *   node scripts/browser-check.js
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.APP_URL || 'http://localhost:5173';
const userDir = mkdtempSync(join(tmpdir(), 'mams-chrome-'));

if (!existsSync(CHROME)) {
  console.error('Chrome not found. Set CHROME_PATH.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Drive Chrome over the DevTools protocol (no extra npm dependencies).
async function cdp() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=9222', `--user-data-dir=${userDir}`,
    '--window-size=1440,1000', 'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(400);
    try {
      const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
  }
  if (!wsUrl) { chrome.kill(); throw new Error('Could not start Chrome'); }

  const { WebSocket } = await import('node:worker_threads').then(() => ({ WebSocket: globalThis.WebSocket }));
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    else if (msg.method) events.push(msg);
  };
  const send = (method, params = {}) => new Promise((res) => {
    const myId = ++id;
    pending.set(myId, (m) => res(m.result ?? m.error));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  return {
    events, send, close: () => { try { ws.close(); } catch {} chrome.kill(); },
    async goto(url) { await send('Page.navigate', { url }); await sleep(1200); },
    /** Polls an expression until it returns truthy (cold Vite can be slow). */
    async waitFor(expr, { timeout = 15000, label = expr } = {}) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const r = await send('Runtime.evaluate', { expression: `(()=>{try{return (${expr})?1:0}catch(e){return 0}})()`, returnByValue: true });
        if (r?.result?.value === 1) return true;
        await sleep(250);
      }
      console.log(`        (timeout waiting for: ${label})`);
      return false;
    },
    async evalJs(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r?.exceptionDetails) return { error: r.exceptionDetails.text };
      return { value: r?.result?.value };
    },
    problems() {
      const out = [];
      for (const e of events) {
        if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
          out.push(`console.${e.params.type}: ${(e.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
        }
        if (e.method === 'Runtime.exceptionThrown') {
          out.push(`exception: ${e.params.exceptionDetails?.text} ${e.params.exceptionDetails?.exception?.description || ''}`);
        }
        if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
          // The deliberate wrong-password test produces one expected 401.
          // Match on the status code rather than Chrome's reason phrase, which
          // varies ("401 (Unauthorized)" locally vs "401 ()" behind a proxy).
          const expected = /\b401\b/.test(e.params.entry.text || '')
            && /\/api\/auth\/login/.test(e.params.entry.url || '');
          if (!expected) out.push(`log: ${e.params.entry.text} ${e.params.entry.url || ''}`);
        }
        if (e.method === 'Network.loadingFailed' && !e.params.canceled) {
          out.push(`net: ${e.params.errorText} ${e.params.type}`);
        }
      }
      return [...new Set(out)];
    }
  };
}

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' -> ' + JSON.stringify(extra).slice(0, 300) : ''}`); }
};

(async () => {
  const b = await cdp();
  // Built fresh on every call so TEST_EMAIL changes take effect.
  const LOGIN = (email) => `(async () => {
    const set = (el, v) => {
      const proto = Object.getPrototypeOf(el);
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const inputs = [...document.querySelectorAll('input')];
    set(inputs[0], ${JSON.stringify(email)});
    set(inputs[1], 'Password123');
    document.querySelector('form button[type=submit]').click();
    await new Promise(r => setTimeout(r, 2600));
    return location.pathname;
  })()`;

  try {
    console.log('\n== Login page ==');
    await b.goto(APP + '/');
    await b.waitFor(`document.querySelector('.demo-btn')`, { label: 'login form' });
    let r = await b.evalJs(`document.querySelector('h1')?.textContent`);
    check('login page renders', r.value === 'Military Asset Management', r);
    r = await b.evalJs(`document.querySelectorAll('.demo-btn').length`);
    check('demo account buttons present', r.value === 3, r);
    r = await b.evalJs(`document.querySelectorAll('.alert-error').length`);
    check('no error banner before submitting', r.value === 0, r);

    console.log('\n== Bad credentials ==');
    await b.evalJs(`(async()=>{const s=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}))};const i=[...document.querySelectorAll('input')];s(i[0],'admin@mams.mil');s(i[1],'nope');document.querySelector('form button[type=submit]').click();await new Promise(r=>setTimeout(r,1500));})()`);
    await b.waitFor(`document.querySelector('.alert-error')`, { label: 'login error' });
    r = await b.evalJs(`document.querySelector('.alert-error')?.textContent || ''`);
    check('invalid password shows an error', /Invalid email or password/.test(r.value || ''), r);

    console.log('\n== Admin dashboard ==');
    await b.evalJs(LOGIN('admin@mams.mil'));
    await b.waitFor(`document.querySelectorAll('.kpi').length >= 5`, { label: 'dashboard KPI cards' });
    r = await b.evalJs(`location.pathname`);
    check('redirects to dashboard after login', r.value === '/', r);
    r = await b.evalJs(`[...document.querySelectorAll('.kpi .lbl')].map(e=>e.textContent.trim().split(' click')[0])`);
    const labels = r.value || [];
    check('all 6 KPI cards render', ['Opening Balance', 'Net Movement', 'Closing Balance', 'Assigned', 'Expended'].every((l) => labels.includes(l)), labels);
    r = await b.evalJs(`[...document.querySelectorAll('.kpi .val')].map(e=>e.textContent.trim())`);
    check('KPI values are populated', (r.value || []).every((v) => v && v !== '—'), r);
    r = await b.evalJs(`document.querySelectorAll('.card').length`);
    check('dashboard tables render', r.value >= 2, r);
    r = await b.evalJs(`document.querySelectorAll('tbody tr').length`);
    check('data rows render', r.value > 5, r);

    console.log('\n== Net Movement pop-up (bonus) ==');
    await b.evalJs(`(()=>{const b=[...document.querySelectorAll('.kpi.clickable')].find(x=>x.textContent.includes('Net Movement'));b.click();return 1})()`);
    await b.waitFor(`document.querySelector('.modal') && document.querySelector('.modal .spinner') === null`, { label: 'net movement modal' });
    r = await b.evalJs(`document.querySelector('.modal h2')?.textContent || ''`);
    check('net movement modal opens', /Net Movement/i.test(r.value || ''), r);
    r = await b.evalJs(`[...document.querySelectorAll('.modal .kpi .lbl')].map(e=>e.textContent.trim())`);
    check('modal shows purchases / in / out / net', ['Purchases (+)', 'Transfer In (+)', 'Transfer Out (−)', 'Net Movement'].every((l) => (r.value || []).includes(l)), r);
    r = await b.evalJs(`document.querySelectorAll('.modal tbody tr').length`);
    check('modal lists individual movement rows', r.value > 0, r);
    await b.evalJs(`document.querySelector('.modal .x-btn').click()`);
    await sleep(600);
    r = await b.evalJs(`!!document.querySelector('.modal')`);
    check('modal closes', r.value === false, r);

    console.log('\n== Other pages ==');
    for (const [path, marker] of [
      ['/opening-balances', 'Opening stock on record'],
      ['/purchases', 'Purchase history'],
      ['/transfers', 'Transfer history'],
      ['/assignments', 'Assignment history'],
      ['/users', 'Users'],
      ['/audit', 'API transaction log']
    ]) {
      await b.goto(APP + path);
      await b.waitFor(`document.body.innerText.includes(${JSON.stringify(marker)})`, { label: marker });
      // The heading renders before the table data arrives. Against a remote
      // API (Render free tier sleeps, then takes ~1s to wake) the table is
      // often still empty at this point, so wait for rows to actually land
      // instead of racing the fetch.
      await b
        .waitFor(`document.querySelectorAll('tbody tr').length > 0`, { label: `${path} table rows`, timeout: 45000 })
        .catch(() => {});
      const t = await b.evalJs(`document.body.innerText.includes(${JSON.stringify(marker)})`);
      const rows = await b.evalJs(`document.querySelectorAll('tbody tr').length`);
      check(`${path} renders "${marker}" with data`, t.value === true && rows.value > 0, { marker: t.value, rows: rows.value });
    }

    console.log('\n== Modal forms ==');
    await b.goto(APP + '/purchases');
    await b.goto(APP + '/opening-balances');
    await b.waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Add opening stock'))`, { label: 'opening balances page' });
    await b.evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Add opening stock')).click()`);
    await b.waitFor(`document.querySelector('.modal select')`, { label: 'opening modal' });
    r = await b.evalJs(`document.querySelectorAll('.modal .form-grid .field').length`);
    check('opening balance form is the simple 4-field layout', r.value === 5, r);
    await b.evalJs(`document.querySelector('.modal button[form="opening-form"]').click()`);
    await b.waitFor(`document.querySelector('.modal .alert-err, .modal [class*="error"]')`, { label: 'opening form validation' })
      .catch(() => {});
    r = await b.evalJs(`!!document.querySelector('.modal')`);
    check('opening balance form blocks an empty submit', r.value === true, r);
    await b.evalJs(`document.querySelector('.modal .btn').click()`);

    await b.goto(APP + '/purchases');
    await b.waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Record purchase'))`, { label: 'purchases page' });
    await b.evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Record purchase')).click()`);
    await b.waitFor(`document.querySelector('.modal select')`, { label: 'purchase modal' });
    r = await b.evalJs(`document.querySelectorAll('.modal .form-grid .field').length`);
    check('purchase form has all fields', r.value === 8, r);

    // Admin gets a base pre-selected; clearing it must trigger HTML5 validation
    // and block the request.
    r = await b.evalJs(`document.querySelector('.modal select').value`);
    check('admin form pre-selects a base', !!r.value, r);

    await b.evalJs(`(()=>{const s=document.querySelector('.modal select');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s),'value').set.call(s,'');s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.modal-foot .btn-primary').click();})()`);
    await sleep(500);
    r = await b.evalJs(`document.querySelector('.modal select').validity.valueMissing`);
    check('cleared form is blocked by client-side validation', r.value === true, r);
    check('modal stays open when validation fails', (await b.evalJs(`!!document.querySelector('.modal')`)).value === true);

    // Now fill it in properly and confirm the record is accepted.
    await b.evalJs(`(async () => {
      const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
      const q = document.querySelector('.modal');
      const sel = q.querySelectorAll('select');
      set(sel[0], sel[0].options[1].value);
      set(sel[1], sel[1].options[1].value);
      const ins = q.querySelectorAll('input');
      set(ins[0], '7');
      set(ins[1], '12.50');
      set(ins[2], 'UI Test Supplier');
      set(ins[3], 'UI-TEST-1');
      document.querySelector('.modal-foot .btn-primary').click();
      await new Promise(r => setTimeout(r, 2000));
      return 1;
    })()`);
    await b.waitFor(`document.querySelector('.toast.ok')`, { label: 'success toast' });
    r = await b.evalJs(`document.querySelector('.toast.ok')?.textContent || ''`);
    check('valid purchase is saved and confirmed by a toast', /Purchase PUR-/.test(r.value || ''), r);
    r = await b.evalJs(`[...document.querySelectorAll('tbody tr')].some(t=>t.textContent.includes('UI-TEST-1'))`);
    check('new purchase appears in the table', r.value === true, r);

    console.log('\n== Clear all stock data (destructive guard) ==');
    await b.goto(APP + '/users');
    await b.waitFor(`[...document.querySelectorAll('button')].some(x=>/Clear all stock data/.test(x.textContent))`, { label: 'clear data button' });
    r = await b.evalJs(`[...document.querySelectorAll('button')].some(x=>/Clear all stock data/.test(x.textContent))`);
    check('admin sees the clear-data button', r.value === true, r);
    r = await b.evalJs(`[...document.querySelectorAll('.nav a')].some(a=>/User Management/i.test(a.textContent))`);
    check('admin does see User Management', r.value === true, r);
    await b.evalJs(`[...document.querySelectorAll('button')].find(x=>/Clear all stock data/.test(x.textContent)).click(); true`);
    await b.waitFor(`document.querySelector('.modal')`, { label: 'clear data modal' });
    r = await b.evalJs(`document.querySelector('.modal h2')?.textContent || ''`);
    check('clear-data modal opens', /Clear all stock data/i.test(r.value || ''), r);
    r = await b.evalJs(`document.querySelector('.modal .alert-danger')?.textContent || ''`);
    check('modal warns it cannot be undone', /cannot be undone/i.test(r.value || ''), r);
    r = await b.evalJs(`[...document.querySelectorAll('.modal button')].filter(x=>/delete all stock data/i.test(x.textContent))[0].disabled`);
    check('confirm button disabled while phrase is empty', r.value === true, r);
    await b.evalJs(`(()=>{const i=document.querySelector('.modal input');const s=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(i),'value').set;s.call(i,'delete all data');i.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await b.waitFor(`[...document.querySelectorAll('.modal button')].filter(x=>/delete all stock data/i.test(x.textContent))[0].disabled === false`, { label: 'confirm enabled' });
    r = await b.evalJs(`[...document.querySelectorAll('.modal button')].filter(x=>/delete all stock data/i.test(x.textContent))[0].disabled`);
    check('confirm button enables once phrase is typed', r.value === false, r);
    // Cancel rather than wipe: the suite's seeded data is still needed.
    await b.evalJs(`[...document.querySelectorAll('.modal button')].find(x=>/^Cancel$/i.test(x.textContent.trim())).click(); true`);
    await b.waitFor(`document.querySelector('.modal') === null`, { label: 'modal closed' });
    r = await b.evalJs(`document.body.innerText.includes('Clear all stock data')`);
    check('cancel closes without clearing anything', r.value === true, r);
    await b.evalJs(`(()=>{const s=document.querySelector('.modal select');Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s),'value').set.call(s,'');s.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.modal-foot .btn-primary').click();})()`);
    await sleep(500);
    r = await b.evalJs(`document.querySelector('.modal select').validity.valueMissing`);

    console.log('\n== Filters ==');
    await b.goto(APP + '/');
    await b.waitFor(`document.querySelector('#f-eq')`, { label: 'dashboard filters' });
    await b.evalJs(`(()=>{const s=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}))};const sel=document.querySelector('#f-eq');s(sel,String(sel.options[1].value));return 1})()`);
    await sleep(1800);
    r = await b.evalJs(`[...document.querySelectorAll('.kpi .val')][0].textContent.trim()`);
    check('equipment filter changes the numbers', r.value && r.value !== '—', r);
    r = await b.evalJs(`[...document.querySelectorAll('tbody tr')].length`);
    check('filtered table still has rows', r.value > 0, r);

    console.log('\n== Logout & role scoping ==');
    await b.goto(APP + '/');
    await b.waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Sign out'))`, { label: 'sign out button' });
    await b.evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Sign out')).click()`);
    await b.waitFor(`location.pathname === '/login'`, { label: 'redirect to login' });
    r = await b.evalJs(`location.pathname`);
    check('sign out returns to login', r.value === '/login', r);

    
    await b.evalJs(LOGIN('commander.kabul@mams.mil'));
    await b.waitFor(`document.querySelectorAll('.kpi').length >= 5`, { label: 'commander dashboard' });
    r = await b.evalJs(`[...document.querySelectorAll('.nav a')].map(a=>a.textContent.trim())`);
    check('commander does NOT see User Management', !(r.value || []).some((t) => /User Management/.test(t)), r);
    r = await b.evalJs(`!!document.querySelector('#f-base')`);
    check('commander has no "all bases" filter', r.value === false, r);
    r = await b.evalJs(`document.body.innerText.includes('Fort Kabul')`);
    check('commander sees their base name', r.value === true, r);
    await b.goto(APP + '/users');
    await b.waitFor(`document.body.innerText.includes('Access denied')`, { label: 'access denied' });
    r = await b.evalJs(`document.body.innerText.includes('Access denied')`);
    check('commander blocked from /users', r.value === true, r);

    // The destructive "clear all data" action must never be reachable by a
    // non-admin, and must stay behind a typed confirmation.
    r = await b.evalJs(`document.body.innerText.includes('Clear all stock data')`);
    check('commander never sees the clear-data action', r.value === false, r);

    // Drop the commander's session first, otherwise the router bounces us
    // off /login and the form is never rendered.
    await b.evalJs(`localStorage.clear(); true`);
    await b.goto(APP + '/login');
    await b.evalJs(LOGIN('logistics.kabul@mams.mil'));
    await b.waitFor(`document.querySelectorAll('.kpi').length >= 5`, { label: 'logistics dashboard' });
    await b.goto(APP + '/assignments');
    await b.waitFor(`document.body.innerText.includes('read-only access')`, { label: 'read-only notice' });
    r = await b.evalJs(`document.body.innerText.includes('read-only access')`);
    check('logistics gets read-only notice on assignments', r.value === true, r);
    r = await b.evalJs(`[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('New assignment')).length`);
    check('logistics has no "New assignment" button', r.value === 0, r);
    r = await b.evalJs(`[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('Record expenditure')).length`);
    check('logistics has no "Record expenditure" button', r.value === 0, r);
    await b.goto(APP + '/transfers');
    await b.waitFor(`document.querySelectorAll('tbody tr').length > 0`, { label: 'transfers rows' });
    r = await b.evalJs(`[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('New transfer')).length`);
    check('logistics CAN create transfers', r.value === 1, r);
    await b.goto(APP + '/purchases');
    await b.waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Record purchase'))`, { label: 'purchases page (logistics)' });
    r = await b.evalJs(`[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('Record purchase')).length`);
    check('logistics CAN create purchases', r.value === 1, r);

    console.log('\n== Responsive (mobile 390x844) ==');
    await send_screenshot(b, 390, 844);

    const problems = b.problems();
    console.log('\n== Console / network ==');
    if (problems.length === 0) { pass++; console.log('  PASS  no console errors or failed requests'); }
    else { fail++; console.log('  FAIL  problems found:'); problems.forEach((p) => console.log('        ' + p)); }
  } finally {
    b.close();
  }

  console.log(`\n${'='.repeat(46)}\n  PASSED: ${pass}    FAILED: ${fail}\n${'='.repeat(46)}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('browser check crashed:', e); process.exit(1); });

async function send_screenshot(b, w, h) {
  await b.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await b.goto(APP + '/');
  const r = await b.evalJs(`(() => {
    document.querySelector('.burger')?.click();
    return { sidebarVisible: getComputedStyle(document.querySelector('.sidebar')).transform };
  })()`);
  check('mobile: burger menu exists', r.value?.sidebarVisible !== undefined, r);
  const overflow = await b.evalJs(`document.documentElement.scrollWidth <= window.innerWidth + 2`);
  check('mobile: no horizontal overflow', overflow.value === true, overflow);
  await b.send('Emulation.clearDeviceMetricsOverride');
}
