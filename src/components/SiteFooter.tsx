import Link from "next/link";

const LINKS = [
  { href: "/policies#privacy", label: "Privacy" },
  { href: "/policies#refunds", label: "Refunds" },
  { href: "/policies#last-minute", label: "Last-minute rules" },
];

export function SiteFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`border-t border-line bg-black/40 ${className}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="display text-xl">
            TUFGER <span className="text-chalk-dim">· Turf Booking Manager</span>
          </div>
          <p className="mt-1 max-w-md text-xs text-muted">
            Payments go straight to the organiser&apos;s UPI. Tufger never holds your money or sees your bank details.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-chalk-dim underline-offset-4 hover:text-lime hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
