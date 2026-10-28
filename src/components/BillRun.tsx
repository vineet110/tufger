"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { initials, rupees } from "@/lib/format";
import { billMessage, upiLink, whatsappLink } from "@/lib/messages";
import { copyQrCard, qrCard } from "@/lib/qr";
import type { Bill } from "@/lib/types";
import { copyText, toast } from "./Toast";

/**
 * Send each player their total bill in their own WhatsApp chat, one tap per player.
 * Uses WhatsApp's free click-to-chat links: the chat opens with the message typed in.
 */
export function BillRun({ bills, organizer, upi, onClose }: { bills: Bill[]; organizer: string; upi: string; onClose: () => void }) {
  const [queue, setQueue] = useState(bills);
  const [i, setI] = useState(0);
  const [sent, setSent] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const b = queue[i];
  const done = i >= queue.length;
  const message = b ? (draft ?? billMessage(b, organizer, upi)) : "";

  async function copyQr() {
    const first = b.name.split(" ")[0];
    const blob = await qrCard({
      upi: upiLink({ upi, payee: organizer, amount: b.due, note: `Turf dues - ${first}` }),
      title: `${first}'s turf dues · pay ${organizer}`,
      amountLine: rupees(b.due),
      upiId: upi,
    });
    const how = await copyQrCard(blob, `tufger-qr-${first.toLowerCase()}.png`);
    toast(how === "copied" ? "QR copied. Paste it in their chat" : "QR saved. Attach it in their chat");
  }

  const next = () => {
    setDraft(null);
    setPhoneInput("");
    setI((n) => n + 1);
  };

  async function savePhone() {
    setSavingPhone(true);
    try {
      const p = await api.updatePlayer(b.player_id, { phone: phoneInput });
      setQueue((q) => q.map((x) => (x.player_id === b.player_id ? { ...x, phone: p.phone } : x)));
      toast(`Number saved for ${b.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save the number", "err");
    } finally {
      setSavingPhone(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="board rise max-h-[92dvh] w-full max-w-lg overflow-y-auto p-6 pt-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="eyebrow !text-led">📤 Send bills</div>
          <button className="text-muted hover:text-chalk" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex flex-1 gap-1">
            {queue.map((q, k) => (
              <span key={q.player_id} title={q.name} className={`h-2 flex-1 rounded-full ${k < i ? "bg-lime" : k === i ? "animate-pulse bg-led" : "bg-white/10"}`} />
            ))}
          </div>
          <div className="font-[family-name:var(--font-jet)] text-xs text-chalk-dim">
            {Math.min(i + 1, queue.length)}/{queue.length}
          </div>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="text-6xl">📨</div>
            <div className="display mt-3 text-4xl">All bills out</div>
            <p className="mt-2 text-chalk-dim">
              {sent} bill{sent === 1 ? "" : "s"} sent. Payments show up in the Scorebook as players pay.
            </p>
            <button className="btn btn-lime mt-6" onClick={onClose}>
              Back to the Scorebook
            </button>
          </div>
        ) : (
          <div key={b.player_id} className="rise mt-6">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 border-dashed border-chalk/50 font-[family-name:var(--font-shoulders)] text-xl font-black">
                {initials(b.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="display truncate text-3xl">{b.name}</div>
                <div className="font-[family-name:var(--font-jet)] text-xs text-muted">{b.phone ? `+91 ${b.phone}` : "no number saved"}</div>
              </div>
              <div className="led dot text-3xl">{rupees(b.due)}</div>
            </div>

            {!b.phone && (
              <div className="mt-4 flex gap-2">
                <input
                  className="field font-[family-name:var(--font-jet)]"
                  inputMode="tel"
                  autoFocus
                  placeholder={`${b.name.split(" ")[0]}'s WhatsApp number`}
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
                <button className="btn btn-sm" disabled={!phoneInput.trim() || savingPhone} onClick={savePhone}>
                  Save
                </button>
              </div>
            )}

            <textarea className="field mt-4 min-h-[170px] text-sm leading-relaxed" value={message} onChange={(e) => setDraft(e.target.value)} />
            <p className="mt-1 text-xs text-muted">The link&apos;s WhatsApp preview shows the payment QR. Want the QR as its own image too? Copy it and paste it in the chat.</p>

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              {b.phone ? (
                <a
                  href={whatsappLink(b.phone, message)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-wa !py-3.5 text-lg"
                  onClick={() => {
                    setSent((s) => s + 1);
                    setTimeout(next, 250);
                  }}
                >
                  Send to {b.name.split(" ")[0]} →
                </a>
              ) : (
                <button
                  className="btn btn-led !py-3.5 text-lg"
                  onClick={() => {
                    copyText(message, "Bill copied. Paste it in their chat");
                    setSent((s) => s + 1);
                    next();
                  }}
                >
                  Copy bill →
                </button>
              )}
              <button className="btn !py-3.5" onClick={next}>
                Skip
              </button>
            </div>
            {upi && (
              <button className="btn btn-sm mt-2 w-full" onClick={copyQr}>
                ▦ Copy QR image ({rupees(b.due)})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
