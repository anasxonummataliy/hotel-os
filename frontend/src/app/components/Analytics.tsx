import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, BedDouble, Users, Wrench, DollarSign } from 'lucide-react';
import { getBookings, getOrders, type BookingData, type OrderData } from '../../lib/api';
import { formatPrice } from './Settings';
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
  const [bookings, setBookings] = useState<BookingData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);

  useEffect(() => {
    getBookings().then(setBookings).catch(() => {});
    getOrders().then(setOrders).catch(() => {});
  }, []);

  const total = rooms.length;
  const occupied = rooms.filter(r => r.status === 'occupied').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const dirty = rooms.filter(r => r.status === 'dirty').length;
  const maintenance = rooms.filter(r => r.status === 'maintenance').length;
  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

  // Revenue calculations
  const totalBookingRevenue = bookings.reduce((sum, b) => sum + (b.total_cost || 0), 0);
  const totalOrderRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const totalRevenue = totalBookingRevenue + totalOrderRevenue;
  const checkedOutBookings = bookings.filter(b => b.status === 'checked_out');
  const activeBookings = bookings.filter(b => b.status === 'checked_in');

  // Room type distribution from real data
  const typeCounts = rooms.reduce<Record<string, number>>((acc, r) => {
    acc[r.roomType] = (acc[r.roomType] ?? 0) + 1;
    return acc;
  }, {});
  const pieData = Object.entries(typeCounts).map(([name, value]) => ({ name, value }));

  // Room status breakdown for bar chart
  const statusData = [
    { status: 'Bo\'sh', count: available, fill: '#16a34a' },
    { status: 'Band', count: occupied, fill: '#2563eb' },
    { status: 'Iflos', count: dirty, fill: '#d97706' },
    { status: 'Ta\'mirda', count: maintenance, fill: '#dc2626' },
  ];

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <KpiCard label="Bandlik darajasi" value={`${occupancyPct}%`} sub={`${total} xonadan ${occupied} tasi band`} icon={TrendingUp} color="#2563eb" bg="#eff6ff" />
        <KpiCard label="Bo'sh xonalar" value={available} sub={`Kirish uchun tayyor`} icon={BedDouble} color="#16a34a" bg="#f0fdf4" />
        <KpiCard label="E'tibor talab qiladi" value={dirty + maintenance} sub={`${dirty} iflos, ${maintenance} ta'mirda`} icon={Wrench} color="#d97706" bg="#fffbeb" />
      </div>

      {/* Revenue KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard label="Umumiy daromad" value={formatPrice(totalRevenue)} sub={`${checkedOutBookings.length} ta tugallangan joylashish`} icon={DollarSign} color="#16a34a" bg="#f0fdf4" />
        <KpiCard label="Xona daromadi" value={formatPrice(totalBookingRevenue)} sub={`Joylashishlar bo'yicha`} icon={DollarSign} color="#2563eb" bg="#eff6ff" />
        <KpiCard label="Xona xizmati daromadi" value={formatPrice(totalOrderRevenue)} sub={`${orders.length} ta buyurtma`} icon={DollarSign} color="#7c3aed" bg="#f5f3ff" />
        <KpiCard label="Faol joylashishlar" value={activeBookings.length} sub={`Hozirda mehmon joylashgan`} icon={Users} color="#d97706" bg="#fffbeb" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Room Status Chart */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '18px 20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Xonalar holati</h3>
          {total === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Xona ma'lumotlari mavjud emas</div>
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
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Xona turlari taqsimoti</h3>
          {pieData.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Xona ma'lumotlari yo'q</div>
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

      {/* Revenue breakdown table */}
      {checkedOutBookings.length > 0 && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>💰 Daromad tarixi (tugallangan joylashishlar)</h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a' }}>Jami: {formatPrice(totalBookingRevenue)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {['Joylashish #', 'Mehmon ID', 'Xona', 'Kirish', 'Chiqish', 'Summa'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {checkedOutBookings.map((b, i) => (
                <tr key={b.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>#{b.id}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>#{b.guest_id}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>#{b.room_id}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{b.check_in_date}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{b.check_out_date}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#16a34a' }}>{formatPrice(b.total_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Room service orders revenue */}
      {orders.length > 0 && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>🍽️ Xona xizmati buyurtmalari</h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>Jami: {formatPrice(totalOrderRevenue)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {['Buyurtma #', 'Xona', 'Tarkibi', 'Summa', 'Holat'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 20).map((o, i) => (
                <tr key={o.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700 }}>#{o.id}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>#{o.room_id}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.items.map((item: { name: string; quantity: number }) => `${item.quantity}× ${item.name}`).join(', ')}
                  </td>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#7c3aed' }}>{formatPrice(o.total_amount)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, backgroundColor: '#eff6ff', color: '#2563eb', textTransform: 'capitalize' }}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary table */}
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', margin: 0 }}>Xonalar inventarizatsiyasi</h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ backgroundColor: '#f8fafc' }}>
              {['Xona', 'Qavat', 'Tur', 'Holat', 'Mehmon'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Xonalar yuklanmagan</td></tr>
            ) : (
              rooms.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e293b' }}>{r.number}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.floor}-qavat</td>
                  <td style={{ padding: '10px 14px', color: '#64748b' }}>{r.roomType}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, textTransform: 'capitalize',
                      backgroundColor: r.status === 'available' ? '#f0fdf4' : r.status === 'occupied' ? '#eff6ff' : r.status === 'dirty' ? '#fffbeb' : '#fef2f2',
                      color: r.status === 'available' ? '#16a34a' : r.status === 'occupied' ? '#2563eb' : r.status === 'dirty' ? '#d97706' : '#dc2626',
                    }}>
                      {r.status === 'available' ? 'Bo\'sh' : r.status === 'occupied' ? 'Band' : r.status === 'dirty' ? 'Iflos' : 'Ta\'mirda'}
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
