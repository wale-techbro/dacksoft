import type { SupabaseClient } from "@supabase/supabase-js";

export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_MODEL = process.env.BRIDGE_EMBEDDING_MODEL || "gemini-embedding-2";

export class EmbeddingServiceError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "EmbeddingServiceError";
  }
}

export async function embedTexts(texts: string[], taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
  const apiKey = process.env.BRIDGE_API_KEY;
  if (!apiKey) throw new EmbeddingServiceError("Bridge is not configured for document embeddings.");
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += 32) {
    const input = texts.slice(offset, offset + 32);
    const baseUrl = (process.env.BRIDGE_BASE_URL || "https://wekoya-api.wekoya.tech/v1").replace(/\/+$/, "");
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input, dimensions: EMBEDDING_DIMENSIONS, task_type: taskType }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new EmbeddingServiceError(`Bridge embedding request failed (${response.status}).`, response.status);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data) || body.data.length !== input.length) throw new EmbeddingServiceError("Bridge returned an incomplete embeddings response.");
    const batch = [...body.data as Array<{ index: number; embedding: number[] }>].sort((a, b) => a.index - b.index).map((entry) => entry.embedding);
    if (batch.some((vector) => !Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((n) => !Number.isFinite(n)))) throw new EmbeddingServiceError("Bridge returned an invalid embedding vector.");
    vectors.push(...batch);
  }
  return vectors;
}

export async function searchTenantKnowledge(supabase: SupabaseClient, tenantId: string, query: string) {
  const [queryVector] = await embedTexts([query], "RETRIEVAL_QUERY");
  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: `[${queryVector.join(",")}]`,
    target_tenant: tenantId,
    match_count: 5,
    match_threshold: 0.35,
  });
  if (error) throw new Error("Knowledge search is temporarily unavailable.");
  return (data ?? []).map((match: { chunk_id: string; document_id: string; document_name: string; page_number: number | null; section_name: string | null; content: string; similarity: number }) => ({
    source_id: match.chunk_id,
    document_id: match.document_id,
    title: match.document_name,
    page_number: match.page_number,
    section: match.section_name,
    content: match.content,
    similarity: match.similarity,
  }));
}
