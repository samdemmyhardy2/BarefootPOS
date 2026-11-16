export type Role = "ADMIN" | "EMPLOYEE";
export type OrderStatus =
  "PENDING" | "PREPARING" | "READY" | "SERVED" | "COMPLETED" | "CANCELLED";
export type TableStatus = "AVAILABLE" | "OCCUPIED" | "RESERVED";
export type TableShape = "ROUND" | "SQUARE" | "RECTANGLE" | "OVAL" | "BOOTH" | "BAR";
export type PrepStation = "KITCHEN" | "BAR" | "NONE";
export type SendTo = PrepStation;
export type RoomStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "ARCHIVED";
export type OrderPaymentMethod = "CASH" | "CARD" | "PROMPTPAY" | "ROOM_CHECKOUT";
export type OrderPaymentStatus = "UNPAID" | "PAID" | "ROOM_FOLIO";
export type RoomPaymentMethod = "CASH" | "CARD";
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

export interface RestaurantIdentity {
  name: string;
  logoUrl: string | null;
  vatPercent?: number;
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
  prepStation?: SendTo;
  price: number | string;
  manualPrice?: boolean;
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
  position: number;
  modifierGroups?: MenuItemModifierGroup[];
  categoryId: string;
  category?: Category;
}

export interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  nameMy: string;
  nameTh: string;
  priceAdjustment: number | string;
  defaultSelected: boolean;
  active: boolean;
  position: number;
  opensGroupId?: string | null;
  opensGroup?: ModifierGroup | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  nameMy: string;
  nameTh: string;
  category: string;
  icon?: string;
  appearance?: "RADIO" | "CHECKBOX" | "SLIDER" | "QUANTITY" | "TEXT" | "TOGGLE";
  madeAt?: "SAME_AS_DISH" | PrepStation;
  required: boolean;
  selectionType: "SINGLE" | "MULTIPLE";
  minPicks: number;
  maxPicks: number;
  includedPicks: number;
  extraPickPrice: number | string;
  allowDuplicates: boolean;
  position: number;
  options: ModifierOption[];
  menuItems?: { menuItemId: string; menuItem: { id: string; name: string } }[];
}

export interface MenuItemModifierGroup {
  position: number;
  group: ModifierGroup;
}

export interface ModifierSelectionSnapshot {
  groupId: string;
  groupName: string;
  station?: SendTo;
  options: { id: string; name: string; price: number }[];
}

export interface PrepTicketItem {
  menuItemName: string;
  quantity: number;
  modifierSelections: ModifierSelectionSnapshot[];
  removeIngredients?: string | null;
  addExtras?: string | null;
  specialNotes?: string | null;
  selectedAllergens?: string[];
  imageUrl?: string | null;
  kitchenFlag?: boolean;
}

export interface PrepTicket {
  id: string;
  orderId: string;
  station: PrepStation;
  status: "PENDING" | "PREPARING" | "READY";
  items: PrepTicketItem[];
  preparingAt?: string | null;
  readyAt?: string | null;
  createdAt: string;
}

export interface DiningTable {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  shape: TableShape;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  sectionId?: string;
  createdAt?: string;
  assignedRoomStays?: Pick<RoomStay, "id" | "primaryGuestName" | "room" | "occupants" | "cashOnly">[];
  splits?: { id: string; label: string; roomStayId: string | null; position: number }[];
}

export interface FloorSection {
  id: string;
  name: string;
  position: number;
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
  signedByName?: string | null;
  signatureData?: string | null;
  occurredAt: string;
  settledAt?: string | null;
  billId?: string | null;
  billNumber?: number | null;
  lines?: { name: string; quantity?: number; amount: number; detail: string | null; orderId?: string; orderItemId?: string; unit?: number; removedAt?: string | null; removalReason?: string | null }[] | null;
}

export interface TableBillLine {
  orderId: string;
  orderItemId: string;
  unit: number;
  name: string;
  detail: string | null;
  amount: number;
}

