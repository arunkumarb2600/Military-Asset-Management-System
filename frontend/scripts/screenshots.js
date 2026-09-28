/**
 * Captures screenshots of every screen for the project report / demo video.
 *   node scripts/screenshots.js
 * Output: deliverables/screenshots/*.png
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP = process.env.APP_URL || 'http://localhost:5173';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'deliverables', 'screenshots');
const userDir = mkdtempSync(join(tmpdir(), 'mams-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(CHROME)) { console.error('Chrome not found. Set CHROME_PATH.'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--remote-debugging-port=9223', `--user-data-dir=${userDir}`,
  '--window-size=1600,1100', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(400);
  try {
    const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
    const page = list.find((t) => t.type === 'page');
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch { /* not up yet */ }
}
if (!wsUrl) { chrome.kill(); throw new Error('Could not start Chrome'); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.id && pending.has(j.id)) { pending.get(j.id)(j); pending.delete(j.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, (j) => res(j.result ?? j.error)); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }))?.result?.value;

await send('Page.enable');
await send('Runtime.enable');

async function waitFor(expr, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evalJs(`(()=>{try{return (${expr})?1:0}catch(e){return 0}})()`)) return true;
    await sleep(250);
  }
  return false;
}
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log('  saved', name + '.png');
}
const loginJs = (email) => `(async () => {
  const set = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
  const i = [...document.querySelectorAll('input')];
  set(i[0], ${JSON.stringify(email)});
  set(i[1], 'Password123');
  document.querySelector('form button[type=submit]').click();
  await new Promise(r => setTimeout(r, 2500));
  return 1;
})()`;
async function goto(path, ready) {
  await send('Page.navigate', { url: APP + path });
  await sleep(1200);
  if (ready) await waitFor(ready);
  await sleep(500);
}

try {
  console.log('Capturing screenshots to', OUT);

  await goto('/', `document.querySelector('.login-wrap')`);
  await shot('01-login');

  await evalJs(loginJs('admin@mams.mil'));
  await waitFor(`document.querySelectorAll('.kpi').length >= 5`);
  await shot('02-dashboard');

  // Filters applied
  await evalJs(`(()=>{const s=(el,v)=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value').set.call(el,v);el.dispatchEvent(new Event('change',{bubbles:true}))};const sel=document.querySelector('#f-eq');s(sel,String(sel.options[1].value));return 1})()`);
  await sleep(2000);
  await shot('03-dashboard-filtered');

  // Net movement pop-up
  await evalJs(`(()=>{const b=[...document.querySelectorAll('.kpi.clickable')].find(x=>x.textContent.includes('Net Movement'));b.click();return 1})()`);
  await waitFor(`document.querySelector('.modal') && !document.querySelector('.modal .spinner')`);
  await sleep(600);
  await shot('04-net-movement-popup');
  await evalJs(`document.querySelector('.modal .x-btn').click()`);
  await sleep(500);

  await goto('/purchases', `document.body.innerText.includes('Purchase history')`);
  await shot('05-purchases');
  await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Record purchase')).click()`);
  await waitFor(`document.querySelector('.modal select')`);
  await sleep(500);
  await shot('06-purchase-form');
  await evalJs(`document.querySelector('.modal .x-btn').click()`);

  await goto('/transfers', `document.body.innerText.includes('Transfer history')`);
  await shot('07-transfers');
  await evalJs(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('New transfer')).click()`);
  await waitFor(`document.querySelector('.modal select')`);
  await sleep(500);
  await shot('08-transfer-form');
  await evalJs(`document.querySelector('.modal .x-btn').click()`);

  await goto('/assignments', `document.body.innerText.includes('Assignment history')`);
  await shot('09-assignments');
  await evalJs(`[...document.querySelectorAll('.tab')][1].click()`);
  await waitFor(`document.body.innerText.includes('Expenditure history')`);
  await sleep(700);
  await shot('10-expenditures');

  await goto('/audit', `document.body.innerText.includes('API transaction log')`);
  await shot('11-audit-log');
  const firstLog = await evalJs(`(()=>{const b=[...document.querySelectorAll('tbody button')].find(x=>x.textContent.trim()==='View');if(b){b.click();return 1}return 0})()`);
  if (firstLog) { await sleep(700); await shot('12-audit-detail'); await evalJs(`document.querySelector('.modal .x-btn').click()`); }

  await goto('/users', `document.body.innerText.includes('Users')`);
  await shot('13-users');

  // Commander view
  await evalJs(`localStorage.clear(); true`);
  await goto('/login', `document.querySelector('.login-wrap')`);
  await evalJs(loginJs('commander.kabul@mams.mil'));
  await waitFor(`document.querySelectorAll('.kpi').length >= 5`);
  await shot('14-commander-dashboard');

  // Logistics view
  await evalJs(`localStorage.clear(); true`);
  await goto('/login', `document.querySelector('.login-wrap')`);
  await evalJs(loginJs('logistics.kabul@mams.mil'));
  await waitFor(`document.querySelectorAll('.kpi').length >= 5`);
  await shot('15-logistics-dashboard');

  // Mobile
  await send('Emulation.setDeviceMetricsOverride', { width: 414, height: 896, deviceScaleFactor: 2, mobile: true });
  await goto('/', `document.querySelectorAll('.kpi').length >= 5`);
  await shot('16-mobile-dashboard');
  await evalJs(`document.querySelector('.burger').click()`);
  await sleep(600);
  await shot('17-mobile-menu');
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('\nDone.');
} finally {
  try { ws.close(); } catch { /* ignore */ }
  chrome.kill();
}
