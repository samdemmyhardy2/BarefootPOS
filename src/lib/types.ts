export type Role = "ADMIN" | "EMPLOYEE";
export type OrderStatus =
  "PENDING" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";
export type RoomSize = "NORMAL" | "FAMILY";
export type RoomStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
export type OrderPaymentMethod = "CASH" | "ROOM_CHECKOUT";
export type OrderPaymentStatus = "UNPAID" | "PAID" | "ROOM_FOLIO";
export type RoomChargeKind = "ROOM_FEE" | "WATER" | "FOOD" | "RESTAURANT_ORDER" | "OTHER";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "COMPLETED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  jobTitle: string;
  avatarUrl?: string | null;
}

export interface StaffTask {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueAt?: string | null;
  assignments: { employee: Pick<User, "id" | "name" | "jobTitle" | "avatarUrl">; assignedAt: string }[];
  createdBy?: Pick<User, "id" | "name"> | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  items?: MenuItem[];
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  imageUrl?: string | null;
  allergens: string[];
  allergensMy: string[];
  allergensTh: string[];
  dietaryInfo: string[];
  dietaryInfoMy: string[];
  dietaryInfoTh: string[];
  availableExtras: string[];
  availableExtrasMy: string[];
  availableExtrasTh: string[];
  categoryId: string;
  category?: Category;
}

export interface DiningTable {
  id: string;
  tableNumber: number;
  capacity: number;
  status: TableStatus;
}

export interface RoomOccupant {
  id: string;
  name: string;
}

export interface RoomCharge {
  id: string;
  orderId?: string | null;
  kind: RoomChargeKind;
  description: string;
  quantity: number;
  unitPrice: number | string;
  amount: number | string;
  occurredAt: string;
}

export interface RoomStay {
  id: string;
  roomId: string;
  room?: Room;
  primaryGuestName: string;
  occupants: RoomOccupant[];
  checkedInAt: string;
  checkedOutAt?: string | null;
  charges?: RoomCharge[];
  orders?: Order[];
  folioTotal?: number;
}

export interface Room {
  id: string;
  roomNumber: number;
  size: RoomSize;
  usageFee: number | string;
  facilities: string[];
  status: RoomStatus;
  stays: RoomStay[];
  _count?: { stays: number };
}

export interface OrderLine {
  id?: string;
  menuItemId: string;
  quantity: number;
  unitPrice?: number | string;
  subtotal?: number | string;
  removeIngredients?: string | null;
  addExtras?: string | null;
  selectedAllergens?: string[];
  specialNotes?: string | null;
  menuItem: MenuItem;
}

export interface Order {
  id: string;
  tableId?: string | null;
  table?: DiningTable | null;
  roomStayId?: string | null;
  roomStay?: RoomStay | null;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paidAt?: string | null;
  paidBy?: Pick<User, "id" | "name"> | null;
  waiterId: string;
  waiter: Pick<User, "id" | "name">;
  servedBy?: Pick<User, "id" | "name"> | null;
  status: OrderStatus;
  totalAmount: number | string;
  preparingAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  items: OrderLine[];
  createdAt: string;
  updatedAt: string;
}

export interface Employee extends User {
  isOnline: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeShift {
  id: string;
  employeeId: string;
  employee?: Pick<Employee, "id" | "name" | "email">;
  checkedInAt: string;
  checkedOutAt?: string | null;
  breaks?: { id: string; startedAt: string; endedAt?: string | null }[];
}

export const money = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(value ?? 0),
  );

export const orderLocation = (order: Pick<Order, "table" | "roomStay">) =>
  order.table ? `Table ${order.table.tableNumber}` : order.roomStay?.room ? `Room ${order.roomStay.room.roomNumber}` : "Room service";

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
