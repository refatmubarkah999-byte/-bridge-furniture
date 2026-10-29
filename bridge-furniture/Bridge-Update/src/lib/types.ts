export type AppRole = "super_admin" | "factory_admin" | "sales" | "accountant" | "returns";
export type OrderKind = "regular" | "return";
export type PaymentStatus = "pending" | "confirmed" | "rejected";
export type PaymentMethod = "cash" | "transfer" | "cheque" | "card";

/** المالك والمحاسب: يريان التكلفة والربح ويؤكدان الدفعات */
export const isFinanceRole = (r: AppRole) => r === "super_admin" || r === "accountant";

export type OrderStatus =
  | "draft"
  | "new"
  | "received"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled";

export const ORDER_FLOW: OrderStatus[] = ["new", "received", "preparing", "ready", "out_for_delivery", "delivered"];

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(s);
  return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null;
}
export function prevStatus(s: OrderStatus): OrderStatus | null {
  const i = ORDER_FLOW.indexOf(s);
  return i > 0 ? ORDER_FLOW[i - 1] : null;
}

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: AppRole;
  is_active: boolean;
};

/** ما تُرجعه بوابة المصنع — الحقول السبعة فقط */
export type FactoryItem = {
  position: number;
  model: string;
  color: string;
  quantity: number;
  image_path: string | null;
};
export type FactoryOrder = {
  order_id: string;
  order_number: string;
  status: OrderStatus;
  expected_delivery_date: string;
  is_delayed: boolean;
  items: FactoryItem[];
};

export type OrderRow = {
  order_id: string;
  order_number: string | null;
  status: OrderStatus;
  expected_delivery_date: string | null;
  is_delayed: boolean;
  created_at: string;
  submitted_at: string | null;
  sales_id: string;
  sales_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  city: string | null;
  models: string | null;
  total: number | null;
  remaining: number | null;
  kind?: OrderKind;
};

export type OrderDetail = {
  id: string;
  order_number: string | null;
  kind?: OrderKind;
  status: OrderStatus;
  expected_delivery_date: string | null;
  is_delayed: boolean;
  created_at: string;
  submitted_at: string | null;
  acknowledged_at: string | null;
  idempotency_key: string;
  created_by: { id: string; full_name: string };
  customer: { full_name: string; phone: string; phone2: string | null; city: string; address: string };
  customer_notes: string | null;
  internal_notes: string | null;
  items: {
    id: string;
    position: number;
    product_id: string | null;
    model: string;
    color: string;
    quantity: number;
    image_path: string | null;
    unit_price: number;
    notes: string | null;
    line_total: number;
  }[];
  totals: { subtotal: number; delivery_fee: number; total: number; paid: number; remaining: number; pending: number };
  deposit: number;
  payments: {
    id: string;
    amount: number;
    kind: "deposit" | "payment";
    note: string | null;
    paid_at: string;
    recorded_by: string;
    status: PaymentStatus;
    method: PaymentMethod;
    reviewed_by: string | null;
    review_note: string | null;
  }[];
  history: { from: OrderStatus | null; to: OrderStatus; changed_at: string; changed_by: string; note: string | null }[];
  can_edit: boolean;
  can_record_payment: boolean;
  /** للمالك والمحاسب فقط — null لموظف المبيعات */
  finance: { cost: number; profit: number; items_missing_cost: number } | null;
};

export type CatalogProduct = {
  id: string;
  name: string;
  standard_price: number;
  is_active: boolean;
  colors: { name: string; is_active: boolean }[];
  image_path: string | null;
  image_url: string | null;
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
