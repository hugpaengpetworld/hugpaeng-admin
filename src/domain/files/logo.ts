export type LogoMimeType = "image/jpeg" | "image/png" | "image/webp";
export type LogoExtension = "jpg" | "png" | "webp";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export function detectLogoFileType(input: {
  readonly declaredMimeType: string;
  readonly sizeBytes: number;
  readonly header: Uint8Array;
}): { mimeType: LogoMimeType; extension: LogoExtension } | null {
  if (input.sizeBytes < 12 || input.sizeBytes > MAX_LOGO_BYTES) return null;
  const bytes = input.header;
  if (
    input.declaredMimeType === "image/png" &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", extension: "png" };
  }
  if (
    input.declaredMimeType === "image/jpeg" &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  if (
    input.declaredMimeType === "image/webp" &&
    riff === "RIFF" &&
    webp === "WEBP"
  ) {
    return { mimeType: "image/webp", extension: "webp" };
  }
  return null;
}
