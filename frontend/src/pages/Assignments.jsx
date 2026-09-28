import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import {
  Alert, DateFilter, Empty, Field, Modal, Spinner, dateFmt, num, today, useToast
} from '../components/ui';

const A_BLANK = {
  baseId: '', equipmentTypeId: '', quantity: '', personnelName: '',
  personnelId: '', personnelRank: '', assignedDate: today(), dueDate: '', remarks: ''
};
const X_BLANK = {
  baseId: '', equipmentTypeId: '', quantity: '', assignmentId: '',
  personnelName: '', reason: '', expendedDate: today(), remarks: ''
};

const A_STATUS = { active: 'info', returned: 'in', expended: 'out' };

export default function Assignments() {
  const { permissions, user } = useAuth();
  const { bases, equipmentTypes } = useReference();
  const toast = useToast();

  const [tab, setTab] = useState('assignments');
  const [filters, setFilters] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '', status: '', q: '' });

  const [aRows, setARows] = useState(null);
  const [aSum, setASum] = useState(null);
  const [xRows, setXRows] = useState(null);
  const [xSum, setXSum] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [modal, setModal] = useState(null);   // 'assign' | 'expend'
  const [aForm, setAForm] = useState({ ...A_BLANK, baseId: user?.baseId || '' });
  const [xForm, setXForm] = useState({ ...X_BLANK, baseId: user?.baseId || '', reason: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyRow, setBusyRow] = useState(null);

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    try {
      const [a, as, x, xs] = await Promise.all([
        api.assignments({ ...f, status: f.status || undefined }),
        api.assignmentSummary({ ...f, status: f.status || undefined }),
        api.expenditures({ ...f, status: undefined }),
        api.expenditureSummary({ ...f, status: undefined })
      ]);
      setARows(a.assignments);
      setASum(as.summary);
      setXRows(x.expenditures);
      if (x.reasons) setReasons(x.reasons);
      setXSum(xs.summary);
    } catch (e) {
      setError(e.message);
      setARows([]);
      setXRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(filters), 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  function openAssign() {
    setAForm({ ...A_BLANK, baseId: user?.baseId || '' });
    setFormError('');
    setModal('assign');
  }

  function openExpend() {
    setXForm({ ...X_BLANK, baseId: user?.baseId || '', reason: reasons[0] || '' });
    setFormError('');
    setModal('expend');
  }

  async function saveAssignment(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.assignmentCreate({
        ...aForm,
        baseId: Number(aForm.baseId),
        equipmentTypeId: Number(aForm.equipmentTypeId),
        quantity: Number(aForm.quantity),
        dueDate: aForm.dueDate || null
      });
      toast.ok(res.message);
      setModal(null);
      load(filters);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveExpenditure(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.expenditureCreate({
        ...xForm,
        baseId: Number(xForm.baseId),
        equipmentTypeId: Number(xForm.equipmentTypeId),
        quantity: Number(xForm.quantity),
        assignmentId: xForm.assignmentId || null,
        personnelName: xForm.personnelName || null
      });
      toast.ok(res.message);
      setModal(null);
      load(filters);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function returnAssignment(a) {
    setBusyRow(a.id);
    try {
      const res = await api.assignmentReturn(a.id, { returnedDate: today() });
      toast.ok(res.message);
      load(filters);
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusyRow(null);
    }
  }

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const canAssign = permissions.manageAssignments;
  const canExpend = permissions.manageExpenditures;

  // Open assignments for the current base, used to link an expenditure.
  const openAssignments = (aRows || []).filter((a) => a.status === 'active');

  return (
    <>
      <div className="stack">
        <div className="tabs">
          <button className={`tab${tab === 'assignments' ? ' active' : ''}`} onClick={() => setTab('assignments')}>
            Assignments {aRows ? `(${aRows.length})` : ''}
          </button>
          <button className={`tab${tab === 'expenditures' ? ' active' : ''}`} onClick={() => setTab('expenditures')}>
            Expenditures {xRows ? `(${xRows.length})` : ''}
          </button>
        </div>

        <div className="filters">
          <DateFilter from={filters.from} to={filters.to} onChange={set} />

          {!user?.baseId && (
            <div className="field w-sel">
              <label htmlFor="ae-base">Base</label>
              <select id="ae-base" value={filters.baseId} onChange={(e) => set({ baseId: e.target.value })}>
                <option value="">All bases</option>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          )}

          <div className="field w-sel">
            <label htmlFor="ae-eq">Equipment type</label>
            <select id="ae-eq" value={filters.equipmentTypeId} onChange={(e) => set({ equipmentTypeId: e.target.value })}>
              <option value="">All equipment</option>
              {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name}</option>)}
            </select>
          </div>

          {tab === 'assignments' && (
            <div className="field w-sel">
              <label htmlFor="ae-status">Status</label>
              <select id="ae-status" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="returned">Returned</option>
                <option value="expended">Expended</option>
              </select>
            </div>
          )}

          <div className="field w-q">
            <label htmlFor="ae-q">Search</label>
            <input id="ae-q" value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder="Personnel, service no, reference…" />
          </div>

          <button className="btn" onClick={() => setFilters({ from: '', to: '', baseId: '', equipmentTypeId: '', status: '', q: '' })}>Reset</button>

          <div className="row tight" style={{ marginLeft: 'auto' }}>
            {canAssign && <button className="btn btn-primary" onClick={openAssign}>+ New assignment</button>}
            {canExpend && <button className="btn btn-primary" onClick={openExpend}>+ Record expenditure</button>}
          </div>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {!permissions.manageAssignments && (
          <Alert kind="info">
            You have read-only access to this page. Assignments and expenditures are recorded by base commanders.
          </Alert>
        )}

        {/* ------------------------- ASSIGNMENTS ------------------------- */}
        {tab === 'assignments' && (
          <>
            {aSum && (
              <div className="kpi-grid">
                <div className="kpi k-main">
                  <div className="lbl">Assignments</div>
                  <div className="val">{num(aSum.count)}</div>
                </div>
                <div className="kpi k-warn">
                  <div className="lbl">Currently on issue</div>
                  <div className="val">{num(aSum.activeUnits)}</div>
                  <div className="sub">With personnel now</div>
                </div>
                <div className="kpi k-in">
                  <div className="lbl">Returned</div>
                  <div className="val">{num(aSum.returnedUnits)}</div>
                </div>
                <div className="kpi k-out">
                  <div className="lbl">Fully expended</div>
                  <div className="val">{num(aSum.expendedUnits)}</div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>Assignment history</h2>
                <span className="hint spacer">Who holds what, and for how long</span>
              </div>
              <div className="card-body tight">
                {loading && !aRows ? <Spinner /> : !aRows?.length ? (
                  <Empty icon="👤" title="No assignments found" hint="Adjust the filters to widen the search." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th><th>Assigned</th><th>Base</th><th>Equipment</th>
                          <th className="num">Qty</th><th>Personnel</th><th>Due</th><th>Status</th>
                          <th>Recorded by</th>{canAssign && <th className="right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {aRows.map((a) => (
                          <tr key={a.id}>
                            <td className="mono">{a.reference_no}</td>
                            <td className="nowrap">{dateFmt(a.assigned_date)}</td>
                            <td className="nowrap"><span className="mono muted small">{a.baseCode}</span> {a.base}</td>
                            <td>
                              <div className="strong">{a.equipment}</div>
                              <div className="small muted">
                                {a.expended_qty > 0 ? `${num(a.expended_qty)} of ${num(a.quantity)} ${a.unit} expended` : a.category}
                              </div>
                            </td>
                            <td className="num strong">{num(a.quantity)}</td>
                            <td>
                              <div className="strong">{a.personnel_name}</div>
                              <div className="small muted">{a.personnel_rank}{a.personnel_id ? ` · ${a.personnel_id}` : ''}</div>
                            </td>
                            <td className="nowrap small">{a.due_date ? dateFmt(a.due_date) : '—'}</td>
                            <td><span className={`badge ${A_STATUS[a.status] || ''}`}>{a.status}</span></td>
                            <td className="small muted">{a.created_by_name}</td>
                            {canAssign && (
                              <td className="right nowrap">
                                {a.status === 'active' ? (
                                  <button className="btn btn-sm" disabled={busyRow === a.id} onClick={() => returnAssignment(a)}>
                                    Return
                                  </button>
                                ) : <span className="muted small">—</span>}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ------------------------ EXPENDITURES ------------------------ */}
        {tab === 'expenditures' && (
          <>
            {xSum && (
              <div className="kpi-grid">
                <div className="kpi k-out">
                  <div className="lbl">Expenditure entries</div>
                  <div className="val">{num(xSum.count)}</div>
                </div>
                <div className="kpi k-out">
                  <div className="lbl">Units expended</div>
                  <div className="val">{num(xSum.units)}</div>
                </div>
                {xSum.byReason?.slice(0, 3).map((r) => (
                  <div className="kpi k-warn" key={r.reason}>
                    <div className="lbl">{r.reason}</div>
                    <div className="val">{num(r.units)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="card">
              <div className="card-head">
                <h2>Expenditure history</h2>
                <span className="hint spacer">Consumption and write-offs</span>
              </div>
              <div className="card-body tight">
                {loading && !xRows ? <Spinner /> : !xRows?.length ? (
                  <Empty icon="🧾" title="No expenditures found" hint="Adjust the filters to widen the search." />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th><th>Date</th><th>Base</th><th>Equipment</th>
                          <th className="num">Qty</th><th>Reason</th><th>Personnel</th>
                          <th>Assignment</th><th>Recorded by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {xRows.map((x) => (
                          <tr key={x.id}>
                            <td className="mono">{x.reference_no}</td>
                            <td className="nowrap">{dateFmt(x.expended_date)}</td>
                            <td className="nowrap"><span className="mono muted small">{x.baseCode}</span> {x.base}</td>
                            <td>
                              <div className="strong">{x.equipment}</div>
                              <div className="small muted">{x.category}</div>
                            </td>
                            <td className="num strong" style={{ color: 'var(--out)' }}>{num(x.quantity)}</td>
                            <td>
                              <div className="small strong">{x.reason}</div>
                              {x.remarks && <div className="small muted">{x.remarks}</div>}
                            </td>
                            <td className="small">{x.personnel_name || x.assigned_to || '—'}</td>
                            <td className="mono small">{x.assignment_ref || <span className="muted">direct write-off</span>}</td>
                            <td className="small muted">{x.created_by_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ------------------------- new assignment ------------------------- */}
      {modal === 'assign' && (
        <Modal
          title="Assign assets to personnel"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="assign-form" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save assignment'}
              </button>
            </>
          }
        >
          <form id="assign-form" onSubmit={saveAssignment}>
            {formError && <Alert kind="error">{formError}</Alert>}
            <div className="form-grid">
              <Field label="Base" required>
                <select value={aForm.baseId} onChange={(e) => setAForm({ ...aForm, baseId: e.target.value })} disabled={!!user?.baseId} required>
                  <option value="">Select a base…</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>
              <Field label="Equipment type" required>
                <select value={aForm.equipmentTypeId} onChange={(e) => setAForm({ ...aForm, equipmentTypeId: e.target.value })} required>
                  <option value="">Select equipment…</option>
                  {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name} ({t.unit})</option>)}
                </select>
              </Field>
              <Field label="Quantity" required>
                <input type="number" min="1" step="1" value={aForm.quantity} onChange={(e) => setAForm({ ...aForm, quantity: e.target.value })} required />
              </Field>
              <Field label="Assigned date" required>
                <input type="date" value={aForm.assignedDate} onChange={(e) => setAForm({ ...aForm, assignedDate: e.target.value })} required />
              </Field>
              <Field label="Personnel name" required>
                <input value={aForm.personnelName} onChange={(e) => setAForm({ ...aForm, personnelName: e.target.value })} placeholder="e.g. Sgt. Imran Shah" required />
              </Field>
              <Field label="Rank">
                <input value={aForm.personnelRank} onChange={(e) => setAForm({ ...aForm, personnelRank: e.target.value })} placeholder="e.g. Sergeant" />
              </Field>
              <Field label="Service number">
                <input value={aForm.personnelId} onChange={(e) => setAForm({ ...aForm, personnelId: e.target.value })} placeholder="e.g. AF-10293" />
              </Field>
              <Field label="Return due date">
                <input type="date" value={aForm.dueDate} onChange={(e) => setAForm({ ...aForm, dueDate: e.target.value })} />
              </Field>
              <Field label="Remarks" className="full">
                <textarea rows={2} value={aForm.remarks} onChange={(e) => setAForm({ ...aForm, remarks: e.target.value })} />
              </Field>
            </div>
            <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
              Assigning removes the quantity from the base closing balance. It is checked against current stock, so you cannot
              issue more than the base holds.
            </div>
          </form>
        </Modal>
      )}

      {/* ------------------------- new expenditure ------------------------ */}
      {modal === 'expend' && (
        <Modal
          title="Record an expenditure"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="exp-form" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save expenditure'}
              </button>
            </>
          }
        >
          <form id="exp-form" onSubmit={saveExpenditure}>
            {formError && <Alert kind="error">{formError}</Alert>}
            <div className="form-grid">
              <Field label="Base" required>
                <select value={xForm.baseId} onChange={(e) => setXForm({ ...xForm, baseId: e.target.value, assignmentId: '' })} disabled={!!user?.baseId} required>
                  <option value="">Select a base…</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>

              <Field label="Link to assignment" className="full">
                <select
                  value={xForm.assignmentId}
                  onChange={(e) => {
                    const a = openAssignments.find((x) => String(x.id) === e.target.value);
                    setXForm({
                      ...xForm,
                      assignmentId: e.target.value,
                      equipmentTypeId: a ? a.equipment_type_id : xForm.equipmentTypeId,
                      baseId: a ? a.base_id : xForm.baseId,
                      personnelName: a ? a.personnel_name : xForm.personnelName
                    });
                  }}
                >
                  <option value="">— Direct write-off of base-held stock —</option>
                  {openAssignments
                    .filter((a) => String(a.base_id) === String(xForm.baseId))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.reference_no} · {a.equipment} · {a.quantity - a.expended_qty} left · {a.personnel_name}
                      </option>
                    ))}
                </select>
              </Field>

              <Field label="Equipment type" required>
                <select
                  value={xForm.equipmentTypeId}
                  onChange={(e) => setXForm({ ...xForm, equipmentTypeId: e.target.value })}
                  disabled={!!xForm.assignmentId}
                  required
                >
                  <option value="">Select equipment…</option>
                  {equipmentTypes.map((t) => <option key={t.id} value={t.id}>{t.category} — {t.name} ({t.unit})</option>)}
                </select>
              </Field>

              <Field label="Quantity" required>
                <input type="number" min="1" step="1" value={xForm.quantity} onChange={(e) => setXForm({ ...xForm, quantity: e.target.value })} required />
              </Field>

              <Field label="Reason" required>
                <select value={xForm.reason} onChange={(e) => setXForm({ ...xForm, reason: e.target.value })} required>
                  <option value="">Select a reason…</option>
                  {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>

              <Field label="Expended date" required>
                <input type="date" value={xForm.expendedDate} onChange={(e) => setXForm({ ...xForm, expendedDate: e.target.value })} required />
              </Field>

              <Field label="Personnel" className="full">
                <input value={xForm.personnelName} onChange={(e) => setXForm({ ...xForm, personnelName: e.target.value })} placeholder="Name on the assignment" />
              </Field>

              <Field label="Remarks" className="full">
                <textarea rows={2} value={xForm.remarks} onChange={(e) => setXForm({ ...xForm, remarks: e.target.value })} />
              </Field>
            </div>

            <div className="alert alert-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              {xForm.assignmentId
                ? 'Linked to an assignment: the stock already left the base when it was issued, so this records consumption only.'
                : 'Direct write-off: the stock is still on the base books, so this reduces the base closing balance.'}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
