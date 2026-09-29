/**
 * Thin API client.  Adds the JWT to every call, normalises errors and
 * builds query strings.  One place to change if the API moves.
 */
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const TOKEN_KEY = 'mams.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Serialise an object into a query string, dropping empty values. */
export function qs(params = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 'all') p.append(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, body) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  let data = null;
  try { data = await res.json(); } catch { /* empty body is fine */ }

  if (res.status === 401 && getToken()) {
    // Session expired -> clear it so the router sends the user to /login
    setToken(null);
    window.dispatchEvent(new CustomEvent('mams:unauthorised'));
  }
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data;
}

export const api = {
  get:   (path)             => request('GET', path),
  post:  (path, body)       => request('POST', path, body),
  patch: (path, body)       => request('PATCH', path, body),
  del:   (path)             => request('DELETE', path),

  // ---- auth ----
  login: (email, password)  => request('POST', '/auth/login', { email, password }),
  me:    ()                 => request('GET', '/auth/me'),

  // ---- reference data ----
  bases:          ()        => request('GET', '/meta/bases'),
  equipmentTypes: ()        => request('GET', '/meta/equipment-types'),
  permissions:    ()        => request('GET', '/meta/permissions'),

  // ---- dashboard ----
  summary:       (f)        => request('GET', `/dashboard/summary${qs(f)}`),
  netMovement:   (f)        => request('GET', `/dashboard/net-movement${qs(f)}`),
  balances:      (f)        => request('GET', `/dashboard/balances${qs(f)}`),
  movements:     (f)        => request('GET', `/dashboard/movements${qs(f)}`),

  // ---- transactions ----
  purchases:     (f)        => request('GET', `/purchases${qs(f)}`),
  purchaseCreate:(b)        => request('POST', '/purchases', b),
  purchaseSummary:(f)       => request('GET', `/purchases/summary${qs(f)}`),

  openingBalances:   (f)        => request('GET', `/opening-balances${qs(f)}`),
  openingBalanceCreate:(b)      => request('POST', '/opening-balances', b),

  transfers:     (f)        => request('GET', `/transfers${qs(f)}`),
  transferCreate:(b)        => request('POST', '/transfers', b),
  transferReceive:(id,b)    => request('POST', `/transfers/${id}/receive`, b),
  transferCancel:(id,b)     => request('POST', `/transfers/${id}/cancel`, b),
  transferSummary:(f)       => request('GET', `/transfers/summary${qs(f)}`),

  assignments:     (f)      => request('GET', `/assignments${qs(f)}`),
  assignmentCreate:(b)      => request('POST', '/assignments', b),
  assignmentReturn:(id,b)   => request('POST', `/assignments/${id}/return`, b),
  assignmentSummary:(f)     => request('GET', `/assignments/summary${qs(f)}`),

  expenditures:     (f)    => request('GET', `/expenditures${qs(f)}`),
  expenditureCreate:(b)    => request('POST', '/expenditures', b),
  expenditureSummary:(f)   => request('GET', `/expenditures/summary${qs(f)}`),

  // ---- admin ----
  users:       ()           => request('GET', '/admin/users'),
  userCreate:  (b)          => request('POST', '/admin/users', b),
  userUpdate:  (id, b)      => request('PATCH', `/admin/users/${id}`, b),
  userDelete:  (id)         => request('DELETE', `/admin/users/${id}`),
  clearAllData: (confirm)   => request('POST', '/admin/clear-data', { confirm }),
  audit:       (f)          => request('GET', `/admin/audit${qs(f)}`)
};
