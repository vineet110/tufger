import { initials } from "@/lib/format";
import type { EntryStatus, Sport } from "@/lib/types";

type Token = { id: number; name: string; status: EntryStatus; amount: number; is_organizer?: boolean };

/**
 * Players as jerseys around the field. Dashed outline = yet to pay,
 * pulsing amber = says they paid (under review), lit lime = cleared.
 */
export function Pitch({
  sport,
  tokens,
  selectedId,
  onSelect,
}: {
  sport: Sport;
  tokens: Token[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
}) {
  const n = tokens.length;
  const rings = n > 14 ? 2 : 1;
  const positions = tokens.map((_, i) => {
    const ring = rings === 2 && i >= Math.ceil(n * 0.6) ? 1 : 0;
    const inRing = ring === 0 ? Math.ceil(n * (rings === 2 ? 0.6 : 1)) : n - Math.ceil(n * 0.6);
    const idx = ring === 0 ? i : i - Math.ceil(n * 0.6);
    const angle = (idx / inRing) * Math.PI * 2 - Math.PI / 2 + (ring ? Math.PI / inRing : 0);
    const rx = ring ? 26 : 41;
    const ry = ring ? 22 : 38;
    return { x: 50 + rx * Math.cos(angle), y: 50 + ry * Math.sin(angle) };
  });

  return (
    <div className="pitch aspect-[4/3] w-full sm:aspect-[16/10]">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <g stroke="rgba(238,243,230,0.35)" strokeWidth="0.35" fill="none" vectorEffect="non-scaling-stroke">
          <rect x="4" y="5" width="92" height="90" rx="6" vectorEffect="non-scaling-stroke" />
          {sport === "football" ? (
            <>
              <line x1="50" y1="5" x2="50" y2="95" vectorEffect="non-scaling-stroke" />
              <ellipse cx="50" cy="50" rx="11" ry="15" vectorEffect="non-scaling-stroke" />
              <rect x="4" y="32" width="10" height="36" vectorEffect="non-scaling-stroke" />
              <rect x="86" y="32" width="10" height="36" vectorEffect="non-scaling-stroke" />
            </>
          ) : (
            <>
              <ellipse cx="50" cy="50" rx="27" ry="30" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
              <rect x="46.5" y="34" width="7" height="32" fill="rgba(214,190,130,0.22)" vectorEffect="non-scaling-stroke" />
              <line x1="45" y1="38" x2="55" y2="38" vectorEffect="non-scaling-stroke" />
              <line x1="45" y1="62" x2="55" y2="62" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </g>
      </svg>
      {sport !== "football" && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="eyebrow !text-[0.55rem] opacity-70">Pitch</div>
        </div>
      )}
      {tokens.map((t, i) => (
        <button
          key={t.id}
          type="button"
          className="jersey"
          data-status={t.status}
          data-selected={selectedId === t.id}
          style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
          onClick={() => onSelect?.(t.id)}
          title={`${t.name} · ₹${t.amount} · ${t.status}`}
        >
          <span className="disc">{t.is_organizer ? "C" : initials(t.name)}</span>
          <span className="tag">{t.name.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}
