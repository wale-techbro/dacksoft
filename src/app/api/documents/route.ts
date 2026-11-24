import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantMembership } from "@/lib/supabase/server";
import { chunkDocumentPages, extractDocumentText } from "@/lib/knowledge/text";
import { embedTexts } from "@/lib/knowledge/embeddings";

export const runtime = "nodejs";
export const maxDuration = 120;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BUCKET = "dacksoft-documents";
const uuid = z.string().uuid();

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId || !uuid.safeParse(tenantId).success) return NextResponse.json({ error: "A valid tenantId is required." }, { status: 400 });
  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  const { data, error } = await access.supabase.from("documents").select("id, name, mime_type, status, created_at, error_message").eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: "Could not load workspace documents." }, { status: 500 });
  return NextResponse.json({ documents: data });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES + 64_000) return NextResponse.json({ error: "File must be 8 MB or smaller." }, { status: 413 });
  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Upload must be a valid multipart form." }, { status: 400 }); }
  const tenantId = form.get("tenantId");
  const file = form.get("file");
  if (typeof tenantId !== "string" || !uuid.safeParse(tenantId).success || !(file instanceof File)) return NextResponse.json({ error: "A workspace and PDF or TXT file are required." }, { status: 400 });
  if (file.size < 1 || file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File must be between 1 byte and 8 MB." }, { status: 413 });
  const ext = file.name.toLowerCase().split(".").pop();
  const isPdf = ext === "pdf" && file.type === "application/pdf";
  const isText = ext === "txt" && (file.type === "text/plain" || file.type === "application/octet-stream" || file.type === "");
  if (!isPdf && !isText) return NextResponse.json({ error: "Upload a PDF or UTF-8 TXT file." }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isPdf && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return NextResponse.json({ error: "The file contents do not match a PDF." }, { status: 415 });
  if (isText && bytes.includes(0)) return NextResponse.json({ error: "TXT files must contain UTF-8 text, not binary data." }, { status: 415 });
  if (!process.env.BRIDGE_API_KEY) return NextResponse.json({ error: "Set BRIDGE_API_KEY on the server to index knowledge documents." }, { status: 503 });

  const access = await requireTenantMembership(tenantId);
  if ("error" in access) return NextResponse.json({ error: "Sign-in and workspace access are required." }, { status: access.error === "unauthenticated" ? 401 : 403 });
  if (!["owner", "admin", "agent"].includes(access.membership.role)) return NextResponse.json({ error: "Only workspace owners, admins, and agents can add documents." }, { status: 403 });
  const { data: underLimit, error: limitError } = await access.supabase.rpc("consume_ai_rate_limit");
  if (limitError) return NextResponse.json({ error: "The workspace usage limit could not be checked." }, { status: 503 });
  if (!underLimit) return NextResponse.json({ error: "AI usage limit reached. Try again in a minute." }, { status: 429 });

  const cleanName = file.name.normalize("NFKC").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || `document.${ext}`;
  const { data: document, error: insertError } = await access.supabase.from("documents").insert({ tenant_id: tenantId, name: cleanName, mime_type: isPdf ? "application/pdf" : "text/plain", status: "processing" }).select("id, name, mime_type, status, created_at").single();
  if (insertError || !document) return NextResponse.json({ error: "Could not register this document." }, { status: 500 });
  const storagePath = `${tenantId}/${document.id}/${cleanName}`;
  let stored = false;
  try {
    const { error: uploadError } = await access.supabase.storage.from(BUCKET).upload(storagePath, file, { contentType: isPdf ? "application/pdf" : "text/plain", upsert: false, cacheControl: "0" });
    if (uploadError) throw new Error("Storage upload failed.");
    stored = true;
    const pages = await extractDocumentText(bytes, isPdf ? "pdf" : "txt");
    const chunks = chunkDocumentPages(pages);
    if (!chunks.length || chunks.length > 250) throw new Error("Document contains too many text sections.");
    const vectors = await embedTexts(chunks.map((chunk) => chunk.content), "RETRIEVAL_DOCUMENT");
    const rows = chunks.map((chunk, index) => ({ tenant_id: tenantId, document_id: document.id, chunk_index: chunk.chunkIndex, content: chunk.content, page_number: chunk.pageNumber, section_name: null, embedding: vectors[index] }));
    const { error: chunkError } = await access.supabase.from("document_chunks").insert(rows);
    if (chunkError) throw new Error("Could not store document search sections.");
    const { data: ready, error: readyError } = await access.supabase.from("documents").update({ status: "ready", storage_path: storagePath, error_message: null }).eq("id", document.id).eq("tenant_id", tenantId).select("id, name, mime_type, status, created_at").single();
    if (readyError || !ready) throw new Error("Could not mark document processing complete.");
    return NextResponse.json({ document: ready, chunkCount: chunks.length }, { status: 201 });
  } catch (error) {
    if (stored) await access.supabase.storage.from(BUCKET).remove([storagePath]);
    await access.supabase.from("document_chunks").delete().eq("document_id", document.id).eq("tenant_id", tenantId);
    await access.supabase.from("documents").update({ status: "error", storage_path: null, error_message: "Processing failed. Check the file and Bridge configuration, then upload it again." }).eq("id", document.id).eq("tenant_id", tenantId);
    console.error("Document processing failed", { documentId: document.id, kind: isPdf ? "pdf" : "txt", code: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Document processing failed. Check the file and Bridge configuration, then try again.", documentId: document.id }, { status: 502 });
  }
}
