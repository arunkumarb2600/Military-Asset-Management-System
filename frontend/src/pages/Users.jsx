import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import { Alert, Badge, Empty, Field, Modal, Spinner, dateTimeFmt, useToast } from '../components/ui';

const BLANK = { name: '', email: '', password: '', role: 'logistics', baseId: '', rank: '' };
const ROLE_INFO = {
  admin:     { kind: 'out',  note: 'Full access to every base and operation' },
  commander: { kind: 'in',   note: 'Own base only: purchases, transfers, assignments, expenditures' },
  logistics: { kind: 'info', note: 'Own base only: purchases and transfers' }
};

export default function Users() {
  const { bases } = useReference();
  const { user: me } = useAuth();
  const toast = useToast();

  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setRows((await api.users()).users);
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const res = await api.userCreate({ ...form, baseId: form.baseId || null });
      toast.ok(res.message);
      setOpen(false);
      setForm(BLANK);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patch(u, body) {
    setBusy(u.id);
    try {
      const res = await api.userUpdate(u.id, body);
      toast.ok(res.message);
      load();
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(u) {
    if (!window.confirm(`Delete user ${u.email}? This cannot be undone.`)) return;
    setBusy(u.id);
    try {
      const res = await api.userDelete(u.id);
      toast.ok(res.message);
      load();
    } catch (err) {
      toast.err(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="stack">
        <div className="filters">
          <div className="field grow">
            <label>Access control</label>
            <div className="small muted" style={{ paddingTop: 4 }}>
              Admins manage every base. Commanders and logistics officers are locked to the base assigned to their account.
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm(BLANK); setFormError(''); setOpen(true); }}>+ Add user</button>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="card">
          <div className="card-head">
            <h2>Users</h2>
            <span className="hint spacer">{rows ? `${rows.length} account(s)` : ''}</span>
          </div>
          <div className="card-body tight">
            {!rows ? <Spinner /> : rows.length === 0 ? (
              <Empty icon="👥" title="No users" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Role</th><th>Base</th><th>Rank</th>
                      <th>Status</th><th>Created</th><th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((u) => {
                      const info = ROLE_INFO[u.role] || {};
                      return (
                        <tr key={u.id}>
                          <td className="strong">
                            {u.name}
                            {u.id === me?.id && <span className="badge role" style={{ marginLeft: 6 }}>you</span>}
                          </td>
                          <td className="mono small">{u.email}</td>
                          <td>
                            <Badge kind={info.kind}>{u.role}</Badge>
                            <div className="small muted">{info.note}</div>
                          </td>
                          <td className="nowrap">{u.base_name || <span className="muted">All bases</span>}</td>
                          <td className="small">{u.rank || '—'}</td>
                          <td>
                            <span className={`badge ${u.active ? 'in' : 'out'}`}>{u.active ? 'active' : 'disabled'}</span>
                          </td>
                          <td className="small muted nowrap">{dateTimeFmt(u.created_at)}</td>
                          <td className="right nowrap">
                            <div className="row tight" style={{ justifyContent: 'flex-end' }}>
                              <select
                                value={u.role}
                                disabled={busy === u.id || u.id === me?.id}
                                onChange={(e) => patch(u, { role: e.target.value })}
                                style={{ width: 120 }}
                                title="Change role"
                              >
                                <option value="admin">admin</option>
                                <option value="commander">commander</option>
                                <option value="logistics">logistics</option>
                              </select>
                              {u.id !== me?.id && (
                                <>
                                  <button className="btn btn-sm" disabled={busy === u.id} onClick={() => patch(u, { active: !u.active })}>
                                    {u.active ? 'Disable' : 'Enable'}
                                  </button>
                                  <button className="btn btn-sm btn-danger" disabled={busy === u.id} onClick={() => remove(u)}>Delete</button>
                                </>
                              )}
                            </div>
                          </td>
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

      {open && (
        <Modal
          title="Add a user"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" form="user-form" type="submit" disabled={saving}>
                {saving ? 'Creating…' : 'Create user'}
              </button>
            </>
          }
        >
          <form id="user-form" onSubmit={save}>
            {formError && <Alert kind="error">{formError}</Alert>}
            <div className="form-grid">
              <Field label="Full name" required className="full">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Email" required className="full">
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </Field>
              <Field label="Password" required>
                <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
              </Field>
              <Field label="Rank">
                <input value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} placeholder="e.g. Captain" />
              </Field>
              <Field label="Role" required>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="logistics">Logistics Officer</option>
                  <option value="commander">Base Commander</option>
                  <option value="admin">Administrator</option>
                </select>
              </Field>
              <Field label="Base" required={form.role !== 'admin'}>
                <select
                  value={form.baseId}
                  onChange={(e) => setForm({ ...form, baseId: e.target.value })}
                  disabled={form.role === 'admin'}
                >
                  <option value="">{form.role === 'admin' ? 'All bases' : 'Select a base…'}</option>
                  {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="alert alert-info" style={{ marginTop: 12, marginBottom: 0 }}>
              {ROLE_INFO[form.role]?.note}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
