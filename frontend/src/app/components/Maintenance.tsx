import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Clock, RefreshCw, Plus } from 'lucide-react';
import {
  getMaintenanceTickets,
  resolveMaintenanceTicket,
  createMaintenanceTicket,
  getRooms,
  type MaintenanceTicketData,
  type RoomData,
} from '../../lib/api';

const URGENCY_CONFIG = {
  critical: { label: 'Kritik', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  high:     { label: 'Yuqori',     color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  normal:   { label: 'O\'rta',   color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  low:      { label: 'Past',      color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
};
const URGENCY_ORDER = ['critical', 'high', 'normal', 'low'] as const;
type Priority = typeof URGENCY_ORDER[number];

function sortTickets(tickets: MaintenanceTicketData[]): MaintenanceTicketData[] {
  return [...tickets].sort((a, b) => {
    const ao = URGENCY_ORDER.indexOf(a.priority as Priority);
    const bo = URGENCY_ORDER.indexOf(b.priority as Priority);
    if (ao !== bo) return ao - bo;
    // FIFO within same priority — lower id = came first
    return a.id - b.id;
  });
}

export function Maintenance() {
  const [tickets, setTickets] = useState<MaintenanceTicketData[]>([]);
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resolveTarget, setResolveTarget] = useState<MaintenanceTicketData | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState({ room_id: '', description: '', priority: 'normal' as Priority });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketData, roomData] = await Promise.all([
        getMaintenanceTickets(),
        getRooms().catch(() => [] as RoomData[]),
      ]);
      setTickets(ticketData);
      setRooms(roomData);
    } catch {
      setError('Texnik xizmat ma\'lumotlarini serverdan yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleResolve = useCallback(async () => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      await resolveMaintenanceTicket(resolveTarget.id, resolveNotes || 'Hal qilindi');
      setResolveTarget(null);
      setResolveNotes('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Murojaatni hal qilishda xatolik');
    } finally {
      setResolving(false);
    }
  }, [resolveTarget, resolveNotes, load]);

  const handleCreate = useCallback(async () => {
    if (!newForm.room_id || !newForm.description.trim()) {
      alert('Iltimos, xona tanlang va tavsifni kiriting.');
      return;
    }
    setSubmitting(true);
    try {
      await createMaintenanceTicket({
        room_id: Number(newForm.room_id),
        description: newForm.description,
        priority: newForm.priority,
      });
      setShowNewForm(false);
      setNewForm({ room_id: '', description: '', priority: 'normal' });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Murojaatni yaratishda xatolik');
    } finally {
      setSubmitting(false);
    }
  }, [newForm, load]);

  const sorted = sortTickets(tickets);
  const openCount = tickets.filter(t => t.status !== 'resolved').length;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
    backgroundColor: '#f8fafc', outline: 'none', boxSizing: 'border-box',
  };

  if (loading) {
    return (
      <div style={{ padding: 24, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Texnik xizmat murojaatlari yuklanmoqda…
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>

      {/* Main Table */}
      <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Ustuvorlik navbati</h3>
            <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{openCount} ochiq murojaat — ustuvorlik bo'yicha tartiblangan (Kritik birinchi)</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowNewForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Plus size={13} /> Yangi murojaat
            </button>
            <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {error && (
          <div style={{ margin: 14, backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
            {error}
          </div>
        )}

        {/* New Ticket Form */}
        {showNewForm && (
          <div style={{ margin: 14, padding: 16, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10 }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Yangi muammo xabar berish</h4>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Xona</label>
                <select style={inputStyle} value={newForm.room_id} onChange={e => setNewForm(f => ({ ...f, room_id: e.target.value }))}>
                  <option value="">Xona tanlang…</option>
                  {rooms.map(r => <option key={r.id} value={r.id}>Xona {r.number} ({r.floor}-qavat)</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 120px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Ustuvorlik</label>
                <select style={inputStyle} value={newForm.priority} onChange={e => setNewForm(f => ({ ...f, priority: e.target.value as Priority }))}>
                  {URGENCY_ORDER.map(p => <option key={p} value={p}>{URGENCY_CONFIG[p].label}</option>)}
                </select>
              </div>
              <div style={{ flex: '2 1 200px' }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Tavsif</label>
                <input style={inputStyle} placeholder="Muammoni tasvirlab bering…" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button onClick={handleCreate} disabled={submitting} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {submitting ? 'Yuborilmoqda…' : 'Yuborish'}
                </button>
                <button onClick={() => setShowNewForm(false)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 12, color: '#64748b', cursor: 'pointer' }}>
                  Bekor qilish
                </button>
              </div>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc' }}>
                {['#', 'Xona', 'Tavsif', 'Ustuvorlik', 'Holat', 'Xabar bergan', 'Amal'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    Texnik xizmat murojaatlari yo'q — hammasi yaxshi!
                  </td>
                </tr>
              )}
              {sorted.map((ticket, i) => {
                const priority = (ticket.priority ?? 'normal') as Priority;
                const cfg = URGENCY_CONFIG[priority] ?? URGENCY_CONFIG.normal;
                const isResolved = ticket.status === 'resolved';
                return (
                  <tr key={ticket.id} style={{ borderTop: '1px solid #f1f5f9', opacity: isResolved ? 0.55 : 1, backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, color: '#64748b', fontFamily: 'monospace' }}>#{ticket.id}</td>
                    <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                      {rooms.find(r => r.id === ticket.room_id)?.number ?? ticket.room_id}
                    </td>
                    <td style={{ padding: '12px 14px', maxWidth: 240 }}>
                      <span style={{ fontSize: 13, color: '#334155' }}>{ticket.description}</span>
                      {ticket.resolution_notes && (
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>Tuzatish: {ticket.resolution_notes}</p>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 700, color: cfg.color,
                        backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
                        borderRadius: 20, padding: '3px 10px',
                      }}>
                        {priority === 'critical' && <AlertTriangle size={11} />}
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 12, color: '#64748b', textTransform: 'capitalize' }}>{ticket.status === 'resolved' ? 'Hal qilingan' : ticket.status === 'open' ? 'Ochiq' : ticket.status}</span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                      {ticket.reported_by ?? '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {isResolved ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#16a34a' }}>
                          <CheckCircle size={13} /> Hal qilingan
                        </span>
                      ) : (
                        <button
                          onClick={() => setResolveTarget(ticket)}
                          style={{
                            fontSize: 11, fontWeight: 600, color: '#2563eb',
                            backgroundColor: '#eff6ff', border: '1px solid #bfdbfe',
                            borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Tuzatishni qayd etish
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolve Modal */}
      {resolveTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 440, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', margin: 0 }}>Tuzatishni qayd etish — #{resolveTarget.id}</h3>
              <button onClick={() => setResolveTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>
                  Xona {rooms.find(r => r.id === resolveTarget.room_id)?.number ?? resolveTarget.room_id}
                </p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>{resolveTarget.description}</p>
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Tuzatish eslatmalari</label>
              <textarea
                rows={4}
                placeholder="Qanday tuzatilganini, ishlatilgan qismlarni va h.k. tasvirlab bering..."
                value={resolveNotes}
                onChange={e => setResolveNotes(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b', resize: 'vertical', boxSizing: 'border-box', backgroundColor: '#f8fafc', fontFamily: 'Inter, sans-serif' }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button onClick={() => setResolveTarget(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>Bekor qilish</button>
                <button onClick={handleResolve} disabled={resolving} style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 700, cursor: resolving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <CheckCircle size={14} /> {resolving ? 'Saqlanmoqda…' : 'Hal qilindi deb belgilash'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
