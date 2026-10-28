"use client";

import { downloadBlob, qrCard } from "@/lib/qr";
import { Qr } from "./Qr";
import { copyText, toast } from "./Toast";

/** The UPI QR, always visible, with "save" for paying via "scan from gallery" on the same phone. */
export function ScanToPay({
  link,
  upiId,
  title,
  amountLine,
  filename,
}: {
  link: string;
  upiId: string;
  title: string;
  amountLine: string;
  filename: string;
}) {
  return (
    <div className="mt-5 flex flex-col items-center">
      <div className="eyebrow mb-2">Or scan with any UPI app</div>
      <div className="rounded-xl bg-chalk p-3">
        <Qr value={link} size={220} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs">
        <button className="font-[family-name:var(--font-jet)] text-chalk-dim underline" onClick={() => copyText(upiId, "UPI ID copied")}>
          {upiId}
        </button>
        <button
          className="text-chalk-dim underline"
          onClick={async () => {
            downloadBlob(await qrCard({ upi: link, title, amountLine, upiId }), filename);
            toast("QR saved. Open your UPI app → scan → pick from gallery");
          }}
        >
          Save QR
        </button>
      </div>
    </div>
  );
}
