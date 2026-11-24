import { randomUUID } from "node:crypto";
import { z } from "zod";
import { customers, orders } from "@/lib/demo/data";
import { getDemoConnector } from "@/lib/connectors/registry";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchTenantKnowledge } from "@/lib/knowledge/embeddings";

const customerId = z.string().regex(/^CUS-\d{4,8}$/i);
const orderId = z.string().regex(/^ORD-\d{4,8}$/i);
const registered = [
  { name: "get_customer", description: "Retrieve a NexaStore demo customer by customer ID.", parameters: { customer_id: { type: "string", description: "Customer ID such as CUS-1003" } }, required: ["customer_id"] },
  { name: "get_customer_orders", description: "List orders associated with a NexaStore demo customer.", parameters: { customer_id: { type: "string", description: "Customer ID such as CUS-1003" } }, required: ["customer_id"] },
  { name: "get_order_status", description: "Look up order, shipment, payment and delivery details by NexaStore order ID.", parameters: { order_id: { type: "string", description: "Order ID such as ORD-1004" } }, required: ["order_id"] },
  { name: "check_return_eligibility", description: "Check whether a NexaStore demo order can be returned under its 30-day policy. This only evaluates eligibility; it does not create a refund.", parameters: { order_id: { type: "string", description: "Order ID such as ORD-1004" } }, required: ["order_id"] },
  { name: "search_knowledge_base", description: "Search synthetic NexaStore policies and FAQs. Use this for store policy questions and cite the returned source title.", parameters: { query: { type: "string", description: "The policy or FAQ question to search" } }, required: ["query"] },
  { name: "create_support_ticket", description: "Create a support ticket in the NexaStore synthetic demo. Use only when the customer asks for escalation or cannot be helped. Repeated identical requests are deduplicated.", parameters: { customer_id: { type: "string" }, subject: { type: "string" }, description: { type: "string" } }, required: ["customer_id", "subject", "description"] },
].map((tool) => ({ type: "function" as const, function: { ...tool, parameters: { type: "object", properties: tool.parameters, required: tool.required, additionalProperties: false } } }));

export const toolDefinitions = registered;

const schemas = {
  get_customer: z.object({ customer_id: customerId }).strict(),
  get_customer_orders: z.object({ customer_id: customerId }).strict(),
  get_order_status: z.object({ order_id: orderId }).strict(),
  check_return_eligibility: z.object({ order_id: orderId }).strict(),
  search_knowledge_base: z.object({ query: z.string().trim().min(3).max(300) }).strict(),
  create_support_ticket: z.object({ customer_id: customerId, subject: z.string().trim().min(3).max(160), description: z.string().trim().min(5).max(2000) }).strict(),
};
type ToolName = keyof typeof schemas;
export type BusinessToolContext = { supabase: SupabaseClient; tenantId: string; environment: "demo" | "production" };
const ticketByIdempotencyKey = new Map<string, { ticket_id: string; customer_id: string; subject: string; status: "open"; created_at: string }>();

const knowledge = [
  { title: "Shipping & delivery policy", section: "Delivery windows", text: "Standard delivery normally arrives within 3–7 business days after dispatch. Tracking details are shared when a carrier scan becomes available. Delivery estimates can change during carrier delays." },
  { title: "Returns & refunds policy", section: "Return window", text: "Unused products in their original packaging may be returned within 30 calendar days of delivery. Final-sale items are not returnable. Refunds are reviewed by a human support agent after the return is received; this assistant cannot issue a refund." },
  { title: "NexaStore FAQ", section: "Order changes", text: "Address changes may be possible before dispatch. Contact support as soon as possible and include the order number. Orders already handed to a carrier cannot be redirected by NexaStore." },
];

