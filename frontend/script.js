// ── Config ────────────────────────────────────────────────────────────────────
const API = {
  AUTH:  'http://localhost:8000',
  REC:   'http://localhost:8001',
  HK:    'http://localhost:8002',
  RS:    'http://localhost:8003',
  MAINT: 'http://localhost:8004',
  WS:    'ws://localhost:8005/ws/dashboard',
};

const ROLE_NAV = {
  admin:        ['overview','rooms','guests','bookings','orders','housekeeping','maintenance','events','admin'],
  reception:    ['overview','rooms','guests','bookings','orders','events'],
  housekeeping: ['overview','housekeeping','events'],
  room_service: ['overview','orders','events'],
  maintenance:  ['overview','maintenance','events'],
};

const NAV_LABELS = {
  overview:'📊 Overview', rooms:'🛏️ Rooms', guests:'👥 Guests',
  bookings:'📋 Bookings', orders:'🍽️ Room Service', housekeeping:'🧹 Housekeeping',
  maintenance:'🔧 Maintenance', events:'📡 Events', admin:'⚙️ Users',
};

// ── State ─────────────────────────────────────────────────────────────────────
let token = localStorage.getItem('hotel_token');
let user  = null;
try { user = JSON.parse(localStorage.getItem('hotel_user') || 'null'); } catch {}

const state = {
  rooms: new Map(), guests: new Map(), bookings: [],
  orders: new Map(), maint: new Map(), events: [],
  ws: null, wsRetry: 2000,
};

// ── Utilities ─────────────────────────────────────────────────────────────────
function authHdr() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function apiFetch(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: authHdr(), ...opts });
    if (r.status === 401) { logout(); return null; }
    if (!r.ok) {
      const e = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(e.detail || r.statusText);
    }
    return r.json();
  } catch (e) {
    console.error('[API]', url, e.message);
    throw e;
  }
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
}

function fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch { return iso; }
}

function badge(val) {
  const v = (val || '').toLowerCase().replace(/ /g,'_');
  return `<span class="badge badge-${v}">${val}</span>`;
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.sec === id);
  });
  const titles = { overview:'Overview',rooms:'Rooms',guests:'Guests',bookings:'Bookings',
    orders:'Room Service',housekeeping:'Housekeeping',maintenance:'Maintenance',events:'Live Events',admin:'User Management' };
  const el = document.getElementById('page-title');
  if (el) el.textContent = titles[id] || id;
}

// ── Auth tab switch ───────────────────────────────────────────────────────────
function authTab(tab) {
  const loginForm  = document.getElementById('form-login');
  const regForm    = document.getElementById('form-register');
  const tabLogin   = document.getElementById('tab-login');
  const tabReg     = document.getElementById('tab-register');

  if (tab === 'login') {
    loginForm.style.display = 'flex';
    regForm.style.display   = 'none';
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    regForm.style.display   = 'flex';
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
  }
}

// Password visibility toggle
function togglePw(inputId, eyeId) {
  const inp = document.getElementById(inputId);
  const eye = document.getElementById(eyeId);
  if (!inp) return;
  if (inp.type === 'password') { inp.type = 'text';     if (eye) eye.textContent = '🙈'; }
  else                         { inp.type = 'password'; if (eye) eye.textContent = '👁'; }
}

// Click-to-fill demo credentials
function fillLogin(email, pw) {
  const form = document.getElementById('form-login');
  if (!form) return;
  form.querySelector('[name=email]').value    = email;
  form.querySelector('[name=password]').value = pw;
}

// Password strength (register form)
function checkStrength(pw) {
  const wrap  = document.getElementById('pw-strength-wrap');
  const bar   = document.getElementById('pw-strength-bar');
  const label = document.getElementById('pw-strength-label');
  if (!wrap || !bar || !label) return;
  if (!pw) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  let score = 0;
  if (pw.length >= 6)  score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels = [
    { pct:'20%', color:'#ef4444', text:'Very weak' },
    { pct:'40%', color:'#f97316', text:'Weak' },
    { pct:'60%', color:'#eab308', text:'Fair' },
    { pct:'80%', color:'#22c55e', text:'Strong' },
    { pct:'100%',color:'#10b981', text:'Very strong' },
  ];
  const lvl = levels[Math.min(score, 4)];
  bar.style.width      = lvl.pct;
  bar.style.background = lvl.color;
  label.textContent    = lvl.text;
  label.style.color    = lvl.color;
}

