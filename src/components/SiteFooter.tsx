import Link from "next/link";

const LINKS = [
  { anchor: "privacy", label: "Privacy" },
  { anchor: "refunds", label: "Refunds" },
  { anchor: "last-minute", label: "Last-minute rules" },
];

/** host = whose house rules to link to ("" = the site admin's). */
export function SiteFooter({ className = "", host = "" }: { className?: string; host?: string }) {
  const base = host ? `/policies?host=${encodeURIComponent(host)}` : "/policies";
  return (
    <footer className={`border-t border-line bg-black/40 ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="display text-xl">
            TUFGER <span className="text-chalk-dim">· Turf Booking Manager</span>
          </div>
          <p className="mt-1 max-w-md text-xs text-muted">
            Payments go straight to the host&apos;s UPI. Tufger never holds your money or sees your bank details.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.anchor} href={`${base}#${l.anchor}`} className="text-chalk-dim underline-offset-4 hover:text-lime hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
