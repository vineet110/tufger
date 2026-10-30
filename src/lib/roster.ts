import type { RosterRow } from "./types";

// +91 98765 43210 · 098765-43210 · 9876543210
const PHONE = /(?:\+?\s?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}/;
const BULLET = /^\s*(?:\d{1,3}\s*[.)\-:]|[-•*▪➤>✅☑️🔹🔸]+)\s*/u;
const HEADERISH = /^(players?|team|squad|list|names?|playing|confirmed|match|sunday|saturday)\b.*[:：]?$/i;

/** Same rules as clean_name in server/roster.py: short numbers stay, because "Rahul 2" names a different person. */
function cleanName(raw: string): string {
  const name = raw
    .normalize("NFKC")
    .replace(/[\p{Cf}\uFE00-\uFE0F\u20E3]/gu, "")
    .replace(/\d{5,}/g, " ")
    .replace(/^\s*\d+[\s.)\-:]+/, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s.'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.'-]+|[.'-]+$/g, "")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .slice(0, 120);
  return /\p{L}/u.test(name) ? name : "";
}

/** Parse a WhatsApp-style list ("1. Rahul 98765 43210", "Amit 🏏", "+91…") into rows. */
export function parseRoster(text: string): RosterRow[] {
  let lines = text.split(/\r?\n/);
  // A single line like "Rahul, Amit, Sid" → treat commas as separators.
  if (lines.filter((l) => l.trim()).length === 1 && lines[0].includes(",")) lines = lines[0].split(",");

  const rows: RosterRow[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let raw = line.trim();
    if (!raw) continue;
    raw = raw.replace(BULLET, "");

    let phone: string | null = null;
    const m = raw.match(PHONE);
    if (m) {
      const digits = m[0].replace(/\D/g, "");
      phone = digits.slice(-10);
      raw = raw.replace(m[0], " ");
    }
    const name = cleanName(raw);
    if (!name && !phone) continue;
    const looksLikeHeading = /[:：]\s*$/.test(line) || (HEADERISH.test(name) && name.split(" ").length > 1);
    if (!phone && looksLikeHeading) continue;

    const key = phone ?? name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name: name || `Player ${phone!.slice(-4)}`, phone });
  }
  return rows;
}

export function mergeRosters(a: RosterRow[], b: RosterRow[]): RosterRow[] {
  const out = [...a];
  const keys = new Set(a.map((r) => r.phone ?? r.name.toLowerCase()));
  for (const r of b) {
    const k = r.phone ?? r.name.toLowerCase();
    if (!keys.has(k)) {
      keys.add(k);
      out.push(r);
    }
  }
  return out;
}

/** Same algorithm as server/split.py so the preview matches what gets saved. */
export function splitAmount(total: number, fixed: (number | null | undefined)[], roundTo = 1): number[] {
  const flexible = fixed.map((f, i) => (f == null ? i : -1)).filter((i) => i >= 0);
  const fixedSum = fixed.reduce<number>((s, f) => s + (f ?? 0), 0);
  const remaining = Math.max(total - fixedSum, 0);
  const result = fixed.map((f) => f ?? 0);
  if (!flexible.length) return result;
  const n = flexible.length;
  if (roundTo > 1) {
    const share = Math.ceil(remaining / n / roundTo) * roundTo;
    flexible.forEach((i) => (result[i] = share));
  } else {
    const base = Math.floor(remaining / n);
    const extra = remaining % n;
    flexible.forEach((i, rank) => (result[i] = base + (rank < extra ? 1 : 0)));
  }
  return result;
}
