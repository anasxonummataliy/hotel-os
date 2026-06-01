/* ══════════════════════════════════════════════════════════════
   Hotel OS — Dashboard Script
   Backend API endpoints:
     Reception  :8001  /rooms  /guests  /check-in  /check-out
     Housekeeping:8002  /clean/start  /clean/complete  /queue
     Room Svc   :8003  /orders  /orders/{id}  /orders/room/{id}
     Maintenance:8004  /maintenance/report  /maintenance/queue
     WS Gateway :8005  ws://…/ws/dashboard
   ══════════════════════════════════════════════════════════════ */

const CFG = {
  TOKEN:        'hotel-os-secret-token-2024',
  RECEPTION:    'http://localhost:8001',
  HOUSEKEEPING: 'http://localhost:8002',
  ROOM_SVC:     'http://localhost:8003',
  MAINT:        'http://localhost:8004',
  WS_URL:       'ws://localhost:8005/ws/dashboard',
};

// ── Utilities ────────────────────────────────────────────────────────────────

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function authHdr() {
  return { 'x-token': CFG.TOKEN, 'Content-Type': 'application/json' };
}

async function api(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: authHdr(), ...opts });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || r.statusText);
    }
    return await r.json();
  } catch (e) {
    console.warn('[API]', url, e.message);
    throw e;
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return iso; }
}

function fmtDateOnly(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
  catch { return iso; }
}

function badge(val) {
  const v = (val || '').toLowerCase().replace(' ', '_');
  return `<span class="badge badge-${v}">${val}</span>`;
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4000);
}

function openModal(id)  { $(`#${id}`).classList.add('open'); }
function closeModal(id) { $(`#${id}`).classList.remove('open'); }

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  rooms:    new Map(),   // id → room
  guests:   new Map(),   // id → guest
  bookings: new Map(),   // id → booking
  orders:   new Map(),   // id → order
  maint:    new Map(),   // issue_id → issue
  events:   [],
  ws:       null,
  wsRetry:  2000,
};

// ── Navigation ────────────────────────────────────────────────────────────────

const PAGE_TITLES = {
  dashboard: 'Dashboard', rooms: 'Rooms', guests: 'Guests',
  bookings: 'Bookings', orders: 'Room Service',
  housekeeping: 'Housekeeping', maintenance: 'Maintenance', events: 'Live Events',
};