// ── LOGIN ─────────────────────────────────────────────────────────────────────
async function doLogin(e) {
  e.preventDefault();
  const form  = e.target;
  const email = form.querySelector('[name=email]').value.trim();
  const pw    = form.querySelector('[name=password]').value;
  const errEl = document.getElementById('login-err');
  const btn   = document.getElementById('login-btn-text');

  errEl.style.display = 'none';
  if (btn) btn.textContent = 'Signing in…';

  try {
    const body = new URLSearchParams({ username: email, password: pw });
    const r = await fetch(`${API.AUTH}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Login failed');

    token = data.access_token;
    user  = data.user;
    localStorage.setItem('hotel_token', token);
    localStorage.setItem('hotel_user',  JSON.stringify(user));

    enterApp();
  } catch (err) {
    errEl.textContent    = err.message;
    errEl.style.display  = 'block';
    if (btn) btn.textContent = 'Sign In →';
  }
}

// ── REGISTER ──────────────────────────────────────────────────────────────────
async function doRegister(e) {
  e.preventDefault();
  const form  = e.target;
  const fname = form.querySelector('[name=first_name]')?.value.trim() || '';
  const lname = form.querySelector('[name=last_name]')?.value.trim()  || '';
  const email = form.querySelector('[name=email]').value.trim();
  const pw    = form.querySelector('[name=password]').value;
  const errEl = document.getElementById('reg-err');

  errEl.style.display = 'none';

  try {
    const full_name = `${fname} ${lname}`.trim();
    const r = await fetch(`${API.AUTH}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw, full_name, role: 'guest' }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Registration failed');

    toast('Account created! Please sign in.', 'success');
    form.reset();
    authTab('login');
    const loginEmail = document.querySelector('#form-login [name=email]');
    if (loginEmail) loginEmail.value = email;
  } catch (err) {
    errEl.textContent   = err.message;
    errEl.style.display = 'block';
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
function logout() {
  token = null; user = null;
  localStorage.removeItem('hotel_token');
  localStorage.removeItem('hotel_user');
  if (state.ws) { try { state.ws.close(); } catch {} state.ws = null; }
  showPage('page-auth');
  authTab('login');
}

// ── ENTER APP after login ─────────────────────────────────────────────────────
function enterApp() {
  if (!user) return logout();
  const role = user.role;

  if (role === 'guest') {
    // Guest portal
    document.getElementById('guest-name').textContent = user.full_name || 'Guest';
    document.getElementById('guest-email').textContent = user.email;
    showPage('page-guest');
    loadGuestData();
    return;
  }

  // Staff / Admin dashboard
  document.getElementById('staff-role-label').textContent =
    role.charAt(0).toUpperCase() + role.slice(1).replace('_',' ');
  document.getElementById('staff-email').textContent = user.email;

  // Build sidebar nav
  const nav = document.getElementById('sidebar-nav');
  nav.innerHTML = '';
  const sections = ROLE_NAV[role] || ROLE_NAV.reception;
  sections.forEach(sec => {
    const a = document.createElement('a');
    a.className = 'nav-link';
    a.href = '#';
    a.dataset.sec = sec;
    a.textContent = NAV_LABELS[sec] || sec;
    a.addEventListener('click', e => { e.preventDefault(); showSection(sec); loadSection(sec); });
    nav.appendChild(a);
  });

  showPage('page-staff');
  showSection('sec-overview');
  updateClock();
  setInterval(updateClock, 30000);
  connectWS();
  loadAll();
}

function updateClock() {
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = new Date().toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

// ── Section lazy-loader ───────────────────────────────────────────────────────
function loadSection(sec) {
  const loaders = {
    overview:     loadAll,
    rooms:        loadRooms,
    guests:       loadGuests,
    bookings:     loadBookings,
    orders:       loadOrders,
    housekeeping: renderHousekeeping,
    maintenance:  loadMaintenance,
    events:       () => {},
    admin:        loadUsers,
  };
  (loaders[sec] || (() => {}))();
}

function refreshData() { loadAll(); toast('Refreshed', 'info'); }

// ── WebSocket ─────────────────────────────────────────────────────────────────
function connectWS() {
  if (state.ws && state.ws.readyState < 2) return;
  setWS('connecting');
  const ws = new WebSocket(API.WS);
  state.ws = ws;

  ws.onopen = () => { setWS('connected'); state.wsRetry = 2000; };
  ws.onmessage = ({ data }) => {
    try { handleWSMsg(JSON.parse(data)); } catch {}
  };
  ws.onclose = () => {
    setWS('disconnected');
    setTimeout(connectWS, state.wsRetry);
    state.wsRetry = Math.min(state.wsRetry * 1.5, 30000);
  };
  ws.onerror = () => setWS('disconnected');
}

function setWS(s) {
  const dot   = document.getElementById('ws-dot');
  const label = document.getElementById('ws-label');
  if (!dot) return;
  dot.className = `ws-dot ws-${s}`;
  label.textContent = s === 'connected' ? 'Live' : s === 'connecting' ? 'Connecting…' : 'Offline';
}

function handleWSMsg(msg) {
  pushEvent(msg);
  const { event_type, data } = msg;
  switch (event_type) {
    case 'dashboard_init':
      if (data?.rooms) {
        for (const [id, status] of Object.entries(data.rooms)) {
          const r = state.rooms.get(+id); if (r) r.status = status;
        }
        renderRoomMap(); renderKPIs();
      }
      break;
    case 'check_in_completed':
    case 'room_vacated':
      loadRooms(); break;
    case 'room_cleaned':
      if (data?.room_id) {
        const r = state.rooms.get(data.room_id); if (r) { r.status = 'clean'; renderRoomMap(); renderKPIs(); }
      }
      break;
    case 'order_status_changed': loadOrders(); break;
    case 'maintenance_updated':  loadMaintenance(); break;
  }
}

// ── Data loaders ──────────────────────────────────────────────────────────────
async function loadAll() {
  await Promise.allSettled([loadRooms(), loadGuests(), loadBookings(), loadOrders(), loadMaintenance()]);
  if (user?.role === 'admin') loadUsers();
}

async function loadRooms() {
  const data = await apiFetch(`${API.REC}/rooms`).catch(() => null);
  if (!Array.isArray(data)) return;
  data.forEach(r => state.rooms.set(r.id, r));
  renderKPIs(); renderRoomMap(); renderRoomsTable();
  renderHousekeeping();
}

async function loadGuests() {
  const data = await apiFetch(`${API.REC}/guests`).catch(() => null);
  if (!Array.isArray(data)) return;
  state.guests.clear();
  data.forEach(g => state.guests.set(g.id, g));
  renderGuestsTable();
}

async function loadBookings() {
  const data = await apiFetch(`${API.REC}/bookings`).catch(() => null);
  if (!Array.isArray(data)) return;
  state.bookings = data;
  renderBookingsTable();
}

async function loadOrders() {
  const occupied = [...state.rooms.values()].filter(r => r.status === 'occupied');
  const results  = await Promise.allSettled(
    occupied.map(r => apiFetch(`${API.RS}/orders/room/${r.id}`))
  );
  results.forEach(res => {
    if (res.status === 'fulfilled' && res.value?.orders)
      res.value.orders.forEach(o => state.orders.set(o.id, o));
  });
  renderOrdersTable();
}

async function loadMaintenance() {
  const data = await apiFetch(`${API.MAINT}/maintenance/queue`).catch(() => null);
  if (!data?.queue) return;
  state.maint.clear();
  data.queue.forEach(i => state.maint.set(i.issue_id, i));
  renderMaintTable();
}

async function loadUsers() {
  const data = await apiFetch(`${API.AUTH}/auth/users`).catch(() => null);
  if (!Array.isArray(data)) return;
  renderUsersTable(data);
}

// ── Renderers ─────────────────────────────────────────────────────────────────
function renderKPIs() {
  const all = [...state.rooms.values()];
  const c = s => all.filter(r => r.status === s).length;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-total',    all.length);
  set('kpi-clean',    c('clean'));
  set('kpi-occupied', c('occupied'));
  set('kpi-cleaning', c('cleaning'));
  set('kpi-dirty',    c('dirty'));
}

function renderRoomMap() {
  const map = document.getElementById('room-map');
  if (!map) return;
  map.innerHTML = '';
  [...state.rooms.values()].sort((a, b) => a.id - b.id).forEach(r => {
    const div = document.createElement('div');
    div.className = `room-tile tile-${r.status || 'clean'}`;
    div.title = `Room ${r.number} — ${r.status}`;
    div.innerHTML = `<div>${r.number}</div><div style="font-size:.65rem;opacity:.7;margin-top:2px">${r.room_type}</div>`;
    div.onclick = () => showRoomModal(r);
    map.appendChild(div);
  });
}

function renderRoomsTable() {
  const tbody = document.getElementById('rooms-tbody');
  if (!tbody) return;
  const all = [...state.rooms.values()].sort((a, b) => a.id - b.id);
  tbody.innerHTML = all.map(r => `
    <tr>
      <td><strong>Room ${r.number}</strong></td>
      <td>${r.floor}</td>
      <td style="text-transform:capitalize">${r.room_type}</td>
      <td>${badge(r.status)}</td>
      <td>$${r.price_per_night}</td>
      <td>${r.current_guest_id ? '#' + r.current_guest_id : '—'}</td>
      <td style="color:#64748b">${fmt(r.last_cleaned)}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:#475569;padding:24px">No rooms</td></tr>`;
}

function renderGuestsTable() {
  const tbody = document.getElementById('guests-tbody');
  if (!tbody) return;
  const all = [...state.guests.values()].sort((a, b) => a.id - b.id);
  tbody.innerHTML = all.map(g => `
    <tr>
      <td><strong>#${g.id}</strong></td>
      <td>${g.first_name} ${g.last_name}</td>
      <td style="color:#94a3b8">${g.email}</td>
      <td style="color:#94a3b8">${g.phone || '—'}</td>
      <td style="color:#64748b">${fmt(g.created_at)}</td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:#475569;padding:24px">No guests</td></tr>`;
}

function renderBookingsTable() {
  const tbody = document.getElementById('bookings-tbody');
  if (!tbody) return;
  tbody.innerHTML = state.bookings.map(b => `
    <tr>
      <td><strong>#${b.id}</strong></td>
      <td>Guest #${b.guest_id}</td>
      <td>Room #${b.room_id}</td>
      <td>${b.check_in_date}</td>
      <td>${b.check_out_date}</td>
      <td>${badge(b.status)}</td>
      <td>${b.total_cost ? '$'+b.total_cost.toFixed(2) : '—'}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:#475569;padding:24px">No bookings</td></tr>`;
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  const all = [...state.orders.values()].sort((a, b) => b.id - a.id);
  tbody.innerHTML = all.map(o => {
    const items = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}× ${i.name}`).join(', ') : '—';
    const canAdvance = !['delivered','cancelled'].includes((o.status||'').toLowerCase());
    return `<tr>
      <td><strong>#${o.id}</strong></td>
      <td>Room ${o.room_id}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${items}">${items}</td>
      <td>$${(o.total_amount||0).toFixed(2)}</td>
      <td>${badge(o.status)}</td>
      <td style="color:#64748b">${fmt(o.created_at)}</td>
      <td>${canAdvance ? `<button class="btn btn-ghost btn-sm" onclick="advanceOrder(${o.id},'${o.status}')">Advance →</button>` : '—'}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="7" style="text-align:center;color:#475569;padding:24px">No orders</td></tr>`;
}

function renderHousekeeping() {
  const grid = document.getElementById('hk-grid');
  if (!grid) return;
  const dirty = [...state.rooms.values()].filter(r => ['dirty','cleaning'].includes(r.status));
  if (!dirty.length) {
    grid.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:#475569">All rooms are clean ✨</div>`;
    return;
  }
  grid.innerHTML = dirty.map(r => `
    <div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <strong>Room ${r.number}</strong>${badge(r.status)}
      </div>
      <div style="font-size:.8rem;color:#64748b;margin-bottom:12px;text-transform:capitalize">${r.room_type} · Floor ${r.floor}</div>
      <div style="display:flex;gap:8px">
        ${r.status==='dirty'    ? `<button class="btn btn-warning btn-sm" onclick="startClean(${r.id})">Start Cleaning</button>` : ''}
        ${r.status==='cleaning' ? `<button class="btn btn-success btn-sm" onclick="completeClean(${r.id})">Mark Clean ✓</button>` : ''}
      </div>
    </div>`).join('');
}

function renderMaintTable() {
  const tbody = document.getElementById('maint-tbody');
  if (!tbody) return;
  const all = [...state.maint.values()].sort((a, b) => a.position - b.position);
  tbody.innerHTML = all.map(i => `
    <tr>
      <td><strong>#${i.position}</strong></td>
      <td>Room ${i.room_id}</td>
      <td>${i.description}</td>
      <td>${badge(i.priority)}</td>
      <td>${badge(i.status)}</td>
      <td style="color:#64748b">—</td>
      <td>${i.status!=='resolved' ? `<button class="btn btn-ghost btn-sm" onclick="resolveIssueById(${i.issue_id})">Resolve</button>` : '—'}</td>
    </tr>`).join('') || `<tr><td colspan="7" style="text-align:center;color:#475569;padding:24px">No issues</td></tr>`;
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><strong>#${u.id}</strong></td>
      <td>${u.full_name}</td>
      <td style="color:#94a3b8">${u.email}</td>
      <td>${badge(u.role)}</td>
      <td>${u.is_active ? '<span style="color:#22c55e">Active</span>' : '<span style="color:#ef4444">Inactive</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="toggleUser(${u.id})">${u.is_active ? 'Deactivate' : 'Activate'}</button></td>
    </tr>`).join('');
}

// ── Room detail modal ─────────────────────────────────────────────────────────
function showRoomModal(r) {
  document.getElementById('room-modal-title').textContent = `Room ${r.number}`;
  document.getElementById('room-modal-body').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:.875rem">
      ${[['Number',r.number],['Floor',r.floor],['Type',r.room_type],
         ['Status',badge(r.status)],['Price/night','$'+r.price_per_night],
         ['Current guest',r.current_guest_id ? '#'+r.current_guest_id : '—'],
         ['Last cleaned',fmt(r.last_cleaned)],
         ['Amenities',(r.amenities||[]).join(', ')||'—']
        ].map(([k,v]) => `<tr style="border-bottom:1px solid #1e293b">
          <td style="padding:8px 12px;color:#64748b;font-weight:600;width:45%">${k}</td>
          <td style="padding:8px 12px">${v}</td></tr>`).join('')}
    </table>`;
  openModal('modal-room');
}

// ── Staff actions ─────────────────────────────────────────────────────────────
async function addGuest(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await apiFetch(`${API.REC}/guests`, {
      method: 'POST',
      body: JSON.stringify({ first_name: fd.get('first_name'), last_name: fd.get('last_name'),
        email: fd.get('email'), phone: fd.get('phone') || null }),
    });
    toast('Guest registered ✓');
    closeModal('modal-guest');
    e.target.reset();
    loadGuests();
  } catch (err) { toast(err.message, 'error'); }
}

async function doCheckIn(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await apiFetch(`${API.REC}/check-in`, {
      method: 'POST',
      body: JSON.stringify({
        guest_id: +fd.get('guest_id'), room_type: fd.get('room_type'),
        check_in_date: fd.get('check_in_date'), check_out_date: fd.get('check_out_date'),
        preferred_floor: fd.get('preferred_floor') ? +fd.get('preferred_floor') : null,
        special_requests: fd.get('special_requests') || null,
      }),
    });
    toast(`✅ Check-in OK — Booking #${res.booking_id}, Room ${res.room_number}`);
    closeModal('modal-checkin'); e.target.reset();
    loadAll();
  } catch (err) { toast(err.message, 'error'); }
}

async function doCheckOut(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await apiFetch(`${API.REC}/check-out`, {
      method: 'POST',
      body: JSON.stringify({ booking_id: +fd.get('booking_id'), room_id: +fd.get('room_id') }),
    });
    toast(`🚪 Check-out OK — Total: $${res.bill?.total_bill?.toFixed(2)}`);
    closeModal('modal-checkout'); e.target.reset();
    loadAll();
  } catch (err) { toast(err.message, 'error'); }
}

async function placeOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await apiFetch(`${API.RS}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: +fd.get('room_id'),
        items: [{ name: fd.get('item_name'), quantity: +fd.get('quantity'), price: +fd.get('price') }],
        special_requests: fd.get('special_requests') || null,
      }),
    });
    toast(`Order #${res.id} placed`);
    closeModal('modal-order'); e.target.reset();
    loadOrders();
  } catch (err) { toast(err.message, 'error'); }
}

const ORDER_NEXT = { received:'preparing', preparing:'in_delivery', in_delivery:'delivered' };
async function advanceOrder(id, status) {
  const next = ORDER_NEXT[status];
  if (!next) return;
  try {
    await apiFetch(`${API.RS}/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: next }) });
    toast(`Order #${id} → ${next}`);
    loadOrders();
  } catch (err) { toast(err.message, 'error'); }
}

async function startClean(roomId) {
  try {
    await apiFetch(`${API.HK}/clean/start?room_id=${roomId}`, { method: 'POST' });
    toast(`Room ${roomId} cleaning started`);
    loadRooms();
  } catch (err) { toast(err.message, 'error'); }
}

async function completeClean(roomId) {
  try {
    await apiFetch(`${API.HK}/clean/complete?room_id=${roomId}`, { method: 'POST' });
    toast(`Room ${roomId} is clean ✓`);
    loadRooms();
  } catch (err) { toast(err.message, 'error'); }
}

async function reportIssue(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await apiFetch(`${API.MAINT}/maintenance/report`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: +fd.get('room_id'), description: fd.get('description'),
        priority: fd.get('priority'), reported_by: fd.get('reported_by') || user?.full_name || 'staff',
      }),
    });
    toast(`Issue #${res.id} reported`);
    closeModal('modal-issue'); e.target.reset();
    loadMaintenance();
  } catch (err) { toast(err.message, 'error'); }
}

