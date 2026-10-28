import { connection } from "next/server";
import { fmtDate, fmtTime } from "@/lib/format";
import { commonAmount, upiLink } from "@/lib/messages";
import { OG_SIZE, scanToPayImage } from "@/lib/og";
import { serverApiBase } from "@/lib/site";
import type { PublicBooking } from "@/lib/types";

export const alt = "Scan to pay your turf share";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await params;
  const b: PublicBooking | null = await fetch(`${serverApiBase()}/public/b/${slug}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  if (!b) return scanToPayImage({ upi: null, heading: "Pay your share", line: "Tufger · Turf Booking Manager", amount: "", upiId: "" });

  // Shares can differ per player, so the QR leaves the amount for the payer to type.
  const each = commonAmount(b.entries.filter((e) => !e.is_organizer).map((e) => e.amount));
  return scanToPayImage({
    upi: b.upi_id ? upiLink({ upi: b.upi_id, payee: b.payee_name, note: `${b.ground_name} ${b.play_date}` }) : null,
    heading: b.ground_name,
    line: `${fmtDate(b.play_date)} · ${fmtTime(b.start_time)} · pay ${b.payee_name}`,
    amount: each ? `Rs ${each.toLocaleString("en-IN")}` : "",
    amountNote: each ? "each" : undefined,
    upiId: b.upi_id,
  });
}
