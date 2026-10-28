import Link from "next/link";

/** Stadium-signage wordmark: a cricket ball seam doubles as the "u". */
export function Wordmark({ href = "/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-6xl sm:text-7xl" : "text-3xl";
  return (
    <Link href={href} className={`display ${text} inline-flex items-center gap-[0.06em] text-chalk`} aria-label="Tufger home">
      <span>T</span>
      <svg viewBox="0 0 40 40" className="h-[0.78em] w-[0.78em] -translate-y-[0.02em]" aria-hidden>
        <circle cx="20" cy="20" r="18" fill="var(--lime)" />
        <path d="M9 7 C17 15 17 25 9 33" stroke="#0a1404" strokeWidth="2.4" fill="none" strokeDasharray="3 2.4" />
        <path d="M31 7 C23 15 23 25 31 33" stroke="#0a1404" strokeWidth="2.4" fill="none" strokeDasharray="3 2.4" />
      </svg>
      <span>FGER</span>
    </Link>
  );
}
