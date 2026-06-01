/**
 * Hotel OS — Dashboard
 *
 * WebSocket  : ws://localhost:8005/ws/dashboard  (real-time events)
 * REST polls : Reception :8001, Room-Service :8003, Maintenance :8004
 *
 * Event format from backend:
 *   { event_type, timestamp, service, data }
 *
 * REST response formats:
 *   GET /rooms          → [ {id, number, floor, room_type, status, price_per_night, …} ]
 *   GET /orders/room/:id → { room_id, orders: […] }
 *   GET /maintenance/queue → { queue: [{position, issue_id, room_id, priority, status, description}] }
 */

const API = {
  TOKEN: 'hotel-os-secret-token-2024',
  RECEPTION:    'http://localhost:8001',
  HOUSEKEEPING: 'http://localhost:8002',
  ROOM_SVC:     'http://localhost:8003',
  MAINT:        'http://localhost:8004',
  WS_GW:        'http://localhost:8005',
  WS_URL:       'ws://localhost:8005/ws/dashboard',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  return { 'x-token': API.TOKEN, 'Content-Type': 'application/json' };
}

async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, { headers: authHeaders(), ...opts });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (e) {
    console.warn(`[API] ${url} →`, e.message);
    return null;
  }
}

function fmt(isoStr) {
  if (!isoStr) return '—';
  try { return new Date(isoStr).toLocaleString(); } catch { return isoStr; }
}

function statusBadge(s) {
  const map = {
    clean:       'badge-success',
    occupied:    'badge-danger',
    cleaning:    'badge-warning',
    dirty:       'badge-secondary',
    maintenance: 'badge-purple',
    received:    'badge-info',
    preparing:   'badge-warning',
    in_delivery: 'badge-warning',
    delivered:   'badge-success',
    cancelled:   'badge-secondary',
    reported:    'badge-info',
    resolved:    'badge-success',
    critical:    'badge-danger',
    high:        'badge-warning',
    normal:      'badge-info',
    low:         'badge-success',
  };
  const cls = map[(s || '').toLowerCase()] || 'badge-info';
  return `<span class="badge ${cls}">${s}</span>`;
}

// ── Dashboard Manager ─────────────────────────────────────────────────────────