async function resolveIssueById(issueId) {
  try {
    await apiFetch(`${API.MAINT}/maintenance/${issueId}/resolve`, {
      method: 'POST', body: JSON.stringify({ resolution_notes: 'Resolved by staff' }),
    });
    toast(`Issue #${issueId} resolved ✓`);
    loadMaintenance();
  } catch (err) { toast(err.message, 'error'); }
}

async function addStaff(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await apiFetch(`${API.AUTH}/auth/register/staff`, {
      method: 'POST',
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password'),
        full_name: fd.get('full_name'), role: fd.get('role') }),
    });
    toast('Staff account created ✓');
    closeModal('modal-staff'); e.target.reset();
    loadUsers();
  } catch (err) { toast(err.message, 'error'); }
}

async function toggleUser(userId) {
  try {
    const res = await apiFetch(`${API.AUTH}/auth/users/${userId}/activate`, { method: 'PATCH' });
    toast(`User ${res.is_active ? 'activated' : 'deactivated'}`);
    loadUsers();
  } catch (err) { toast(err.message, 'error'); }
}

// ── Events log ────────────────────────────────────────────────────────────────
const EVT_COLOR = {
  check_in_completed:'#22c55e', room_vacated:'#ef4444', room_cleaned:'#06b6d4',
  order_status_changed:'#f59e0b', maintenance_updated:'#a855f7', dashboard_init:'#6366f1',
};