function navigate(page) {
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  $$('.page').forEach(el => el.classList.toggle('active', el.id === `page-${page}`));
  $('#page-title').textContent = PAGE_TITLES[page] || page;
  // Refresh data for the active page
  if (page === 'rooms')        renderRooms();
  if (page === 'guests')       loadGuests();
  if (page === 'bookings')     renderBookings();
  if (page === 'orders')       loadOrders();
  if (page === 'housekeeping') renderHousekeeping();
  if (page === 'maintenance')  loadMaintenance();
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectWS() {
  if (state.ws && state.ws.readyState < 2) return;
  setWsStatus('connecting');

  const ws = new WebSocket(CFG.WS_URL);
  state.ws = ws;

  ws.onopen = () => {
    setWsStatus('connected');
    state.wsRetry = 2000;
  };

  ws.onmessage = ({ data }) => {
    try { handleWsMsg(JSON.parse(data)); } catch (e) { console.error('[WS parse]', e); }
  };

  ws.onerror = () => setWsStatus('disconnected');

  ws.onclose = () => {
    setWsStatus('disconnected');
    setTimeout(connectWS, state.wsRetry);
    state.wsRetry = Math.min(state.wsRetry * 1.5, 30000);
  };
}

function setWsStatus(s) {
  const dot   = $('#ws-dot');
  const label = $('#ws-label');
  dot.className = `ws-dot ${s}`;
  label.textContent = s === 'connected' ? 'Live' : s === 'connecting' ? 'Connecting…' : 'Disconnected';
}

function handleWsMsg(msg) {
  const { event_type, data } = msg;
  pushEvent(msg);

  switch (event_type) {
    case 'dashboard_init':
      if (data?.rooms) {
        for (const [id, status] of Object.entries(data.rooms)) {
          const r = state.rooms.get(parseInt(id));
          if (r) r.status = status;
        }
        renderDashboard();
      }
      break;
    case 'check_in_completed':
    case 'room_vacated':
      loadRooms().then(renderDashboard);
      break;
    case 'room_cleaned':
      if (data?.room_id) {
        const r = state.rooms.get(data.room_id);
        if (r) { r.status = 'clean'; renderDashboard(); }
      }
      break;
    case 'order_status_changed':
      loadOrders();
      break;
    case 'maintenance_updated':
      loadMaintenance();
      break;
  }
}

// ── Data Loaders ──────────────────────────────────────────────────────────────

async function loadRooms() {
  const data = await api(`${CFG.RECEPTION}/rooms`).catch(() => null);
  if (!Array.isArray(data)) return;
  data.forEach(r => state.rooms.set(r.id, r));
}

async function loadGuests() {
  // No list endpoint — we track guests we've created in session
  renderGuests();
}

async function loadOrders() {
  // Fetch orders for all occupied rooms
  const occupied = [...state.rooms.values()].filter(r => r.status === 'occupied');
  const results = await Promise.allSettled(
    occupied.map(r => api(`${CFG.ROOM_SVC}/orders/room/${r.id}`))
  );
  results.forEach(res => {
    if (res.status === 'fulfilled' && res.value?.orders) {
      res.value.orders.forEach(o => state.orders.set(o.id, o));
    }
  });
  renderOrders();
}

async function loadMaintenance() {
  const data = await api(`${CFG.MAINT}/maintenance/queue`).catch(() => null);
  if (!data?.queue) return;
  state.maint.clear();
  data.queue.forEach(item => state.maint.set(item.issue_id, item));
  renderMaintenance();
}

async function loadAll() {
  await loadRooms();
  renderDashboard();
  renderRooms();
  renderBookings();
  await loadOrders();
  await loadMaintenance();
  renderHousekeeping();
}

// ── Renderers ─────────────────────────────────────────────────────────────────

function renderDashboard() {
  const all      = [...state.rooms.values()];
  const count    = s => all.filter(r => r.status === s).length;
  const set      = (id, v) => { const el = $(`#${id}`); if (el) el.textContent = v; };

  set('kpi-total',    all.length);
  set('kpi-clean',    count('clean'));
  set('kpi-occupied', count('occupied'));
  set('kpi-cleaning', count('cleaning'));
  set('kpi-dirty',    count('dirty'));

  // Room map
  const map = $('#room-map');
  if (!map) return;
  map.innerHTML = '';
  all.sort((a,b) => a.id - b.id).forEach(r => {
    const tile = document.createElement('div');
    tile.className = `room-tile ${r.status || 'clean'} fade-in`;
    tile.innerHTML = `<span class="tile-num">${r.number}</span><span class="tile-type">${r.room_type}</span>`;
    tile.title = `Room ${r.number} — ${r.status}`;
    tile.addEventListener('click', () => showRoomDetail(r));
    map.appendChild(tile);
  });
}

function renderRooms() {
  const grid = $('#rooms-grid');
  if (!grid) return;
  const all = [...state.rooms.values()].sort((a,b) => a.id - b.id);
  if (!all.length) { grid.innerHTML = '<div class="empty">No rooms loaded</div>'; return; }
  grid.innerHTML = all.map(r => `
    <div class="room-card ${r.status || 'clean'} fade-in" data-room-id="${r.id}">
      <div class="rc-number">Room ${r.number}</div>
      <div class="rc-type">${r.room_type} · Floor ${r.floor}</div>
      <div class="rc-footer">
        <span class="rc-price">$${r.price_per_night}/night</span>
        ${badge(r.status)}
      </div>
    </div>
  `).join('');
  $$('.room-card').forEach(card => {
    card.addEventListener('click', () => {
      const r = state.rooms.get(parseInt(card.dataset.roomId));
      if (r) showRoomDetail(r);
    });
  });
}

function renderGuests() {
  const tbody = $('#guests-tbody');
  if (!tbody) return;
  const guests = [...state.guests.values()];
  if (!guests.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-row">No guests registered yet</td></tr>';
    return;
  }
  tbody.innerHTML = guests.map(g => `
    <tr class="fade-in">
      <td><strong>#${g.id}</strong></td>
      <td>${g.first_name} ${g.last_name}</td>
      <td>${g.email}</td>
      <td>${g.phone || '—'}</td>
      <td>${fmtDate(g.created_at)}</td>
    </tr>
  `).join('');
}

function renderBookings() {
  const tbody = $('#bookings-tbody');
  if (!tbody) return;
  const bookings = [...state.bookings.values()].sort((a,b) => b.id - a.id);
  if (!bookings.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-row">No bookings yet</td></tr>';
    return;
  }
  tbody.innerHTML = bookings.map(b => `
    <tr class="fade-in">
      <td><strong>#${b.booking_id}</strong></td>
      <td>Guest #${b.guest_id}</td>
      <td>Room ${b.room_number} (#${b.room_id})</td>
      <td>${fmtDateOnly(b.check_in_date)}</td>
      <td>${fmtDateOnly(b.check_out_date)}</td>
      <td>${badge(b.status)}</td>
      <td>${b.total_cost ? '$' + b.total_cost.toFixed(2) : '—'}</td>
    </tr>
  `).join('');
}

function renderOrders() {
  const tbody = $('#orders-tbody');
  if (!tbody) return;
  const orders = [...state.orders.values()].sort((a,b) => b.id - a.id);
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No orders</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const items = Array.isArray(o.items)
      ? o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')
      : '—';
    const status = typeof o.status === 'object' ? o.status.value || o.status : o.status;
    return `
      <tr class="fade-in">
        <td><strong>#${o.id}</strong></td>
        <td>Room ${o.room_id}</td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${items}">${items}</td>
        <td>$${(o.total_amount || 0).toFixed(2)}</td>
        <td>${badge(status)}</td>
        <td>${fmtDate(o.created_at)}</td>
      </tr>
    `;
  }).join('');
}

