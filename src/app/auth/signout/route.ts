import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Clear the browser's workspace access path even if Auth is unavailable.
  }
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
