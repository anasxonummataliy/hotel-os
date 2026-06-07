import { useState, useEffect } from 'react';
import { Bell, Globe, Shield, Users, Building, Save, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from '../../lib/toast';

const CURRENCY_RATES: Record<string, { symbol: string; rate: number; label: string }> = {
  USD: { symbol: '$', rate: 1, label: 'USD ($)' },
  UZS: { symbol: 'so\'m', rate: 12750, label: 'UZS (so\'m)' },
  EUR: { symbol: '€', rate: 0.92, label: 'EUR (€)' },
  RUB: { symbol: '₽', rate: 89, label: 'RUB (₽)' },
};

export function getCurrency(): string {
  return localStorage.getItem('hotel_currency') || 'USD';
}

export function formatPrice(usdAmount: number): string {
  const cur = getCurrency();
  const { symbol, rate } = CURRENCY_RATES[cur] || CURRENCY_RATES.USD;
  const converted = usdAmount * rate;
  if (cur === 'UZS') return `${Math.round(converted).toLocaleString()} ${symbol}`;
  if (cur === 'RUB') return `${Math.round(converted).toLocaleString()} ${symbol}`;
  return `${symbol}${converted.toFixed(2)}`;
}

const sections = [
  { id: 'hotel', label: 'Mehmonxona ma\'lumotlari', icon: Building },
  { id: 'profile', label: 'Profil', icon: User },
  { id: 'currency', label: 'Valyuta', icon: Globe },
  { id: 'notifications', label: 'Bildirishnomalar', icon: Bell },
  { id: 'security', label: 'Xavfsizlik', icon: Shield },
  { id: 'staff', label: 'Xodimlar va kirish', icon: Users },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none',
        backgroundColor: value ? '#1e293b' : '#cbd5e1',
        cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: value ? 20 : 3,
        width: 18, height: 18, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 13, color: '#1e293b', backgroundColor: '#f8fafc', outline: 'none', boxSizing: 'border-box',
};

export function Settings() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('hotel');
  const [notifs, setNotifs] = useState({ maintenance: true, checkin: true, service: false, housekeeping: true });
  const [saved, setSaved] = useState(false);

  // Currency
  const [currency, setCurrency] = useState(getCurrency());

  // Profile rename
  const [newName, setNewName] = useState(user?.full_name ?? '');
  useEffect(() => { setNewName(user?.full_name ?? ''); }, [user]);

  const handleSave = () => {
    setSaved(true);
    toast.success('Saqlandi!');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCurrencyChange = (val: string) => {
    setCurrency(val);
    localStorage.setItem('hotel_currency', val);
    toast.success(`Valyuta o'zgartirildi: ${CURRENCY_RATES[val]?.label}`);
    window.dispatchEvent(new Event('currency-changed'));
  };

  const handleRename = () => {
    if (!newName.trim()) { toast.error('Ism bo\'sh bo\'lishi mumkin emas'); return; }
    toast.success('Ism saqlandi!');
  };

  const exampleUSD = 120;

  return (
    <div style={{ padding: 24, fontFamily: 'Inter, sans-serif', flex: 1, overflowY: 'auto', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Section Nav */}
      <div style={{ width: 200, flexShrink: 0, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        {sections.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '11px 14px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13, textAlign: 'left',
                backgroundColor: isActive ? '#f1f5f9' : 'transparent',
                color: isActive ? '#1e293b' : '#64748b', fontWeight: isActive ? 600 : 400,
                borderLeft: `3px solid ${isActive ? '#1e293b' : 'transparent'}`,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>
            {sections.find(s => s.id === activeSection)?.label}
          </h3>
        </div>

        <div style={{ padding: 24 }}>

          {activeSection === 'hotel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              {[
                { label: 'Mehmonxona nomi', value: 'GrandStay Mehmonxonasi' },
                { label: 'Shahar', value: 'Toshkent, O\'zbekiston' },
                { label: 'Aloqa email', value: 'info@grandstay.uz' },
                { label: 'Asosiy telefon', value: '+998 71 123 45 67' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                  <input style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }} value={value} disabled />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Xonalar soni</label>
                <input type="number" style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }} value={10} disabled />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Vaqt mintaqasi</label>
                <input style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#64748b' }} value="Asia/Tashkent (UTC+5)" disabled />
              </div>
            </div>
          )}

          {activeSection === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>To'liq ism</label>
                <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Email</label>
                <input style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#94a3b8' }} value={user?.email ?? ''} disabled />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Rol</label>
                <input style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#94a3b8' }} value={user?.role ?? ''} disabled />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Login</label>
                <input style={{ ...inputStyle, backgroundColor: '#f1f5f9', color: '#94a3b8' }} value={user?.username ?? ''} disabled />
              </div>
              <button
                onClick={handleRename}
                disabled={newName.trim() === user?.full_name}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  backgroundColor: newName.trim() !== user?.full_name ? '#1e293b' : '#e2e8f0',
                  color: newName.trim() !== user?.full_name ? '#fff' : '#94a3b8',
                  border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Save size={13} /> Saqlash
              </button>
            </div>
          )}

          {activeSection === 'currency' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                Narxlar tanlangan valyutada ko'rsatiladi. Kurs: 1 USD = 12,750 so'm
              </p>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Valyuta</label>
                <select style={inputStyle} value={currency} onChange={e => handleCurrencyChange(e.target.value)}>
                  {Object.entries(CURRENCY_RATES).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div style={{ padding: '12px 14px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                <p style={{ fontSize: 13, color: '#16a34a', margin: 0 }}>
                  Namuna: <strong>$120</strong> = <strong>{formatPrice(exampleUSD)}</strong>
                </p>
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              {[
                { key: 'maintenance', label: 'Texnik xizmat ogohlantirishlari', desc: 'Kritik muammolar haqida xabar' },
                { key: 'checkin', label: 'Kirish / Chiqish', desc: 'Mehmon harakatlari haqida xabar' },
                { key: 'service', label: 'Xona xizmati buyurtmalari', desc: 'Yangi buyurtma kelganda xabar' },
                { key: 'housekeeping', label: 'Tozalash yangilanishlari', desc: 'Xona holati o\'zgarishi' },
              ].map(({ key, label, desc }) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', backgroundColor: '#f8fafc', borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{desc}</p>
                  </div>
                  <Toggle value={notifs[key as keyof typeof notifs]} onChange={v => setNotifs(n => ({ ...n, [key]: v }))} />
                </div>
              ))}
              <button onClick={handleSave} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                backgroundColor: saved ? '#16a34a' : '#1e293b', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 8,
              }}>
                <Save size={13} /> {saved ? 'Saqlandi!' : 'Saqlash'}
              </button>
            </div>
          )}

          {activeSection === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 4px' }}>JWT Autentifikatsiya</p>
                <p style={{ fontSize: 12, color: '#3b82f6', margin: 0 }}>Barcha so'rovlar Bearer Token bilan himoyalangan.</p>
              </div>
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#16a34a', margin: '0 0 4px' }}>Parol himoyasi</p>
                <p style={{ fontSize: 12, color: '#16a34a', margin: 0 }}>Parollar Argon2 algoritmi bilan hashlangan.</p>
              </div>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: '0 0 4px' }}>Rolga asoslangan kirish</p>
                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Har bir xodim faqat o'z bo'limiga kirish huquqiga ega.</p>
              </div>
            </div>
          )}

          {activeSection === 'staff' && (
            <div style={{ maxWidth: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Ism', 'Rol', 'Email', 'Holat'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Aziz Karimov', role: 'Bosh menejer', email: 'a.karimov@grandstay.uz', active: true },
                    { name: 'Dilnoza Rashidova', role: 'Qabulxona', email: 'd.rashidova@grandstay.uz', active: true },
                    { name: 'Bobur Alimov', role: 'Bosh texnik', email: 'b.alimov@grandstay.uz', active: true },
                    { name: 'Malika Usmanova', role: 'Tozalash', email: 'm.usmanova@grandstay.uz', active: true },
                  ].map((staff, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{staff.name}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>{staff.role}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>{staff.email}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 20, padding: '2px 9px' }}>Faol</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