export interface TableBill {
  id: string;
  tableId: string;
  number: number;
  status: "OPEN" | "SETTLED";
  method: string | null;
  stayId: string | null;
  roomNumber: string | null;
  guestName: string | null;
  guestNames: string[];
  amount: number;
  vatPercent?: number;
  signedByName: string | null;
  signatureData: string | null;
  paidAt: string | null;
  chargeId: string | null;
  lines: TableBillLine[];
  createdAt: string;
}

export interface RoomPayment {
  id: string;
  amount: number | string;
  method: RoomPaymentMethod;
  note?: string | null;
  paidAt: string;
  receivedBy?: Pick<User, "id" | "name"> | null;
}

export interface RoomStay {
  id: string;
  roomId: string;
  room?: Room;
  primaryGuestName: string;
  occupants: RoomOccupant[];
  checkedInAt: string;
  expectedCheckoutAt?: string | null;
  checkedOutAt?: string | null;
  cancelledAt?: string | null;
  guestNotes?: string | null;
  cashOnly?: boolean;
  chargeLimit?: number | string | null;
  payments?: RoomPayment[];
  charges?: RoomCharge[];
  orders?: Order[];
  folioTotal?: number;
  grossTotal?: number;
  paidTotal?: number;
  balanceDue?: number;
}

export interface Room {
  id: string;
  roomNumber: string;
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
  modifierSelections?: ModifierSelectionSnapshot[];
  specialNotes?: string | null;
  kitchenFlag?: boolean;
  removedAt?: string | null;
  removalReason?: string | null;
  menuItem: MenuItem;
}

export interface Order {
  id: string;
  number?: number;
  type?: "DINE_IN" | "ROOM_SERVICE" | "PICKUP";
  tableId?: string | null;
  tableSplitId?: string | null;
  table?: DiningTable | null;
  roomStayId?: string | null;
  roomStay?: RoomStay | null;
  roomGuestsSnapshot?: { roomNumber: string | number; guestName: string; guestNames: string[] }[] | null;
  paymentMethod: OrderPaymentMethod;
  paymentStatus: OrderPaymentStatus;
  paidAt?: string | null;
  paidBy?: Pick<User, "id" | "name"> | null;
  roomCharge?: { signedByName?: string | null; signatureData?: string | null } | null;
  waiterId: string;
  waiter: Pick<User, "id" | "name">;
  servedBy?: Pick<User, "id" | "name"> | null;
  status: OrderStatus;
  totalAmount: number | string;
  vatPercent?: number | string | null;
  preparingAt?: string | null;
  readyAt?: string | null;
  servedAt?: string | null;
  items: OrderLine[];
  prepTickets?: PrepTicket[];
  billShares?: { id: string; stayId: string | null; amount: number; method: string; paidAt: string }[];
  splits?: TableBill[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderSalesSummary {
  totalAmount: number;
  totalCount: number;
  roomAmount: number;
  roomCount: number;
  cashAmount: number;
  cashCount: number;
  commissionAmount?: number;
  commissionCount?: number;
}

export interface CommissionReportRow {
  id: string;
  name: string;
  roomNumber: string | null;
  guestName: string;
  quantity: number;
  chargedAmount: number;
  commissionAmount: number;
  paidAt: string;
}

export interface OrderPage {
  items: Order[];
  total: number;
  totalAmount: number;
  summary?: OrderSalesSummary;
  offset: number;
  limit: number;
  hasMore: boolean;
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
  `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value ?? 0))} THB`;

export const orderCode = (order: { id: string; number?: number | null }) =>
  typeof order.number === "number" && Number.isInteger(order.number) && order.number > 0
    ? String(order.number)
    : order.id.replace(/-/g, "").slice(0, 8).toUpperCase();

export const orderLocation = (order: Pick<Order, "table" | "roomStay" | "type">) => {
  if (order.type === "ROOM_SERVICE") {
    const number = order.roomStay?.room?.roomNumber;
    return number ? `Room service · Room ${number}` : "Room service";
  }
  return order.table ? order.table.tableNumber : order.roomStay?.room ? `Room ${order.roomStay.room.roomNumber}` : "Room service";
};

export const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
