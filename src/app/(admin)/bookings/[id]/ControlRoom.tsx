"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { Pitch } from "@/components/Pitch";
import { Scoreboard } from "@/components/Scoreboard";
import { AddPhone } from "@/components/AddPhone";
import { copyText, toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { endTime, fmtDate, fmtDuration, fmtTime, rupees, sportEmoji, timeAgo } from "@/lib/format";
import { fillTemplate, groupMessage, payLink, whatsappLink } from "@/lib/messages";
import { parseRoster } from "@/lib/roster";
import type { BookingDetail, Entry, Settings } from "@/lib/types";
import { NudgeRun } from "./NudgeRun";

export function ControlRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = Number(rawId);
  const router = useRouter();
  const fresh = useSearchParams().get("fresh") === "1";

  const [b, setB] = useState<BookingDetail | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [nudging, setNudging] = useState(false);
  const [view, setView] = useState<"pitch" | "card">("pitch");

  const load = useCallback(() => api.booking(id).then(setB, (e) => setError(e.message)), [id]);

  useEffect(() => {
    load();
    api.settings().then(setSettings);
    // claims arrive from players' phones, so keep the board live
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 12000);
    return () => clearInterval(timer);
  }, [load]);

  const act = async (p: Promise<BookingDetail>, ok?: string) => {
    try {
      setB(await p);
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "err");
    }
  };

  if (error) return <p className="slab p-6 text-red">✕ {error}</p>;
  if (!b) return <div className="led py-20 text-center text-2xl">LOADING…</div>;

  const link = payLink(b.slug);
  const claims = b.entries.filter((e) => e.status === "claimed");
  const pending = b.entries.filter((e) => e.status === "pending");
  const sel = b.entries.find((e) => e.id === selected) ?? null;
  const template = settings?.reminder_template ?? "Hi {name}, your share is ₹{amount}: {link}";
  const upi = settings?.upi_id ?? "";

  return (
    <div className="space-y-6">
      <Link href="/" className="eyebrow inline-block hover:text-chalk">
        ← Pavilion
      </Link>

      <header className="rise flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 !text-lime">
              <span className="h-2 w-2 animate-pulse rounded-full bg-lime" /> Live
            </span>
            <span>·</span>
            <span>
              {sportEmoji[b.sport]} {fmtDate(b.play_date, { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">{b.ground_name}</h1>
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-chalk-dim">
            <span className="chip chip-pending">
              {fmtTime(b.start_time)} – {fmtTime(endTime(b.start_time, b.duration_min))}
            </span>
            <span className="chip chip-pending">{fmtDuration(b.duration_min)}</span>
            <span className="chip chip-pending">{b.entries.length} players</span>
            {b.rate_per_hour > 0 && (
              <span className="chip chip-pending">
                {b.is_weekend ? "Weekend" : "Weekday"} rate {rupees(b.rate_per_hour)}/hr
              </span>
            )}
            {b.discount > 0 && (
              <span className="chip chip-paid" title={b.discount_note || undefined}>
                − {rupees(b.discount)} discount{b.discount_note ? ` · ${b.discount_note}` : ""}
              </span>
            )}
            <span className="chip chip-pending">Ground {rupees(b.total_amount)}</span>
            {b.ground_area && <span className="chip chip-pending">{b.ground_area}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => copyText(link, "Pay link copied")}>
            🔗 Copy link
          </button>
          <a className="btn btn-wa" href={whatsappLink(null, groupMessage(b, upi))} target="_blank" rel="noreferrer">
            Post to group
          </a>
          <button className="btn btn-led" disabled={!pending.length} onClick={() => setNudging(true)}>
            ⚡ Nudge run ({pending.length})
          </button>
        </div>
      </header>

      {fresh && (
        <div className="rise board flex flex-col gap-4 p-5 pt-7 sm:flex-row sm:items-center">
          <div className="flex-1">
            <div className="eyebrow !text-lime">Booking is live 🎉</div>
            <div className="mt-1 text-sm text-chalk-dim">Post this one link in your WhatsApp group. Everyone taps their name and pays.</div>
            <div className="mt-2 truncate font-mono text-sm text-led">{link}</div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm" onClick={() => copyText(link, "Pay link copied")}>
              Copy
            </button>
            <a className="btn btn-sm btn-wa" href={whatsappLink(null, groupMessage(b, upi))} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
            <button className="btn btn-sm btn-ghost" onClick={() => router.replace(`/bookings/${b.id}`)}>
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Scoreboard tally={b.tally} />

          <div className="flex items-center justify-between">
            <div className="seg">
              <button aria-pressed={view === "pitch"} onClick={() => setView("pitch")}>
                Pitch view
              </button>
              <button aria-pressed={view === "card"} onClick={() => setView("card")}>
                Scorecard
              </button>
            </div>
            <Legend />
          </div>

          {view === "pitch" ? (
            <Pitch sport={b.sport} tokens={b.entries} selectedId={selected} onSelect={(eid) => setSelected(eid === selected ? null : eid)} />
          ) : (
            <Scorecard entries={b.entries} onSelect={setSelected} selectedId={selected} />
          )}

          <AddLate onAdd={(rows) => act(api.addPlayers(b.id, rows), `${rows.length} added, shares re-split`)} />
        </div>

        <aside className="space-y-5">
          {/* Third umpire: claims to verify */}
          <section className="slab p-5">
            <div className="flex items-center justify-between">
              <h2 className="display text-2xl">Third umpire</h2>
              <span className={`chip ${claims.length ? "chip-claimed" : "chip-pending"}`}>{claims.length} to review</span>
            </div>
            <p className="mt-1 text-xs text-muted">Players who say they&apos;ve paid. Check your UPI app, then confirm.</p>
            <div className="mt-4 space-y-2">
              {claims.length === 0 && <div className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">Nothing to review right now.</div>}
              {claims.map((e) => (
                <div key={e.id} className="rise rounded-xl border border-led/40 bg-led/[0.06] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{e.name}</div>
                      <div className="font-mono text-xs text-chalk-dim">
                        {e.utr ? `UTR ${e.utr}` : "no reference"} · {e.claimed_at ? timeAgo(e.claimed_at) : ""}
                      </div>
                    </div>
                    <div className="led text-xl">{rupees(e.amount)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn btn-lime btn-sm" onClick={() => act(api.setStatus(b.id, e.id, "paid"), `${e.name} confirmed ✓`)}>
                      ✓ Received
                    </button>
                    <button className="btn btn-sm" onClick={() => act(api.setStatus(b.id, e.id, "pending"), `${e.name} sent back to pending`)}>
                      ✕ Not received
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {sel ? (
            <PlayerPanel
              key={sel.id}
              b={b}
              e={sel}
              template={template}
              upi={upi}
              onClose={() => setSelected(null)}
              act={act}
            />
          ) : (
            <section className="slab p-5 text-center text-sm text-muted">Tap a jersey to manage that player.</section>
          )}

          <MatchTools b={b} upi={upi} act={act} onDeleted={() => router.push("/")} />

          <section className="slab p-5">
            <h2 className="display text-2xl">Commentary</h2>
            <ol className="mt-3 space-y-3">
              {b.events.map((ev, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      ev.kind === "paid" ? "bg-lime" : ev.kind === "claimed" ? "bg-led" : ev.kind === "reset" ? "bg-red" : "bg-chalk/30"
                    }`}
                  />
                  <div>
                    <div>{ev.message}</div>
                    <div className="text-xs text-muted">{timeAgo(ev.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>

      {nudging && (
        <NudgeRun
          b={b}
          template={template}
          upi={upi}
          onNudged={(eid) => api.nudge(b.id, eid).then(setB).catch(() => {})}
          onMarkPaid={(eid) => act(api.setStatus(b.id, eid, "paid"))}
          onClose={() => {
            setNudging(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-xs text-chalk-dim sm:flex">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full border border-dashed border-chalk/60" /> Yet to pay
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-led" /> Under review
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-lime" /> Paid
      </span>
    </div>
  );
}

function Scorecard({ entries, onSelect, selectedId }: { entries: Entry[]; onSelect: (id: number) => void; selectedId: number | null }) {
  return (
    <div className="slab overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="eyebrow border-b border-line text-left !text-[0.7rem]">
            <th className="px-4 py-3">#</th>
            <th className="py-3">Player</th>
            <th className="py-3 text-right">Share</th>
            <th className="hidden py-3 text-center sm:table-cell">Nudges</th>
            <th className="px-4 py-3 text-right">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={e.id}
              onClick={() => onSelect(e.id)}
              className={`cursor-pointer border-b border-line/50 transition-colors last:border-0 hover:bg-white/[0.03] ${selectedId === e.id ? "bg-sky/[0.06]" : ""}`}
            >
              <td className="px-4 py-3 font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</td>
              <td className="py-3">
                <div className="font-semibold">
                  {e.name} {e.is_organizer && <span className="text-xs text-muted">(captain)</span>}
                </div>
                <div className="font-mono text-xs text-muted">{e.phone ?? "no number"}</div>
              </td>
              <td className="led py-3 text-right text-lg">{rupees(e.amount)}</td>
              <td className="hidden py-3 text-center font-mono text-xs text-chalk-dim sm:table-cell">{e.nudges || "–"}</td>
              <td className="px-4 py-3 text-right">
                <StatusChip s={e.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusChip({ s }: { s: Entry["status"] }) {
  return <span className={`chip chip-${s}`}>{s === "claimed" ? "review" : s === "paid" ? "paid ✓" : "pending"}</span>;
}

function PlayerPanel({
  b,
  upi,
  e,
  template,
  onClose,
  act,
}: {
  b: BookingDetail;
  upi: string;
  e: Entry;
  template: string;
  onClose: () => void;
  act: (p: Promise<BookingDetail>, ok?: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(e.amount));
  const msg = fillTemplate(template, b, e, upi);

  return (
    <section className="slab rise border-sky/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow !text-sky">Selected player</div>
          <div className="display text-3xl">{e.name}</div>
          <div className="font-mono text-xs text-muted">
            {e.phone ? `+91 ${e.phone}` : "No WhatsApp number yet"} ·{" "}
            <Link href={`/khata/${e.player_id}`} className="underline hover:text-chalk">
              khata
            </Link>
          </div>
        </div>
        <button className="text-muted hover:text-chalk" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      {!e.phone && (
        <div className="mt-3">
          <AddPhone playerId={e.player_id} name={e.name} onSaved={() => act(api.booking(b.id))} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <StatusChip s={e.status} />
        {e.nudges > 0 && <span className="text-xs text-muted">nudged {e.nudges}×</span>}
        {e.paid_at && <span className="text-xs text-muted">paid {timeAgo(e.paid_at)}</span>}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <label className="eyebrow label !text-[0.7rem]">Share</label>
          <input type="number" className="field led !py-2 !text-xl" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
        </div>
        <button
          className="btn btn-sm !py-3"
          disabled={Number(amount) === e.amount}
          onClick={() => act(api.setAmount(b.id, e.id, Math.max(0, Number(amount))), "Share updated")}
        >
          Save
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {e.status !== "paid" ? (
          <button className="btn btn-lime btn-sm" onClick={() => act(api.setStatus(b.id, e.id, "paid"), `${e.name} marked paid`)}>
            ✓ Mark paid
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => act(api.setStatus(b.id, e.id, "pending"), "Moved back to pending")}>
            ↺ Undo paid
          </button>
        )}
        {e.status !== "paid" && (
          <a
            className="btn btn-wa btn-sm"
            href={whatsappLink(e.phone, msg)}
            target="_blank"
            rel="noreferrer"
            onClick={() => act(api.nudge(b.id, e.id))}
          >
            Nudge on WhatsApp
          </a>
        )}
        <button className="btn btn-sm" onClick={() => copyText(msg, "Reminder copied")}>
          Copy reminder
        </button>
        {!e.is_organizer && (
          <button
            className="btn btn-sm hover:!border-red hover:!text-red"
            onClick={() => {
              if (confirm(`Remove ${e.name} and re-split the amount?`)) {
                act(api.removeEntry(b.id, e.id), `${e.name} removed`);
                onClose();
              }
            }}
          >
            Remove
          </button>
        )}
      </div>
    </section>
  );
}

function AddLate({ onAdd }: { onAdd: (rows: { name: string; phone: string | null }[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const rows = parseRoster(text);
  if (!open) {
    return (
      <button className="btn btn-sm" onClick={() => setOpen(true)}>
        + Add late joiners
      </button>
    );
  }
  return (
    <div className="slab p-4">
      <div className="eyebrow mb-2">Add players (shares will be re-split)</div>
      <textarea className="field min-h-[90px] font-mono text-sm" placeholder={"Rohit 9876512345\nDev"} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex gap-2">
        <button
          className="btn btn-lime btn-sm"
          disabled={!rows.length}
          onClick={() => {
            onAdd(rows);
            setText("");
            setOpen(false);
          }}
        >
          Add {rows.length || ""} player{rows.length === 1 ? "" : "s"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function MatchTools({
  b,
  upi,
  act,
  onDeleted,
}: {
  b: BookingDetail;
  upi: string;
  act: (p: Promise<BookingDetail>, ok?: string) => Promise<void>;
  onDeleted: () => void;
}) {
  const [total, setTotal] = useState(String(b.total_amount));
  return (
    <section className="slab p-5">
      <h2 className="display text-2xl">Match tools</h2>
      <div className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label className="eyebrow label !text-[0.7rem]">Ground amount</label>
          <input type="number" className="field led !py-2 !text-xl" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <button
          className="btn btn-sm !py-3"
          onClick={async () => {
            if (Number(total) !== b.total_amount) await act(api.patchBooking(b.id, { total_amount: Number(total) }));
            act(api.resplit(b.id), "Shares re-split equally");
          }}
        >
          Re-split
        </button>
      </div>
      <p className="mt-1 text-xs text-muted">Re-split keeps what&apos;s already paid and divides the rest equally among players who haven&apos;t paid.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn btn-sm" onClick={() => copyText(groupMessage(b, upi), "Group message copied")}>
          Copy status msg
        </button>
        <button className="btn btn-sm" onClick={() => act(api.patchBooking(b.id, { archived: !b.archived }), b.archived ? "Restored" : "Archived")}>
          {b.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          className="btn btn-sm col-span-2 hover:!border-red hover:!text-red"
          onClick={async () => {
            if (!confirm("Delete this booking and its payment records for good?")) return;
            await api.deleteBooking(b.id);
            toast("Booking deleted");
            onDeleted();
          }}
        >
          Delete booking
        </button>
      </div>
    </section>
  );
}
