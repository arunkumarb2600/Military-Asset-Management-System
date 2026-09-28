import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Field } from '../components/ui';

const DEMO = [
  ['Admin',            'admin@mams.mil',                 'Full access, all bases'],
  ['Base Commander',   'commander.kabul@mams.mil',       'Fort Kabul only'],
  ['Logistics Officer','logistics.kabul@mams.mil',       'Purchases & transfers only']
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function useDemo(demoEmail) {
    setEmail(demoEmail);
    setPassword('Password123');
    setError('');
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand-mark">MAMS</div>
        <h1>Military Asset Management</h1>
        <div className="tag">Sign in to your secure account</div>

        <form onSubmit={submit}>
          {error && <Alert kind="error">{error}</Alert>}

          <div className="stack" style={{ gap: 12 }}>
            <Field label="Email address" required>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@mams.mil"
                autoComplete="username"
                required
                autoFocus
              />
            </Field>
            <Field label="Password" required>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </Field>
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="demo-users">
          <div className="t">Demo accounts — click to fill</div>
          {DEMO.map(([role, mail, note]) => (
            <button key={mail} type="button" className="demo-btn" onClick={() => useDemo(mail)}>
              <b>{role}</b>
              <span>{note}</span>
            </button>
          ))}
          <div className="small muted" style={{ marginTop: 6 }}>
            Password for all demo accounts: <code>Password123</code>
          </div>
        </div>
      </div>
    </div>
  );
}