function renderHousekeeping() {
  const grid = $('#hk-grid');
  if (!grid) return;
  const dirty = [...state.rooms.values()].filter(r => ['dirty','cleaning'].includes(r.status));
  if (!dirty.length) {
    grid.innerHTML = '<div class="empty">All rooms are clean ✨</div>';
    return;
  }
  grid.innerHTML = dirty.map(r => `
    <div class="hk-card fade-in">
      <div class="hk-card-head">
        <span class="hk-room">Room ${r.number}</span>
        ${badge(r.status)}
      </div>
      <div style="font-size:.8rem;color:var(--text-2)">${r.room_type} · Floor ${r.floor}</div>
      <div class="hk-actions">
        ${r.status === 'dirty' ? `<button class="btn btn-sm btn-warning" onclick="startCleaning(${r.id})">Start Cleaning</button>` : ''}
        ${r.status === 'cleaning' ? `<button class="btn btn-sm btn-primary" onclick="completeCleaning(${r.id})">Mark Clean</button>` : ''}
      </div>
    </div>
  `).join('');
}

function renderMaintenance() {
  const tbody = $('#maint-tbody');
  if (!tbody) return;
  const issues = [...state.maint.values()].sort((a,b) => a.position - b.position);
  if (!issues.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No maintenance issues</td></tr>';
    return;
  }
  tbody.innerHTML = issues.map(i => `
    <tr class="fade-in">
      <td><strong>#${i.position}</strong></td>
      <td>Room ${i.room_id}</td>
      <td>${i.description}</td>
      <td>${badge(i.priority)}</td>
      <td>${badge(i.status)}</td>
      <td>—</td>
    </tr>
  `).join('');
}

// ── Event Log ─────────────────────────────────────────────────────────────────

const EVENT_COLORS = {
  check_in_completed:   '#22c55e',
  room_vacated:         '#ef4444',
  room_cleaned:         '#06b6d4',
  order_status_changed: '#f59e0b',
  maintenance_updated:  '#a855f7',
  dashboard_init:       '#6366f1',
};

