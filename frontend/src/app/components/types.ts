export type RoomStatus = 'available' | 'occupied' | 'dirty' | 'maintenance';

export interface Room {
  id: string;
  number: string;
  floor: number;
  status: RoomStatus;
  guestName?: string;
  checkIn?: string;
  checkOut?: string;
  roomType: 'Single' | 'Double' | 'Luxury Suite' | 'Accessible';
  balance?: number;
}

export interface ActivityEvent {
  id: string;
  message: string;
  time: Date;
  type: 'status' | 'checkin' | 'checkout' | 'maintenance' | 'service';
}

export interface MaintenanceTicket {
  id: string;
  roomNumber: string;
  description: string;
  urgency: 'critical' | 'high' | 'normal' | 'low';
  assignedTech?: string;
  dateLogged: string;
  status: 'open' | 'in-progress' | 'resolved';
  notes?: string;
}

export interface Technician {
  id: string;
  name: string;
  status: 'available' | 'busy';
  currentJob?: string;
}

export interface OrderItem {
  name: string;
  quantity: number;
}

export interface RoomOrder {
  id: string;
  roomNumber: string;
  items: OrderItem[];
  timestamp: Date;
  status: 'received' | 'preparing' | 'delivery' | 'delivered';
  delayed?: boolean;
}

export type ActiveView = 'dashboard' | 'reception' | 'housekeeping' | 'kitchen' | 'maintenance' | 'analytics' | 'settings' | 'guest-portal';
