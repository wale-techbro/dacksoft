import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMembership } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId || !z.string().uuid().safeParse(tenantId).success) return NextResponse.json({ error: "A valid tenantId is required." }, { status: 400 });
  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const { data, error } = await access.supabase.from("ai_execution_logs").select("id, conversation_id, provider, model, status, duration_ms, provider_usage, trace, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load workspace AI activity." }, { status: 500 });
  return NextResponse.json({ activity: data });
}