function pushEvent(msg) {
  state.events.unshift(msg);
  if (state.events.length > 200) state.events.length = 200;

  // Mini events on overview
  const mini = document.getElementById('mini-events');
  if (mini) {
    if (mini.querySelector('[style*="No events"]')) mini.innerHTML = '';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:start;gap:10px;padding:10px 16px;border-bottom:1px solid #1e293b;font-size:.8rem';
    const color = EVT_COLOR[msg.event_type] || '#64748b';
    row.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;margin-top:3px"></span>
      <span style="color:${color};font-weight:700;min-width:120px">${msg.event_type}</span>
      <span style="color:#475569;margin-left:auto;white-space:nowrap">${fmt(msg.timestamp)}</span>`;
    mini.insertBefore(row, mini.firstChild);
    while (mini.children.length > 8) mini.removeChild(mini.lastChild);
  }
  renderEventStream();
}

function renderEventStream() {
  const el = document.getElementById('event-stream');
  if (!el) return;
  if (!state.events.length) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:#475569">Waiting for events…</div>`;
    return;
  }
  el.innerHTML = state.events.map(e => {
    const color = EVT_COLOR[e.event_type] || '#64748b';
    return `<div style="display:grid;grid-template-columns:160px 180px 100px 1fr;gap:10px;padding:8px 16px;border-bottom:1px solid #1e293b;align-items:start">
      <span style="color:#475569">${fmt(e.timestamp)}</span>
      <span style="font-weight:700;color:${color}">${e.event_type}</span>
      <span style="color:#64748b">${e.service||'—'}</span>
      <span style="word-break:break-all">${JSON.stringify(e.data||{})}</span>
    </div>`;
  }).join('');
}

