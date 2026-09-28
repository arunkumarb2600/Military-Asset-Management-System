import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Alert, Badge, DateFilter, Empty, Modal, Spinner, dateTimeFmt, useToast } from '../components/ui';

const ACTION_TONE = {
  LOGIN_SUCCESS: 'in', LOGIN_FAILED: 'out', LOGIN_BLOCKED: 'out',
  ACCESS_DENIED: 'out', INVALID_TOKEN: 'out', UNAUTHENTICATED: 'out',
  API_ERROR: 'out', USER_CREATED: 'info', USER_UPDATED: 'info', USER_DELETED: 'out',
  PURCHASE_CREATED: 'in', TRANSFER_DISPATCHED: 'warn', TRANSFER_RECEIVED: 'in',
  TRANSFER_CANCELLED: 'out', ASSIGNMENT_CREATED: 'warn', ASSIGNMENT_RETURNED: 'in',
  EXPENDITURE_RECORDED: 'out'
};

const ENTITY_LABEL = {
  auth: 'Authentication', purchase: 'Purchase', transfer: 'Transfer',
  assignment: 'Assignment', expenditure: 'Expenditure', user: 'User',
  rbac: 'Access control', api: 'API', admin: 'Admin', system: 'System'
};

const ACTION_LABEL = (a) =>
  a.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function AuditLog() {
  const toast = useToast();
  const [filters, setFilters] = useState({ from: '', to: '', action: '', entity: '', q: '', limit: 200 });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState(null);

  const load = useCallback(async (f) => {
    setError('');
    try {
      setData(await api.audit(f));
    } catch (e) {
      setError(e.message);
      setData(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(filters), 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const logs = data?.logs || [];

  return (
    <>
      <div className="stack">
        <div className="filters">
          <DateFilter from={filters.from} to={filters.to} onChange={set} />

          <div className="field w-sel">
            <label htmlFor="a-action">Action</label>
            <select id="a-action" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
              <option value="">All actions</option>
              <optgroup label="Authentication">
                <option value="LOGIN">LOGIN…</option>
              </optgroup>
              <optgroup label="Transactions">
                <option value="PURCHASE_CREATED">Purchase created</option>
                <option value="TRANSFER_">Transfer…</option>
                <option value="ASSIGNMENT_">Assignment…</option>
                <option value="EXPENDITURE_">Expenditure…</option>
              </optgroup>
              <optgroup label="Security">
                <option value="ACCESS_DENIED">Access denied</option>
                <option value="INVALID_TOKEN">Invalid token</option>
                <option value="API_ERROR">API error</option>
              </optgroup>
              <optgroup label="Administration">
                <option value="USER_">User…</option>
              </optgroup>
            </select>
          </div>

          <div className="field w-sel">
            <label htmlFor="a-entity">Entity</label>
            <select id="a-entity" value={filters.entity} onChange={(e) => set({ entity: e.target.value })}>
              <option value="">All entities</option>
              {Object.entries(ENTITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div className="field w-q">
            <label htmlFor="a-q">Search</label>
            <input id="a-q" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="User, endpoint or payload…" />
          </div>

          <button className="btn" onClick={() => setFilters({ from: '', to: '', action: '', entity: '', q: '', limit: 200 })}>Reset</button>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="card">
          <div className="card-head">
            <h2>API transaction log</h2>
            <span className="hint spacer">
              {data ? `Showing ${logs.length} of ${num(data.total)} entries` : ''} · every mutating call and security event is recorded
            </span>
          </div>
          <div className="card-body tight">
            {!data ? <Spinner /> : logs.length === 0 ? (
              <Empty icon="☰" title="No log entries match this filter" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th><th>User</th><th>Role</th><th>Action</th>
                      <th>Entity</th><th>Request</th><th>Status</th><th>IP</th><th className="right">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((l) => (
                      <tr key={l.id}>
                        <td className="nowrap small mono">{dateTimeFmt(l.created_at)}</td>
                        <td className="small">{l.username || <span className="muted">anonymous</span>}</td>
                        <td className="small muted">{l.role || '—'}</td>
                        <td>
                          <Badge kind={ACTION_TONE[l.action] || ''}>{ACTION_LABEL(l.action)}</Badge>
                        </td>
                        <td className="small">{ENTITY_LABEL[l.entity] || l.entity}</td>
                        <td className="mono small muted nowrap">
                          {l.method ? `${l.method} ${l.endpoint}` : '—'}
                        </td>
                        <td>
                          <span className={`badge ${l.status_code >= 400 ? 'out' : 'in'}`}>{l.status_code}</span>
                        </td>
                        <td className="mono small muted">{l.ip_address || '—'}</td>
                        <td className="right">
                          <button className="btn btn-sm btn-ghost" onClick={() => setDetail(l)} disabled={!l.details}>
                            {l.details ? 'View' : '—'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {detail && (
        <Modal
          title="Log entry detail"
          onClose={() => setDetail(null)}
          footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}
        >
          <div className="stack" style={{ gap: 10 }}>
            <div><strong>Timestamp</strong><div className="mono small">{dateTimeFmt(detail.created_at)}</div></div>
            <div><strong>User</strong><div className="mono small">{detail.username || 'anonymous'} ({detail.role || 'no role'})</div></div>
            <div><strong>Action</strong><div className="mono small">{detail.action}</div></div>
            <div><strong>Entity</strong><div className="mono small">{detail.entity}{detail.entity_id ? ` #${detail.entity_id}` : ''}</div></div>
            <div><strong>Request</strong><div className="mono small">{detail.method} {detail.endpoint} → {detail.status_code}</div></div>
            <div><strong>IP address</strong><div className="mono small">{detail.ip_address || '—'}</div></div>
            <div>
              <strong>Payload</strong>
              <pre
                className="mono small"
                style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  borderRadius: 7, padding: 10, overflowX: 'auto', marginTop: 4
                }}
              >
                {(() => {
                  try { return JSON.stringify(JSON.parse(detail.details), null, 2); }
                  catch { return detail.details; }
                })()}
              </pre>
            </div>
            <Alert kind="info">Passwords, tokens and secrets are stripped before anything is written to the log.</Alert>
          </div>
        </Modal>
      )}
    </>
  );
}

const num = (n) => Number(n || 0).toLocaleString();
