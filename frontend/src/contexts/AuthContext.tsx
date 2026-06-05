/**
 * AuthContext — JWT token management.
 * Token is kept in localStorage so the session survives page refresh.
 * Provides: user info, login(), logout(), loading state.
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { login as apiLogin, getMe, setToken, removeToken, getToken, type UserInfo } from '../lib/api';

interface AuthState {
  user: UserInfo | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true); // true while validating stored token
  const [error, setError] = useState<string | null>(null);

  // On mount: if a stored token exists, verify it against /auth/me
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => removeToken()) // token invalid/expired — clear it
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const resp = await apiLogin(username, password);
      setToken(resp.access_token);
      // Use the user payload returned by the login endpoint
      setUser(resp.user);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
