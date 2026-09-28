/** Small, dependency-free UI building blocks shared by every page. */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/* ----------------------------- toasts ------------------------------ */
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, type = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, message, type }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = {
    ok:   (m) => push(m, 'ok'),
    err:  (m) => push(m, 'err'),
    info: (m) => push(m, 'info')
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>{t.type === 'err' ? '⚠' : t.type === 'ok' ? '✓' : 'ℹ'}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const c = useContext(ToastContext);
  if (!c) throw new Error('useToast must be used inside <ToastProvider>');
  return c;
}

/* ----------------------------- modal ------------------------------- */
export function Modal({ title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="x-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------- primitives --------------------------- */
export const num = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : Number(n).toLocaleString());

export const dateFmt = (d) => {
  if (!d) return '—';
  const dt = new Date(d.length === 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const dateTimeFmt = (d) => {
  if (!d) return '—';
  const dt = new Date(d.includes('T') ? d : d.replace(' ', 'T'));
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

export function Empty({ icon = '📭', title, hint }) {
  return (
    <div className="empty">
      <span className="ico">{icon}</span>
      <div className="t">{title}</div>
      {hint && <div className="small">{hint}</div>}
    </div>
  );
}

export function Alert({ kind = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function Badge({ kind, children }) {
  return <span className={`badge${kind ? ' ' + kind : ''}`}>{children}</span>;
}

/* -------------------------- date filter ---------------------------- */
/** Reusable date-range picker with quick presets. */
export function DateFilter({ from, to, onChange }) {
  const set = (patch) => onChange({ ...{ from, to }, ...patch });
  const presets = [
    ['7d',  'Last 7 days',  6],
    ['30d', 'Last 30 days', 29],
    ['90d', 'Last 90 days', 89],
    ['all', 'All time',     null]
  ];
  return (
    <>
      <div className="field w-date">
        <label htmlFor="f-from">From</label>
        <input id="f-from" type="date" value={from || ''} onChange={(e) => set({ from: e.target.value })} />
      </div>
      <div className="field w-date">
        <label htmlFor="f-to">To</label>
        <input id="f-to" type="date" value={to || ''} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <div className="field w-sel">
        <label>Quick range</label>
        <select
          value=""
          onChange={(e) => {
            const p = presets.find((x) => x[0] === e.target.value);
            if (!p) return;
            onChange(p[2] === null ? { from: '', to: '' } : { from: daysAgo(p[2]), to: today() });
          }}
        >
          <option value="">Choose…</option>
          {presets.map((p) => <option key={p[0]} value={p[0]}>{p[1]}</option>)}
        </select>
      </div>
    </>
  );
}

/* --------------------------- form fields --------------------------- */
export function Field({ label, required, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}{required && <span className="req"> *</span>}</label>
      {children}
    </div>
  );
}
