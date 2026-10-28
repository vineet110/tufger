"use client";

import { useMemo, useState } from "react";
import { copyText } from "@/components/Toast";
import { initials, rupees } from "@/lib/format";
import { fillTemplate, whatsappLink } from "@/lib/messages";
import type { BookingDetail } from "@/lib/types";

/**
 * Bowl through the unpaid list one "ball" at a time: each send opens WhatsApp
 * with a personal message, then the next player is lined up straight away.
 */
export function NudgeRun({
  b,
  template,
  onNudged,
  onMarkPaid,
  onClose,
}: {
  b: BookingDetail;
  template: string;
  onNudged: (entryId: number) => void;
  onMarkPaid: (entryId: number) => void;
  onClose: () => void;
}) {
  // freeze the queue when the run starts so it doesn't reshuffle mid-over
  const queue = useMemo(() => b.entries.filter((e) => e.status === "pending" && !e.is_organizer), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const [sent, setSent] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);

  const e = queue[i];
  const done = i >= queue.length;
  const message = e ? (draft ?? fillTemplate(template, b, e)) : "";
  const over = Math.floor(i / 6) + 1;
  const ball = (i % 6) + 1;

  const next = () => {
    setDraft(null);
    setI((n) => n + 1);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="board rise w-full max-w-lg p-6 pt-8" onClick={(ev) => ev.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="eyebrow !text-led">⚡ Nudge run</div>
          <button className="text-muted hover:text-chalk" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* the over */}
        <div className="mt-4 flex items-center gap-3">
          <div className="led text-lg">
            OVER {over}.{done ? 0 : ball}
          </div>
          <div className="flex flex-1 gap-1.5">
            {queue.map((q, k) => (
              <span
                key={q.id}
                className={`h-2 flex-1 rounded-full ${k < i ? "bg-lime" : k === i ? "animate-pulse bg-led" : "bg-white/10"}`}
                title={q.name}
              />
            ))}
          </div>
          <div className="font-mono text-xs text-chalk-dim">
            {Math.min(i + 1, queue.length)}/{queue.length}
          </div>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="text-6xl">🏏</div>
            <div className="display mt-3 text-4xl">Over complete</div>
            <p className="mt-2 text-chalk-dim">
              {sent} reminder{sent === 1 ? "" : "s"} sent. Payments show up on the board as they come in.
            </p>
            <button className="btn btn-lime mt-6" onClick={onClose}>
              Back to the board
            </button>
          </div>
        ) : (
          <div key={e.id} className="rise mt-6">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-dashed border-chalk/50 font-[family-name:var(--font-shoulders)] text-2xl font-black">
                {initials(e.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="display truncate text-4xl">{e.name}</div>
                <div className="font-mono text-xs text-muted">
                  {e.phone ? `+91 ${e.phone}` : "no number, copy the message instead"}
                  {e.nudges > 0 && ` · nudged ${e.nudges}× before`}
                </div>
              </div>
              <div className="led text-3xl">{rupees(e.amount)}</div>
            </div>

            <textarea
              className="field mt-4 min-h-[130px] text-sm leading-relaxed"
              value={message}
              onChange={(ev) => setDraft(ev.target.value)}
            />

            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              {e.phone ? (
                <a
                  href={whatsappLink(e.phone, message)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-wa !py-3.5 text-lg"
                  onClick={() => {
                    onNudged(e.id);
                    setSent((s) => s + 1);
                    setTimeout(next, 250);
                  }}
                >
                  Send on WhatsApp →
                </a>
              ) : (
                <button
                  className="btn btn-led !py-3.5 text-lg"
                  onClick={() => {
                    copyText(message, "Message copied, paste it to them");
                    onNudged(e.id);
                    setSent((s) => s + 1);
                    next();
                  }}
                >
                  Copy message →
                </button>
              )}
              <button className="btn !py-3.5" onClick={next}>
                Skip
              </button>
            </div>
            <button
              className="mt-3 w-full text-center text-xs text-chalk-dim underline hover:text-lime"
              onClick={() => {
                onMarkPaid(e.id);
                next();
              }}
            >
              Already paid in cash? Mark {e.name.split(" ")[0]} as paid
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
