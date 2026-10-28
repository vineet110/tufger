import { ImageResponse } from "next/og";
import QRCode from "qrcode";

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * The link-preview picture WhatsApp shows under a pay link: the UPI QR on the left,
 * who/what/how much on the right. Uses "Rs" because the built-in OG font has no ₹ sign.
 */
export async function scanToPayImage(opts: {
  upi: string | null; // UPI payload; null = no QR (e.g. organiser hasn't set a UPI ID)
  heading: string;
  line: string;
  amount: string;
  amountNote?: string; // small text after the amount, e.g. "each"
  upiId: string;
}) {
  const qr = opts.upi ? await QRCode.toDataURL(opts.upi, { width: 520, margin: 1, color: { dark: "#050c08", light: "#ffffff" } }) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", background: "#0b1f13", padding: 40, gap: 48 }}>
        {qr ? (
          <div style={{ display: "flex", background: "#ffffff", borderRadius: 28, padding: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={qr} width={510} height={510} />
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, color: "#eef3e6" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#c6ff3a", letterSpacing: 4 }}>TUFGER</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, marginTop: 12, lineHeight: 1.05 }}>{opts.heading}</div>
          <div style={{ display: "flex", fontSize: 34, color: "#c3cfc0", marginTop: 14 }}>{opts.line}</div>
          {opts.amount ? (
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 18 }}>
              <div style={{ display: "flex", fontSize: 104, fontWeight: 800, color: "#ffb21e" }}>{opts.amount}</div>
              {opts.amountNote ? <div style={{ display: "flex", fontSize: 40, color: "#ffb21e", marginLeft: 16 }}>{opts.amountNote}</div> : null}
            </div>
          ) : null}
          {opts.upiId ? <div style={{ display: "flex", fontSize: 32, marginTop: 14 }}>UPI: {opts.upiId}</div> : null}
          <div style={{ display: "flex", fontSize: 24, color: "#93a898", marginTop: 18 }}>Scan with GPay · PhonePe · Paytm · any UPI app</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
