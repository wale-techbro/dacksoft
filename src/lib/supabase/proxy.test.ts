import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getClaims } = vi.hoisted(() => ({ getClaims: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

import { refreshSupabaseSession } from "@/lib/supabase/proxy";

describe("Supabase route guard", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    vi.stubEnv("NODE_ENV", "test");
    getClaims.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(["/", "/login", "/auth/callback", "/setup", "/api/health"])("keeps %s public", async (path) => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const response = await refreshSupabaseSession(new NextRequest(`http://localhost:3000${path}`));
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/dashboard", "/onboarding", "/api/workspace"])("redirects unauthenticated %s to login", async (path) => {
    getClaims.mockResolvedValue({ data: { claims: null } });
    const response = await refreshSupabaseSession(new NextRequest(`http://localhost:3000${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost:3000/login?next=${encodeURIComponent(path)}`);
  });

  it("allows an authenticated user to open the dashboard", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "user-1" } } });
    const response = await refreshSupabaseSession(new NextRequest("http://localhost:3000/dashboard"));
    expect(response.headers.get("location")).toBeNull();
  });
});
