import { describe, expect, it } from "vitest";
import { chunkDocumentPages, extractDocumentText } from "./text";

describe("document text processing", () => {
  it("decodes UTF-8 TXT and tags it as the first page", async () => {
    const text = `Delivery policies apply to all orders. ${"Please contact support for order changes. ".repeat(2)}`;
    await expect(extractDocumentText(new TextEncoder().encode(text), "txt")).resolves.toEqual([{ pageNumber: 1, text: text.trim() }]);
  });

  it("rejects invalid UTF-8 instead of silently changing source text", async () => {
    await expect(extractDocumentText(new Uint8Array([0xc3, 0x28]), "txt")).rejects.toThrow();
  });

  it("splits long pages with stable indexes and preserves page references", () => {
    const text = Array.from({ length: 360 }, (_, index) => `paragraph-${index}`).join(" ");
    const chunks = chunkDocumentPages([{ pageNumber: 7, text }], 400, 50);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
    expect(chunks.every((chunk) => chunk.pageNumber === 7 && chunk.content.length <= 400)).toBe(true);
    expect(chunks[1]?.content).toContain("paragraph-");
  });
});
