import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import {
  Alert, Empty, Field, Modal, Spinner, dateFmt, num, today, useToast
} from '../components/ui';

const BLANK = { baseId: '', equipmentTypeId: '', quantity: '', asOfDate: today(), remarks: '' };

/**
 * Opening balances - the stock a base already holds on the day you start
 * using the system. Everything else (purchases, transfers, assignments,
 * expenditures) is then added on top, and the dashboard adds it all up.
 *
 * Kept deliberately plain: three required choices, one number, one date.
 */
export default function OpeningBalances() {
  const { permissions, user } = useAuth();
  const { bases, equipmentTypes } = useReference();
  const toast = useToast();

  const [filters, setFilters] = useState({ baseId: '', equipmentTypeId: '', q: '' });
  const [rows, setRows] = useState(null);
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
      const res = await api.openingBalances(f);
      setRows(res.openingBalances);
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
      const res = await api.openingBalanceCreate({
        ...form,
        baseId: Number(form.baseId),
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

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const canWrite = permissions.manageAssignments;
  const totalUnits = (rows || []).reduce((a, r) => a + Number(r.quantity || 0), 0);

  return (
    <>
      <div className="stack">
        <Alert kind="info">
          <b>Start here.</b> Enter what each base already holds. Every other page adds on
          top of these figures, and the dashboard totals them for you.
        </Alert>

        <div className="filters">
          {!user?.baseId && (
            <div className="field w-sel">
              <label htmlFor="o-base">Base</label>
              <select id="o-base" value={filters.baseId} onChange={(e) => set({ baseId: e.target.value })}>
                <option value="">All bases</option>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          )}

          <div className="field w-sel">
            <label htmlFor="o-eq">Equipment type</label>
            <select id="o-eq" value={filters.equipmentTypeId} onChange={(e) => set({ equipmentTypeId: e.target.value })}>
              <option value="">All equipment</option>
              {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}
            </select>
          </div>

          <div className="field w-q">
            <label htmlFor="o-q">Search</label>
            <input id="o-q" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Equipment or base…" />
          </div>

          <button className="btn" onClick={() => setFilters({ baseId: '', equipmentTypeId: '', q: '' })}>Reset</button>

          {canWrite && (
            <button className="btn btn-primary" onClick={openNew} style={{ marginLeft: 'auto' }}>
              + Add opening stock
            </button>
          )}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {rows && rows.length > 0 && (
          <div className="kpi-grid">
            <div className="kpi">
              <div className="lbl">Items entered</div>
              <div className="val">{num(rows.length)}</div>
            </div>
            <div className="kpi k-main">
              <div className="lbl">Total units on record</div>
              <div className="val">{num(totalUnits)}</div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h2>Opening stock on record</h2>
            <span className="hint spacer">
              {user?.baseId ? `Scoped to ${user.base}` : 'All bases'}
            </span>
          </div>
          <div className="card-body tight">
            {loading && !rows ? <Spinner /> : !rows?.length ? (
              <Empty
                icon="📦"
                title="No opening stock entered yet"
                hint="Use “Add opening stock” to record what each base is already holding."
              />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>As of</th><th>Base</th><th>Equipment</th>
                      <th className="num">Opening qty</th>
                      <th className="num">In stock now</th>
                      <th>Remarks</th><th>Entered by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{dateFmt(r.as_of_date)}</td>
                        <td className="nowrap">
                          <span className="mono muted small">{r.baseCode}</span> {r.base}
                        </td>
                        <td>
                          <div className="strong">{r.equipment}</div>
                          <div className="small muted">{r.category}</div>
                        </td>
                        <td className="num strong">{num(r.quantity)}</td>
                        <td className="num muted">{num(r.currentBalance)}</td>
                        <td className="small">{r.remarks || '—'}</td>
                        <td className="small muted">{r.created_by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------ add opening ------------------------- */}
      {open && (
        <Modal
          title="Add opening stock"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="opening-form" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form id="opening-form" onSubmit={save}>
            {formError && <Alert kind="error">{formError}</Alert>}

            <div className="form-grid">
              <Field label="Base" required>
                <select
                  value={form.baseId}
                  onChange={(e) => setForm({ ...form, baseId: e.target.value })}
                  disabled={!!user?.baseId}
                  required
                >
                  <option value="">Choose a base…</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>

              <Field label="Equipment type" required>
                <select
                  value={form.equipmentTypeId}
                  onChange={(e) => setForm({ ...form, equipmentTypeId: e.target.value })}
                  required
                >
                  <option value="">Choose an item…</option>
                  {equipmentTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.category} — {t.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Quantity held" required hint="How many the base already has.">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="e.g. 340"
                  required
                />
              </Field>

              <Field label="As of date" required hint="The date this count is for.">
                <input
                  type="date"
                  value={form.asOfDate}
                  onChange={(e) => setForm({ ...form, asOfDate: e.target.value })}
                  required
                />
              </Field>

              <Field label="Remarks" span="full">
                <input
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="e.g. Physical stock take"
                />
              </Field>
            </div>

            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Entering the same item and date again adds to the total, so you can build up a
              figure in several small steps.
            </p>
          </form>
        </Modal>
      )}
    </>
  );
}
