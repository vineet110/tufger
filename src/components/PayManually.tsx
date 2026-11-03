"use client";

import { copyText } from "./Toast";

/**
 * For when the UPI button doesn't go through. Google Pay often blocks link-opened payments to personal UPI IDs
 * ("limit exceeded" or "declined for security reasons"), but the same payment works when typed in the app itself.
 */
export function PayManually({ upiId, phone, amount, payee }: { upiId: string; phone: string; amount: number; payee: string }) {
  if (!upiId && !phone) return null;
  return (
    <div className="mt-5 rounded-xl border border-line bg-black/30 p-4">
      <div className="eyebrow !text-led">Pay didn&apos;t go through?</div>
      <p className="mt-1 text-xs text-muted">
        If GPay shows a limit or security error, copy one of these, open your UPI app and pay <b className="text-chalk">₹{amount}</b> to {payee}.
      </p>
      <div className="mt-3 space-y-2">
        {upiId && <CopyRow label="UPI ID" value={upiId} toastText="UPI ID copied" />}
        {phone && <CopyRow label="UPI number" value={phone} shown={`${phone.slice(0, 5)} ${phone.slice(5)}`} toastText="Number copied" />}
        <CopyRow label="Amount" value={String(amount)} shown={`₹${amount}`} toastText="Amount copied" />
      </div>
    </div>
  );
}

function CopyRow({ label, value, shown, toastText }: { label: string; value: string; shown?: string; toastText: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
      <div className="min-w-0">
        <div className="eyebrow !text-[0.66rem]">{label}</div>
        <div className="truncate font-[family-name:var(--font-jet)] text-sm">{shown ?? value}</div>
      </div>
      <button className="btn btn-sm shrink-0" onClick={() => copyText(value, toastText)}>
        Copy
      </button>
    </div>
  );
}
