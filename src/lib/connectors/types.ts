import type { DemoCustomer, DemoOrder } from "@/lib/demo/data";

export type ConnectorCapability = "customers.read" | "orders.read";
export interface BusinessConnector {
  readonly id: string;
  readonly kind: "demo" | "external";
  readonly capabilities: readonly ConnectorCapability[];
  testConnection(): Promise<boolean>;
  getCustomer(id: string): Promise<DemoCustomer | null>;
  getOrder(id: string): Promise<(DemoOrder & { customerName: string }) | null>;
}
