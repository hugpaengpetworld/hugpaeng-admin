import "server-only";

import QRCode from "qrcode";

export async function renderPromptPayQrDataUrl(
  payload: string,
): Promise<string> {
  return QRCode.toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 4,
    width: 320,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
