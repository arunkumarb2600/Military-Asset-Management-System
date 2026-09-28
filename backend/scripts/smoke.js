#!/usr/bin/env node
/**
 * End-to-end smoke test of every API endpoint, including RBAC checks.
 *   node scripts/smoke.js            (server must be running on :4000)
 * Sets SMOKE_BASE to point elsewhere.
 */
const BASE = process.env.SMOKE_BASE || 'http://localhost:4000';

let pass = 0, fail = 0;
const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
};
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const section = (s) => console.log(`\n== ${s} ==`);

(async () => {
  section('Health & auth');
  const health = await call('GET', '/api/health');
  check('GET /api/health', health.status === 200 && health.json.status === 'ok');

  check('POST /api/auth/login rejects bad password', (await call('POST', '/api/auth/login', { body: { email: 'admin@mams.mil', password: 'wrong' } })).status === 401);
  check('GET /api/dashboard/summary without token = 401', (await call('GET', '/api/dashboard/summary')).status === 401);

  const admin = await call('POST', '/api/auth/login', { body: { email: 'admin@mams.mil', password: 'Password123' } });
  check('POST /api/auth/login admin', admin.status === 200 && !!admin.json.token, admin.json);
  const aT = admin.json.token;

  const cmd = await call('POST', '/api/auth/login', { body: { email: 'commander.kabul@mams.mil', password: 'Password123' } });
  check('POST /api/auth/login commander', cmd.status === 200 && cmd.json.user.role === 'commander', cmd.json);
  const cT = cmd.json.token;

  const log = await call('POST', '/api/auth/login', { body: { email: 'logistics.kandahar@mams.mil', password: 'Password123' } });
  check('POST /api/auth/login logistics', log.status === 200 && log.json.user.role === 'logistics', log.json);
  const lT = log.json.token;

  check('GET /api/auth/me', (await call('GET', '/api/auth/me', { token: aT })).json.user.email === 'admin@mams.mil');

  section('Reference data + RBAC scoping');
  const basesAdmin = (await call('GET', '/api/meta/bases', { token: aT })).json.bases;
  const basesCmd = (await call('GET', '/api/meta/bases', { token: cT })).json.bases;
  check('admin sees all 4 bases', basesAdmin.length === 4, basesAdmin.length);
  check('commander sees only their 1 base', basesCmd.length === 1 && basesCmd[0].code === 'B-01', basesCmd);
  check('GET /api/meta/equipment-types', (await call('GET', '/api/meta/equipment-types', { token: aT })).json.equipmentTypes.length === 12);
  const perms = (await call('GET', '/api/meta/permissions', { token: lT })).json.permissions;
  check('logistics cannot manage assignments', perms.manageAssignments === false, perms);

  section('Dashboard');
  const sum = (await call('GET', '/api/dashboard/summary', { token: aT })).json;
  const s = sum.summary;
  check('summary returns all KPI fields', ['openingBalance','closingBalance','netMovement','purchases','transferIn','transferOut','assigned','expended'].every((k) => k in s), s);
  check('closing balance identity holds',
    s.openingBalance + s.purchases + s.transferIn - s.transferOut - s.assigned - s.writeOffs === s.closingBalance, s);
  check('net movement = P + TI - TO', s.netMovement === s.purchases + s.transferIn - s.transferOut, s);
  check('byEquipment breakdown present', sum.byEquipment.length > 0);

  const scoped = (await call('GET', '/api/dashboard/summary', { token: cT })).json.summary;
  check('commander sees only their base totals (smaller than admin)', scoped.closingBalance < s.closingBalance, { scoped, s });

  const filtered = (await call('GET', '/api/dashboard/summary?from=2000-01-01&to=2000-12-31', { token: aT })).json.summary;
  check('date filter narrows results', filtered.purchases === 0 && filtered.closingBalance === 0, filtered);
  const oneEq = (await call('GET', `/api/dashboard/summary?equipmentTypeId=${sum.byEquipment[0].equipmentTypeId}`, { token: aT })).json.summary;
  check('equipment filter narrows results', oneEq.closingBalance < s.closingBalance);

  const nm = (await call('GET', '/api/dashboard/net-movement', { token: aT })).json;
  check('net-movement drill-down returns 3 lists',
    Array.isArray(nm.purchases) && Array.isArray(nm.transferIn) && Array.isArray(nm.transferOut) && nm.purchases.length > 0);
  check('net-movement summary matches card',
    nm.summary.netMovement === s.netMovement, { nm: nm.summary, s: { netMovement: s.netMovement } });
  const bal = (await call('GET', '/api/dashboard/balances', { token: aT })).json.balances;
  check('GET /api/dashboard/balances', bal.length > 0);
  const mov = (await call('GET', '/api/dashboard/movements?limit=5', { token: aT })).json.movements;
  check('GET /api/dashboard/movements respects limit', mov.length === 5);

  section('Purchases');
  const pList = (await call('GET', '/api/purchases', { token: aT })).json.purchases;
  check('GET /api/purchases', pList.length === 16, pList.length);
  check('GET /api/purchases?baseId filter', (await call('GET', '/api/purchases?baseId=2', { token: aT })).json.purchases.every((p) => p.base_id === 2));
  check('GET /api/purchases?q=invoice search', (await call('GET', '/api/purchases?q=INV-90211', { token: aT })).json.purchases.length === 1);
  check('GET /api/purchases/summary', (await call('GET', '/api/purchases/summary', { token: aT })).json.summary.count === 16);
  const pCmdFilter = (await call('GET', '/api/purchases', { token: cT })).json.purchases;
  check('commander purchase list is base-scoped', pCmdFilter.every((p) => p.base_id === 1), pCmdFilter.map((p) => p.base_id));

  const newP = await call('POST', '/api/purchases', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 25, unitCost: 700, supplier: 'Test Supplier', invoiceNo: 'SMOKE-1', purchaseDate: new Date().toISOString().slice(0, 10) } });
  check('POST /api/purchases (admin)', newP.status === 201 && /^PUR-/.test(newP.json.purchase.reference_no), newP.json);
  check('POST /api/purchases rejects quantity 0', (await call('POST', '/api/purchases', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 0, purchaseDate: '2025-01-01' } })).status === 400);
  check('POST /api/purchases rejects bad date', (await call('POST', '/api/purchases', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 5, purchaseDate: 'not-a-date' } })).status === 400);
  const crossBase = await call('POST', '/api/purchases', { token: cT, body: { baseId: 2, equipmentTypeId: 1, quantity: 5, purchaseDate: '2025-01-01' } });
  check('commander CANNOT purchase for another base (403)', crossBase.status === 403, crossBase.json);
  check('logistics CAN create purchases', (await call('POST', '/api/purchases', { token: lT, body: { baseId: 2, equipmentTypeId: 1, quantity: 5, purchaseDate: '2025-01-01' } })).status === 201);

  section('Transfers');
  const tList = (await call('GET', '/api/transfers', { token: aT })).json.transfers;
  check('GET /api/transfers', tList.length === 9, tList.length);
  check('GET /api/transfers?status=dispatched', (await call('GET', '/api/transfers?status=dispatched', { token: aT })).json.transfers.length === 2);
  check('GET /api/transfers/summary', (await call('GET', '/api/transfers/summary', { token: aT })).json.summary.inTransitUnits > 0);

  const tooMuch = await call('POST', '/api/transfers', { token: aT, body: { fromBaseId: 1, toBaseId: 2, equipmentTypeId: 1, quantity: 99999999, transferDate: '2025-06-01' } });
  check('POST /api/transfers blocks insufficient stock', tooMuch.status === 400 && /Insufficient stock/.test(tooMuch.json.error), tooMuch.json);
  check('POST /api/transfers blocks same base', (await call('POST', '/api/transfers', { token: aT, body: { fromBaseId: 1, toBaseId: 1, equipmentTypeId: 1, quantity: 1, transferDate: '2025-06-01' } })).status === 400);

  const before = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  const newT = await call('POST', '/api/transfers', { token: aT, body: { fromBaseId: 1, toBaseId: 3, equipmentTypeId: 1, quantity: 10, transferDate: new Date().toISOString().slice(0, 10), remarks: 'smoke test' } });
  check('POST /api/transfers dispatch', newT.status === 201, newT.json);
  const afterDispatch = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  check('dispatch reduces sending base stock by 10', afterDispatch === before - 10, { before, afterDispatch });

  const recv = await call('POST', `/api/transfers/${newT.json.transfer.id}/receive`, { token: aT, body: { receivedDate: new Date().toISOString().slice(0, 10) } });
  check('POST /api/transfers/:id/receive', recv.status === 200, recv.json);
  check('receiving twice is rejected', (await call('POST', `/api/transfers/${newT.json.transfer.id}/receive`, { token: aT, body: {} })).status === 400);

  const t2 = await call('POST', '/api/transfers', { token: aT, body: { fromBaseId: 1, toBaseId: 2, equipmentTypeId: 1, quantity: 5, transferDate: new Date().toISOString().slice(0, 10) } });
  const b2 = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  const cancel = await call('POST', `/api/transfers/${t2.json.transfer.id}/cancel`, { token: aT, body: { reason: 'smoke test cancel' } });
  const a2 = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  check('POST /api/transfers/:id/cancel restores stock', cancel.status === 200 && a2 === b2 + 5, { b2, a2, cancel: cancel.json });

  section('Assignments & expenditures');
  const aList = (await call('GET', '/api/assignments', { token: aT })).json.assignments;
  check('GET /api/assignments', aList.length === 10, aList.length);
  check('GET /api/assignments?status=active', (await call('GET', '/api/assignments?status=active', { token: aT })).json.assignments.every((x) => x.status === 'active'));
  check('GET /api/assignments/summary', (await call('GET', '/api/assignments/summary', { token: aT })).json.summary.activeUnits > 0);

  check('logistics CANNOT create assignment (403)', (await call('POST', '/api/assignments', { token: lT, body: { baseId: 2, equipmentTypeId: 1, quantity: 1, personnelName: 'X', assignedDate: '2025-01-01' } })).status === 403);
  check('commander CANNOT assign for another base (403)', (await call('POST', '/api/assignments', { token: cT, body: { baseId: 2, equipmentTypeId: 1, quantity: 1, personnelName: 'X', assignedDate: '2025-01-01' } })).status === 403);
  check('assignment rejects over-issue', (await call('POST', '/api/assignments', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 9999999, personnelName: 'X', assignedDate: '2025-01-01' } })).status === 400);
  check('assignment requires personnel name', (await call('POST', '/api/assignments', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 1, personnelName: '', assignedDate: '2025-01-01' } })).status === 400);

  const newA = await call('POST', '/api/assignments', { token: aT, body: { baseId: 1, equipmentTypeId: 4, quantity: 4, personnelName: 'Smoke Tester', personnelId: 'AF-99999', personnelRank: 'Captain', assignedDate: new Date().toISOString().slice(0, 10) } });
  check('POST /api/assignments', newA.status === 201, newA.json);

  const xList = (await call('GET', '/api/expenditures', { token: aT })).json.expenditures;
  check('GET /api/expenditures', xList.length === 15, xList.length);
  check('expenditure reasons returned for the form', (await call('GET', '/api/expenditures', { token: aT })).json.reasons.length > 0);
  check('logistics CANNOT create expenditure (403)', (await call('POST', '/api/expenditures', { token: lT, body: { baseId: 2, equipmentTypeId: 1, quantity: 1, reason: 'Other', expendedDate: '2025-01-01' } })).status === 403);
  check('expenditure requires a reason', (await call('POST', '/api/expenditures', { token: aT, body: { baseId: 1, equipmentTypeId: 1, quantity: 1, expendedDate: '2025-01-01' } })).status === 400);

  const bBase1 = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  const x1 = await call('POST', '/api/expenditures', { token: aT, body: { baseId: 1, equipmentTypeId: 4, quantity: 1, personnelName: 'Smoke Tester', expendedDate: new Date().toISOString().slice(0, 10), reason: 'Damage / write-off', assignmentId: newA.json.assignment.id } });
  const aBase1 = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  check('POST /api/expenditures against assignment', x1.status === 201, x1.json);
  check('expenditure vs assignment does NOT double-deduct base stock', aBase1 === bBase1, { bBase1, aBase1 });
  check('cannot over-expend an assignment', (await call('POST', '/api/expenditures', { token: aT, body: { baseId: 1, equipmentTypeId: 4, quantity: 99, expendedDate: '2025-01-01', reason: 'Other', assignmentId: newA.json.assignment.id } })).status === 400);

  const bBase1b = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  const x2 = await call('POST', '/api/expenditures', { token: aT, body: { baseId: 1, equipmentTypeId: 4, quantity: 1, expendedDate: new Date().toISOString().slice(0, 10), reason: 'Damage / write-off' } });
  const aBase1b = (await call('GET', '/api/dashboard/summary?baseId=1', { token: aT })).json.summary.closingBalance;
  check('direct write-off DOES reduce base stock', x2.status === 201 && aBase1b === bBase1b - 1, { bBase1b, aBase1b, x2: x2.json });

  const ret = await call('POST', `/api/assignments/${newA.json.assignment.id}/return`, { token: aT, body: { returnedDate: new Date().toISOString().slice(0, 10) } });
  check('POST /api/assignments/:id/return returns only the remainder', ret.status === 200 && ret.json.assignment.returned === 3, ret.json);
  check('returning twice is rejected', (await call('POST', `/api/assignments/${newA.json.assignment.id}/return`, { token: aT, body: {} })).status === 400);

  section('Admin & audit');
  check('logistics cannot reach /api/admin/users (403)', (await call('GET', '/api/admin/users', { token: lT })).status === 403);
  check('commander cannot reach /api/admin/users (403)', (await call('GET', '/api/admin/users', { token: cT })).status === 403);
  const users = (await call('GET', '/api/admin/users', { token: aT })).json.users;
  check('GET /api/admin/users', users.length === 6, users.length);
  check('GET /api/admin/users never leaks password hashes', users.every((u) => !u.password_hash));

  const nu = await call('POST', '/api/admin/users', { token: aT, body: { name: 'Smoke User', email: 'smoke@mams.mil', password: 'Smoke123', role: 'logistics', baseId: 1 } });
  check('POST /api/admin/users', nu.status === 201, nu.json);
  check('duplicate email rejected', (await call('POST', '/api/admin/users', { token: aT, body: { name: 'X', email: 'smoke@mams.mil', password: 'Smoke123', role: 'logistics', baseId: 1 } })).status === 409);
  check('logistics user without a base rejected', (await call('POST', '/api/admin/users', { token: aT, body: { name: 'X', email: 'x@mams.mil', password: 'Smoke123', role: 'commander' } })).status === 400);
  check('PATCH /api/admin/users/:id', (await call('PATCH', `/api/admin/users/${nu.json.user.id}`, { token: aT, body: { role: 'commander', baseId: 3 } })).status === 200);
  check('admin cannot delete self', (await call('DELETE', `/api/admin/users/${admin.json.user.id}`, { token: aT })).status === 400);
  check('DELETE /api/admin/users/:id', (await call('DELETE', `/api/admin/users/${nu.json.user.id}`, { token: aT })).status === 200);

  const audit = (await call('GET', '/api/admin/audit?limit=1000', { token: aT })).json;
  check('GET /api/admin/audit returns rows', audit.logs.length > 0 && audit.total > 0, audit.total);
  check('audit captured LOGIN_SUCCESS', audit.logs.some((l) => l.action === 'LOGIN_SUCCESS'));
  check('audit captured ACCESS_DENIED', audit.logs.some((l) => l.action === 'ACCESS_DENIED'));
  check('audit captured business transactions', audit.logs.some((l) => l.action === 'PURCHASE_CREATED') && audit.logs.some((l) => l.action === 'TRANSFER_DISPATCHED'));
  check('audit filter by action', (await call('GET', '/api/admin/audit?action=LOGIN_SUCCESS&limit=10', { token: aT })).json.logs.every((l) => l.action === 'LOGIN_SUCCESS'));
  check('audit never stores passwords', !JSON.stringify(audit.logs).toLowerCase().includes('password123'));

  section('404 handling');
  check('unknown route returns JSON 404', (await call('GET', '/api/does-not-exist', { token: aT })).status === 404);

  console.log(`\n${'='.repeat(46)}\n  PASSED: ${pass}    FAILED: ${fail}\n${'='.repeat(46)}\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('smoke test crashed:', e); process.exit(1); });