function clearEvents() { state.events = []; renderEventStream(); }

// ── Guest portal ──────────────────────────────────────────────────────────────
async function loadGuestData() {
  const guestId = user?.guest_id;
  if (!guestId) return;

  // Bookings
  const bookings = await apiFetch(`${API.REC}/bookings/my`).catch(() => []);
  const card = document.getElementById('guest-booking-card');
  if (card) {
    const active = (bookings || []).filter(b => b.status === 'checked_in');
    if (active.length) {
      const b = active[0];
      card.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div><div style="font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Room</div><div style="font-size:1.5rem;font-weight:800;color:#818cf8">#${b.room_id}</div></div>
          <div><div style="font-size:.72rem;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Booking</div><div style="font-size:1.5rem;font-weight:800">#${b.id}</div></div>
          <div><div style="font-size:.72rem;color:#64748b;margin-bottom:4px">Check-in</div><div>${b.check_in_date}</div></div>
          <div><div style="font-size:.72rem;color:#64748b;margin-bottom:4px">Check-out</div><div>${b.check_out_date}</div></div>
        </div>`;
      // Load orders for this room
      const orders = await apiFetch(`${API.RS}/orders/room/${b.room_id}`).catch(() => null);
      const tbody = document.getElementById('guest-orders-tbody');
      if (tbody && orders?.orders?.length) {
        tbody.innerHTML = orders.orders.map(o => {
          const items = Array.isArray(o.items) ? o.items.map(i => `${i.quantity}× ${i.name}`).join(', ') : '—';
          return `<tr><td>#${o.id}</td><td>${items}</td><td>$${(o.total_amount||0).toFixed(2)}</td><td>${badge(o.status)}</td><td style="color:#64748b">${fmt(o.created_at)}</td></tr>`;
        }).join('');
      }
    } else {
      card.innerHTML = `<p style="color:#64748b">No active booking found.</p>`;
    }
  }
}

