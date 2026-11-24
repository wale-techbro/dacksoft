import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMembership } from "@/lib/supabase/server";

const schema = z.object({ tenantId: z.string().uuid(), status: z.enum(["open", "ai_handling", "needs_human_review", "resolved"]).optional(), assignedTo: z.union([z.string().uuid(), z.literal("self")]).nullable().optional() }).strict().refine((value) => value.status !== undefined || value.assignedTo !== undefined);

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!z.string().uuid().safeParse(id).success || !tenantId || !z.string().uuid().safeParse(tenantId).success) return NextResponse.json({ error: "A valid workspace and conversation are required." }, { status: 400 });
  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const { data, error } = await access.supabase.from("messages").select("id, role, content, citations, created_at").eq("tenant_id", tenantId).eq("conversation_id", id).order("created_at", { ascending: true }).limit(500);
  if (error) return NextResponse.json({ error: "Could not load conversation history." }, { status: 500 });
  return NextResponse.json({ messages: data });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid workspace and conversation update are required." }, { status: 400 });
  const access = await requireTenantMembership(parsed.data.tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const assignedTo = parsed.data.assignedTo === "self" ? access.user.id : parsed.data.assignedTo;
  if (assignedTo && assignedTo !== access.user.id) {
    if (!["owner", "admin"].includes(access.membership.role)) return NextResponse.json({ error: "Only workspace admins can assign another agent." }, { status: 403 });
    const { data: assignee } = await access.supabase.from("tenant_memberships").select("user_id").eq("tenant_id", parsed.data.tenantId).eq("user_id", assignedTo).maybeSingle();
    if (!assignee) return NextResponse.json({ error: "The selected agent is not a member of this workspace." }, { status: 400 });
  }
  const updates = { ...(parsed.data.status ? { status: parsed.data.status } : {}), ...(parsed.data.assignedTo !== undefined ? { assigned_to: assignedTo } : {}), updated_at: new Date().toISOString() };
  const { data, error } = await access.supabase.from("conversations").update(updates).eq("id", id).eq("tenant_id", parsed.data.tenantId).select("id, status, assigned_to, updated_at").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Could not update this conversation." }, { status: 404 });
  return NextResponse.json({ conversation: data });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid conversation id." }, { status: 400 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const parsed = z.object({ tenantId: z.string().uuid(), content: z.string().trim().min(1).max(4000) }).strict().safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "A valid workspace and message are required." }, { status: 400 });
  const access = await requireTenantMembership(parsed.data.tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  if (!["owner", "admin", "agent"].includes(access.membership.role)) return NextResponse.json({ error: "Only workspace owners, admins, and agents can reply." }, { status: 403 });
  const { data: conversation } = await access.supabase.from("conversations").select("id").eq("tenant_id", parsed.data.tenantId).eq("id", id).maybeSingle();
  if (!conversation) return NextResponse.json({ error: "Conversation was not found in this workspace." }, { status: 404 });
  const [{ data: message, error }, { error: updateError }] = await Promise.all([
    access.supabase.from("messages").insert({ tenant_id: parsed.data.tenantId, conversation_id: id, role: "agent", content: parsed.data.content }).select("id, role, content, citations, created_at").single(),
    access.supabase.from("conversations").update({ status: "needs_human_review", assigned_to: access.user.id, updated_at: new Date().toISOString() }).eq("tenant_id", parsed.data.tenantId).eq("id", id),
  ]);
  if (error || updateError || !message) return NextResponse.json({ error: "Could not save the agent reply." }, { status: 500 });
  return NextResponse.json({ message }, { status: 201 });
}
