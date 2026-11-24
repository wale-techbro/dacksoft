import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMembership } from "@/lib/supabase/server";

const BUCKET = "dacksoft-documents";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!z.string().uuid().safeParse(id).success || !tenantId || !z.string().uuid().safeParse(tenantId).success) return NextResponse.json({ error: "A valid workspace and document are required." }, { status: 400 });
  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  if (!["owner", "admin", "agent"].includes(access.membership.role)) return NextResponse.json({ error: "Only workspace owners, admins, and agents can delete documents." }, { status: 403 });
  const { data: document, error: readError } = await access.supabase.from("documents").select("id, storage_path").eq("id", id).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
  if (readError || !document) return NextResponse.json({ error: "Document was not found in this workspace." }, { status: 404 });
  if (document.storage_path) {
    const { error: storageError } = await access.supabase.storage.from(BUCKET).remove([document.storage_path]);
    if (storageError) return NextResponse.json({ error: "Could not remove the stored document. No database records were deleted." }, { status: 502 });
  }
  const { error } = await access.supabase.from("documents").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: "Could not remove document records." }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
