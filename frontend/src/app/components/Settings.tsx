import { useState } from 'react';
import { Bell, Globe, Shield, Users, Building, Save } from 'lucide-react';

const sections = [
  { id: 'hotel', label: 'Hotel Info', icon: Building },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'localization', label: 'Localization', icon: Globe },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'staff', label: 'Staff & Access', icon: Users },
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
  const [activeSection, setActiveSection] = useState('hotel');
  const [notifs, setNotifs] = useState({ maintenance: true, checkin: true, service: false, housekeeping: true });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

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
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: saved ? '#16a34a' : '#1e293b',
              color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <Save size={13} /> {saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {activeSection === 'hotel' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              {[
                { label: 'Hotel Name', value: 'Grand Horizon Hotel', ph: '' },
                { label: 'City', value: 'New York, NY', ph: '' },
                { label: 'Contact Email', value: 'gm@grandhorizon.com', ph: '' },
                { label: 'Main Phone', value: '+1 (212) 555-0192', ph: '' },
              ].map(({ label, value, ph }) => (
                <div key={label}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                  <input style={inputStyle} defaultValue={value} placeholder={ph} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Total Rooms</label>
                <input type="number" style={inputStyle} defaultValue={80} />
              </div>
            </div>
          )}

          {activeSection === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
              {[
                { key: 'maintenance', label: 'Maintenance Alerts', desc: 'Get notified on new critical tickets' },
                { key: 'checkin', label: 'Check-In / Check-Out', desc: 'Receive alerts on guest activity' },
                { key: 'service', label: 'Room Service Orders', desc: 'Notify when new orders arrive' },
                { key: 'housekeeping', label: 'Housekeeping Updates', desc: 'Status changes for room cleaning' },
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
            </div>
          )}

          {activeSection === 'localization' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              {[
                { label: 'Language', options: ['English (US)', 'French', 'Spanish', 'Arabic'] },
                { label: 'Currency', options: ['USD ($)', 'EUR (€)', 'GBP (£)', 'AED (د.إ)'] },
                { label: 'Date Format', options: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'] },
                { label: 'Time Zone', options: ['America/New_York', 'Europe/London', 'Asia/Dubai'] },
              ].map(({ label, options }) => (
                <div key={label}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                  <select style={inputStyle}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', margin: '0 0 4px' }}>Two-Factor Authentication</p>
                <p style={{ fontSize: 12, color: '#3b82f6', margin: 0 }}>2FA is currently enabled for all admin accounts.</p>
              </div>
              {[
                { label: 'Session Timeout', options: ['15 minutes', '30 minutes', '1 hour', '4 hours'] },
                { label: 'Password Policy', options: ['Strong (min 12 chars)', 'Very Strong (min 16 + special chars)'] },
              ].map(({ label, options }) => (
                <div key={label}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{label}</label>
                  <select style={inputStyle}>
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {activeSection === 'staff' && (
            <div style={{ maxWidth: 600 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc' }}>
                    {['Name', 'Role', 'Email', 'Status'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: 'Richard Thornton', role: 'General Manager', email: 'r.thornton@gh.com', active: true },
                    { name: 'Priya Nair', role: 'Front Desk Supervisor', email: 'p.nair@gh.com', active: true },
                    { name: 'Alex Rivera', role: 'Head Technician', email: 'a.rivera@gh.com', active: true },
                    { name: 'Maria Santos', role: 'Housekeeping Supervisor', email: 'm.santos@gh.com', active: true },
                  ].map((staff, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{staff.name}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>{staff.role}</td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: '#64748b' }}>{staff.email}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#16a34a', backgroundColor: '#f0fdf4', borderRadius: 20, padding: '2px 9px' }}>Active</span>
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
