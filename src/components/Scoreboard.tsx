import { num } from "@/lib/format";
import type { Tally } from "@/lib/types";

/** The money as a floodlit cricket scoreboard. */
export function Scoreboard({ tally, compact = false }: { tally: Tally; compact?: boolean }) {
  const remaining = Math.max(tally.target - tally.collected, 0);
  const pct = tally.target ? Math.min(100, (tally.collected / tally.target) * 100) : 0;
  const claimedPct = tally.target ? Math.min(100 - pct, (tally.claimed / tally.target) * 100) : 0;
  const allClear = tally.pending_count === 0 && tally.claimed_count === 0;
  const big = compact ? "text-[1.6rem] sm:text-4xl" : "text-3xl sm:text-5xl xl:text-6xl";

  return (
    <div className="board px-5 pt-7 pb-5 sm:px-7">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Cell label="Target" className={big}>
          {num(tally.target)}
        </Cell>
        <Cell label="Collected" className={`${big} led-lime`}>
          {num(tally.collected)}
        </Cell>
        <Cell label={allClear ? "All clear" : "To go"} className={`${big} ${remaining ? "" : "led-lime"}`}>
          {num(remaining)}
        </Cell>
      </div>

      {/* each player is one "ball" of the over */}
      <div className="mt-5 flex flex-wrap justify-center gap-1.5" aria-label="Players paid">
        {Array.from({ length: tally.players }).map((_, i) => {
          const tone =
            i < tally.paid_count ? "bg-lime shadow-[0_0_8px_var(--lime)]" : i < tally.paid_count + tally.claimed_count ? "bg-led" : "bg-[#1b261e]";
          return <span key={i} className={`h-2.5 w-2.5 rounded-full ${tone}`} />;
        })}
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#121a14]">
        <div className="flex h-full">
          <div className="h-full bg-lime transition-all duration-700" style={{ width: `${pct}%` }} />
          <div className="h-full bg-led/70 transition-all duration-700" style={{ width: `${claimedPct}%` }} />
        </div>
      </div>
      <div className="mt-3 flex justify-between text-[0.75rem] font-semibold tracking-widest text-chalk-dim uppercase">
        <span>
          <span className="text-lime">{tally.paid_count}</span> paid
        </span>
        <span>
          <span className="text-led">{tally.claimed_count}</span> under review
        </span>
        <span>
          <span className="text-chalk">{tally.pending_count}</span> yet to pay
        </span>
      </div>
    </div>
  );
}

function Cell({ label, className, children }: { label: string; className: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1 !text-[0.72rem]">{label}</div>
      <div className={`led dot leading-none ${className}`}>
        <span className="mr-0.5 align-top text-[0.45em] opacity-70">₹</span>
        {children}
      </div>
    </div>
  );
}