async function guestOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const bookings = await apiFetch(`${API.REC}/bookings/my`).catch(() => []);
  const active = (bookings || []).filter(b => b.status === 'checked_in');
  if (!active.length) { toast('No active booking found', 'error'); return; }
  const roomId = active[0].room_id;
  try {
    const res = await apiFetch(`${API.RS}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        items: [{ name: fd.get('item_name'), quantity: +fd.get('quantity'), price: +fd.get('price') }],
        special_requests: fd.get('special_requests') || null,
      }),
    });
    toast(`Order #${res.id} placed! We'll bring it to your room.`);
    e.target.reset();
    loadGuestData();
  } catch (err) { toast(err.message, 'error'); }
}

async function guestReportIssue(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const bookings = await apiFetch(`${API.REC}/bookings/my`).catch(() => []);
  const active = (bookings || []).filter(b => b.status === 'checked_in');
  if (!active.length) { toast('No active booking found', 'error'); return; }
  const roomId = active[0].room_id;
  try {
    await apiFetch(`${API.MAINT}/maintenance/report`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId, description: fd.get('description'),
        priority: fd.get('priority'), reported_by: user?.full_name || 'Guest',
      }),
    });
    toast('Issue reported. Our team will attend shortly.');
    e.target.reset();
  } catch (err) { toast(err.message, 'error'); }
}

function gNav(sec) {
  document.querySelectorAll('#page-guest .section').forEach(s => s.classList.remove('active'));
  document.getElementById(sec)?.classList.add('active');
  document.querySelectorAll('#page-guest .nav-link').forEach(l =>
    l.classList.toggle('active', l.getAttribute('onclick')?.includes(sec)));
}

// ── Modal backdrop close ──────────────────────────────────────────────────────
document.querySelectorAll('.modal-bg').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});

// ── Password strength listener ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set default dates on check-in form
  const today    = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const ciDate   = document.querySelector('#modal-checkin [name=check_in_date]');
  const coDate   = document.querySelector('#modal-checkin [name=check_out_date]');
  if (ciDate) ciDate.value = today;
  if (coDate) coDate.value = tomorrow;

  // Password strength on register
  const regPw = document.getElementById('reg-pw');
  if (regPw) regPw.addEventListener('input', () => checkStrength(regPw.value));

  // Auto-login if token exists
  if (token && user) enterApp();
});
