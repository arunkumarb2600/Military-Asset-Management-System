import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import {
  Alert, DateFilter, Empty, Field, Modal, Spinner, dateFmt, num, today, useToast
} from '../components/ui';

const BLANK = {
  fromBaseId: '', toBaseId: '', equipmentTypeId: '',
  quantity: '', transferDate: today(), remarks: ''
};

const STATUS = {
  dispatched: { kind: 'warn',  label: 'In transit' },
  received:   { kind: 'in',    label: 'Received' },
  cancelled:  { kind: 'mute',  label: 'Cancelled' }
};

export default function Transfers() {
  const { permissions, user } = useAuth();
  const { bases, equipmentTypes } = useReference();
  const toast = useToast();

  const [filters, setFilters] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '', status: '', q: '' });
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState(null);

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    try {
      const [list, sum] = await Promise.all([api.transfers(f), api.transferSummary(f)]);
      setRows(list.transfers);
      setSummary(sum.summary);
    } catch (e) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(filters), 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  function openNew() {
    setForm({ ...BLANK, fromBaseId: user?.baseId || '' });
    setFormError('');
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.transferCreate({
        ...form,
        fromBaseId: Number(form.fromBaseId),
        toBaseId: Number(form.toBaseId),
        equipmentTypeId: Number(form.equipmentTypeId),
        quantity: Number(form.quantity)
      });
      toast.ok(res.message);
      setOpen(false);
      load(filters);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function receive(t) {
    setBusyRow(t.id);
    try {
      const res = await api.transferReceive(t.id, { receivedDate: today() });
      toast.ok(res.message);
      load(filters);
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusyRow(null);
    }
  }

  async function cancel(t) {
    const reason = window.prompt(`Cancel transfer ${t.reference_no}?\nStock in transit will be returned to ${t.from_base}.\n\nReason (optional):`);
    if (reason === null) return;
    setBusyRow(t.id);
    try {
      const res = await api.transferCancel(t.id, { reason });
      toast.ok(res.message);
      load(filters);
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusyRow(null);
    }
  }

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const canWrite = permissions.manageTransfers;

  return (
    <>
      <div className="stack">
        <div className="filters">
          <DateFilter from={filters.from} to={filters.to} onChange={set} />

          {!user?.baseId && (
            <div className="field w-sel">
              <label htmlFor="t-base">Base</label>
              <select id="t-base" value={filters.baseId} onChange={(e) => set({ baseId: e.target.value })}>
                <option value="">All bases</option>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          )}

          <div className="field w-sel">
            <label htmlFor="t-eq">Equipment type</label>
            <select id="t-eq" value={filters.equipmentTypeId} onChange={(e) => set({ equipmentTypeId: e.target.value })}>
              <option value="">All equipment</option>
              {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}
            </select>
          </div>

          <div className="field w-sel">
            <label htmlFor="t-status">Status</label>
            <select id="t-status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">All statuses</option>
              <option value="dispatched">In transit</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="field w-q">
            <label htmlFor="t-q">Search</label>
            <input id="t-q" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Reference or remarks…" />
          </div>

          <button className="btn" onClick={() => setFilters({ from: '', to: '', baseId: '', equipmentTypeId: '', status: '', q: '' })}>Reset</button>

          {canWrite && (
            <button className="btn btn-primary" onClick={openNew} style={{ marginLeft: 'auto' }}>+ New transfer</button>
          )}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {summary && (
          <div className="kpi-grid">
            <div className="kpi k-main">
              <div className="lbl">Transfer records</div>
              <div className="val">{num(summary.count)}</div>
            </div>
            <div className="kpi k-warn">
              <div className="lbl">In transit</div>
              <div className="val">{num(summary.inTransitUnits)}</div>
              <div className="sub">Left the sender, not yet received</div>
            </div>
            <div className="kpi k-in">
              <div className="lbl">Received</div>
              <div className="val">{num(summary.receivedUnits)}</div>
            </div>
            <div className="kpi k-out">
              <div className="lbl">Cancelled</div>
              <div className="val">{num(summary.cancelledUnits)}</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Transfer history</h2>
            <span className="hint spacer">
              Stock leaves the sender on dispatch and arrives on receipt
            </span>
          </div>
          <div className="card-body tight">
            {loading && !rows ? <Spinner /> : !rows?.length ? (
              <Empty icon="⇄" title="No transfers found" hint="Adjust the filters or record a new transfer." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th><th>Dispatched</th><th>Route</th><th>Equipment</th>
                      <th className="num">Qty</th><th>Status</th><th>Received</th>
                      <th>Recorded by</th>{canWrite && <th className="right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => {
                      const st = STATUS[t.status] || { kind: '', label: t.status };
                      return (
                        <tr key={t.id}>
                          <td className="mono">{t.reference_no}</td>
                          <td className="nowrap">{dateFmt(t.transfer_date)}</td>
                          <td className="nowrap">
                            <strong>{t.from_base}</strong>
                            <span className="muted"> → </span>
                            <strong>{t.to_base}</strong>
                          </td>
                          <td>
                            <div className="strong">{t.equipment}</div>
                            <div className="small muted">{t.category}</div>
                          </td>
                          <td className="num strong">{num(t.quantity)}</td>
                          <td><span className={`badge ${st.kind}`}>{st.label}</span></td>
                          <td className="nowrap">{t.received_date ? dateFmt(t.received_date) : <span className="muted">—</span>}</td>
                          <td className="small muted">{t.created_by_name}</td>
                          {canWrite && (
                            <td className="right nowrap">
                              {t.status === 'dispatched' ? (
                                <div className="row tight" style={{ justifyContent: 'flex-end' }}>
                                  <button className="btn btn-sm" disabled={busyRow === t.id} onClick={() => receive(t)}>
                                    Receive
                                  </button>
                                  <button className="btn btn-sm btn-ghost" disabled={busyRow === t.id} onClick={() => cancel(t)}>
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <span className="muted small">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------- new transfer -------------------------- */}
      {open && (
        <Modal
          title="Transfer assets between bases"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="transfer-form" type="submit" disabled={saving}>
                {saving ? 'Dispatching…' : 'Dispatch transfer'}
              </button>
            </>
          }
        >
          <form id="transfer-form" onSubmit={save}>
            {formError && <Alert kind="error">{formError}</Alert>}

            <div className="form-grid">
              <Field label="From base" required>
                <select
                  value={form.fromBaseId}
                  onChange={(e) => setForm({ ...form, fromBaseId: e.target.value })}
                  disabled={!!user?.baseId}
                  required
                >
                  <option value="">Select…</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>

              <Field label="To base" required>
                <select value={form.toBaseId} onChange={(e) => setForm({ ...form, toBaseId: e.target.value })} required>
                  <option value="">Select…</option>
                  {bases
                    .filter((b) => String(b.id) !== String(form.fromBaseId))
                    .map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>

              <Field label="Equipment type" required>
                <select
                  value={form.equipmentTypeId}
                  onChange={(e) => setForm({ ...form, equipmentTypeId: e.target.value })}
                  required
                >
                  <option value="">Select equipment…</option>
                  {equipmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.category} — {t.name} ({t.unit})</option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity" required>
                <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
              </Field>

              <Field label="Transfer date" required>
                <input type="date" value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} required />
              </Field>

              <Field label="Remarks" className="full">
                <textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="Convoy, reason for movement…" />
              </Field>
            </div>

            <div className="alert alert-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              <strong>Two-step movement.</strong> Stock leaves the sending base immediately. It only appears in the receiving
              base&rsquo;s balance when the receiving base confirms receipt — so nothing is double counted while in transit.
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
