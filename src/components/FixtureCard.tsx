import Link from "next/link";
import { fmtDate, fmtDuration, fmtTime, rupees, sportEmoji, whenLabel } from "@/lib/format";
import type { BookingSummary } from "@/lib/types";

/** A booking as a match-ticket stub. */
export function FixtureCard({ b, index = 0 }: { b: BookingSummary; index?: number }) {
  const t = b.tally;
  const pct = t.target ? Math.round((t.collected / t.target) * 100) : 0;
  const done = t.pending_count === 0 && t.claimed_count === 0;
  const when = whenLabel(b.play_date);

  return (
    <Link
      href={`/bookings/${b.id}`}
      className="rise group slab relative flex overflow-hidden transition-all hover:-translate-y-0.5 hover:border-chalk/30"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r border-dashed border-line bg-black/40 py-4 sm:w-24">
        <div className="eyebrow !text-[0.6rem]">{fmtDate(b.play_date, { month: "short" })}</div>
        <div className="led text-4xl leading-none">{fmtDate(b.play_date, { day: "2-digit" })}</div>
        <div className="eyebrow mt-1 !text-[0.6rem]">{fmtDate(b.play_date, { weekday: "short" })}</div>
      </div>

      {/* ticket notches */}
      <span className="absolute top-[-8px] left-[72px] h-4 w-4 rounded-full bg-night sm:left-[88px]" />
      <span className="absolute bottom-[-8px] left-[72px] h-4 w-4 rounded-full bg-night sm:left-[88px]" />

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2 !text-[0.62rem]">
              <span>{sportEmoji[b.sport]}</span>
              <span className={when === "Today" || when === "Tomorrow" ? "!text-led" : ""}>{when}</span>
              <span>·</span>
              <span>
                {fmtTime(b.start_time)} · {fmtDuration(b.duration_min)}
              </span>
            </div>
            <h3 className="display mt-1 truncate text-2xl">{b.ground_name}</h3>
            {b.ground_area && <div className="truncate text-xs text-muted">{b.ground_area}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className={`led text-2xl ${done ? "led-lime" : ""}`}>{pct}%</div>
            <div className="text-[0.68rem] text-muted">
              {rupees(t.collected)} / {rupees(t.target)}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex flex-1 gap-[3px]">
            {Array.from({ length: t.players }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < t.paid_count ? "bg-lime" : i < t.paid_count + t.claimed_count ? "bg-led" : "bg-white/10"
                }`}
              />
            ))}
          </div>
          <span className="text-xs whitespace-nowrap text-chalk-dim">
            {done ? (
              <span className="text-lime">All paid ✓</span>
            ) : (
              <>
                {t.claimed_count > 0 && <span className="mr-2 text-led">{t.claimed_count} to verify</span>}
                {t.pending_count} pending
              </>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}
