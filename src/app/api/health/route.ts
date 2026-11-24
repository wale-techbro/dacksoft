import { NextResponse } from "next/server";
import { supabaseConfigured } from "@/lib/supabase/server";

export function GET() {
  const checks = { supabaseConfigured: supabaseConfigured(), bridgeConfigured: Boolean(process.env.BRIDGE_API_KEY) };
  const configured = checks.supabaseConfigured && checks.bridgeConfigured;
  return NextResponse.json({ status: configured ? "configured" : "degraded", scope: "configuration-only", checks, timestamp: new Date().toISOString() }, { status: configured ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
