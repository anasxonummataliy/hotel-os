/**
 * KitchenDisplay — real-time kitchen order board.
 * Fetches all orders from /orders and advances status via /orders/{id}/status.
 * Polls every 15 s for new orders in addition to WebSocket events.
 */
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Clock, RefreshCw } from 'lucide-react';
import { getOrders, type OrderData } from '../../lib/api';

const STATUS_STEPS = ['received', 'preparing', 'in_delivery', 'delivered'] as const;
type OrderStatus = typeof STATUS_STEPS[number];

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  received:    { label: 'Received',    color: '#7c3aed', bg: '#f5f3ff' },
  preparing:   { label: 'Preparing',   color: '#d97706', bg: '#fffbeb' },
  in_delivery: { label: 'In Delivery', color: '#2563eb', bg: '#eff6ff' },
  delivered:   { label: 'Delivered',   color: '#16a34a', bg: '#f0fdf4' },
};

function useElapsed(isoString: string) {
  const [mins, setMins] = useState(
    Math.floor((Date.now() - new Date(isoString).getTime()) / 60000),
  );
  useEffect(() => {
    const t = setInterval(
      () => setMins(Math.floor((Date.now() - new Date(isoString).getTime()) / 60000)),
      10_000,
    );
    return () => clearInterval(t);
  }, [isoString]);
  return mins;
}

function OrderCard({
  order, onAdvance, advancing,
}: {
  order: OrderData;
  onAdvance: (id: number, next: OrderStatus) => void;
  advancing: boolean;
}) {
  const elapsed = useElapsed(order.created_at);
  const isDelayed = elapsed > 20;
  const currentIdx = STATUS_STEPS.indexOf(order.status as OrderStatus);

  return (
    <div style={{
      backgroundColor: '#fff',
      border: `1.5px solid ${isDelayed ? '#fecaca' : '#e2e8f0'}`,
      borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Room</p>
          <span style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', letterSpacing: '-1px' }}>
            {order.room_id}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 10, color: '#94a3b8', display: 'block' }}>#{order.id}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, color: isDelayed ? '#ef4444' : '#64748b' }}>
            <Clock size={12} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>{elapsed} min{elapsed !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ backgroundColor: '#f8fafc', borderRadius: 7, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
        {(order.items as { name: string; quantity: number }[]).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: i < order.items.length - 1 ? 5 : 0 }}>
            <span style={{ fontSize: 13, color: '#374151' }}>{item.name}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>×{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Progress steps */}
      <div>
        <div style={{ display: 'flex', gap: 4 }}>
          {STATUS_STEPS.map((step, idx) => {
            const isActive = idx === currentIdx;
            const isDone = idx < currentIdx;
            const cfg = STATUS_CONFIG[step];
            const isNext = idx === currentIdx + 1;
            return (
              <button
                key={step}
                onClick={() => {
                  if (isNext && order.status !== 'delivered' && !advancing) {
                    onAdvance(order.id, step);
                  }
                }}
                disabled={!isNext || order.status === 'delivered' || advancing}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none',
                  fontSize: 10, fontWeight: 700,
                  cursor: isNext && !advancing ? 'pointer' : 'default',
                  backgroundColor: isActive ? cfg.bg : isDone ? '#f1f5f9' : '#f8fafc',
                  color: isActive ? cfg.color : isDone ? '#94a3b8' : '#cbd5e1',
                  outline: isActive ? `1.5px solid ${cfg.color}` : 'none',
                  opacity: idx > currentIdx + 1 ? 0.4 : 1,
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${((currentIdx + 1) / STATUS_STEPS.length) * 100}%`,
            backgroundColor: isDelayed ? '#ef4444' : '#3b82f6',
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

export function KitchenDisplay() {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch {
      // orders endpoint might not be accessible for all roles — fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000); // poll every 15 s
    return () => clearInterval(interval);
  }, [load]);

  const advanceOrder = useCallback(async (orderId: number, nextStatus: OrderStatus) => {
    setAdvancing(orderId);
    try {
      const token = localStorage.getItem('hotel_os_token');
      await fetch(`/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update order');
      await load();
    } finally {
      setAdvancing(null);
    }
  }, [load]);

  const active = orders.filter(o => o.status !== 'delivered');
  const delayed = active.filter(o =>
    Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) > 20,
  );

  if (loading) {
    return (
      <div style={{ backgroundColor: '#f8fafc', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Loading orders…
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#f8fafc', minHeight: '100%', flex: 1, fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column' }}>
      {/* Top Banner */}
      <div style={{
        backgroundColor: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#3b82f6' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6' }}>{active.length} Active Orders</span>
        </div>
        {delayed.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} style={{ color: '#ef4444' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
              {delayed.length} Delayed Order{delayed.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>
          {orders.filter(o => o.status === 'delivered').length} delivered today
        </span>
        <button
          onClick={load}
          style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 10px', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Order Grid */}
      <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onAdvance={advanceOrder}
              advancing={advancing === order.id}
            />
          ))}
        </div>
        {orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>No orders yet</p>
            <p style={{ fontSize: 13 }}>Room service orders will appear here in real time.</p>
          </div>
        )}
      </div>
    </div>
  );
}
