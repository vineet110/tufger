import { fmtDate, fmtDuration, fmtTime, rupees, sportEmoji } from "./format";
import type { BookingDetail, Entry } from "./types";

export function payLink(slug: string): string {
  return `${window.location.origin}/pay/${slug}`;
}

export function upiLink(opts: { upi: string; payee: string; amount: number; note: string }): string {
  const params = new URLSearchParams({
    pa: opts.upi,
    pn: opts.payee,
    am: opts.amount.toFixed(2),
    cu: "INR",
    tn: opts.note.slice(0, 60),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function fillTemplate(template: string, booking: BookingDetail, entry: Entry): string {
  const vars: Record<string, string> = {
    name: entry.name.split(" ")[0],
    fullname: entry.name,
    amount: String(entry.amount),
    ground: booking.ground_name,
    date: fmtDate(booking.play_date),
    time: fmtTime(booking.start_time),
    link: payLink(booking.slug),
  };
  return template.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
}

export function whatsappLink(phone: string | null, text: string): string {
  const encoded = encodeURIComponent(text);
  return phone ? `https://wa.me/91${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

/** The amount most players pay, used for {amount} in a game's custom message. */
export function commonAmount(amounts: number[]): number {
  const counts = new Map<number, number>();
  amounts.forEach((a) => counts.set(a, (counts.get(a) ?? 0) + 1));
  return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? 0;
}

/** Fill a custom game message: {link} → pay link, {amount} → usual share. */
export function fillNote(note: string, link: string, amount: number): string {
  return note.replaceAll("{link}", link).replaceAll("{amount}", String(amount));
}

/** Status board to paste into the WhatsApp group. */
export function groupMessage(b: BookingDetail): string {
  const paid = b.entries.filter((e) => e.status === "paid");
  const claimed = b.entries.filter((e) => e.status === "claimed");
  const pending = b.entries.filter((e) => e.status === "pending");
  const note = b.notes.trim()
    ? [fillNote(b.notes.trim(), payLink(b.slug), commonAmount(b.entries.filter((e) => !e.is_organizer).map((e) => e.amount))), ""]
    : [];
  const lines = [
    ...note,
    `${sportEmoji[b.sport]} *${b.ground_name}*`,
    `📅 ${fmtDate(b.play_date, { weekday: "long", day: "numeric", month: "short" })} · ${fmtTime(b.start_time)} (${fmtDuration(b.duration_min)})`,
    ...(b.discount > 0 ? [`🏷️ ${rupees(b.discount)} discount applied${b.discount_note ? ` (${b.discount_note})` : ""}`] : []),
    `🎯 Target ${rupees(b.tally.target)} · Collected ${rupees(b.tally.collected)}`,
    "",
  ];
  if (pending.length) {
    lines.push(`⏳ *Yet to pay (${pending.length})*`);
    pending.forEach((e) => lines.push(`• ${e.name} — ${rupees(e.amount)}`));
    lines.push("");
  }
  if (claimed.length) {
    lines.push(`🟡 *Under review (${claimed.length})*`);
    lines.push(claimed.map((e) => e.name).join(", "));
    lines.push("");
  }
  if (paid.length) {
    lines.push(`✅ *Paid (${paid.length})*`);
    lines.push(paid.map((e) => e.name).join(", "));
    lines.push("");
  }
  lines.push(pending.length ? `👉 Pay your share in 10 sec: ${payLink(b.slug)}` : "🏆 All clear! See you on the turf.");
  return lines.join("\n");
}
