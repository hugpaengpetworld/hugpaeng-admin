import { describe, expect, it } from "vitest";

import { detectLogoFileType } from "./logo";

describe("logo content validation", () => {
  it("accepts a PNG only when its magic bytes match", () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(
      detectLogoFileType({
        declaredMimeType: "image/png",
        sizeBytes: 100,
        header: png,
      }),
    ).toEqual({
      mimeType: "image/png",
      extension: "png",
    });
    expect(
      detectLogoFileType({
        declaredMimeType: "image/jpeg",
        sizeBytes: 100,
        header: png,
      }),
    ).toBeNull();
  });

  it("rejects files larger than two megabytes", () => {
    expect(
      detectLogoFileType({
        declaredMimeType: "image/jpeg",
        sizeBytes: 2 * 1024 * 1024 + 1,
        header: new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      }),
    ).toBeNull();
  });
});
