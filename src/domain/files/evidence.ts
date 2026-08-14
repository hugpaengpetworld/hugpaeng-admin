export type EvidenceMimeType =
  "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export interface EvidenceFileType {
  readonly mimeType: EvidenceMimeType;
  readonly extension: "jpg" | "png" | "webp" | "pdf";
}

export const MAX_EVIDENCE_SIZE_BYTES = 10 * 1024 * 1024;

export function detectEvidenceFileType(input: {
  readonly declaredMimeType: string;
  readonly sizeBytes: number;
  readonly header: Uint8Array;
}): EvidenceFileType | null {
  if (input.sizeBytes < 1 || input.sizeBytes > MAX_EVIDENCE_SIZE_BYTES) {
    return null;
  }
  const signatures: readonly (EvidenceFileType & {
    readonly matches: (header: Uint8Array) => boolean;
  })[] = [
    {
      mimeType: "image/jpeg",
      extension: "jpg",
      matches: (header) => header[0] === 0xff && header[1] === 0xd8,
    },
    {
      mimeType: "image/png",
      extension: "png",
      matches: (header) =>
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47,
    },
    {
      mimeType: "image/webp",
      extension: "webp",
      matches: (header) =>
        new TextDecoder().decode(header.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(header.slice(8, 12)) === "WEBP",
    },
    {
      mimeType: "application/pdf",
      extension: "pdf",
      matches: (header) =>
        new TextDecoder().decode(header.slice(0, 5)) === "%PDF-",
    },
  ];
  const detected = signatures.find(({ matches }) => matches(input.header));
  if (!detected || detected.mimeType !== input.declaredMimeType) return null;
  return { mimeType: detected.mimeType, extension: detected.extension };
}
