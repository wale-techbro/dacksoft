import OpenAI from "openai";

let client: OpenAI | undefined;
export function getBridgeClient() {
  const apiKey = process.env.BRIDGE_API_KEY;
  if (!apiKey) throw new Error("Bridge is not configured. Set BRIDGE_API_KEY on the server.");
  client ??= new OpenAI({ apiKey, baseURL: process.env.BRIDGE_BASE_URL || "https://wekoya-api.wekoya.tech/v1", timeout: 30_000, maxRetries: 0 });
  return client;
}

export function safeProviderError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    return { status: error.status ?? 502, code: error.code ?? "provider_error", message: error.status === 401 ? "Bridge rejected the configured API key." : "Bridge could not complete the request." };
  }
  if (error instanceof Error && error.name === "AbortError") return { status: 504, code: "timeout", message: "The AI request timed out. Please try again." };
  return { status: 502, code: "bridge_unavailable", message: error instanceof Error && error.message.startsWith("Bridge is not configured") ? error.message : "The AI provider is temporarily unavailable." };
}
