import { NextResponse } from "next/server";
import { createSupabaseServerClient, supabaseConfigured } from "@/lib/supabase/server";

export async function GET() {
  if (!supabaseConfigured()) return NextResponse.json({ error: "Workspace authentication is not configured." }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in to load your workspace." }, { status: 401 });
  const { data, error } = await supabase.from("tenant_memberships").select("tenant_id, role, business_tenants!inner(id, name, slug, environment)").eq("user_id", user.id).limit(20);
  if (error) return NextResponse.json({ error: "Could not load workspace access." }, { status: 500 });
  return NextResponse.json({ user: { id: user.id, email: user.email }, memberships: data });
}
