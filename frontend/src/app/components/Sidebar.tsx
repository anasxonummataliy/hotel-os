import {
  Home, BedDouble, Sparkles, UtensilsCrossed, Wrench, BarChart3, Settings, ChevronRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ActiveView } from './types';

interface SidebarProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
}

const navItems: { id: ActiveView; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; roles: string[] }[] = [
  { id: 'dashboard', label: 'Bosh sahifa', icon: Home, roles: ['admin', 'reception', 'housekeeping', 'room_service', 'maintenance'] },
  { id: 'reception', label: 'Qabulxona', icon: BedDouble, roles: ['admin', 'reception'] },
  { id: 'housekeeping', label: 'Tozalash', icon: Sparkles, roles: ['admin', 'housekeeping'] },
  { id: 'kitchen', label: 'Xona xizmati', icon: UtensilsCrossed, roles: ['admin', 'room_service', 'reception'] },
  { id: 'maintenance', label: 'Texnik xizmat', icon: Wrench, roles: ['admin', 'maintenance'] },
  { id: 'analytics', label: 'Statistika', icon: BarChart3, roles: ['admin', 'reception'] },
  { id: 'settings', label: 'Sozlamalar', icon: Settings, roles: ['admin'] },
];

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const { user } = useAuth();
  const userRole = user?.role ?? 'reception';

  // Filter nav items by user role
  const visibleItems = navItems.filter(item => item.roles.includes(userRole));
  return (
    <aside
      style={{ backgroundColor: '#1e293b', fontFamily: 'Inter, sans-serif', width: 220, minWidth: 220 }}
      className="flex flex-col h-full"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div
          style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', borderRadius: 8, width: 34, height: 34 }}
          className="flex items-center justify-center flex-shrink-0"
        >
          <span style={{ color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: '-0.5px' }}>H</span>
        </div>
        <div>
          <span style={{ color: '#f8fafc', fontSize: 15, fontWeight: 700, letterSpacing: '-0.3px' }}>HotelOS</span>
          <p style={{ color: '#94a3b8', fontSize: 10, marginTop: 1 }}>Boshqaruv tizimi</p>
        </div>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3 py-4" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                backgroundColor: isActive ? 'rgba(59,130,246,0.2)' : 'transparent',
                color: isActive ? '#93c5fd' : '#94a3b8',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                transition: 'all 0.15s ease',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.06)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#e2e8f0';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
                }
              }}
            >
              {isActive && (
                <span style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 20, backgroundColor: '#3b82f6', borderRadius: '0 3px 3px 0'
                }} />
              )}
              <Icon size={16} className="" />
              <span style={{ flex: 1 }}>{label}</span>
              {isActive && <ChevronRight size={13} style={{ opacity: 0.5 }} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ color: '#475569', fontSize: 11, textAlign: 'center' }}>v2.4.1 · GrandStay Mehmonxonasi</p>
      </div>
    </aside>
  );
}
