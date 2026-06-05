import { Clock, AlertTriangle, RefreshCw, ArrowRight, CheckCircle, Coffee } from 'lucide-react';
import type { ActivityEvent } from './types';

interface LiveFeedProps {
  events: ActivityEvent[];
}

const typeConfig = {
  status: { icon: RefreshCw, color: '#3b82f6', bg: '#eff6ff', label: 'Status' },
  checkin: { icon: ArrowRight, color: '#22c55e', bg: '#f0fdf4', label: 'Check-in' },
  checkout: { icon: CheckCircle, color: '#8b5cf6', bg: '#f5f3ff', label: 'Check-out' },
  maintenance: { icon: AlertTriangle, color: '#ef4444', bg: '#fef2f2', label: 'Maintenance' },
  service: { icon: Coffee, color: '#f59e0b', bg: '#fffbeb', label: 'Service' },
};

function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export function LiveFeed({ events }: LiveFeedProps) {
  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        backgroundColor: '#fff',
        borderLeft: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, sans-serif',
        flexShrink: 0,
      }}
    >
      <div style={{
        padding: '16px 16px 12px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>Live Activity</h3>
          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Real-time updates</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 10, color: '#16a34a', backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 20, padding: '2px 8px',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e' }} />
          Live
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {events.map((event) => {
          const cfg = typeConfig[event.type];
          const Icon = cfg.icon;
          return (
            <div
              key={event.id}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, backgroundColor: cfg.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={14} style={{ color: cfg.color }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, color: '#334155', margin: 0, lineHeight: 1.5 }}>{event.message}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                  <Clock size={10} style={{ color: '#94a3b8' }} />
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{timeAgo(event.time)}</span>
                  <span style={{
                    fontSize: 9, color: cfg.color, backgroundColor: cfg.bg,
                    borderRadius: 10, padding: '1px 5px', marginLeft: 4,
                  }}>{cfg.label}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
