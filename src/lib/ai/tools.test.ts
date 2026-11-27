import { afterEach, describe, expect, it, vi } from "vitest";
import { executeBusinessTool } from "./tools";

describe("NexaStore demo order tool", () => {
  afterEach(() => vi.useRealTimers());
  it("returns the seeded milestone order from the synthetic dataset", async () => {
    const result = await executeBusinessTool("get_order_status", JSON.stringify({ order_id: "ORD-1004" }));
    expect(result).toMatchObject({ found: true, id: "ORD-1004", status: "In transit", trackingNumber: "NX730004812" });
  });
  it("validates tool arguments before lookup", async () => {
    await expect(executeBusinessTool("get_order_status", JSON.stringify({ order_id: "DROP TABLE orders" }))).rejects.toThrow();
  });
  it("does not execute unregistered tools", async () => {
    await expect(executeBusinessTool("run_sql", "{}" )).rejects.toThrow("not registered");
  });
  it("returns a predictable missing-order result", async () => {
    const result = await executeBusinessTool("get_order_status", JSON.stringify({ order_id: "ORD-999999" }));
    expect(result).toMatchObject({ found: false, order_id: "ORD-999999" });
  });
  it("checks return eligibility with a deterministic delivered-date rule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
    const eligible = await executeBusinessTool("check_return_eligibility", JSON.stringify({ order_id: "ORD-1084" }));
    const expired = await executeBusinessTool("check_return_eligibility", JSON.stringify({ order_id: "ORD-1085" }));
    expect(eligible).toMatchObject({ found: true, eligible: true });
    expect(expired).toMatchObject({ found: true, eligible: false });
  });
  it("searches only the synthetic policy collection and returns source metadata", async () => {
    const result = await executeBusinessTool("search_knowledge_base", JSON.stringify({ query: "return window" }));
    expect(result).toMatchObject({ search_mode: "synthetic keyword demo", matches: [{ title: "Returns & refunds policy", section: "Return window" }] });
  });
  it("creates and deduplicates support tickets for known customers", async () => {
    const args = JSON.stringify({ customer_id: "CUS-1001", subject: "Delivery help", description: "Customer asked for a human follow-up." });
    const first = await executeBusinessTool("create_support_ticket", args);
    const second = await executeBusinessTool("create_support_ticket", args);
    expect(first).toMatchObject({ created: true });
    expect(second).toMatchObject({ created: false, duplicate: true });
  });
});
