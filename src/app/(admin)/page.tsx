"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FixtureCard } from "@/components/FixtureCard";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, num, rupees, whenLabel } from "@/lib/format";
import type { BookingSummary, Dashboard } from "@/lib/types";

export default function PavilionPage() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [bookings, setBookings] = useState<BookingSummary[] | null>(null);
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.dashboard().then(setDash, (e) => setError(e.message));
  }, []);
  useEffect(() => {
    api.bookings(archived).then(setBookings, (e) => setError(e.message));
  }, [archived]);

  const showArchived = (a: boolean) => {
    if (a === archived) return;
    setBookings(null);
    setArchived(a);
  };

  const next = dash?.next_game;

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-end">
        <div className="rise">
          <div className="eyebrow !text-led">● The Pavilion</div>
          <h1 className="display mt-2 text-6xl sm:text-8xl">
            Who owes
            <br />
            <span className="text-lime">the turf?</span>
          </h1>
          <p className="mt-4 max-w-md text-chalk-dim">
            Share one link in the group. Everyone taps their name and pays over UPI, and this board updates on its own.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/bookings/new" className="btn btn-lime !px-6 !py-3.5 text-lg">
              + New booking
            </Link>
            <Link href="/squad" className="btn !py-3.5">
              View squad ledger
            </Link>
          </div>
        </div>

        {next ? (
          <Link href={`/bookings/${next.id}`} className="board rise block p-6 pt-8 transition-transform hover:-translate-y-1">
            <div className="flex items-center justify-between">
              <span className="eyebrow !text-led">Next match</span>
              <span className="eyebrow !text-lime">{whenLabel(next.play_date)}</span>
            </div>
            <div className="display mt-3 text-4xl">{next.ground_name}</div>
            <div className="mt-1 text-sm text-chalk-dim">
              {fmtDate(next.play_date, { weekday: "long", day: "numeric", month: "long" })} · {fmtTime(next.start_time)}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <div className="eyebrow !text-[0.6rem]">Collected</div>
                <div className="led led-lime text-3xl">{rupees(next.tally.collected)}</div>
              </div>
              <div className="text-right">
                <div className="eyebrow !text-[0.6rem]">Still out</div>
                <div className="led text-3xl">{rupees(Math.max(next.tally.target - next.tally.collected, 0))}</div>
              </div>
            </div>
          </Link>
        ) : (
          <div className="board rise p-6 pt-8 text-center">
            <div className="eyebrow !text-led">Next match</div>
            <div className="led mt-3 text-3xl opacity-60">NO FIXTURE</div>
            <p className="mt-2 text-sm text-muted">Book a turf and it shows up here.</p>
          </div>
        )}
      </section>

      {error && <p className="slab p-4 text-red">✕ {error}</p>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="To collect" value={dash ? rupees(dash.to_collect) : "–"} tone="led" />
        <Stat label="Waiting for your OK" value={dash ? num(dash.awaiting_confirmation) : "–"} tone={dash?.awaiting_confirmation ? "led" : "dim"} />
        <Stat label="Collected, all time" value={dash ? rupees(dash.collected_all_time) : "–"} tone="lime" />
        <Stat label="Squad size" value={dash ? num(dash.players) : "–"} tone="dim" />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <div className="eyebrow">Fixtures</div>
            <h2 className="display text-4xl">{archived ? "Archived" : "Active bookings"}</h2>
          </div>
          <div className="seg">
            <button aria-pressed={!archived} onClick={() => showArchived(false)}>
              Active
            </button>
            <button aria-pressed={archived} onClick={() => showArchived(true)}>
              Archived
            </button>
          </div>
        </div>
        <div className="chalk-rule mb-5" />

        {bookings === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="slab h-[118px] animate-pulse opacity-50" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="slab p-10 text-center">
            <div className="text-5xl">🏟️</div>
            <div className="display mt-3 text-3xl">{archived ? "Nothing archived" : "The ground is empty"}</div>
            {!archived && (
              <>
                <p className="mt-2 text-chalk-dim">Create your first booking and paste the WhatsApp list. We&apos;ll do the maths.</p>
                <Link href="/bookings/new" className="btn btn-lime mt-5">
                  + New booking
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {bookings.map((b, i) => (
              <FixtureCard key={b.id} b={b} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "led" | "lime" | "dim" }) {
  return (
    <div className="board px-4 pt-6 pb-4">
      <div className="eyebrow !text-[0.6rem]">{label}</div>
      <div className={`led mt-1 text-3xl sm:text-4xl ${tone === "lime" ? "led-lime" : tone === "dim" ? "!text-chalk !opacity-80 [text-shadow:none]" : ""}`}>
        {value}
      </div>
    </div>
  );
}
