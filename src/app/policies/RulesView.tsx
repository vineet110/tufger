import { PRIVACY_RULES } from "@/lib/rules";

export function HostRulesView({ hostName, refunds, lastMinute }: { hostName: string; refunds: string[]; lastMinute: string[] }) {
  const sections = [
    { id: "privacy", title: "Privacy", points: PRIVACY_RULES },
    { id: "refunds", title: "Refunds", points: refunds },
    { id: "last-minute", title: "Last-minute rules", points: lastMinute },
  ];
  return (
    <>
      <div className="rise mt-8">
        <div className="eyebrow !text-led">● House rules{hostName ? ` · ${hostName}` : ""}</div>
        <h1 className="display mt-2 text-5xl sm:text-6xl">Privacy, refunds &amp; last-minute rules</h1>
        <p className="mt-3 text-chalk-dim">
          Short and plain, so everyone knows where they stand before the toss.
          {hostName ? ` Refund and last-minute rules are set by ${hostName}.` : ""}
        </p>
        <nav className="mt-5 flex flex-wrap gap-2">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="chip chip-pending !text-[0.75rem] hover:!text-lime">
              {s.title}
            </a>
          ))}
        </nav>
      </div>
      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="slab scroll-mt-6 p-6">
            <h2 className="display text-3xl">{s.title}</h2>
            <ul className="mt-4 space-y-3">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">Questions about a payment? Message your host on WhatsApp with your UPI reference number.</p>
    </>
  );
}
