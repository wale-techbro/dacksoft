import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMembership } from "@/lib/supabase/server";

const tenantSchema = z.string().uuid();

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId || !tenantSchema.safeParse(tenantId).success) return NextResponse.json({ error: "A valid tenantId is required." }, { status: 400 });
  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const { data, error } = await access.supabase.from("conversations").select("id, customer_id, status, assigned_to, created_at, updated_at, messages(id, role, content, citations, created_at)").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load workspace conversations." }, { status: 500 });
  return NextResponse.json({ conversations: data });
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = z.object({ tenantId: tenantSchema, customerId: z.string().uuid().optional() }).strict().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid tenantId is required." }, { status: 400 });
  const access = await requireTenantMembership(parsed.data.tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const { data, error } = await access.supabase.from("conversations").insert({ tenant_id: parsed.data.tenantId, customer_id: parsed.data.customerId ?? null }).select("id, tenant_id, status, created_at").single();
  if (error) return NextResponse.json({ error: "Could not create a conversation." }, { status: 500 });
  return NextResponse.json({ conversation: data }, { status: 201 });
}
