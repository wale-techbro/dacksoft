import { customers, getOrderStatus, type DemoCustomer, type DemoOrder } from "@/lib/demo/data";
import type { BusinessConnector } from "./types";

export const nexastoreDemoConnector: BusinessConnector = {
  id: "nexastore-demo", kind: "demo", capabilities: ["customers.read", "orders.read"],
  async testConnection() { return true; },
  async getCustomer(id: string): Promise<DemoCustomer | null> { return customers.find((customer) => customer.id.toLowerCase() === id.toLowerCase()) ?? null; },
  async getOrder(id: string): Promise<(DemoOrder & { customerName: string }) | null> {
    const result = getOrderStatus(id);
    return "error" in result ? null : result;
  },
};
