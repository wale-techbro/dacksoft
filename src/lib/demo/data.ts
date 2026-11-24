export type DemoCustomer = { id: string; name: string; email: string; phone: string };
export type DemoOrder = {
  id: string; customerId: string; placedAt: string; status: "In transit" | "Delivered" | "Delayed" | "Cancelled";
  paymentStatus: "Paid" | "Refunded"; fulfilmentStatus: string; carrier: string | null; trackingNumber: string | null;
  estimatedDelivery: string | null; deliveredAt: string | null; items: string[]; total: number;
};

const firstNames = ["Amara", "Tunde", "Zainab", "Kelechi", "Ifeoma", "Chidi", "Amina", "Emeka", "Dara", "Yusuf"];
const lastNames = ["Okafor", "Adeyemi", "Bello", "Nwosu", "Mensah", "Balogun", "Eze", "Sule", "Obi", "Danladi"];
const products = ["Everyday Tote", "Wireless Earbuds", "Linen Shirt", "Ceramic Pour-over Set", "Desk Lamp", "Canvas Weekender"];

export const customers: DemoCustomer[] = Array.from({ length: 40 }, (_, i) => {
  const name = `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length)]}`;
  return { id: `CUS-${String(1001 + i)}`, name, email: `${name.toLowerCase().replaceAll(" ", ".")}@example.test`, phone: `+234 80${String(10000000 + i * 7919).slice(0, 8)}` };
});

const statuses: DemoOrder["status"][] = ["In transit", "Delivered", "Delayed", "Cancelled"];
export const orders: DemoOrder[] = Array.from({ length: 85 }, (_, i) => {
  const n = 1001 + i;
  const status = statuses[i % statuses.length];
  const customer = customers[(i * 7) % customers.length];
  return {
    id: `ORD-${n}`, customerId: customer.id, placedAt: `2026-11-${String((i % 22) + 1).padStart(2, "0")}`,
    status, paymentStatus: status === "Cancelled" ? "Refunded" : "Paid",
    fulfilmentStatus: status === "Delivered" ? "Delivered" : status === "Cancelled" ? "Cancelled" : "Shipped",
    carrier: i % 13 === 0 ? null : "DHL", trackingNumber: i % 13 === 0 ? null : `NX${String(730000000 + i * 31)}`,
    estimatedDelivery: status === "Delivered" || status === "Cancelled" ? null : `2026-11-${String(Math.min(30, (i % 22) + 5)).padStart(2, "0")}`,
    deliveredAt: status === "Delivered" ? `2026-11-${String((i % 19) + 1).padStart(2, "0")}` : null,
    items: [products[i % products.length], ...(i % 5 === 0 ? [products[(i + 2) % products.length]] : [])],
    total: 18000 + ((i * 2347) % 112000),
  };
});

// Stable milestone fixture used in demos and deterministic tests.
orders[3] = {
  id: "ORD-1004", customerId: customers[2].id, placedAt: "2026-11-12", status: "In transit",
  paymentStatus: "Paid", fulfilmentStatus: "Shipped", carrier: "DHL", trackingNumber: "NX730004812",
  estimatedDelivery: "2026-11-26", deliveredAt: null, items: ["Wireless Earbuds"], total: 64900,
};
orders[83] = { ...orders[83], status: "Delivered", fulfilmentStatus: "Delivered", deliveredAt: "2026-10-25", estimatedDelivery: null };
orders[84] = { ...orders[84], status: "Delivered", fulfilmentStatus: "Delivered", deliveredAt: "2026-09-01", estimatedDelivery: null };

export function getOrderStatus(orderId: string) {
  const order = orders.find((candidate) => candidate.id.toLowerCase() === orderId.toLowerCase());
  if (!order) return { error: `No order found for ${orderId}.` };
  const customer = customers.find((candidate) => candidate.id === order.customerId);
  return { ...order, customerName: customer?.name ?? "Customer record unavailable" };
}
