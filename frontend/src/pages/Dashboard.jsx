import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useReference } from '../components/ReferenceData';
import {
  Alert, Badge, DateFilter, Empty, Modal, Spinner, dateFmt, num, useToast
} from '../components/ui';

const TX_LABEL = {
  PURCHASE:    'Purchase',
  TRANSFER_IN: 'Transfer In',
  TRANSFER_OUT:'Transfer Out'
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { bases, equipmentTypes } = useReference();
  const toast = useToast();

  const [filters, setFilters] = useState({ from: '', to: '', baseId: '', equipmentTypeId: '' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drill, setDrill] = useState(null);      // net-movement pop-up payload
  const [drillBusy, setDrillBusy] = useState(false);

  const load = useCallback(async (f) => {
    setLoading(true);
    setError('');
    try {
      setData(await api.summary(f));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce so typing in the search-free date fields does not spam the API.
  useEffect(() => {
    const t = setTimeout(() => load(filters), 250);
    return () => clearTimeout(t);
  }, [filters, load]);

  /** Bonus feature: pop-up drill-down of the Net Movement figure. */
  async function openNetMovement() {
    setDrillBusy(true);
    setDrill({ loading: true });
    try {
      setDrill({ ...(await api.netMovement(filters)), loading: false });
    } catch (e) {
      toast.err(e.message);
      setDrill(null);
    } finally {
      setDrillBusy(false);
    }
  }

  const s = data?.summary;
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <>
      <div className="stack">
        {/* ---------------------- filters ---------------------- */}
        <div className="filters">
          <DateFilter from={filters.from} to={filters.to} onChange={set} />

          {isAdmin && (
            <div className="field w-sel">
              <label htmlFor="f-base">Base</label>
              <select id="f-base" value={filters.baseId} onChange={(e) => set({ baseId: e.target.value })}>
                <option value="">All bases</option>
                {bases.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          )}

          <div className="field w-sel">
            <label htmlFor="f-eq">Equipment type</label>
            <select id="f-eq" value={filters.equipmentTypeId} onChange={(e) => set({ equipmentTypeId: e.target.value })}>
              <option value="">All equipment</option>
              {equipmentTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.category} — {t.name}</option>
              ))}
            </select>
          </div>

          <button className="btn" onClick={() => setFilters({ from: '', to: '', baseId: '', equipmentTypeId: '' })}>
            Reset
          </button>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        {loading && !data ? (
          <Spinner />
        ) : s ? (
          <>
            <div className="formula-note">
              <strong>How the figures are built:</strong>{' '}
              <code>
                Closing = Opening + Purchases + Transfer In − Transfer Out − Assigned − Direct Write-offs
              </code>
              <br />
              <code>Net Movement = Purchases + Transfer In − Transfer Out</code>
              {' · '}
              <em>“Expended” is consumption booked against assignments, which happens off-base, so it is reported separately and is not part of the closing balance.</em>
            </div>

            {/* ---------------------- KPI cards ---------------------- */}
            <div className="kpi-grid">
              <div className="kpi k-main">
                <div className="lbl">Opening Balance</div>
                <div className="val">{num(s.openingBalance)}</div>
                <div className="sub">Stock held at period start</div>
              </div>

              <button
                className="kpi k-net clickable"
                onClick={openNetMovement}
                disabled={drillBusy}
                title="Click to see the purchases, transfer in and transfer out detail"
              >
                <div className="lbl">
                  Net Movement <span className="info">click for detail ▸</span>
                </div>
                <div className="val">
                  {s.netMovement > 0 ? '+' : ''}{num(s.netMovement)}
                </div>
                <div className="sub">
                  +{num(s.purchases)} purchased · +{num(s.transferIn)} in · −{num(s.transferOut)} out
                </div>
              </button>

              <div className="kpi k-in">
                <div className="lbl">Closing Balance</div>
                <div className="val">{num(s.closingBalance)}</div>
                <div className="sub">Stock held at period end</div>
              </div>

              <div className="kpi k-warn">
                <div className="lbl">Assigned</div>
                <div className="val">{num(s.assigned)}</div>
                <div className="sub">Issued to personnel</div>
              </div>

              <div className="kpi k-out">
                <div className="lbl">Expended</div>
                <div className="val">{num(s.expended)}</div>
                <div className="sub">Consumed / written off</div>
              </div>

              <div className="kpi k-in">
                <div className="lbl">Purchases</div>
                <div className="val">{num(s.purchases)}</div>
                <div className="sub">Procured into bases</div>
              </div>

              <div className="kpi k-in">
                <div className="lbl">Transfer In</div>
                <div className="val">{num(s.transferIn)}</div>
                <div className="sub">Received from other bases</div>
              </div>

              <div className="kpi k-out">
                <div className="lbl">Transfer Out</div>
                <div className="val">{num(s.transferOut)}</div>
                <div className="sub">Sent to other bases</div>
              </div>
            </div>

            {/* ---------------------- breakdown ---------------------- */}
            <div className="split">
              <div className="card">
                <div className="card-head">
                  <h2>Movement by equipment type</h2>
                  <span className="hint spacer">Opening → closing reconciliation</span>
                </div>
                <div className="card-body tight">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Equipment</th>
                          <th className="num">Opening</th>
                          <th className="num">Purch.</th>
                          <th className="num">T/In</th>
                          <th className="num">T/Out</th>
                          <th className="num">Net</th>
                          <th className="num">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byEquipment.map((r) => (
                          <tr key={r.equipmentTypeId}>
                            <td>
                              <div className="strong">{r.name}</div>
                              <div className="small muted">{r.category} · per {r.unit}</div>
                            </td>
                            <td className="num">{num(r.opening)}</td>
                            <td className="num" style={{ color: 'var(--in)' }}>+{num(r.purchases)}</td>
                            <td className="num" style={{ color: 'var(--in)' }}>+{num(r.transferIn)}</td>
                            <td className="num" style={{ color: 'var(--out)' }}>−{num(r.transferOut)}</td>
                            <td className="num strong" style={{ color: r.netMovement >= 0 ? 'var(--in)' : 'var(--out)' }}>
                              {r.netMovement > 0 ? '+' : ''}{num(r.netMovement)}
                            </td>
                            <td className="num strong">{num(r.closing)}</td>
                          </tr>
                        ))}
                        {data.byEquipment.length === 0 && (
                          <tr><td colSpan={7}><Empty icon="📊" title="No movement for this filter" /></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="stack">
                <div className="card">
                  <div className="card-head"><h2>Closing balance by base</h2></div>
                  <div className="card-body tight">
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr><th>Base</th><th className="num">Opening</th><th className="num">Closing</th></tr>
                        </thead>
                        <tbody>
                          {data.byBase.map((b) => (
                            <tr key={b.baseId}>
                              <td>
                                <span className="mono muted">{b.code}</span>{' '}
                                <span className="strong">{b.name}</span>
                              </td>
                              <td className="num muted">{num(b.opening)}</td>
                              <td className="num strong">{num(b.closing)}</td>
                            </tr>
                          ))}
                          {data.byBase.length === 0 && (
                            <tr><td colSpan={3}><Empty icon="🏛" title="No base data" /></td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <MovementHistory filters={filters} />
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* ---------------------- net movement pop-up ---------------------- */}
      {drill && (
        <Modal
          wide
          title="Net Movement — detail"
          onClose={() => setDrill(null)}
          footer={<button className="btn" onClick={() => setDrill(null)}>Close</button>}
        >
          {drill.loading ? (
            <Spinner />
          ) : (
            <>
              <div className="kpi-grid" style={{ marginBottom: 18 }}>
                <div className="kpi k-in">
                  <div className="lbl">Purchases (+)</div>
                  <div className="val">+{num(drill.summary.purchases)}</div>
                </div>
                <div className="kpi k-in">
                  <div className="lbl">Transfer In (+)</div>
                  <div className="val">+{num(drill.summary.transferIn)}</div>
                </div>
                <div className="kpi k-out">
                  <div className="lbl">Transfer Out (−)</div>
                  <div className="val">−{num(drill.summary.transferOut)}</div>
                </div>
                <div className="kpi k-net">
                  <div className="lbl">Net Movement</div>
                  <div className="val">
                    {drill.summary.netMovement > 0 ? '+' : ''}{num(drill.summary.netMovement)}
                  </div>
                </div>
              </div>

              {['PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT'].map((type) => {
                const rows = type === 'PURCHASE' ? drill.purchases
                  : type === 'TRANSFER_IN' ? drill.transferIn : drill.transferOut;
                const isOut = type === 'TRANSFER_OUT';
                return (
                  <div key={type} className="card" style={{ marginBottom: 14 }}>
                    <div className="card-head">
                      <h2>{TX_LABEL[type]}</h2>
                      <Badge kind={isOut ? 'out' : 'in'}>
                        {isOut ? '−' : '+'}{num(rows.reduce((a, r) => a + r.amount, 0))} units
                      </Badge>
                      <span className="hint spacer">{rows.length} entr{rows.length === 1 ? 'y' : 'ies'}</span>
                    </div>
                    <div className="card-body tight">
                      {rows.length === 0 ? (
                        <Empty icon="—" title={`No ${TX_LABEL[type].toLowerCase()} in this period`} />
                      ) : (
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th><th>Reference</th><th>Base</th>
                                <th>Equipment</th><th>Recorded by</th><th className="num">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r) => (
                                <tr key={r.id}>
                                  <td className="nowrap">{dateFmt(r.txn_date)}</td>
                                  <td className="mono">{r.ref_no || '—'}</td>
                                  <td>{r.base}</td>
                                  <td>
                                    {r.equipment}
                                    {r.remarks && <div className="small muted">{r.remarks}</div>}
                                  </td>
                                  <td className="small">{r.created_by_name}</td>
                                  <td className="num strong" style={{ color: isOut ? 'var(--out)' : 'var(--in)' }}>
                                    {isOut ? '−' : '+'}{num(r.amount)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </Modal>
      )}
    </>
  );
}

/* ------------------------- movement history ------------------------- */
function MovementHistory({ filters }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    api.movements({ ...filters, limit: 40 })
      .then((r) => alive && setRows(r.movements))
      .catch(() => alive && setRows([]));
    return () => { alive = false; };
  }, [filters]);

  const TONE = {
    OPENING: 'mute', PURCHASE: 'in', TRANSFER_IN: 'in',
    TRANSFER_OUT: 'out', ASSIGNMENT: 'warn', EXPENDITURE: 'out'
  };
  const NAME = {
    OPENING: 'Opening', PURCHASE: 'Purchase', TRANSFER_IN: 'Transfer In',
    TRANSFER_OUT: 'Transfer Out', ASSIGNMENT: 'Assigned', EXPENDITURE: 'Write-off'
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Recent movements</h2>
        <span className="hint spacer">Ledger with running balance</span>
      </div>
      <div className="card-body tight">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <Empty icon="🗂" title="No movements recorded" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Type</th><th>Base</th><th>Equipment</th><th className="num">Qty</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap small">{dateFmt(r.txn_date)}</td>
                    <td><Badge kind={TONE[r.tx_type]}>{NAME[r.tx_type] || r.tx_type}</Badge></td>
                    <td className="small">{r.base}</td>
                    <td className="small">{r.equipment}</td>
                    <td className="num" style={{ color: r.direction > 0 ? 'var(--in)' : 'var(--out)' }}>
                      {r.direction > 0 ? '+' : '−'}{num(r.qty)}
                    </td>
                    <td className="num strong">{num(r.balance_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
