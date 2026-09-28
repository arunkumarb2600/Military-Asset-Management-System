import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  /** Pull the current user + permission map from the API. */
  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const { user: u } = await api.me();
      setUser(u);
      const { permissions: p } = await api.permissions();
      setPermissions(p);
      return u;
    } catch {
      setToken(null);
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // The api client fires this when a request comes back 401.
  useEffect(() => {
    const onUnauthorised = () => { setUser(null); setPermissions({}); };
    window.addEventListener('mams:unauthorised', onUnauthorised);
    return () => window.removeEventListener('mams:unauthorised', onUnauthorised);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api.login(email, password);
    setToken(token);
    setUser(u);
    const { permissions: p } = await api.permissions();
    setPermissions(p);
    return u;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setPermissions({});
  }, []);

  const value = useMemo(
    () => ({ user, permissions, loading, login, logout, refresh, isAdmin: user?.role === 'admin' }),
    [user, permissions, loading, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
