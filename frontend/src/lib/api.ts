const TOKEN_KEY = 'hotel_os_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const d = body.detail;
      if (typeof d === 'string') {
        detail = d;
      } else if (d && typeof d === 'object') {
        detail = d.detail || d.suggestion || JSON.stringify(d);
      } else {
        detail = JSON.stringify(body);
      }
    } catch {
    }
    throw new Error(detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserInfo;
}

export interface UserInfo {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  guest_id: number | null;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const body = new URLSearchParams({ username, password });
  const res = await fetch('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
    } catch { }
    throw new Error(detail);
  }
  return res.json();
}

export function getMe(): Promise<UserInfo> {
  return request<UserInfo>('/auth/me');
}

export interface RoomData {
  id: number;
  number: string;
  floor: number;
  status: string;
  room_type: string;
  price_per_night: number;
  guest_id: number | null;
  last_cleaned: string | null;
}

export function getRooms(): Promise<RoomData[]> {
  return request<RoomData[]>('/rooms');
}

export interface GuestData {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  passport_id: string | null;
}

export interface GuestCredentials {
  guest_id: number;
  user_id: number;
  full_name: string;
  username: string;
  password: string;
}

export function getGuests(): Promise<GuestData[]> {
  return request<GuestData[]>('/guests');
}

export function registerGuest(data: {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  passport_id?: string;
}): Promise<GuestCredentials> {
  return request<GuestCredentials>('/guests/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface BookingData {
  id: number;
  guest_id: number;
  room_id: number;
  check_in_date: string;
  check_out_date: string;
  status: string;
  total_cost: number;
  special_requests: string | null;
}

export function getBookings(): Promise<BookingData[]> {
  return request<BookingData[]>('/bookings');
}

export interface CheckInRequest {
  guest_id: number;
  room_type: string;
  check_in_date: string;
  check_out_date: string;
  preferred_floor?: number;
  special_requests?: string;
}

export interface CheckInResponse {
  booking_id: number;
  room_id: number;
  room_number: string;
  guest_id: number;
  check_in_date: string;
  check_out_date: string;
  status: string;
  price_per_night: number;
}

export function checkIn(data: CheckInRequest): Promise<CheckInResponse> {
  return request<CheckInResponse>('/check-in', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface CheckOutRequest {
  booking_id: number;
  room_id: number;
}

export interface CheckOutResponse {
  booking_id: number;
  room_id: number;
  bill: {
    nightly_rate: number;
    num_nights: number;
    room_service_charges: number;
    additional_charges: number;
    total_bill: number;
  };
  status: string;
}

export function checkOut(data: CheckOutRequest): Promise<CheckOutResponse> {
  return request<CheckOutResponse>('/check-out', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function startCleaning(roomId: number): Promise<{ status: string; room_id: number }> {
  return request(`/clean/start?room_id=${roomId}`, { method: 'POST' });
}

export function completeCleaning(roomId: number): Promise<{ status: string; room_id: number }> {
  return request(`/clean/complete?room_id=${roomId}`, { method: 'POST' });
}

export function getCleaningQueue(): Promise<{ queue: { room_id: number; priority: number; status: string }[] }> {
  return request('/queue');
}

export interface MaintenanceTicketData {
  id: number;
  room_id: number;
  description: string;
  priority: string;
  status: string;
  reported_by?: string;
  resolution_notes?: string;
  resolved_at?: string | null;
  created_at: string;
}

export function getMaintenanceTickets(): Promise<MaintenanceTicketData[]> {
  return request<MaintenanceTicketData[]>('/maintenance/tickets');
}

export function createMaintenanceTicket(data: {
  room_id: number;
  description: string;
  priority: string;
  reported_by?: string;
}): Promise<MaintenanceTicketData> {
  return request<MaintenanceTicketData>('/maintenance/report', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function resolveMaintenanceTicket(
  issueId: number,
  resolutionNotes?: string,
): Promise<MaintenanceTicketData> {
  return request<MaintenanceTicketData>(`/maintenance/${issueId}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ resolution_notes: resolutionNotes ?? 'Resolved' }),
  });
}

export function getMaintenanceQueue(): Promise<{
  queue: { position: number; issue_id: number; room_id: number; priority: string; status: string; description: string }[]
}> {
  return request('/maintenance/queue');
}

export interface OrderData {
  id: number;
  room_id: number;
  items: { name: string; quantity: number; price: number }[];
  status: string;
  total_amount: number;
  created_at: string;
}

export function getOrders(): Promise<OrderData[]> {
  return request<OrderData[]>('/orders');
}

export function getMyBookings(): Promise<BookingData[]> {
  return request<BookingData[]>('/bookings/my');
}

export function getOrdersByRoom(roomId: number): Promise<OrderData[]> {
  return request<OrderData[]>(`/orders/room/${roomId}`);
}

export function createOrder(data: {
  room_id: number;
  items: { name: string; quantity: number; price: number }[];
}): Promise<OrderData> {
  return request<OrderData>('/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
