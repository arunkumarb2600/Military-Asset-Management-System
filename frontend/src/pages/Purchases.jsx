import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import {
  Alert, DateFilter, Empty, Field, Modal, Spinner, dateFmt, num, today, useToast
} from '../components/ui';

const BLANK = {
  baseId: '', equipmentTypeId: '', quantity: '', unitCost: '',
  supplier: '', invoiceNo: '', purchaseDate: today(), remarks: ''
};

export default function Purchases() {
  const { permissions, user } = useAuth();
  const { bases, equipmentTypes } = useReference();
  const toast = useToast();

  const [filters, setFilters] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '', q: '' });
  const [rows, setRows] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK, baseId: user?.baseId || '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    try {
      const [list, sum] = await Promise.all([api.purchases(f), api.purchaseSummary(f)]);
      setRows(list.purchases);
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
    setForm({ ...BLANK, baseId: user?.baseId || bases[0]?.id || '' });
    setFormError('');
    setOpen(true);
  }

  async function save(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.purchaseCreate({
        ...form,
        baseId: Number(form.baseId),
        equipmentTypeId: Number(form.equipmentTypeId),
        quantity: Number(form.quantity),
        unitCost: form.unitCost === '' ? 0 : Number(form.unitCost)
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

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const canWrite = permissions.managePurchases;

  return (
    <>
      <div className="stack">
        <div className="filters">
          <DateFilter from={filters.from} to={filters.to} onChange={set} />

          {!user?.baseId && (
            <div className="field w-sel">
              <label htmlFor="p-base">Base</label>
              <select id="p-base" value={filters.baseId} onChange={(e) => set({ baseId: e.target.value })}>
                <option value="">All bases</option>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          )}

          <div className="field w-sel">
            <label htmlFor="p-eq">Equipment type</label>
            <select id="p-eq" value={filters.equipmentTypeId} onChange={(e) => set({ equipmentTypeId: e.target.value })}>
              <option value="">All equipment</option>
              {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}
            </select>
          </div>

          <div className="field w-q">
            <label htmlFor="p-q">Search</label>
            <input
              id="p-q"
              value={filters.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder="Invoice no, supplier, reference…"
            />
          </div>

          <button className="btn" onClick={() => setFilters({ from: '', to: '', baseId: '', equipmentTypeId: '', q: '' })}>Reset</button>

          {canWrite && (
            <button className="btn btn-primary" onClick={openNew} style={{ marginLeft: 'auto' }}>+ Record purchase</button>
          )}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {summary && (
          <div className="kpi-grid">
            <div className="kpi k-in">
              <div className="lbl">Purchase entries</div>
              <div className="val">{num(summary.count)}</div>
            </div>
            <div className="kpi k-main">
              <div className="lbl">Units procured</div>
              <div className="val">{num(summary.units)}</div>
            </div>
            <div className="kpi k-warn">
              <div className="lbl">Total value</div>
              <div className="val" style={{ fontSize: '1.3rem' }}>
                {Number(summary.value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Purchase history</h2>
            <span className="hint spacer">
              {user?.baseId ? `Scoped to ${user.base}` : 'All bases'} · {rows ? `${rows.length} record(s)` : ''}
            </span>
          </div>
          <div className="card-body tight">
            {loading && !rows ? <Spinner /> : !rows?.length ? (
              <Empty icon="🛒" title="No purchases found" hint="Try widening the date range or clearing the filters." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th><th>Date</th><th>Base</th><th>Equipment</th>
                      <th className="num">Qty</th><th className="num">Unit cost</th>
                      <th className="num">Total</th><th>Supplier</th><th>Invoice</th><th>Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.id}>
                        <td className="mono">{p.reference_no}</td>
                        <td className="nowrap">{dateFmt(p.purchase_date)}</td>
                        <td className="nowrap">
                          <span className="mono muted small">{p.baseCode}</span> {p.base}
                        </td>
                        <td>
                          <div className="strong">{p.equipment}</div>
                          <div className="small muted">{p.category}</div>
                        </td>
                        <td className="num strong">{num(p.quantity)}</td>
                        <td className="num muted">{Number(p.unit_cost).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                        <td className="num strong">{Number(p.total_cost).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}</td>
                        <td className="small">{p.supplier || '—'}</td>
                        <td className="mono small">{p.invoice_no || '—'}</td>
                        <td className="small muted">{p.created_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------- new purchase ------------------------- */}
      {open && (
        <Modal
          title="Record a purchase"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="purchase-form" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save purchase'}
              </button>
            </>
          }
        >
          <form id="purchase-form" onSubmit={save}>
            {formError && <Alert kind="error">{formError}</Alert>}

            <div className="form-grid">
              <Field label="Base" required>
                <select
                  value={form.baseId}
                  onChange={(e) => setForm({ ...form, baseId: e.target.value })}
                  disabled={!!user?.baseId}
                  required
                >
                  <option value="">Select a base…</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
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
                <input
                  type="number" min="1" step="1" value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 250" required
                />
              </Field>

              <Field label="Unit cost (USD)">
                <input
                  type="number" min="0" step="0.01" value={form.unitCost}
                  onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
                  placeholder="0.00"
                />
              </Field>

              <Field label="Supplier">
                <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier name" />
              </Field>

              <Field label="Invoice number">
                <input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} placeholder="INV-00000" />
              </Field>

              <Field label="Purchase date" required>
                <input type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} required />
              </Field>

              <Field label="Remarks" className="full">
                <textarea
                  rows={2} value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Optional notes…"
                />
              </Field>
            </div>

            <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
              Saving this purchase immediately increases the closing balance of the selected base and is written to the audit log.
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
