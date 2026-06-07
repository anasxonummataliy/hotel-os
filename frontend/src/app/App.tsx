import { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster } from 'sonner';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LiveFeed } from './components/LiveFeed';
import { Dashboard } from './components/Dashboard';
import { Reception } from './components/Reception';
import { Housekeeping } from './components/Housekeeping';
import { KitchenDisplay } from './components/KitchenDisplay';
import { Maintenance } from './components/Maintenance';
import { Analytics } from './components/Analytics';
import { Settings } from './components/Settings';
import { LoginPage } from './components/LoginPage';
import { GuestPortal } from './components/GuestPortal';
import { useAuth } from '../contexts/AuthContext';
import { getRooms, checkIn, checkOut, getBookings, getGuests, type RoomData, type CheckInRequest } from '../lib/api';
import { toast } from '../lib/toast';
import type { ActiveView, Room, ActivityEvent } from './components/types';
import { initialActivity } from './components/mockData';

function mapRoom(r: RoomData): Room {
  const statusMap: Record<string, Room['status']> = {
    clean: 'available',
    occupied: 'occupied',
    dirty: 'dirty',
    cleaning: 'dirty',
    maintenance: 'maintenance',
  };
  const typeMap: Record<string, Room['roomType']> = {
    single: 'Single',
    double: 'Double',
    suite: 'Luxury Suite',
    accessible: 'Accessible',
  };
  return {
    id: String(r.id),
    number: r.number,
    floor: r.floor,
    status: statusMap[r.status] ?? 'available',
    roomType: typeMap[r.room_type] ?? 'Single',
    // guest info is not in the basic room list — will be enriched via bookings
    guestName: undefined,
    checkIn: undefined,
    checkOut: undefined,
    balance: undefined,
  };
}

