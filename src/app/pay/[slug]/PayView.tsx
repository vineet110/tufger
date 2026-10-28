"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Qr } from "@/components/Qr";
import { Scoreboard } from "@/components/Scoreboard";
import { copyText, Toaster, toast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";
import { api } from "@/lib/api";
import { useStoredValue } from "@/lib/client";
import { endTime, fmtDate, fmtDuration, fmtTime, initials, rupees, sportEmoji, sportLabel } from "@/lib/format";
import { upiLink } from "@/lib/messages";
import type { PublicBooking } from "@/lib/types";

export function PayView({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const meKey = `tufger.me.${slug}`;
  const [b, setB] = useState<PublicBooking | null>(null);
  const [error, setError] = useState("");
  const saved = useStoredValue(meKey);
  const [picked, setMe] = useState<number | null | undefined>(undefined);
  const me = picked !== undefined ? picked : saved ? Number(saved) : null;

  const load = useCallback(() => api.publicBooking(slug).then(setB, (e) => setError(e.message)), [slug]);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    return () => clearInterval(t);
  }, [load]);

  const choose = (id: number | null) => {
    setMe(id);
    try {
      if (id) localStorage.setItem(meKey, String(id));
      else localStorage.removeItem(meKey);
    } catch {}
    if (id) setTimeout(() => document.getElementById("pay")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (error)
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <div className="led led-red text-4xl dot">NO BALL</div>
          <p className="mt-3 text-chalk-dim">{error}</p>
        </div>
      </div>
    );
  if (!b) return <div className="led grid min-h-dvh place-items-center text-2xl">LOADING…</div>;

  const entry = b.entries.find((e) => e.id === me) ?? null;
  const players = b.entries.filter((e) => !e.is_organizer || e.status !== "paid");

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pt-6 pb-20">
      <div className="flex items-center justify-between">
        <Wordmark href={`/pay/${slug}`} />
        <span className="eyebrow flex items-center gap-1.5 !text-lime">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime" /> Live
        </span>
      </div>

      {/* match ticket */}
      <section className="rise relative mt-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-[#10301c] to-[#07140c]">
        <div className="p-5">
          <div className="eyebrow !text-led">
            {sportEmoji[b.sport]} {sportLabel[b.sport]} · Match ticket
          </div>
          <h1 className="display mt-2 text-5xl">{b.ground_name}</h1>
          {b.ground_area && <div className="text-sm text-chalk-dim">{b.ground_area}</div>}
        </div>
        <div className="relative border-t border-dashed border-chalk/20">
          <span className="absolute top-[-9px] left-[-9px] h-4 w-4 rounded-full bg-night" />
          <span className="absolute top-[-9px] right-[-9px] h-4 w-4 rounded-full bg-night" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-line text-center">
          <TicketCell k="Date" v={fmtDate(b.play_date, { weekday: "short", day: "numeric", month: "short" })} />
          <TicketCell k="Time" v={`${fmtTime(b.start_time)}–${fmtTime(endTime(b.start_time, b.duration_min))}`} />
          <TicketCell k="Duration" v={fmtDuration(b.duration_min)} />
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-chalk-dim">
          Collected by <span className="text-chalk">{b.organizer_name}</span> · {rupees(b.total_amount)} across {b.tally.players} players
          {b.discount > 0 && <span className="text-lime"> · {rupees(b.discount)} discount applied 🎉</span>}
        </div>
        {playerNote(b.notes) && (
          <div className="border-t border-line px-5 py-3 text-sm whitespace-pre-line text-chalk">
            <div className="eyebrow mb-1 !text-led">Note from {b.organizer_name}</div>
            {playerNote(b.notes)}
          </div>
        )}
      </section>

      <div className="mt-5">
        <Scoreboard tally={b.tally} compact />
      </div>

      {/* who are you */}
      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="display text-3xl">{entry ? "Squad" : "Tap your name"}</h2>
          {entry && (
            <button className="text-xs text-chalk-dim underline" onClick={() => choose(null)}>
              Not {entry.name.split(" ")[0]}?
            </button>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {players.map((e) => {
            const mine = e.id === me;
            return (
              <button
                key={e.id}
                onClick={() => choose(e.id)}
                className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                  mine
                    ? "border-sky bg-sky/10"
                    : e.status === "paid"
                      ? "border-lime/30 bg-lime/[0.05]"
                      : e.status === "claimed"
                        ? "border-led/40 bg-led/[0.05]"
                        : "border-line bg-black/30 hover:border-chalk/30"
                }`}
              >
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-full font-[family-name:var(--font-shoulders)] text-sm font-black ${
                    e.status === "paid"
                      ? "bg-lime text-[#0a1404]"
                      : e.status === "claimed"
                        ? "bg-led text-[#1a1000]"
                        : "border-2 border-dashed border-chalk/40 text-chalk-dim"
                  }`}
                >
                  {e.status === "paid" ? "✓" : initials(e.name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{e.name}</span>
                  <span className="block text-[0.75rem] text-muted">
                    {e.status === "paid" ? "paid" : e.status === "claimed" ? "under review" : rupees(e.amount)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {entry && <PayPanel key={entry.id} b={b} entry={entry} onUpdate={setB} />}

      <p className="mt-12 text-center text-xs text-muted">
        Payments go straight to {b.payee_name}&apos;s UPI. Tufger never touches your money.
      </p>
      <Toaster />
    </div>
  );
}

function TicketCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="px-2 py-3">
      <div className="eyebrow !text-[0.68rem]">{k}</div>
      <div className="mt-0.5 text-sm font-semibold">{v}</div>
    </div>
  );
}

function PayPanel({
  b,
  entry,
  onUpdate,
}: {
  b: PublicBooking;
  entry: PublicBooking["entries"][number];
  onUpdate: (b: PublicBooking) => void;
}) {
  const [utr, setUtr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [tapped, setTapped] = useState(false);
  const first = entry.name.split(" ")[0];
  const note = `${b.ground_name} ${fmtDate(b.play_date, { day: "numeric", month: "short" })} - ${first}`;
  const link = b.upi_id ? upiLink({ upi: b.upi_id, payee: b.payee_name, amount: entry.amount, note }) : "";

  async function claim() {
    setBusy(true);
    try {
      onUpdate(await api.claim(b.slug, entry.id, utr));
      toast("Sent to the organiser for confirmation");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send", "err");
    } finally {
      setBusy(false);
    }
  }

  if (entry.status === "paid") {
    return (
      <section id="pay" className="board rise mt-8 overflow-hidden p-8 pt-10 text-center">
        <Sparks />
        <div className="led led-lime text-5xl dot">CLEARED</div>
        <div className="display mt-3 text-3xl">You&apos;re good to play, {first} ✅</div>
        <p className="mt-2 text-sm text-chalk-dim">
          {rupees(entry.amount)} received. See you at {fmtTime(b.start_time)}.
        </p>
      </section>
    );
  }

  if (entry.status === "claimed") {
    return (
      <section id="pay" className="board rise mt-8 p-8 pt-10 text-center">
        <div className="eyebrow !text-led">Decision pending</div>
        <div className="led mt-2 text-4xl dot">
          THIRD UMPIRE<span className="blink">…</span>
        </div>
        <p className="mt-3 text-sm text-chalk-dim">
          {b.organizer_name} is checking your {rupees(entry.amount)} payment. This page updates on its own once it&apos;s confirmed.
        </p>
      </section>
    );
  }

  return (
    <section id="pay" className="board rise mt-8 scroll-mt-4 p-6 pt-8">
      <div className="text-center">
        <div className="eyebrow !text-led">{first}&apos;s share</div>
        <div className="led mt-1 text-7xl leading-none dot">
          <span className="align-top text-3xl opacity-70">₹</span>
          {entry.amount}
        </div>
      </div>

      {!b.upi_id ? (
        <p className="mt-6 rounded-xl border border-red/40 bg-red/10 p-4 text-center text-sm text-red">
          The organiser hasn&apos;t added a UPI ID yet. Ask them to add one in Settings.
        </p>
      ) : (
        <>
          <a href={link} onClick={() => setTapped(true)} className="btn btn-lime mt-6 w-full !py-4 text-xl">
            Pay {rupees(entry.amount)} via UPI
          </a>
          <div className="mt-2 text-center text-xs text-muted">Opens GPay · PhonePe · Paytm · BHIM with the amount filled in</div>

          <div className="mt-4 flex items-center justify-center gap-4 text-xs">
            <button className="text-chalk-dim underline" onClick={() => setShowQr((s) => !s)}>
              {showQr ? "Hide QR" : "Show QR code"}
            </button>
            <button className="font-mono text-chalk-dim underline" onClick={() => copyText(b.upi_id, "UPI ID copied")}>
              {b.upi_id}
            </button>
          </div>
          {showQr && (
            <div className="rise mt-4 flex justify-center">
              <div className="rounded-xl bg-chalk p-3">
                <Qr value={link} size={220} />
              </div>
            </div>
          )}

          <div className="chalk-rule my-6" />

          <div className={tapped ? "rise" : ""}>
            <div className="display text-2xl">{tapped ? "Done paying? 👇" : "Already paid?"}</div>
            <p className="mt-1 text-xs text-muted">Let {b.organizer_name} know so they can tick you off.</p>
            <input
              className="field mt-3 font-mono"
              inputMode="numeric"
              placeholder="UPI ref / UTR no. (optional)"
              value={utr}
              maxLength={40}
              onChange={(e) => setUtr(e.target.value)}
            />
            <button className="btn btn-led mt-3 w-full !py-3.5" disabled={busy} onClick={claim}>
              {busy ? "Sending…" : "✓ I've paid"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Sparks() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <span
          key={i}
          className="absolute h-1.5 w-1.5 rounded-full"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 53) % 100}%`,
            background: i % 3 ? "var(--lime)" : "var(--led)",
            opacity: 0.6,
            animation: `rise ${0.6 + (i % 5) * 0.2}s ease-out both`,
            animationDelay: `${i * 40}ms`,
          }}
        />
      ))}
    </div>
  );
}

/** The organiser's note as players should read it: no pay-link placeholders. */
function playerNote(notes: string): string {
  return notes
    .split("\n")
    .filter((l) => !l.includes("{link}"))
    .join("\n")
    .replaceAll("{amount}", "your share")
    .replace(/([*_~])(\S(?:.*?\S)?)\1/g, "$2") // WhatsApp *bold* / _italic_ / ~strike~
    .trim();
}
