import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Purchases from './pages/Purchases';
import Transfers from './pages/Transfers';
import Assignments from './pages/Assignments';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import NotFound from './pages/NotFound';
import { Spinner } from './components/ui';

/** Blocks a route until the session is known, then checks the role. */
function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="page"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="page page-narrow">
        <div className="card">
          <div className="card-body">
            <div className="alert alert-error">
              <strong>Access denied.</strong> Your role ({user.role}) is not permitted to view this page.
            </div>
          </div>
        </div>
      </div>
    );
  }
  return children;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <div className="page"><Spinner /></div> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="purchases" element={<Purchases />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="assignments" element={<Assignments />} />
        <Route
          path="users"
          element={<Protected roles={['admin']}><Users /></Protected>}
        />
        <Route path="audit" element={<AuditLog />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