class DashboardManager {
  constructor() {
    this.ws          = null;
    this.wsRetryMs   = 2000;
    this.rooms       = new Map();   // id → room object
    this.bookings    = new Map();   // booking_id → booking
    this.orders      = new Map();   // order_id  → order
    this.maintenance = new Map();   // issue_id  → issue
    this.events      = [];
    this.maxEvents   = 150;
    this._pollTimer  = null;

    this._init();
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  _init() {
    this._setupNav();
    this._setupToolbar();
    this._setupForms();
    this._connectWS();
    this._loadAll();
    // Poll REST every 15 s so data stays fresh even without WS events
    this._pollTimer = setInterval(() => this._loadAll(), 15_000);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  _setupNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this._switchSection(btn.dataset.section));
    });
  }

  _switchSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id)?.classList.add('active');
    document.querySelector(`[data-section="${id}"]`)?.classList.add('active');
  }

  // ── Toolbar buttons ────────────────────────────────────────────────────────

  _setupToolbar() {
    document.getElementById('clear-events')?.addEventListener('click', () => {
      this.events = [];
      this._renderEvents();
    });
    document.getElementById('refresh-btn')?.addEventListener('click', () => this._loadAll());
  }

  // ── Quick-action forms ─────────────────────────────────────────────────────

  _setupForms() {
    // Check-in form
    document.getElementById('form-checkin')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        guest_id:       parseInt(fd.get('guest_id')),
        room_type:      fd.get('room_type'),
        check_in_date:  fd.get('check_in_date'),
        check_out_date: fd.get('check_out_date'),
        preferred_floor: fd.get('preferred_floor') ? parseInt(fd.get('preferred_floor')) : null,
      };
      const res = await apiFetch(`${API.RECEPTION}/check-in`, { method: 'POST', body: JSON.stringify(body) });
      if (res) {
        this._toast(`✅ Check-in OK — Booking #${res.booking_id}, Room ${res.room_number}`);
        this._loadAll();
      } else {
        this._toast('❌ Check-in failed — see console', 'error');
      }
    });

    // Check-out form
    document.getElementById('form-checkout')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { booking_id: parseInt(fd.get('booking_id')), room_id: parseInt(fd.get('room_id')) };
      const res = await apiFetch(`${API.RECEPTION}/check-out`, { method: 'POST', body: JSON.stringify(body) });
      if (res) {
        this._toast(`✅ Check-out OK — Total: $${res.bill?.total_bill?.toFixed(2)}`);
        this._loadAll();
      } else {
        this._toast('❌ Check-out failed — see console', 'error');
      }
    });

    // Create guest form
    document.getElementById('form-guest')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = { first_name: fd.get('first_name'), last_name: fd.get('last_name'), email: fd.get('email'), phone: fd.get('phone') || null };
      const res = await apiFetch(`${API.RECEPTION}/guests`, { method: 'POST', body: JSON.stringify(body) });
      if (res) {
        this._toast(`✅ Guest created — ID: ${res.id}`);
        e.target.reset();
      } else {
        this._toast('❌ Guest creation failed', 'error');
      }
    });

    // Room order form
    document.getElementById('form-order')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        room_id: parseInt(fd.get('room_id')),
        items: [{ name: fd.get('item_name'), quantity: parseInt(fd.get('quantity')), price: parseFloat(fd.get('price')) }],
        special_requests: fd.get('special_requests') || null,
      };
      const res = await apiFetch(`${API.ROOM_SVC}/orders`, { method: 'POST', body: JSON.stringify(body) });
      if (res) {
        this._toast(`✅ Order #${res.id} created`);
        this._loadOrders();
      } else {
        this._toast('❌ Order failed', 'error');
      }
    });

    // Maintenance report form
    document.getElementById('form-maintenance')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = {
        room_id:     parseInt(fd.get('room_id')),
        description: fd.get('description'),
        priority:    fd.get('priority'),
        reported_by: fd.get('reported_by') || 'staff',
      };
      const res = await apiFetch(`${API.MAINT}/maintenance/report`, { method: 'POST', body: JSON.stringify(body) });
      if (res) {
        this._toast(`✅ Issue #${res.id} reported`);
        this._loadMaintenance();
      } else {
        this._toast('❌ Report failed', 'error');
      }
    });

    // Start / complete cleaning buttons (delegated)
    document.getElementById('maintenance-list')?.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const roomId = parseInt(btn.dataset.roomId);
      const action = btn.dataset.action;
      if (action === 'start-clean') {
        await apiFetch(`${API.HOUSEKEEPING}/clean/start?room_id=${roomId}`, { method: 'POST' });
        this._loadAll();
      } else if (action === 'complete-clean') {
        await apiFetch(`${API.HOUSEKEEPING}/clean/complete?room_id=${roomId}`, { method: 'POST' });
        this._loadAll();
      }
    });
  }

  // ── WebSocket ──────────────────────────────────────────────────────────────

  _connectWS() {
    if (this.ws && this.ws.readyState < 2) return; // already open/connecting

    this.ws = new WebSocket(API.WS_URL);

    this.ws.onopen = () => {
      this._setConnected(true);
      this.wsRetryMs = 2000;
      console.log('[WS] connected');
    };

    this.ws.onmessage = ({ data }) => {
      try { this._handleWSMessage(JSON.parse(data)); }
      catch (e) { console.error('[WS] parse error', e); }
    };

    this.ws.onerror = err => {
      console.warn('[WS] error', err);
      this._setConnected(false);
    };

    this.ws.onclose = () => {
      this._setConnected(false);
      console.log(`[WS] closed — retry in ${this.wsRetryMs}ms`);
      setTimeout(() => this._connectWS(), this.wsRetryMs);
      this.wsRetryMs = Math.min(this.wsRetryMs * 1.5, 30_000);
    };
  }

  _setConnected(ok) {
    const badge = document.getElementById('status');
    if (!badge) return;
    badge.textContent = ok ? '● Connected' : '● Disconnected';
    badge.className   = `status-badge ${ok ? 'connected' : 'disconnected'}`;
  }

  // ── WS message router ──────────────────────────────────────────────────────

  _handleWSMessage(msg) {
    // msg = { event_type, timestamp, service, data }
    const { event_type, data } = msg;

    this._pushEvent(msg);   // always log to event feed

    switch (event_type) {
      case 'dashboard_init':
        // data.rooms = { "1": "clean", "2": "occupied", … }
        if (data?.rooms) {
          for (const [id, status] of Object.entries(data.rooms)) {
            const existing = this.rooms.get(parseInt(id));
            if (existing) existing.status = status;
          }
          this._renderRoomGrid();
          this._updateStats();
        }
        break;

      case 'check_in_completed':
        this._loadRooms();
        this._loadBookings();
        break;

      case 'room_vacated':
        this._loadRooms();
        this._loadBookings();
        break;

      case 'room_cleaned':
        if (data?.room_id) {
          const r = this.rooms.get(data.room_id);
          if (r) { r.status = 'clean'; this._renderRoomGrid(); this._updateStats(); }
        }
        break;

      case 'order_status_changed':
        this._loadOrders();
        break;

      case 'maintenance_updated':
        this._loadMaintenance();
        break;

      default:
        // unknown event — already logged
        break;
    }
  }

  // ── REST loaders ───────────────────────────────────────────────────────────

  async _loadAll() {
    await Promise.all([
      this._loadRooms(),
      this._loadBookings(),
      this._loadOrders(),
      this._loadMaintenance(),
    ]);
  }

  async _loadRooms() {
    // GET /rooms → array of room objects
    const data = await apiFetch(`${API.RECEPTION}/rooms`);
    if (!Array.isArray(data)) return;
    data.forEach(r => this.rooms.set(r.id, r));
    this._renderRoomGrid();
    this._renderRoomsList();
    this._updateStats();
  }

  async _loadBookings() {
    // No dedicated "list all bookings" endpoint — derive from rooms
    // We show rooms that are occupied with their guest info
    this._renderBookings();
  }

  async _loadOrders() {
    // Fetch orders for every occupied room
    const occupied = Array.from(this.rooms.values()).filter(r => r.status === 'occupied');
    const results = await Promise.all(
      occupied.map(r => apiFetch(`${API.ROOM_SVC}/orders/room/${r.id}`))
    );
    this.orders.clear();
    results.forEach(res => {
      if (res?.orders) {
        res.orders.forEach(o => this.orders.set(o.id, o));
      }
    });
    this._renderOrders();
  }

  async _loadMaintenance() {
    const data = await apiFetch(`${API.MAINT}/maintenance/queue`);
    if (!data?.queue) return;
    this.maintenance.clear();
    data.queue.forEach(item => this.maintenance.set(item.issue_id, item));
    this._renderMaintenance();
  }

  // ── Renderers ──────────────────────────────────────────────────────────────

  _renderRoomGrid() {
    const grid = document.getElementById('room-grid');
    if (!grid) return;
    grid.innerHTML = '';
    Array.from(this.rooms.values())
      .sort((a, b) => a.id - b.id)
      .forEach(room => {
        const card = document.createElement('div');
        card.className = `room-card ${(room.status || 'clean').toLowerCase()}`;
        card.title = `Room ${room.number} — ${room.status} — ${room.room_type} — $${room.price_per_night}/night`;
        card.innerHTML = `
          <div class="room-number">${room.number}</div>
          <div class="room-type">${room.room_type}</div>
        `;
        card.addEventListener('click', () => this._showRoomDetail(room));
        grid.appendChild(card);
      });
  }

  _renderRoomsList() {
    const container = document.getElementById('rooms-list');
    if (!container) return;
    if (this.rooms.size === 0) {
      container.innerHTML = '<div class="empty-state">No rooms loaded</div>';
      return;
    }
    container.innerHTML = Array.from(this.rooms.values())
      .sort((a, b) => a.id - b.id)
      .map(r => `
        <div class="list-item">
          <div>
            <div class="list-item-title">Room ${r.number} — Floor ${r.floor}</div>
            <div class="list-item-info">${r.room_type} · $${r.price_per_night}/night · Last cleaned: ${fmt(r.last_cleaned)}</div>
          </div>
          <div>${statusBadge(r.status)}</div>
        </div>
      `).join('');
  }

  _updateStats() {
    const all = Array.from(this.rooms.values());
    const count = s => all.filter(r => r.status === s).length;
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('total-rooms',    all.length);
    set('clean-rooms',    count('clean'));
    set('occupied-rooms', count('occupied'));
    set('cleaning-rooms', count('cleaning'));
  }

  _renderBookings() {
    const container = document.getElementById('bookings-list');
    if (!container) return;
    const occupied = Array.from(this.rooms.values()).filter(r => r.status === 'occupied');
    if (occupied.length === 0) {
      container.innerHTML = '<div class="empty-state">No occupied rooms</div>';
      return;
    }
    container.innerHTML = occupied.map(r => `
      <div class="list-item">
        <div>
          <div class="list-item-title">Room ${r.number} (${r.room_type})</div>
          <div class="list-item-info">Guest ID: ${r.current_guest_id ?? '—'} · Floor ${r.floor}</div>
        </div>
        <div>${statusBadge('occupied')}</div>
      </div>
    `).join('');
  }

  _renderOrders() {
    const container = document.getElementById('services-list');
    if (!container) return;
    if (this.orders.size === 0) {
      container.innerHTML = '<div class="empty-state">No active orders</div>';
      return;
    }
    const sorted = Array.from(this.orders.values())
      .sort((a, b) => b.id - a.id);
    container.innerHTML = sorted.map(o => {
      const items = Array.isArray(o.items)
        ? o.items.map(i => `${i.quantity}× ${i.name}`).join(', ')
        : '—';
      return `
        <div class="list-item">
          <div>
            <div class="list-item-title">Order #${o.id} — Room ${o.room_id}</div>
            <div class="list-item-info">${items} · $${(o.total_amount || 0).toFixed(2)}</div>
            <div class="list-item-info">Created: ${fmt(o.created_at)}</div>
          </div>
          <div>${statusBadge(o.status)}</div>
        </div>
      `;
    }).join('');
  }

  _renderMaintenance() {
    const container = document.getElementById('maintenance-list');
    if (!container) return;
    if (this.maintenance.size === 0) {
      container.innerHTML = '<div class="empty-state">No maintenance issues</div>';
      return;
    }
    const sorted = Array.from(this.maintenance.values())
      .sort((a, b) => a.position - b.position);
    container.innerHTML = sorted.map(issue => `
      <div class="list-item">
        <div>
          <div class="list-item-title">#${issue.position} — Room ${issue.room_id}</div>
          <div class="list-item-info">${issue.description}</div>
          <div class="list-item-info">Status: ${issue.status}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end">
          ${statusBadge(issue.priority)}
          ${statusBadge(issue.status)}
        </div>
      </div>
    `).join('');
  }

  // ── Event log ──────────────────────────────────────────────────────────────

  _pushEvent(msg) {
    this.events.unshift({
      time:  fmt(msg.timestamp) || new Date().toLocaleTimeString(),
      type:  msg.event_type || 'unknown',
      svc:   msg.service   || '—',
      data:  msg.data      || {},
    });
    if (this.events.length > this.maxEvents) this.events.length = this.maxEvents;
    this._renderEvents();
  }

  _renderEvents() {
    const log = document.getElementById('event-log');
    if (!log) return;
    if (this.events.length === 0) {
      log.innerHTML = '<div class="empty-state">No events yet</div>';
      return;
    }
    log.innerHTML = this.events.map(ev => `
      <div class="event-item">
        <div class="event-time">${ev.time}</div>
        <div class="event-type">${ev.type}</div>
        <div class="event-svc">${ev.svc}</div>
        <div class="event-data">${JSON.stringify(ev.data)}</div>
      </div>
    `).join('');
  }

  // ── Room detail modal ──────────────────────────────────────────────────────

  _showRoomDetail(room) {
    const modal = document.getElementById('room-modal');
    const body  = document.getElementById('room-modal-body');
    if (!modal || !body) return;
    body.innerHTML = `
      <table class="detail-table">
        <tr><th>Number</th><td>${room.number}</td></tr>
        <tr><th>Floor</th><td>${room.floor}</td></tr>
        <tr><th>Type</th><td>${room.room_type}</td></tr>
        <tr><th>Status</th><td>${statusBadge(room.status)}</td></tr>
        <tr><th>Price/night</th><td>$${room.price_per_night}</td></tr>
        <tr><th>Guest ID</th><td>${room.current_guest_id ?? '—'}</td></tr>
        <tr><th>Last cleaned</th><td>${fmt(room.last_cleaned)}</td></tr>
        <tr><th>Amenities</th><td>${(room.amenities || []).join(', ') || '—'}</td></tr>
      </table>
    `;
    modal.classList.add('open');
  }

  // ── Toast ──────────────────────────────────────────────────────────────────

  _toast(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3500);
  }
}

// ── Modal close ───────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  window.dashboard = new DashboardManager();

  // Close modal on backdrop click or × button
  document.getElementById('room-modal')?.addEventListener('click', e => {
    if (e.target.id === 'room-modal' || e.target.dataset.close) {
      document.getElementById('room-modal').classList.remove('open');
    }
  });
});
