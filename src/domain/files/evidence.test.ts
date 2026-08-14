import { describe, expect, it } from "vitest";

import { detectEvidenceFileType, MAX_EVIDENCE_SIZE_BYTES } from "./evidence";

describe("payment evidence validation", () => {
  it("accepts a PDF only when MIME and magic bytes match", () => {
    const header = new TextEncoder().encode("%PDF-1.7");
    expect(
      detectEvidenceFileType({
        declaredMimeType: "application/pdf",
        sizeBytes: 1_000,
        header,
      }),
    ).toEqual({ mimeType: "application/pdf", extension: "pdf" });
    expect(
      detectEvidenceFileType({
        declaredMimeType: "image/png",
        sizeBytes: 1_000,
        header,
      }),
    ).toBeNull();
  });

  it("rejects oversized evidence", () => {
    expect(
      detectEvidenceFileType({
        declaredMimeType: "application/pdf",
        sizeBytes: MAX_EVIDENCE_SIZE_BYTES + 1,
        header: new TextEncoder().encode("%PDF-1.7"),
      }),
    ).toBeNull();
  });
});
