import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession } = vi.hoisted(() => ({ exchangeCodeForSession: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));

import { GET } from "@/app/auth/callback/route";

describe("auth callback", () => {
  beforeEach(() => exchangeCodeForSession.mockReset());

  it("sends a missing code back to login with a helpful error", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?authError=confirmation");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges a valid code and redirects to the requested local destination", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=valid&next=%2Fonboarding"));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid", undefined);
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });

  it("returns invalid codes to login without exposing provider details", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("invalid code") });
    const response = await GET(new NextRequest("https://dacksoft.vercel.app/auth/callback?code=invalid"));
    expect(response.headers.get("location")).toBe("https://dacksoft.vercel.app/login?authError=confirmation");
  });

  it("does not accept an external redirect destination", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=valid&next=https%3A%2F%2Fevil.example"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/onboarding");
  });
});
