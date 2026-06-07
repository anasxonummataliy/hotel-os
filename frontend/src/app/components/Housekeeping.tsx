import { useState, useEffect, useCallback } from 'react';
import { Clock, ArrowRight, CheckCircle, Star, RefreshCw } from 'lucide-react';
import { getRooms, startCleaning, completeCleaning, type RoomData } from '../../lib/api';

interface HKRoom {
  id: number;
  number: string;
  floor: number;
  status: 'dirty' | 'cleaning' | 'clean';
}

interface Props {
  onStatusChange?: () => void;
}

function elapsed(dateStr: string | null): string {
  if (!dateStr) return '—';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins} daq. oldin`;
  return `${Math.floor(mins / 60)} soat ${mins % 60} daq. oldin`;
}

const HK_STATUSES = ['dirty', 'cleaning', 'clean'] as const;

function RoomKanbanCard({
  room, onAdvance, advancing,
}: {
  room: HKRoom;
  onAdvance: (id: number) => void;
  advancing: boolean;
}) {
  return (
    <div style={{
      backgroundColor: '#fff',
      border: '1.5px solid #e2e8f0',
      borderRadius: 10, padding: 14, marginBottom: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Xona {room.number}</span>
        <span style={{
          fontSize: 11, color: '#64748b', backgroundColor: '#f1f5f9',
          padding: '2px 7px', borderRadius: 20,
        }}>{room.floor}-qavat</span>
      </div>

      {room.status !== 'clean' && (
        <button
          onClick={() => onAdvance(room.id)}
          disabled={advancing}
          style={{
            width: '100%', padding: '7px', borderRadius: 7, border: 'none',
            backgroundColor: advancing ? '#94a3b8' : room.status === 'dirty' ? '#1e293b' : '#16a34a',
            color: '#fff', fontSize: 12, fontWeight: 600,
            cursor: advancing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {room.status === 'dirty' ? (
            <><ArrowRight size={13} /> Tozalashni boshlash</>
          ) : (
            <><CheckCircle size={13} /> Toza deb belgilash</>
          )}
        </button>
      )}
      {room.status === 'clean' && (
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          fontSize: 12, fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 7, padding: '6px',
        }}>
          <CheckCircle size={13} /> Tekshirilgan va Toza
        </span>
      )}
    </div>
  );
}

export function Housekeeping({ onStatusChange }: Props) {
  const [rooms, setRooms] = useState<HKRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: RoomData[] = await getRooms();
      const hkRooms = data
        .filter(r => ['dirty', 'cleaning', 'clean'].includes(r.status))
        .map(r => ({
          id: r.id,
          number: r.number,
          floor: r.floor,
          status: r.status as HKRoom['status'],
        }));
      setRooms(hkRooms);
    } catch (e) {
      setError('Xonalarni serverdan yuklashda xatolik.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const advance = useCallback(async (roomId: number) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    setAdvancing(roomId);
    try {
      if (room.status === 'dirty') {
        await startCleaning(roomId);
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'cleaning' } : r));
      } else if (room.status === 'cleaning') {
        await completeCleaning(roomId);
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: 'clean' } : r));
        onStatusChange?.(); // notify App.tsx so Dashboard updates
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Amal bajarilmadi');
      await load(); // re-sync on error
    } finally {
      setAdvancing(null);
    }
  }, [rooms, onStatusChange, load]);

  const columnDef = [
    { key: 'dirty',   label: 'Tozalash kutilmoqda', color: '#d97706', bg: '#fffbeb' },
    { key: 'cleaning', label: 'Jarayonda',      color: '#2563eb', bg: '#eff6ff' },
    { key: 'clean',   label: 'Tekshirilgan va Toza', color: '#16a34a', bg: '#f0fdf4' },
  ] as const;

  if (loading) {
    return (
      <div style={{ padding: 24, color: '#94a3b8', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
        Tozalash ma'lumotlari yuklanmoqda…
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Tozalash paneli</h2>
          <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Serverdan jonli ma'lumotlar — holatni o'zgartirish uchun bosing</p>
        </div>
        <button
          onClick={load}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px',
            border: '1px solid #e2e8f0', borderRadius: 8, backgroundColor: '#fff',
            fontSize: 12, color: '#64748b', cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} /> Yangilash
        </button>
      </div>

      {error && (
        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, alignItems: 'start' }}>
        {columnDef.map(({ key, label, color, bg }) => {
          const colRooms = rooms.filter(r => r.status === key);
          return (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{label}</span>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 700, color,
                  backgroundColor: bg, borderRadius: 20, padding: '2px 9px',
                  border: `1px solid ${color}33`,
                }}>{colRooms.length}</span>
              </div>
              <div style={{
                backgroundColor: '#f8fafc', borderRadius: 10,
                border: '1px solid #e2e8f0', padding: 10, minHeight: 200,
              }}>
                {colRooms.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: '#cbd5e1', fontSize: 12 }}>
                    Bu bosqichda xonalar yo'q
                  </div>
                )}
                {colRooms.map(room => (
                  <RoomKanbanCard
                    key={room.id}
                    room={room}
                    onAdvance={advance}
                    advancing={advancing === room.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