export default function App() {
  const { user, loading: authLoading, logout } = useAuth();

  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [activity, setActivity] = useState<ActivityEvent[]>(initialActivity);
  const wsRef = useRef<WebSocket | null>(null);

  const addActivity = useCallback((msg: string, type: ActivityEvent['type']) => {
    const newEvent: ActivityEvent = {
      id: `a-${Date.now()}`,
      message: msg,
      time: new Date(),
      type,
    };
    setActivity(prev => [newEvent, ...prev].slice(0, 30));
  }, []);

  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const [roomList, bookingList, guestList] = await Promise.all([
        getRooms(),
        getBookings().catch(() => []),
        getGuests().catch(() => []),
      ]);

      // Build guest name lookup
      const guestNames: Record<number, string> = {};
      for (const g of guestList) {
        guestNames[g.id] = `${g.first_name} ${g.last_name}`;
      }

      // Build guest-name lookup from active bookings
      const guestByRoom: Record<number, { name: string; checkIn: string; checkOut: string; bookingId: number; balance: number }> = {};
      for (const b of bookingList) {
        if (b.status === 'checked_in') {
          // Calculate balance: price_per_night × nights stayed so far
          const room = roomList.find(r => r.id === b.room_id);
          const checkInDate = new Date(b.check_in_date);
          const today = new Date();
          const nightsStayed = Math.max(1, Math.ceil((today.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)));
          const roomCharge = (room?.price_per_night ?? 0) * nightsStayed;

          guestByRoom[b.room_id] = {
            name: guestNames[b.guest_id] || `Mehmon #${b.guest_id}`,
            checkIn: b.check_in_date,
            checkOut: b.check_out_date,
            bookingId: b.id,
            balance: roomCharge,
          };
        }
      }

      setRooms(
        roomList.map(r => {
          const base = mapRoom(r);
          const booking = guestByRoom[r.id];
          return booking
            ? { ...base, guestName: booking.name, checkIn: booking.checkIn, checkOut: booking.checkOut, balance: booking.balance }
            : base;
        })
      );
    } catch (err) {
      console.error('Failed to load rooms:', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const ws = new WebSocket('ws://localhost:8005/ws/dashboard');
      wsRef.current = ws;

      ws.onopen = () => {
        addActivity('Live dashboard connected', 'status');
      };

      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data as string) as {
            event_type: string;
            data: Record<string, unknown>;
          };

          switch (payload.event_type) {
            case 'dashboard_init':
              fetchRooms();
              break;

            case 'check_in_completed':
              addActivity(
                `Guest checked in to Room ${payload.data.room_number ?? ''}`,
                'checkin',
              );
              fetchRooms();
              break;

            case 'room_vacated':
              addActivity(
                `Room ${payload.data.room_number ?? ''} vacated — awaiting cleaning`,
                'checkout',
              );
              fetchRooms();
              break;

            case 'room_cleaned':
              addActivity(
                `Room ${payload.data.room_number ?? ''} cleaned and ready`,
                'status',
              );
              fetchRooms();
              break;

            case 'order_status_changed':
              addActivity(
                `Order #${payload.data.order_id} → ${payload.data.status}`,
                'service',
              );
              break;

            case 'maintenance_updated':
              addActivity(
                `Maintenance issue #${payload.data.issue_id}: ${payload.data.status}`,
                'maintenance',
              );
              break;

            default:
              break;
          }
        } catch {
        }
      };

      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 4000);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [user, addActivity, fetchRooms]);

  useEffect(() => {
    if (user) fetchRooms();
  }, [user, fetchRooms]);

  const handleCheckIn = useCallback(async (data: {
    guestName: string;
    guestId: number | null;
    nights: number;
    roomType: 'Single' | 'Double' | 'Luxury Suite' | 'Accessible';
    floorPreference: 'low' | 'high' | 'any';
    nearElevator: boolean;
  }) => {
    if (!data.guestId) {
      toast.error('Please select a guest');
      return;
    }
    const backendTypeMap: Record<string, string> = {
      Single: 'single',
      Double: 'double',
      'Luxury Suite': 'suite',
      Accessible: 'accessible',
    };
    const floorMap: Record<string, number | undefined> = {
      low: 1,
      high: 2,
      any: undefined,
    };

    const today = new Date();
    const checkout = new Date();
    checkout.setDate(today.getDate() + data.nights);

    const req: CheckInRequest = {
      guest_id: data.guestId,
      room_type: backendTypeMap[data.roomType] ?? 'single',
      check_in_date: today.toISOString().split('T')[0],
      check_out_date: checkout.toISOString().split('T')[0],
      preferred_floor: floorMap[data.floorPreference],
      special_requests: data.nearElevator ? 'Near elevator' : undefined,
    };

    try {
      await checkIn(req);
      addActivity(`${data.guestName} checked in`, 'checkin');
      await fetchRooms();
    } catch (err: unknown) {
      alert(
        err instanceof Error
          ? err.message
          : 'Check-in failed. Check backend.',
      );
    }
  }, [addActivity, fetchRooms]);

  const handleCheckOut = useCallback(async (roomId: string) => {
    try {
      const bookingList = await getBookings();
      const booking = bookingList.find(
        b => String(b.room_id) === roomId && b.status === 'checked_in',
      );
      if (!booking) {
        toast.error('No active booking found for this room.');
        return;
      }
      const result = await checkOut({ booking_id: booking.id, room_id: booking.room_id });
      const bill = result.bill;
      addActivity(`Room ${roomId} checked out — Total: $${bill.total_bill.toFixed(2)}`, 'checkout');
      toast.success(`🚪 Check-out complete — Bill: $${bill.total_bill.toFixed(2)} (${bill.num_nights} nights × $${bill.nightly_rate} + $${bill.room_service_charges} room service)`);

      // Open print receipt
      const room = rooms.find(r => r.id === roomId);
      const receiptHtml = `
        <div style="font-family:sans-serif;padding:24px;max-width:320px;margin:auto;border:2px solid #000;">
          <h2 style="text-align:center;margin:0 0 8px;">🏨 HotelOS</h2>
          <p style="text-align:center;color:#666;margin:0 0 16px;font-size:12px;">Guest Check-Out Receipt</p>
          <hr/>
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <tr><td style="padding:6px 0;color:#666;">Guest</td><td style="text-align:right;font-weight:bold;">${room?.guestName || 'Guest'}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Room</td><td style="text-align:right;font-weight:bold;">${room?.number || roomId}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Nights</td><td style="text-align:right;">${bill.num_nights}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Nightly Rate</td><td style="text-align:right;">$${bill.nightly_rate.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Room Service</td><td style="text-align:right;">$${bill.room_service_charges.toFixed(2)}</td></tr>
            <tr><td style="padding:6px 0;color:#666;">Additional</td><td style="text-align:right;">$${bill.additional_charges.toFixed(2)}</td></tr>
            <tr style="border-top:2px solid #000;"><td style="padding:10px 0;font-weight:bold;font-size:15px;">TOTAL</td><td style="text-align:right;font-weight:bold;font-size:15px;">$${bill.total_bill.toFixed(2)}</td></tr>
          </table>
          <hr/>
          <p style="text-align:center;font-size:11px;color:#999;margin-top:12px;">Thank you for staying with us!</p>
        </div>`;
      const w = window.open('', '_blank', 'width=400,height=500');
      if (w) { w.document.write(receiptHtml); w.document.close(); w.print(); }

      await fetchRooms();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check-out failed.');
    }
  }, [addActivity, fetchRooms, rooms]);

  const handleRoomClick = (room: Room) => {
    if (room.status === 'occupied') setActiveView('reception');
  };

  if (authLoading) {
    return (
      <div style={{
        display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#0f172a', color: '#94a3b8', fontFamily: 'Inter, sans-serif',
        fontSize: 14,
      }}>
        Loading…
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (user.role === 'guest') {
    return (
      <>
        <Toaster position="top-right" richColors />
        <GuestPortal />
      </>
    );
  }

  const showFeed = activeView === 'dashboard' || activeView === 'reception';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, sans-serif', backgroundColor: '#f8fafc' }}>
      <Toaster position="top-right" richColors />
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header currentView={activeView} onLogout={logout} onNavigate={(v) => setActiveView(v as ActiveView)} />

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {roomsLoading && rooms.length === 0 && (
              <div style={{ padding: 24, color: '#94a3b8', fontSize: 13 }}>
                Loading rooms…
              </div>
            )}

            {activeView === 'dashboard' && (
              <Dashboard rooms={rooms} onRoomClick={handleRoomClick} />
            )}
            {activeView === 'reception' && (
              <Reception rooms={rooms} onCheckIn={handleCheckIn} onCheckOut={handleCheckOut} />
            )}
            {activeView === 'housekeeping' && <Housekeeping onStatusChange={fetchRooms} />}
            {activeView === 'kitchen' && <KitchenDisplay />}
            {activeView === 'maintenance' && <Maintenance />}
            {activeView === 'analytics' && <Analytics rooms={rooms} />}
            {activeView === 'settings' && <Settings />}
          </main>

          {showFeed && <LiveFeed events={activity} />}
        </div>
      </div>
    </div>
  );
}
