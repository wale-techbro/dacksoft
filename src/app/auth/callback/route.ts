import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNextPath(value: string | null) {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/onboarding";
}

function confirmationError(request: NextRequest) {
  const login = new URL("/login", request.url);
  login.searchParams.set("authError", "confirmation");
  return NextResponse.redirect(login);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  if (!code) return confirmationError(request);

  try {
    const supabase = await createSupabaseServerClient();
    const flowId = requestUrl.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return confirmationError(request);

    return NextResponse.redirect(new URL(getSafeNextPath(requestUrl.searchParams.get("next")), requestUrl.origin));
  } catch {
    return confirmationError(request);
  }
}
