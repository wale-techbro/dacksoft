import { nexastoreDemoConnector } from "./nexastore";
import type { BusinessConnector } from "./types";

const connectors = new Map<string, BusinessConnector>([[nexastoreDemoConnector.id, nexastoreDemoConnector]]);

export function getBusinessConnector(id: string) {
  return connectors.get(id) ?? null;
}

export function getDemoConnector() {
  const connector = getBusinessConnector("nexastore-demo");
  if (!connector || connector.kind !== "demo") throw new Error("NexaStore demo connector is unavailable.");
  return connector;
}