export async function executeBusinessTool(name: string, rawArgs: string, context?: BusinessToolContext) {
  if (!Object.hasOwn(schemas, name)) throw new Error("This tool is not registered.");
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(rawArgs); } catch { throw new Error("Tool arguments were not valid JSON."); }
  const toolName = name as ToolName;

  if (toolName === "get_customer") {
    if (context?.environment === "production") throw new Error("The NexaStore demo connector is not available in this workspace.");
    const args = schemas.get_customer.parse(parsedJson);
    const customer = await getDemoConnector().getCustomer(args.customer_id);
    return customer ? { found: true, ...customer } : { found: false, customer_id: args.customer_id };
  }
  if (toolName === "get_customer_orders") {
    if (context?.environment === "production") throw new Error("The NexaStore demo connector is not available in this workspace.");
    const args = schemas.get_customer_orders.parse(parsedJson);
    if (!customers.some((item) => item.id.toLowerCase() === args.customer_id.toLowerCase())) return { found: false, customer_id: args.customer_id, orders: [] };
    return { found: true, customer_id: args.customer_id, orders: orders.filter((item) => item.customerId.toLowerCase() === args.customer_id.toLowerCase()) };
  }
  if (toolName === "get_order_status") {
    if (context?.environment === "production") throw new Error("The NexaStore demo connector is not available in this workspace.");
    const args = schemas.get_order_status.parse(parsedJson);
    const result = await getDemoConnector().getOrder(args.order_id);
    return result ? { found: true, ...result } : { found: false, order_id: args.order_id, message: "No matching order was found." };
  }
  if (toolName === "check_return_eligibility") {
    if (context?.environment === "production") throw new Error("The NexaStore demo connector is not available in this workspace.");
    const args = schemas.check_return_eligibility.parse(parsedJson);
    const order = orders.find((item) => item.id.toLowerCase() === args.order_id.toLowerCase());
    if (!order) return { found: false, order_id: args.order_id };
    const ageDays = order.deliveredAt ? Math.floor((Date.now() - Date.parse(order.deliveredAt)) / 86_400_000) : Infinity;
    const eligible = order.status === "Delivered" && ageDays <= 30;
    return { found: true, order_id: order.id, eligible, policy: "30 calendar days from delivery; unused item in original packaging", reason: order.status !== "Delivered" ? "Order has not been delivered." : eligible ? "Within the return window; human review is still required." : "Return window has expired." };
  }
  if (toolName === "search_knowledge_base") {
    const args = schemas.search_knowledge_base.parse(parsedJson);
    if (context && (context.environment === "production" || context.environment === "demo")) {
      const matches = await searchTenantKnowledge(context.supabase, context.tenantId, args.query);
      if (matches.length || context.environment === "production") return { matches, search_mode: "tenant document vector search", message: matches.length ? undefined : "No matching uploaded document passage was found." };
    }
    const queryTerms = args.query.toLowerCase().split(/\W+/).filter((term) => term.length > 2);
    const hits = knowledge.map((source) => ({ ...source, score: queryTerms.filter((term) => new RegExp(`\\b${term}\\b`).test(`${source.title} ${source.section} ${source.text}`.toLowerCase())).length }))
      .filter((source) => source.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    return { matches: hits.map(({ title, section, text }) => ({ title, section, text })), search_mode: "synthetic keyword demo", message: hits.length ? undefined : "No matching policy passage was found." };
  }
  if (context?.environment === "production") throw new Error("The NexaStore demo ticket tool is not available in this workspace.");
  const args = schemas.create_support_ticket.parse(parsedJson);
  const customer = customers.find((item) => item.id.toLowerCase() === args.customer_id.toLowerCase());
  if (!customer) return { created: false, error: "An existing customer is required to create a ticket." };
  const key = `${customer.id}:${args.subject.toLowerCase()}`;
  const existing = ticketByIdempotencyKey.get(key);
  if (existing) return { created: false, duplicate: true, ticket: existing };
  const ticket = { ticket_id: `NEXA-${randomUUID().slice(0, 8).toUpperCase()}`, customer_id: customer.id, subject: args.subject, status: "open" as const, created_at: new Date().toISOString() };
  ticketByIdempotencyKey.set(key, ticket);
  return { created: true, ticket };
}
