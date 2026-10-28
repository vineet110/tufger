import { fmtDate, fmtDuration, fmtTime, rupees, sportEmoji } from "./format";
import type { Bill, BookingDetail, Entry } from "./types";

export function payLink(slug: string): string {
  return `${window.location.origin}/pay/${slug}`;
}

/** UPI deep link / QR payload. Leave out the amount to let the payer type it. */
export function upiLink(opts: { upi: string; payee: string; amount?: number; note: string }): string {
  const params = new URLSearchParams({ pa: opts.upi, pn: opts.payee });
  if (opts.amount) params.set("am", opts.amount.toFixed(2));
  params.set("cu", "INR");
  params.set("tn", opts.note.slice(0, 60));
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** Put a "UPI: …" line just above the pay link when a template doesn't place {upi} itself. */
function withUpiLine(template: string, upi: string): string {
  if (!upi || template.includes("{upi}")) return template;
  const lines = template.split("\n");
  const at = lines.findIndex((l) => l.includes("{link}"));
  lines.splice(at === -1 ? lines.length : at, 0, "💳 UPI: {upi}");
  return lines.join("\n");
}

export function fillTemplate(template: string, booking: BookingDetail, entry: Entry, upi = ""): string {
  const vars: Record<string, string> = {
    name: entry.name.split(" ")[0],
    fullname: entry.name,
    amount: String(entry.amount),
    ground: booking.ground_name,
    date: fmtDate(booking.play_date),
    time: fmtTime(booking.start_time),
    link: payLink(booking.slug),
    upi,
  };
  return withUpiLine(template, upi).replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
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

/** Fill a custom game message: {link} → pay link, {amount} → usual share, {upi} → UPI ID. */
export function fillNote(note: string, link: string, amount: number, upi = ""): string {
  return withUpiLine(note, upi).replaceAll("{link}", link).replaceAll("{amount}", String(amount)).replaceAll("{upi}", upi);
}

/** Status board to paste into the WhatsApp group. */
export function groupMessage(b: BookingDetail, upi = ""): string {
  const paid = b.entries.filter((e) => e.status === "paid");
  const claimed = b.entries.filter((e) => e.status === "claimed");
  const pending = b.entries.filter((e) => e.status === "pending");
  const note = b.notes.trim()
    ? [fillNote(b.notes.trim(), payLink(b.slug), commonAmount(b.entries.filter((e) => !e.is_organizer).map((e) => e.amount)), upi), ""]
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
  if (pending.length) {
    if (upi && !note.length) lines.push(`💳 UPI: ${upi}`);
    lines.push(`👉 Scan the QR or pay in 10 sec: ${payLink(b.slug)}`);
  } else lines.push("🏆 All clear! See you on the turf.");
  return lines.join("\n");
}

export function billLink(slug: string): string {
  return `${window.location.origin}/bill/${slug}`;
}

/** A player's full bill, ready to send in their personal WhatsApp chat. */
export function billMessage(bill: Bill, organizer: string, upi = ""): string {
  const lines = [`Hi ${bill.name.split(" ")[0]} 👋`, `Your turf dues${organizer ? ` with ${organizer}` : ""}:`, ""];
  bill.lines.forEach((l) => {
    const when = fmtDate(l.play_date, { weekday: "short", day: "numeric", month: "short" });
    lines.push(`• ${l.ground_name} · ${when} — ${rupees(l.amount)}${l.status === "claimed" ? " (checking your payment)" : ""}`);
  });
  if (bill.extra_due > 0) lines.push(`• Other dues — ${rupees(bill.extra_due)}`);
  if (bill.extra_due < 0) lines.push(`• Already paid in advance — −${rupees(-bill.extra_due)}`);
  lines.push("", `Total: *${rupees(bill.due)}*`);
  if (upi) lines.push(`💳 UPI: ${upi}`);
  lines.push(`👉 Scan the QR or pay in one tap: ${billLink(bill.pay_slug)}`);
  return lines.join("\n");
}
