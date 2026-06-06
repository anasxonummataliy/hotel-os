import { useState, useEffect, useMemo } from 'react';
import { BedDouble, Users, CalendarCheck, CalendarX, Plus, X, CreditCard, Zap, UserPlus, Printer, Search } from 'lucide-react';
import { registerGuest, getGuests, type GuestCredentials, type GuestData } from '../../lib/api';
import { toast } from '../../lib/toast';
import type { Room } from './types';

interface ReceptionProps {
  rooms: Room[];
  onCheckIn: (data: CheckInData) => void;
  onCheckOut: (roomId: string) => void;
}

export interface CheckInData {
  guestName: string;
  guestId: number | null;
  nights: number;
  roomType: 'Single' | 'Double' | 'Luxury Suite' | 'Accessible';
  floorPreference: 'low' | 'high' | 'any';
  nearElevator: boolean;
}

const defaultForm: CheckInData = {
  guestName: '',
  guestId: null,
  nights: 2,
  roomType: 'Single',
  floorPreference: 'any',
  nearElevator: false,
};

function MetricCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ComponentType<{ size?: number }>;
  label: string; value: number; color: string; bg: string;
}) {
  return (
    <div style={{
      backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div>
        <p style={{ fontSize: 28, fontWeight: 700, color: '#1e293b', margin: 0, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>{label}</p>
      </div>
    </div>
  );
}

export function Reception({ rooms, onCheckIn, onCheckOut }: ReceptionProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CheckInData>(defaultForm);
  const [checkoutRoom, setCheckoutRoom] = useState<Room | null>(null);

  // Guest Register state
  const [showGuestRegister, setShowGuestRegister] = useState(false);
  const [guestForm, setGuestForm] = useState({ first_name: '', last_name: '', email: '', phone: '', passport_id: '' });
  const [registering, setRegistering] = useState(false);
  const [credentials, setCredentials] = useState<GuestCredentials | null>(null);

  const occupied = rooms.filter(r => r.status === 'occupied');
  const available = rooms.filter(r => r.status === 'available');
  const dirty = rooms.filter(r => r.status === 'dirty');
  const maintenance = rooms.filter(r => r.status === 'maintenance');

  // Guest search (inline autocomplete)
  const [guests, setGuests] = useState<GuestData[]>([]);
  const [guestSearch, setGuestSearch] = useState('');
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  useEffect(() => {
    getGuests().then(setGuests).catch(() => {});
  }, [credentials]); // reload after registering a new guest

  const filteredGuests = useMemo(() => {
    if (!guestSearch.trim()) return guests.slice(0, 8);
    const q = guestSearch.toLowerCase();
    return guests.filter(g =>
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
      (g.passport_id && g.passport_id.toLowerCase().includes(q)) ||
      g.email.toLowerCase().includes(q) ||
      String(g.id).includes(q)
    ).slice(0, 8);
  }, [guests, guestSearch]);

  const handleSubmit = () => {
    if (!form.guestId) {
      toast.error('Iltimos, ro\'yxatdan mehmonni tanlang');
      return;
    }
    onCheckIn(form);
    setForm(defaultForm);
    setGuestSearch('');
    setShowForm(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, color: '#1e293b',
    backgroundColor: '#f8fafc', outline: 'none', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5,
  };

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto' }}>
      {/* Metrics + Register Guest button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          <MetricCard icon={Users} label="Band xonalar" value={occupied.length} color="#2563eb" bg="#eff6ff" />
          <MetricCard icon={BedDouble} label="Bo'sh va toza" value={available.length} color="#16a34a" bg="#f0fdf4" />
          <MetricCard icon={CalendarCheck} label="Iflos / Tozalanmoqda" value={dirty.length} color="#d97706" bg="#fffbeb" />
          <MetricCard icon={CalendarX} label="Ta'mirda" value={maintenance.length} color="#dc2626" bg="#fef2f2" />
        </div>
        <button
          onClick={() => setShowGuestRegister(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
            backgroundColor: '#16a34a', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', height: 'fit-content',
          }}
        >
          <UserPlus size={14} /> Mehmon ro'yxatdan o'tkazish
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: showForm ? '1fr 1.2fr' : '1fr', gap: 20, alignItems: 'start' }}>
        {/* Active Bookings Table */}
        <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', margin: 0 }}>Faol joylashishlar</h3>
              <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{occupied.length} mehmon hozirda joylashgan</p>
            </div>
            <button
              onClick={() => setShowForm(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                backgroundColor: '#1e293b', color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              Yangi mehmon kirishi
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc' }}>
                  {['Xona', 'Mehmon ismi', 'Xona turi', 'Kirish sanasi', 'Balans', 'Amal'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {occupied.map((room, i) => (
                  <tr key={room.id} style={{ borderTop: '1px solid #f1f5f9', backgroundColor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{room.number}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, color: '#334155', fontWeight: 500 }}>{room.guestName}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{room.roomType}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{room.checkIn}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>${room.balance?.toLocaleString()}</span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => setCheckoutRoom(room)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          backgroundColor: '#fef2f2', color: '#dc2626',
                          border: '1px solid #fecaca', borderRadius: 6,
                          padding: '5px 10px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <CreditCard size={12} /> Chiqishni amalga oshirish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Check-In Form */}
        {showForm && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{
              padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              backgroundColor: '#1e293b',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', margin: 0 }}>Yangi mehmon kirishi</h3>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Guest Search — inline autocomplete like Telegram */}
              <div style={{ position: 'relative' }}>
                <label style={labelStyle}>Mehmon *</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                  <input
                    style={{ ...inputStyle, paddingLeft: 32 }}
                    placeholder="Ism, pasport ID yoki email bo'yicha qidirish…"
                    value={guestSearch}
                    onChange={e => {
                      setGuestSearch(e.target.value);
                      setShowGuestDropdown(true);
                      if (!e.target.value) setForm(f => ({ ...f, guestName: '', guestId: null }));
                    }}
                    onFocus={() => setShowGuestDropdown(true)}
                  />
                </div>
                {form.guestId && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                    <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ {form.guestName}</span>
                    <span style={{ fontSize: 10, color: '#64748b' }}>ID #{form.guestId}</span>
                    <button onClick={() => { setForm(f => ({ ...f, guestName: '', guestId: null })); setGuestSearch(''); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}>×</button>
                  </div>
                )}
                {/* Dropdown results */}
                {showGuestDropdown && !form.guestId && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                    backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
                    marginTop: 4,
                  }}>
                    {filteredGuests.length === 0 ? (
                      <div style={{ padding: '12px 14px', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                        Mehmon topilmadi. Avval yangi mehmon ro'yxatdan o'tkazing.
                      </div>
                    ) : (
                      filteredGuests.map(g => (
                        <button
                          key={g.id}
                          onClick={() => {
                            setForm(f => ({ ...f, guestName: `${g.first_name} ${g.last_name}`, guestId: g.id }));
                            setGuestSearch(`${g.first_name} ${g.last_name}`);
                            setShowGuestDropdown(false);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                            padding: '9px 14px', background: 'none', border: 'none',
                            borderBottom: '1px solid #f1f5f9', cursor: 'pointer', textAlign: 'left',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <div style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6' }}>
                              {g.first_name[0]}{g.last_name[0]}
                            </span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {g.first_name} {g.last_name}
                            </p>
                            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>
                              {g.passport_id ? `🪪 ${g.passport_id} · ` : ''}#{g.id} · {g.email}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div>
                <label style={labelStyle}>Qolish muddati (kechalar)</label>
                <input type="number" min={1} max={90} style={inputStyle} value={form.nights} onChange={e => setForm(f => ({ ...f, nights: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={labelStyle}>Xona turi</label>
                <select style={inputStyle} value={form.roomType} onChange={e => setForm(f => ({ ...f, roomType: e.target.value as CheckInData['roomType'] }))}>
                  {(['Single', 'Double', 'Luxury Suite', 'Accessible'] as const).map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Qavat afzalligi</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['any', 'low', 'high'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setForm(f => ({ ...f, floorPreference: opt }))}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                        border: '1px solid',
                        borderColor: form.floorPreference === opt ? '#1e293b' : '#e2e8f0',
                        backgroundColor: form.floorPreference === opt ? '#1e293b' : '#f8fafc',
                        color: form.floorPreference === opt ? '#fff' : '#64748b',
                        cursor: 'pointer', textTransform: 'capitalize',
                      }}
                    >
                      {opt === 'any' ? 'Farqi yo\'q' : opt === 'low' ? 'Pastki' : 'Yuqori'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', margin: 0 }}>Lift / Zinapoya yaqinida</p>
                  <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>Imkoniyati cheklangan shaxslar uchun</p>
                </div>
                <button
                  onClick={() => setForm(f => ({ ...f, nearElevator: !f.nearElevator }))}
                  style={{
                    width: 42, height: 24, borderRadius: 12, border: 'none',
                    backgroundColor: form.nearElevator ? '#1e293b' : '#cbd5e1',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 3, left: form.nearElevator ? 20 : 3,
                    width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>

              <button
                onClick={handleSubmit}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: '#3b82f6', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '11px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', marginTop: 4,
                }}
              >
                <Zap size={15} /> Eng yaxshi xonani avtomatik tanlash
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Check-Out Modal */}
      {checkoutRoom && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 420, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: 0 }}>Chiqishni amalga oshirish — Xona {checkoutRoom.number}</h3>
              <button onClick={() => setCheckoutRoom(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '20px 22px' }}>
              <div style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Mehmon</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{checkoutRoom.guestName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Xona turi</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{checkoutRoom.roomType}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>Kirish sanasi</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{checkoutRoom.checkIn}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Qoldiq balans</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#dc2626' }}>${checkoutRoom.balance?.toLocaleString()}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setCheckoutRoom(null)} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>
                  Bekor qilish
                </button>
                <button onClick={() => { onCheckOut(checkoutRoom.id); setCheckoutRoom(null); }} style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <CreditCard size={14} /> Chiqishni tasdiqlash va hisob
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guest Register Modal */}
      {showGuestRegister && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 440, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1e293b' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', margin: 0 }}>Yangi mehmonni ro'yxatdan o'tkazish</h3>
              <button onClick={() => setShowGuestRegister(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Ism *</label>
                  <input style={inputStyle} value={guestForm.first_name} onChange={e => setGuestForm(f => ({ ...f, first_name: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Familiya *</label>
                  <input style={inputStyle} value={guestForm.last_name} onChange={e => setGuestForm(f => ({ ...f, last_name: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" style={inputStyle} value={guestForm.email} onChange={e => setGuestForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Telefon (ixtiyoriy)</label>
                <input style={inputStyle} value={guestForm.phone} onChange={e => setGuestForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Pasport / ID raqami</label>
                <input style={inputStyle} placeholder="masalan, AB1234567" value={guestForm.passport_id} onChange={e => setGuestForm(f => ({ ...f, passport_id: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowGuestRegister(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b' }}>Bekor qilish</button>
                <button
                  onClick={async () => {
                    if (!guestForm.first_name || !guestForm.last_name || !guestForm.email) {
                      toast.error('Barcha majburiy maydonlarni to\'ldiring'); return;
                    }
                    setRegistering(true);
                    try {
                      const creds = await registerGuest({
                        first_name: guestForm.first_name,
                        last_name: guestForm.last_name,
                        email: guestForm.email,
                        phone: guestForm.phone || undefined,
                        passport_id: guestForm.passport_id || undefined,
                      });
                      setCredentials(creds);
                      setShowGuestRegister(false);
                      setGuestForm({ first_name: '', last_name: '', email: '', phone: '', passport_id: '' });
                      toast.success('Mehmon ro\'yxatdan o\'tkazildi! Kirish ma\'lumotlari yaratildi.');
                    } catch (err: unknown) {
                      toast.error(err instanceof Error ? err.message : 'Ro\'yxatdan o\'tkazish muvaffaqiyatsiz');
                    } finally { setRegistering(false); }
                  }}
                  disabled={registering}
                  style={{ flex: 2, padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: registering ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <UserPlus size={14} /> {registering ? 'Ro\'yxatdan o\'tkazilmoqda…' : 'Ro\'yxatdan o\'tkazish'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Credentials Card Modal — shows generated username/password to hand to guest */}
      {credentials && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 12, width: 440, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#16a34a' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>🎉 Mehmon hisobi yaratildi</h3>
              <button onClick={() => setCredentials(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbf7d0' }}><X size={16} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
                Bu kirish ma'lumotlarini mehmoningizga bering. Parol <strong>faqat bir marta</strong> ko'rsatiladi.
              </p>
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', textTransform: 'uppercase' }}>Mehmon ismi</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>{credentials.full_name}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', textTransform: 'uppercase' }}>Mehmon ID</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>#{credentials.guest_id}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', textTransform: 'uppercase' }}>Foydalanuvchi nomi</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#2563eb', margin: 0, fontFamily: 'monospace' }}>{credentials.username}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: 10, color: '#64748b', margin: '0 0 2px', textTransform: 'uppercase' }}>Parol</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: 0, fontFamily: 'monospace' }}>{credentials.password}</p>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  onClick={() => {
                    const printContent = `
                      <div style="font-family:sans-serif;padding:20px;border:2px solid #000;max-width:300px;margin:auto;">
                        <h2 style="text-align:center;">🏨 HotelOS</h2>
                        <p><strong>Ism:</strong> ${credentials.full_name}</p>
                        <p><strong>Foydalanuvchi:</strong> ${credentials.username}</p>
                        <p><strong>Parol:</strong> ${credentials.password}</p>
                        <hr/>
                        <p style="font-size:11px;color:#666;">Mehmonxona kioski yoki HotelOS ilovasiga kiring. Bu kartani saqlang.</p>
                      </div>`;
                    const w = window.open('', '_blank', 'width=400,height=400');
                    if (w) { w.document.write(printContent); w.document.close(); w.print(); }
                  }}
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: 13, cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Printer size={14} /> Kartani chop etish
                </button>
                <button onClick={() => setCredentials(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', backgroundColor: '#1e293b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Tayyor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
