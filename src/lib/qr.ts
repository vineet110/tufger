"use client";

import QRCode from "qrcode";

/**
 * A shareable "scan to pay" card: the UPI QR with who/what/how much printed under it,
 * so it still makes sense when forwarded as an image in WhatsApp.
 */
export async function qrCard(opts: { upi: string; title: string; amountLine: string; upiId: string }): Promise<Blob> {
  const W = 640;
  const H = 820;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0b1f13";
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = "#c6ff3a";
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Scan to pay", W / 2, 62);

  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, opts.upi, { width: 500, margin: 1, color: { dark: "#050c08", light: "#ffffff" } });
  ctx.drawImage(qr, (W - 500) / 2, 120);

  ctx.fillStyle = "#050c08";
  ctx.font = "800 44px system-ui, sans-serif";
  ctx.fillText(opts.amountLine, W / 2, 680);
  ctx.font = "500 26px system-ui, sans-serif";
  ctx.fillStyle = "#33463a";
  ctx.fillText(opts.title, W / 2, 724);
  ctx.font = "600 26px ui-monospace, monospace";
  ctx.fillText(`UPI: ${opts.upiId}`, W / 2, 768);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("QR failed"))), "image/png"));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy the QR card to the clipboard so it can be pasted into a WhatsApp chat; falls back to a download. */
export async function copyQrCard(blob: Blob, filename: string): Promise<"copied" | "downloaded"> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return "copied";
  } catch {
    downloadBlob(blob, filename);
    return "downloaded";
  }
}
