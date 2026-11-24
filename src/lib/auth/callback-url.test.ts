import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthCallbackUrl } from "@/lib/auth/callback-url";

describe("getAuthCallbackUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the configured production origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://dacksoft.vercel.app");
    expect(getAuthCallbackUrl("http://localhost:3000")).toBe("https://dacksoft.vercel.app/auth/callback?next=%2Fonboarding");
  });

  it("falls back to the current origin in local development", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(getAuthCallbackUrl("http://localhost:3000")).toBe("http://localhost:3000/auth/callback?next=%2Fonboarding");
  });
});