function pushEvent(msg) {
  state.events.unshift(msg);
  if (state.events.length > 200) state.events.length = 200;

  // Mini events on dashboard
  const mini = $('#mini-events');
  if (mini) {
    const row = document.createElement('div');
    row.className = 'mini-event fade-in';
    const color = EVENT_COLORS[msg.event_type] || '#94a3b8';
    row.innerHTML = `
      <span class="me-dot" style="background:${color}"></span>
      <span class="me-type">${msg.event_type}</span>
      <span class="me-time">${fmtDate(msg.timestamp)}</span>
    `;
    if (mini.querySelector('.empty')) mini.innerHTML = '';
    mini.insertBefore(row, mini.firstChild);
    if (mini.children.length > 8) mini.lastChild.remove();
  }

  // Full event stream
  renderEventStream();
}

function renderEventStream() {
  const stream = $('#event-stream');
  if (!stream) return;
  if (!state.events.length) {
    stream.innerHTML = '<div class="empty">Waiting for events…</div>';
    return;
  }
  stream.innerHTML = state.events.map(msg => `
    <div class="event-row fade-in">
      <span class="ev-time">${fmtDate(msg.timestamp)}</span>
      <span class="ev-type">${msg.event_type}</span>
      <span class="ev-svc">${msg.service || '—'}</span>
      <span class="ev-data">${JSON.stringify(msg.data || {})}</span>
    </div>
  `).join('');
}

// ── Room Detail Modal ─────────────────────────────────────────────────────────

function showRoomDetail(r) {
  $('#room-detail-title').textContent = `Room ${r.number}`;
  $('#room-detail-body').innerHTML = `
    <table class="detail-table">
      <tr><th>Number</th><td>${r.number}</td></tr>
      <tr><th>Floor</th><td>${r.floor}</td></tr>
      <tr><th>Type</th><td>${r.room_type}</td></tr>
      <tr><th>Status</th><td>${badge(r.status)}</td></tr>
      <tr><th>Price / night</th><td>$${r.price_per_night}</td></tr>
      <tr><th>Current Guest</th><td>${r.current_guest_id ? '#' + r.current_guest_id : '—'}</td></tr>
      <tr><th>Last Cleaned</th><td>${fmtDate(r.last_cleaned)}</td></tr>
      <tr><th>Amenities</th><td>${(r.amenities || []).join(', ') || '—'}</td></tr>
    </table>
  `;
  openModal('modal-room');
}

// ── Housekeeping Actions ──────────────────────────────────────────────────────

