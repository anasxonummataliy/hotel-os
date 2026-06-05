import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, BedDouble, Users, Wrench } from 'lucide-react';
import type { Room } from './types';

interface AnalyticsProps {
  rooms?: Room[];
}

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];

function KpiCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string; bg: string;
}) {
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} />
        </div>
      </div>
      <p style={{ fontSize: 26, fontWeight: 700, color: '#1e293b', margin: '0 0 3px', lineHeight: 1 }}>{value}</p>
      <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{sub}</p>
    </div>
  );
}

export function Analytics({ rooms = [] }: AnalyticsProps) {
  const total = rooms.length;
  const occupied = rooms.filter(r => r.status === 'occupied').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const dirty = rooms.filter(r => r.status === 'dirty').length;
  const maintenance = rooms.filter(r => r.status === 'maintenance').length;
  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

  // Room type distribution from real data
  const typeCounts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.roomType] = (acc[r.roomType] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  // Room status breakdown for bar chart
  const statusData = [
    { status: 'Available', count: available, fill: '#16a34a' },
    { status: 'Occupied', count: occupied, fill: '#2563eb' },
    { status: 'Dirty', count: dirty, fill: '#d97706' },
    { status: 'Maintenance', count: maintenance, fill: '#dc2626' },
  ];

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Occupancy Rate" value={`${occupancyPct}%`} sub={`${occupied} of ${total} rooms occupied`} icon={TrendingUp} color="#2563eb" bg="#eff6ff" />
        <KpiCard label="Available Rooms" value={available} sub={`Ready for check-in`} icon={BedDouble} color="#16a34a" bg="#f0fdf4" />
        <KpiCard label="Occupied Rooms" value={occupied} sub={`Currently hosting guests`} icon={Users} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard label="Needs Attention" value={dirty + maintenance} sub={`${dirty} dirty, ${maintenance} maintenance`} icon={Wrench} color="#d97706" bg="#fffbeb" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Room Status Chart */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Room Status Overview</h3>
          {total === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No room data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Room Type Breakdown */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Room Type Distribution</h3>
          {pieData.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No room data</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 11, color: '#64748b' }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Summary table */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Room Inventory Summary</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Room', 'Floor', 'Type', 'Status', 'Guest'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No rooms loaded</td></tr>
            ) : (
              rooms.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>{r.number}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>Floor {r.floor}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.roomType}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, textTransform: 'capitalize',
                      backgroundColor: r.status === 'available' ? '#f0fdf4' : r.status === 'occupied' ? '#eff6ff' : r.status === 'dirty' ? '#fffbeb' : '#fef2f2',
                      color: r.status === 'available' ? '#16a34a' : r.status === 'occupied' ? '#2563eb' : r.status === 'dirty' ? '#d97706' : '#dc2626',
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.guestName || '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
