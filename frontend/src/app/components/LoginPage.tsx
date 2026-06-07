import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Tizim administratori',
  reception: 'Qabulxona',
  housekeeping: 'Xona tozalash',
  room_service: 'Xona xizmati',
  maintenance: 'Texnik xizmat',
  guest: 'Mehmon',
};

const QUICK_LOGINS = [
  { label: 'Admin', username: 'admin@hotel.com', password: 'admin123' },
  { label: 'Qabulxona', username: 'reception@hotel.com', password: 'staff123' },
  { label: 'Tozalash', username: 'housekeeping@hotel.com', password: 'staff123' },
  { label: 'Xona xizmati', username: 'roomservice@hotel.com', password: 'staff123' },
  { label: 'Texnik xizmat', username: 'maintenance@hotel.com', password: 'staff123' },
];

export function LoginPage() {
  const { login, loading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!username.trim() || !password.trim()) {
      setLocalError('Iltimos, foydalanuvchi nomi va parolni kiriting.');
      return;
    }
    try {
      await login(username.trim(), password.trim());
    } catch {
    }
  };

  const quickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setLocalError(null);
    try {
      await login(u, p);
    } catch {
    }
  };

  const displayError = localError ?? error;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0f172a', fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: '0 20px' }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 14,
            backgroundColor: '#3b82f6', marginBottom: 14,
            fontSize: 26,
          }}>
            🏨
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px' }}>
            HotelOS
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            GrandStay Mehmonxona Boshqaruv Tizimi
          </p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: '#1e293b', borderRadius: 14,
          border: '1px solid #334155', padding: '28px 28px 24px',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc', margin: '0 0 22px' }}>
            Hisobingizga kiring
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Email yoki foydalanuvchi nomi
              </label>
              <input
                type="text"
                autoComplete="username"
                placeholder="masalan, admin@hotel.com"
                value={username}
                onChange={e => setUsername(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #334155', backgroundColor: '#0f172a',
                  color: '#f8fafc', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
                Parol
              </label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  border: '1px solid #334155', backgroundColor: '#0f172a',
                  color: '#f8fafc', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {displayError && (
              <div style={{
                backgroundColor: '#450a0a', border: '1px solid #7f1d1d',
                borderRadius: 8, padding: '10px 12px',
                fontSize: 13, color: '#fca5a5',
              }}>
                {displayError}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '11px', borderRadius: 8, border: 'none',
                backgroundColor: loading ? '#1d4ed8' : '#3b82f6',
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                marginTop: 4,
                opacity: loading ? 0.8 : 1,
              }}
            >
              {loading ? 'Kirilmoqda…' : 'Kirish'}
            </button>
          </form>
        </div>

        {/* Quick-login shortcuts (development / demo convenience) */}
        <div style={{ marginTop: 20 }}>
          <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginBottom: 10 }}>
            Tez kirish (demo)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {QUICK_LOGINS.map(({ label, username: u, password: p }) => (
              <button
                key={label}
                onClick={() => quickLogin(u, p)}
                disabled={loading}
                style={{
                  padding: '6px 13px', borderRadius: 20,
                  border: '1px solid #334155', backgroundColor: '#1e293b',
                  color: '#94a3b8', fontSize: 11, fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export { ROLE_LABELS };
