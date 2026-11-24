import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedPage = { pageNumber: number; text: string };

const MAX_PAGES = 250;
const MAX_TEXT_CHARACTERS = 500_000;

export async function extractDocumentText(bytes: Uint8Array, kind: "pdf" | "txt"): Promise<ExtractedPage[]> {
  let pages: ExtractedPage[];
  if (kind === "txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replaceAll("\u0000", "").trim();
    pages = [{ pageNumber: 1, text }];
  } else {
    const loadingTask = getDocument({ data: bytes, useSystemFonts: false });
    const pdf = await loadingTask.promise;
    try {
      if (pdf.numPages < 1 || pdf.numPages > MAX_PAGES) throw new Error("PDF page limit exceeded.");
      pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = textContent.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push({ pageNumber, text });
      }
    } finally {
      await loadingTask.destroy();
    }
  }
  const total = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (total < 30) throw new Error("No readable text was found in the document.");
  if (total > MAX_TEXT_CHARACTERS) throw new Error("Document text is too large to process.");
  return pages;
}

export function chunkDocumentPages(pages: ExtractedPage[], maxCharacters = 2400, overlap = 250) {
  const chunks: Array<{ chunkIndex: number; pageNumber: number; content: string }> = [];
  for (const page of pages) {
    const text = page.text;
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(offset + maxCharacters, text.length);
      if (end < text.length) {
        const space = text.lastIndexOf(" ", end);
        if (space > offset + Math.floor(maxCharacters * 0.6)) end = space;
      }
      const content = text.slice(offset, end).trim();
      if (content) chunks.push({ chunkIndex: chunks.length, pageNumber: page.pageNumber, content });
      if (end >= text.length) break;
      offset = Math.max(offset + 1, end - overlap);
    }
  }
  return chunks;
}
