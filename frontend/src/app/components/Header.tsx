import { useState, useEffect } from 'react';
import { Bell, ChevronDown, User, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  currentView: string;
  onLogout?: () => void;
  onNavigate?: (view: string) => void;
}

const viewLabels: Record<string, string> = {
  dashboard: 'Overview Dashboard',
  reception: 'Reception Desk',
  housekeeping: 'Housekeeping',
  kitchen: 'Kitchen Display System',
  maintenance: 'Maintenance',
  analytics: 'Analytics',
  settings: 'Settings',
};

export function Header({ currentView, onLogout, onNavigate }: HeaderProps) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<{ id: number; msg: string; time: Date }[]>([]);

  // Derive initials and display name from real user
  const displayName = user?.full_name ?? 'Hotel Staff';
  const role = user?.role ? (user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ')) : 'Staff';
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Listen to WebSocket events for notifications
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8005/ws/dashboard');
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event_type === 'dashboard_init') return;
        const labels: Record<string, string> = {
          check_in_completed: '🛎️ New check-in',
          room_vacated: '🚪 Room vacated',
          room_cleaned: '✨ Room cleaned',
          order_status_changed: '🍽️ Order update',
          maintenance_updated: '🔧 Maintenance update',
        };
        const label = labels[msg.event_type] || msg.event_type.replace(/_/g, ' ');
        const detail = msg.data?.room_number ? ` — Room ${msg.data.room_number}` : '';
        setNotifications(prev => [
          { id: Date.now(), msg: `${label}${detail}`, time: new Date() },
          ...prev,
        ].slice(0, 20));
      } catch { /* ignore */ }
    };
    ws.onerror = () => ws.close();
    return () => ws.close();
  }, []);

  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <header
      style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid #e2e8f0',
        padding: '0 24px',
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: 'Inter, sans-serif',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1e293b', margin: 0 }}>
          {viewLabels[currentView] || currentView}
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* Live Connection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10 }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              backgroundColor: '#22c55e', opacity: 0.6,
              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
            }} />
            <span style={{ position: 'relative', borderRadius: '50%', width: 10, height: 10, backgroundColor: '#22c55e' }} />
          </span>
          <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>Live Connection</span>
        </div>

        {/* Date & Time */}
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>{dateStr}</p>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</p>
        </div>

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => { setNotifOpen(v => !v); setProfileOpen(false); }}
            style={{
              position: 'relative', background: 'none', border: '1px solid #e2e8f0',
              borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', color: '#64748b',
            }}
          >
            <Bell size={15} />
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 5, minWidth: 8, height: 8,
                backgroundColor: '#ef4444', borderRadius: '50%', border: '1.5px solid #fff',
                fontSize: 8, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: notifications.length > 9 ? '0 3px' : 0,
              }}>
                {notifications.length > 0 ? '' : ''}
              </span>
            )}
          </button>

          {notifOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 44, backgroundColor: '#fff',
              border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              width: 300, maxHeight: 360, zIndex: 50, overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Notifications</span>
                {notifications.length > 0 && (
                  <button onClick={() => setNotifications([])} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer' }}>
                    Clear all
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                    No new notifications
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9', fontSize: 12, color: '#374151' }}>
                      <p style={{ margin: '0 0 2px' }}>{n.msg}</p>
                      <p style={{ margin: 0, fontSize: 10, color: '#94a3b8' }}>
                        {n.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '5px 10px', cursor: 'pointer',
            }}
          >
            <div style={{ width: 26, height: 26, borderRadius: '50%',
              backgroundColor: '#1e293b', display: 'flex', alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{initials}</span>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', margin: 0 }}>{displayName}</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{role}</p>
            </div>
            <ChevronDown size={13} style={{ color: '#94a3b8' }} />
          </button>

          {profileOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 44, backgroundColor: '#fff',
              border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
              minWidth: 180, zIndex: 50, overflow: 'hidden',
            }}>
              {[
                { icon: User, label: 'My Profile', action: () => onNavigate?.('settings') },
                { icon: LogOut, label: 'Sign Out', action: onLogout },
              ].map(({ icon: Icon, label, action }) => (
                <button
                  key={label}
                  onClick={() => { setProfileOpen(false); action?.(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%', padding: '9px 14px', background: 'none',
                    border: 'none', cursor: 'pointer', fontSize: 13, color: '#374151',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <Icon size={14} style={{ color: '#94a3b8' }} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </header>
  );
}
