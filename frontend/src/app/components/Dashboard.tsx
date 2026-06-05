import { BedDouble, Users, AlertTriangle, Wrench } from 'lucide-react';
import type { Room, RoomStatus } from './types';

interface DashboardProps {
  rooms: Room[];
  onRoomClick: (room: Room) => void;
}

const statusConfig: Record<RoomStatus, { label: string; color: string; bg: string; border: string }> = {
  available: { label: 'Clean / Available', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  occupied: { label: 'Occupied', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  dirty: { label: 'Needs Cleaning', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  maintenance: { label: 'Maintenance', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
};

const statusIcons: Record<RoomStatus, React.ComponentType<{ size?: number }>> = {
  available: BedDouble,
  occupied: Users,
  dirty: AlertTriangle,
  maintenance: Wrench,
};

function RoomCard({ room, onClick }: { room: Room; onClick: () => void }) {
  const cfg = statusConfig[room.status];
  const Icon = statusIcons[room.status];

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#fff',
        border: `1.5px solid ${cfg.border}`,
        borderRadius: 10,
        padding: '14px 16px',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: cfg.color, opacity: 0.7 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', letterSpacing: '-0.5px' }}>
          {room.number}
        </span>
        <div style={{
          width: 28, height: 28, borderRadius: 7, backgroundColor: cfg.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={14} />
        </div>
      </div>

      <div>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: '0 0 4px' }}>
          {room.guestName || 'Vacant'}
        </p>
        <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 8px' }}>{room.roomType}</p>
      </div>

      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 600, color: cfg.color,
        backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
        borderRadius: 20, padding: '2px 8px',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: cfg.color }} />
        {cfg.label}
      </span>
    </div>
  );
}

export function Dashboard({ rooms, onRoomClick }: DashboardProps) {
  const floor1 = rooms.filter(r => r.floor === 1);
  const floor2 = rooms.filter(r => r.floor === 2);

  const totalOccupied = rooms.filter(r => r.status === 'occupied').length;
  const totalAvailable = rooms.filter(r => r.status === 'available').length;
  const totalDirty = rooms.filter(r => r.status === 'dirty').length;
  const totalMaintenance = rooms.filter(r => r.status === 'maintenance').length;

  const stats = [
    { label: 'Occupied', value: totalOccupied, color: '#2563eb', bg: '#eff6ff', icon: Users },
    { label: 'Available', value: totalAvailable, color: '#16a34a', bg: '#f0fdf4', icon: BedDouble },
    { label: 'Needs Cleaning', value: totalDirty, color: '#d97706', bg: '#fffbeb', icon: AlertTriangle },
    { label: 'Maintenance', value: totalMaintenance, color: '#dc2626', bg: '#fef2f2', icon: Wrench },
  ];

  return (
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {stats.map(({ label, value, color, bg, icon: Icon }) => (
          <div key={label} style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 10, backgroundColor: bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={18} style={{ color }} />
            </div>
            <div>
              <p style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        {Object.entries(statusConfig).map(([key, cfg]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cfg.color }} />
            <span style={{ fontSize: 11, color: '#64748b' }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Floor 2 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase',
            letterSpacing: '0.08em', backgroundColor: '#f1f5f9', borderRadius: 6,
            padding: '3px 10px',
          }}>Floor 2</span>
          <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {floor2.map(room => (
            <RoomCard key={room.id} room={room} onClick={() => onRoomClick(room)} />
          ))}
        </div>
      </div>

      {/* Floor 1 */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#1e293b', textTransform: 'uppercase',
            letterSpacing: '0.08em', backgroundColor: '#f1f5f9', borderRadius: 6,
            padding: '3px 10px',
          }}>Floor 1</span>
          <div style={{ flex: 1, height: 1, backgroundColor: '#e2e8f0' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {floor1.map(room => (
            <RoomCard key={room.id} room={room} onClick={() => onRoomClick(room)} />
          ))}
        </div>
      </div>
    </div>
  );
}
