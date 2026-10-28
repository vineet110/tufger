"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { initials, rupees } from "@/lib/format";
import type { PlayerStats } from "@/lib/types";

const RATING_STYLE: Record<string, { cls: string; hint: string }> = {
  Lightning: { cls: "chip-paid", hint: "pays within 2 hours" },
  Quick: { cls: "chip-paid", hint: "pays the same day" },
  Steady: { cls: "chip-claimed", hint: "pays within 2 days" },
  Slow: { cls: "chip-pending !text-red !border-red", hint: "takes more than 2 days" },
  "Yet to pay": { cls: "chip-pending", hint: "no payments yet" },
  New: { cls: "chip-pending", hint: "no games yet" },
};

export default function SquadPage() {
  const [players, setPlayers] = useState<PlayerStats[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyOwing, setOnlyOwing] = useState(false);

  useEffect(() => {
    api.players().then(setPlayers);
  }, []);

  const list = useMemo(
    () =>
      (players ?? []).filter(
        (p) => (!onlyOwing || p.outstanding > 0) && (p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone ?? "").includes(q)),
      ),
    [players, q, onlyOwing],
  );
  const owing = (players ?? []).reduce((s, p) => s + p.outstanding, 0);
  const owers = (players ?? []).filter((p) => p.outstanding > 0).length;

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow !text-led">● Squad ledger</div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">The dressing room</h1>
          <p className="mt-2 text-chalk-dim">Everyone who&apos;s played, what they&apos;ve paid, and how fast they usually pay.</p>
        </div>
        <div className="board px-5 pt-6 pb-4 text-right">
          <div className="eyebrow !text-[0.6rem]">Outstanding · {owers} players</div>
          <div className="led text-4xl">{rupees(owing)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" placeholder="Search name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          <button aria-pressed={!onlyOwing} onClick={() => setOnlyOwing(false)}>
            Everyone
          </button>
          <button aria-pressed={onlyOwing} onClick={() => setOnlyOwing(true)}>
            Owes money
          </button>
        </div>
      </div>

      {players === null ? (
        <div className="slab h-64 animate-pulse opacity-50" />
      ) : list.length === 0 ? (
        <div className="slab p-10 text-center text-chalk-dim">
          {players.length ? "No one matches that." : "Your squad builds itself from the lists you paste into bookings."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p, i) => {
            const r = RATING_STYLE[p.rating] ?? RATING_STYLE.New;
            return (
              <div key={p.id} className="slab rise p-4" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                <div className="flex items-center gap-3">
                  <div
                    className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-[family-name:var(--font-shoulders)] text-lg font-black ${
                      p.outstanding ? "border-2 border-dashed border-chalk/50 text-chalk-dim" : "bg-lime text-[#0a1404]"
                    }`}
                  >
                    {initials(p.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="display truncate text-2xl">{p.name}</div>
                    <div className="font-mono text-xs text-muted">{p.phone ? `+91 ${p.phone}` : "no number"}</div>
                  </div>
                  <span className={`chip ${r.cls}`} title={r.hint}>
                    {p.rating === "Lightning" ? "⚡ " : ""}
                    {p.rating}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Mini k="Games" v={String(p.games)} />
                  <Mini k="Paid" v={rupees(p.paid_total)} lime />
                  <Mini k="Owes" v={rupees(p.outstanding)} warn={p.outstanding > 0} />
                </div>
                {p.avg_pay_hours != null && (
                  <div className="mt-3 text-center text-[0.7rem] text-muted">
                    Usually pays in {p.avg_pay_hours < 1 ? "under an hour" : `~${Math.round(p.avg_pay_hours)}h`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Mini({ k, v, lime, warn }: { k: string; v: string; lime?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-black/40 py-2">
      <div className="eyebrow !text-[0.55rem]">{k}</div>
      <div className={`led text-lg ${lime ? "led-lime" : ""} ${warn ? "" : !lime ? "!text-chalk [text-shadow:none]" : ""}`}>{v}</div>
    </div>
  );
}
