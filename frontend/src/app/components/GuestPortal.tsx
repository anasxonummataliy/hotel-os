/**
 * GuestPortal — shown when a guest logs in.
 * Shows: current booking info, room service ordering, maintenance reporting.
 * Brief: Guest receives credentials from reception and logs in to order/report.
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getToken } from '../../lib/api';
import { toast } from '../../lib/toast';

const API_REC = '/bookings/my';
const API_RS = '/orders';
const API_MAINT = '/maintenance/report';

interface Booking {
  id: number;
  room_id: number;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_cost: number;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  id: number;
  items: OrderItem[];
  total_amount: number;
  status: string;
  created_at: string;
}

async function authFetch(url: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(url, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || res.statusText);
  }
  return res.json();
}

export function GuestPortal() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'stay' | 'order' | 'report'>('stay');
  const [booking, setBooking] = useState<Booking | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Order form
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(10);
  const [specialReq, setSpecialReq] = useState('');
  const [ordering, setOrdering] = useState(false);

  // Report form
  const [issueDesc, setIssueDesc] = useState('');
  const [issuePriority, setIssuePriority] = useState('normal');
  const [reporting, setReporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const bookings: Booking[] = await authFetch(API_REC);
      const active = bookings.find(b => b.status === 'checked_in');
      setBooking(active ?? null);
      if (active) {
        const res = await authFetch(`/orders/room/${active.room_id}`);
        setOrders(res.orders ?? []);
      }
    } catch {
      // Not checked in
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleOrder = async () => {
    if (!booking) { toast.error('No active booking'); return; }
    if (!itemName.trim()) { toast.error('Enter item name'); return; }
    setOrdering(true);
    try {
      const res = await authFetch(API_RS, {
        method: 'POST',
        body: JSON.stringify({
          room_id: booking.room_id,
          items: [{ name: itemName, quantity, price }],
          special_requests: specialReq || null,
        }),
      });
      toast.success(`Order #${res.id} placed! We'll bring it to your room.`);
      setItemName(''); setQuantity(1); setPrice(10); setSpecialReq('');
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Order failed');
    } finally {
      setOrdering(false);
    }
  };

  const handleReport = async () => {
    if (!booking) { toast.error('No active booking'); return; }
    if (!issueDesc.trim()) { toast.error('Enter issue description'); return; }
    setReporting(true);
    try {
      await authFetch(API_MAINT, {
        method: 'POST',
        body: JSON.stringify({
          room_id: booking.room_id,
          description: issueDesc,
          priority: issuePriority,
          reported_by: user?.full_name ?? 'Guest',
        }),
      });
      toast.success('Issue reported. Our team will attend shortly.');
      setIssueDesc(''); setIssuePriority('normal');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Report failed');
    } finally {
      setReporting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
    backgroundColor: '#f8fafc', outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#1e293b', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🏨</span>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc', margin: 0 }}>HotelOS</h1>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Guest Portal</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Welcome, {user?.full_name}</span>
          <button onClick={logout} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #475569', backgroundColor: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
        {([['stay', '🏠 My Stay'], ['order', '🍽️ Room Service'], ['report', '🔧 Report Issue']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '12px 20px', border: 'none', backgroundColor: 'transparent',
              borderBottom: activeTab === key ? '2px solid #3b82f6' : '2px solid transparent',
              color: activeTab === key ? '#1e293b' : '#64748b',
              fontWeight: activeTab === key ? 600 : 400, fontSize: 13, cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 640, margin: '24px auto', padding: '0 20px' }}>
        {loading && <p style={{ color: '#94a3b8', textAlign: 'center' }}>Loading…</p>}

        {/* ─── My Stay ─── */}
        {!loading && activeTab === 'stay' && (
          <div>
            {booking ? (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 20, marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Current Stay</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase' }}>Room</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#3b82f6', margin: 0 }}>#{booking.room_id}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px', textTransform: 'uppercase' }}>Booking</p>
                    <p style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', margin: 0 }}>#{booking.id}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px' }}>Check-in</p>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{booking.check_in_date}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 4px' }}>Check-out</p>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{booking.check_out_date}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                No active booking found. Please check in at reception.
              </div>
            )}

            {orders.length > 0 && (
              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>My Orders</h3>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc' }}>
                      {['Order', 'Items', 'Total', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>#{o.id}</td>
                        <td style={{ padding: '10px 14px', color: '#64748b' }}>
                          {o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>${o.total_amount.toFixed(2)}</td>
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
          </div>
        )}

        {/* ─── Room Service ─── */}
        {!loading && activeTab === 'order' && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Order Room Service</h3>
            {!booking && <p style={{ color: '#dc2626', fontSize: 13 }}>You must be checked in to place orders.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Item Name</label>
                <input style={inputStyle} placeholder="e.g. Coffee, Sandwich…" value={itemName} onChange={e => setItemName(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Quantity</label>
                  <input type="number" min={1} style={inputStyle} value={quantity} onChange={e => setQuantity(+e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Price ($)</label>
                  <input type="number" min={1} step={0.5} style={inputStyle} value={price} onChange={e => setPrice(+e.target.value)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Special Requests</label>
                <input style={inputStyle} placeholder="Optional…" value={specialReq} onChange={e => setSpecialReq(e.target.value)} />
              </div>
              <button
                onClick={handleOrder}
                disabled={ordering || !booking}
                style={{ padding: '11px', borderRadius: 8, border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: ordering ? 'wait' : 'pointer', opacity: !booking ? 0.5 : 1 }}
              >
                {ordering ? 'Placing…' : 'Place Order'}
              </button>
            </div>
          </div>
        )}

        {/* ─── Report Issue ─── */}
        {!loading && activeTab === 'report' && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Report a Maintenance Issue</h3>
            {!booking && <p style={{ color: '#dc2626', fontSize: 13 }}>You must be checked in to report issues.</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Description</label>
                <textarea rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Describe the problem…" value={issueDesc} onChange={e => setIssueDesc(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Priority</label>
                <select style={inputStyle} value={issuePriority} onChange={e => setIssuePriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button
                onClick={handleReport}
                disabled={reporting || !booking}
                style={{ padding: '11px', borderRadius: 8, border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: reporting ? 'wait' : 'pointer', opacity: !booking ? 0.5 : 1 }}
              >
                {reporting ? 'Submitting…' : 'Submit Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
