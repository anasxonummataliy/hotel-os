import type { Room, MaintenanceTicket, Technician, RoomOrder, ActivityEvent } from './types';

export const initialRooms: Room[] = [
  // Floor 1
  { id: '101', number: '101', floor: 1, status: 'occupied', guestName: 'James Whitmore', checkIn: '2026-06-02', checkOut: '2026-06-07', roomType: 'Single', balance: 1240 },
  { id: '102', number: '102', floor: 1, status: 'available', roomType: 'Double' },
  { id: '103', number: '103', floor: 1, status: 'dirty', roomType: 'Single' },
  { id: '104', number: '104', floor: 1, status: 'occupied', guestName: 'Elena Marchetti', checkIn: '2026-06-03', checkOut: '2026-06-06', roomType: 'Luxury Suite', balance: 3850 },
  { id: '105', number: '105', floor: 1, status: 'maintenance', roomType: 'Accessible' },
  // Floor 2
  { id: '201', number: '201', floor: 2, status: 'occupied', guestName: 'David Chen', checkIn: '2026-06-01', checkOut: '2026-06-08', roomType: 'Double', balance: 2100 },
  { id: '202', number: '202', floor: 2, status: 'maintenance', roomType: 'Double' },
  { id: '203', number: '203', floor: 2, status: 'available', roomType: 'Single' },
  { id: '204', number: '204', floor: 2, status: 'dirty', roomType: 'Luxury Suite' },
  { id: '205', number: '205', floor: 2, status: 'occupied', guestName: 'Sofia Andersson', checkIn: '2026-06-04', checkOut: '2026-06-09', roomType: 'Accessible', balance: 980 },
];

export const initialTickets: MaintenanceTicket[] = [
  { id: 'TKT-001', roomNumber: '115', description: 'Broken Shower — hot water not working', urgency: 'critical', assignedTech: 'Alex Rivera', dateLogged: '2026-06-04 07:12', status: 'in-progress' },
  { id: 'TKT-002', roomNumber: '202', description: 'AC Malfunction — unit not cooling', urgency: 'high', assignedTech: 'John Park', dateLogged: '2026-06-04 08:30', status: 'open' },
  { id: 'TKT-003', roomNumber: '105', description: 'Accessible door sensor fault', urgency: 'critical', dateLogged: '2026-06-03 22:45', status: 'open' },
  { id: 'TKT-004', roomNumber: '301', description: 'TV remote not responding', urgency: 'low', dateLogged: '2026-06-04 09:00', status: 'open' },
  { id: 'TKT-005', roomNumber: '204', description: 'Mini-bar fridge humming loudly', urgency: 'normal', assignedTech: 'Maria Santos', dateLogged: '2026-06-04 06:55', status: 'in-progress' },
  { id: 'TKT-006', roomNumber: '110', description: 'Bathroom exhaust fan broken', urgency: 'high', dateLogged: '2026-06-03 18:20', status: 'open' },
];

export const initialTechnicians: Technician[] = [
  { id: 't1', name: 'Alex Rivera', status: 'busy', currentJob: 'Room 115 - Shower repair' },
  { id: 't2', name: 'John Park', status: 'available' },
  { id: 't3', name: 'Maria Santos', status: 'busy', currentJob: 'Room 204 - Mini-bar' },
  { id: 't4', name: 'Carlos Diaz', status: 'available' },
];

export const initialOrders: RoomOrder[] = [
  {
    id: 'ORD-001',
    roomNumber: '301',
    items: [{ name: 'Coffee', quantity: 2 }, { name: 'Croissant', quantity: 1 }],
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
    status: 'preparing',
  },
  {
    id: 'ORD-002',
    roomNumber: '104',
    items: [{ name: 'Club Sandwich', quantity: 1 }, { name: 'Orange Juice', quantity: 2 }, { name: 'Caesar Salad', quantity: 1 }],
    timestamp: new Date(Date.now() - 22 * 60 * 1000),
    status: 'delivery',
    delayed: true,
  },
  {
    id: 'ORD-003',
    roomNumber: '205',
    items: [{ name: 'Sparkling Water', quantity: 3 }, { name: 'Cheese Platter', quantity: 1 }],
    timestamp: new Date(Date.now() - 4 * 60 * 1000),
    status: 'received',
  },
];

export const initialActivity: ActivityEvent[] = [
  { id: 'a1', message: 'Room 204 status changed to Dirty', time: new Date(Date.now() - 2 * 60 * 1000), type: 'status' },
  { id: 'a2', message: 'New Critical Maintenance Request for Room 105', time: new Date(Date.now() - 5 * 60 * 1000), type: 'maintenance' },
  { id: 'a3', message: 'Guest Elena Marchetti checked in to Room 104', time: new Date(Date.now() - 18 * 60 * 1000), type: 'checkin' },
  { id: 'a4', message: 'Room Service Order #ORD-002 delayed — Room 104', time: new Date(Date.now() - 22 * 60 * 1000), type: 'service' },
  { id: 'a5', message: 'Room 103 marked as Dirty after checkout', time: new Date(Date.now() - 35 * 60 * 1000), type: 'status' },
  { id: 'a6', message: 'Tech Alex Rivera assigned to TKT-001', time: new Date(Date.now() - 48 * 60 * 1000), type: 'maintenance' },
  { id: 'a7', message: 'Room 102 cleaned and marked Available', time: new Date(Date.now() - 60 * 60 * 1000), type: 'status' },
];