async function startCleaning(roomId) {
  try {
    await api(`${CFG.HOUSEKEEPING}/clean/start?room_id=${roomId}`, { method: 'POST' });
    toast(`Room ${roomId} cleaning started`);
    await loadRooms();
    renderHousekeeping();
    renderDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

async function completeCleaning(roomId) {
  try {
    await api(`${CFG.HOUSEKEEPING}/clean/complete?room_id=${roomId}`, { method: 'POST' });
    toast(`Room ${roomId} marked clean ✅`);
    await loadRooms();
    renderHousekeeping();
    renderDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

// ── Form Handlers ─────────────────────────────────────────────────────────────

function setupForms() {

  // ── Guest ──────────────────────────────────────────────────────────────────
  $('#form-guest').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      first_name: fd.get('first_name'),
      last_name:  fd.get('last_name'),
      email:      fd.get('email'),
      phone:      fd.get('phone') || null,
    };
    try {
      const res = await api(`${CFG.RECEPTION}/guests`, { method: 'POST', body: JSON.stringify(body) });
      state.guests.set(res.id, res);
      renderGuests();
      closeModal('modal-guest');
      e.target.reset();
      toast(`Guest #${res.id} registered — ${res.first_name} ${res.last_name}`);
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Check-in ───────────────────────────────────────────────────────────────
  $('#form-checkin').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      guest_id:       parseInt(fd.get('guest_id')),
      room_type:      fd.get('room_type'),
      check_in_date:  fd.get('check_in_date'),
      check_out_date: fd.get('check_out_date'),
      preferred_floor: fd.get('preferred_floor') ? parseInt(fd.get('preferred_floor')) : null,
      special_requests: fd.get('special_requests') || null,
    };
    try {
      const res = await api(`${CFG.RECEPTION}/check-in`, { method: 'POST', body: JSON.stringify(body) });
      state.bookings.set(res.booking_id, res);
      await loadRooms();
      renderDashboard();
      renderRooms();
      renderBookings();
      closeModal('modal-checkin');
      e.target.reset();
      toast(`✅ Check-in OK — Booking #${res.booking_id}, Room ${res.room_number}`);
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Check-out ──────────────────────────────────────────────────────────────
  $('#form-checkout').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      booking_id: parseInt(fd.get('booking_id')),
      room_id:    parseInt(fd.get('room_id')),
    };
    try {
      const res = await api(`${CFG.RECEPTION}/check-out`, { method: 'POST', body: JSON.stringify(body) });
      const booking = state.bookings.get(body.booking_id);
      if (booking) { booking.status = 'checked_out'; booking.total_cost = res.bill?.total_bill; }
      await loadRooms();
      renderDashboard();
      renderRooms();
      renderBookings();
      renderHousekeeping();
      closeModal('modal-checkout');
      e.target.reset();
      toast(`🚪 Check-out OK — Total: $${res.bill?.total_bill?.toFixed(2)}`);
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Room Service Order ─────────────────────────────────────────────────────
  $('#form-order').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      room_id: parseInt(fd.get('room_id')),
      items: [{ name: fd.get('item_name'), quantity: parseInt(fd.get('quantity')), price: parseFloat(fd.get('price')) }],
      special_requests: fd.get('special_requests') || null,
    };
    try {
      const res = await api(`${CFG.ROOM_SVC}/orders`, { method: 'POST', body: JSON.stringify(body) });
      state.orders.set(res.id, res);
      renderOrders();
      closeModal('modal-order');
      e.target.reset();
      toast(`Order #${res.id} placed for Room ${res.room_id}`);
    } catch (err) { toast(err.message, 'error'); }
  });

  // ── Maintenance Issue ──────────────────────────────────────────────────────
  $('#form-issue').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      room_id:     parseInt(fd.get('room_id')),
      description: fd.get('description'),
      priority:    fd.get('priority'),
      reported_by: fd.get('reported_by') || 'Front desk',
    };
    try {
      const res = await api(`${CFG.MAINT}/maintenance/report`, { method: 'POST', body: JSON.stringify(body) });
      await loadMaintenance();
      closeModal('modal-issue');
      e.target.reset();
      toast(`Issue #${res.id} reported — ${res.priority} priority`);
    } catch (err) { toast(err.message, 'error'); }
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Navigation
  $$('.nav-item').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); });
  });

  // Mobile menu toggle
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
  });

  // Modal open buttons
  $('#btn-new-guest')?.addEventListener('click',    () => openModal('modal-guest'));
  $('#btn-checkin')?.addEventListener('click',      () => openModal('modal-checkin'));
  $('#btn-checkout')?.addEventListener('click',     () => openModal('modal-checkout'));
  $('#btn-new-order')?.addEventListener('click',    () => openModal('modal-order'));
  $('#btn-report-issue')?.addEventListener('click', () => openModal('modal-issue'));

  // Modal close — backdrop click or × button
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Refresh button
  $('#refresh-btn').addEventListener('click', () => {
    loadAll();
    toast('Data refreshed', 'info');
  });

  // Clear events
  $('#btn-clear-events')?.addEventListener('click', () => {
    state.events = [];
    renderEventStream();
    if ($('#mini-events')) $('#mini-events').innerHTML = '<div class="empty">No events yet…</div>';
  });

  // Topbar date
  function updateClock() {
    const el = $('#topbar-date');
    if (el) el.textContent = new Date().toLocaleString('en-US', { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  }
  updateClock();
  setInterval(updateClock, 30000);

  // Set today as default check-in date
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const ci = $('input[name="check_in_date"]');
  const co = $('input[name="check_out_date"]');
  if (ci) ci.value = today;
  if (co) co.value = tomorrow;

  // Forms
  setupForms();

  // Connect WebSocket
  connectWS();

  // Load initial data
  loadAll();

  // Poll every 20s
  setInterval(loadAll, 20000);
});
