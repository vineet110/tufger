"use client";

import { use, useCallback, useEffect, useState } from "react";
import { ScanToPay } from "@/components/ScanToPay";
import { SiteFooter } from "@/components/SiteFooter";
import { Toaster, toast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, rupees } from "@/lib/format";
import { upiLink } from "@/lib/messages";
import type { PublicBill } from "@/lib/types";

export function BillView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [b, setB] = useState<PublicBill | null>(null);
  const [error, setError] = useState("");
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tapped, setTapped] = useState(false);

  const load = useCallback(() => api.publicBill(slug).then(setB, (e) => setError(e.message)), [slug]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20000);
    return () => clearInterval(t);
  }, [load]);

  if (error)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="led dot led-red text-4xl">NO BALL</div>
          <p className="mt-3 text-chalk-dim">{error}</p>
        </div>
      </div>
    );
  if (!b) return <div className="led grid min-h-dvh place-items-center text-2xl">LOADING…</div>;

  const first = b.name.split(" ")[0];
  const link = b.upi_id && b.due > 0 ? upiLink({ upi: b.upi_id, payee: b.payee_name, amount: b.due, note: `Turf dues - ${first}` }) : "";

  async function claim() {
    setBusy(true);
    try {
      setB(await api.claimBill(slug, utr));
      toast("Sent to the organiser for confirmation");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-6 pb-20">
      <Wordmark href={`/bill/${slug}`} />

      <section className="rise mt-6">
        <div className="eyebrow !text-led">Your turf bill</div>
        <h1 className="display mt-1 text-5xl">Hi {first} 👋</h1>
        <p className="mt-1 text-chalk-dim">Everything you owe {b.organizer_name}, in one place.</p>
      </section>

      <section className="board rise mt-5 p-6 pt-8 text-center">
        {b.due > 0 ? (
          <>
            <div className="eyebrow !text-led">Total to pay</div>
            <div className="led dot mt-1 text-7xl leading-none">
              <span className="align-top text-3xl opacity-70">₹</span>
              {b.due}
            </div>
          </>
        ) : b.under_review > 0 ? (
          <>
            <div className="eyebrow !text-led">Decision pending</div>
            <div className="led dot mt-2 text-4xl">
              THIRD UMPIRE<span className="blink">…</span>
            </div>
            <p className="mt-3 text-sm text-chalk-dim">
              {b.organizer_name} is checking your {rupees(b.under_review)} payment. This page updates on its own.
            </p>
          </>
        ) : (
          <>
            <div className="led dot led-lime text-5xl">ALL CLEAR</div>
            <p className="mt-3 text-chalk-dim">You don&apos;t owe anything right now. See you on the turf ✅</p>
          </>
        )}
      </section>

      {(b.lines.length > 0 || b.extra_due !== 0) && (
        <section className="slab mt-5 divide-y divide-line overflow-hidden">
          {b.lines.map((l) => (
            <div key={`${l.booking_id}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{l.ground_name}</div>
                <div className="text-xs text-muted">
                  {fmtDate(l.play_date, { weekday: "short", day: "numeric", month: "short" })} · {fmtTime(l.start_time)}
                </div>
              </div>
              <div className="text-right">
                <div className="led">{rupees(l.amount)}</div>
                {l.status === "claimed" && <div className="text-[0.72rem] text-led">being checked</div>}
              </div>
            </div>
          ))}
          {b.extra_due > 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Other dues</span>
              <span className="led">{rupees(b.extra_due)}</span>
            </div>
          )}
          {b.extra_due < 0 && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="font-semibold">Paid in advance</span>
              <span className="led led-lime">−{rupees(-b.extra_due)}</span>
            </div>
          )}
        </section>
      )}

      {b.due > 0 &&
        (!b.upi_id ? (
          <p className="mt-6 rounded-xl border border-red/40 bg-red/10 p-4 text-center text-sm text-red">
            The organiser hasn&apos;t added a UPI ID yet. Ask them to add one in Settings.
          </p>
        ) : (
          <section className="board rise mt-5 p-6 pt-8">
            <a href={link} onClick={() => setTapped(true)} className="btn btn-lime w-full !py-4 text-xl">
              Pay {rupees(b.due)} via UPI
            </a>
            <div className="mt-2 text-center text-xs text-muted">Opens GPay · PhonePe · Paytm · BHIM with the amount filled in</div>
            <ScanToPay
              link={link}
              upiId={b.upi_id}
              title={`${first}'s turf dues · pay ${b.payee_name}`}
              amountLine={rupees(b.due)}
              filename={`tufger-bill-${first.toLowerCase()}.png`}
            />
            <div className="chalk-rule my-6" />
            <div className="display text-2xl">{tapped ? "Done paying? 👇" : "Already paid?"}</div>
            <p className="mt-1 text-xs text-muted">Let {b.organizer_name} know so they can tick you off.</p>
            <input
              className="field mt-3 font-[family-name:var(--font-jet)]"
              inputMode="numeric"
              placeholder="UPI ref / UTR no. (optional)"
              value={utr}
              maxLength={40}
              onChange={(e) => setUtr(e.target.value)}
            />
            <button className="btn btn-led mt-3 w-full !py-3.5" disabled={busy} onClick={claim}>
              {busy ? "Sending…" : "✓ I've paid everything"}
            </button>
          </section>
        ))}

      <SiteFooter className="mt-12 -mx-4 rounded-t-2xl" />
      <Toaster />
    </div>
  );
}
