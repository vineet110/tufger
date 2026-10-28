import { connection } from "next/server";
import { upiLink } from "@/lib/messages";
import { OG_SIZE, scanToPayImage } from "@/lib/og";
import { serverApiBase } from "@/lib/site";
import type { PublicBill } from "@/lib/types";

export const alt = "Scan to pay your turf bill";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection(); // the amount changes as people pay, so never cache this
  const { slug } = await params;
  const bill: PublicBill | null = await fetch(`${serverApiBase()}/public/bill/${slug}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  if (!bill) return scanToPayImage({ upi: null, heading: "Turf bill", line: "Tufger · Turf Booking Manager", amount: "", upiId: "" });

  const first = bill.name.split(" ")[0];
  const canPay = !!bill.upi_id && bill.due > 0;
  return scanToPayImage({
    upi: canPay ? upiLink({ upi: bill.upi_id, payee: bill.payee_name, amount: bill.due, note: `Turf dues - ${first}` }) : null,
    heading: canPay ? `${first}'s turf bill` : `${first}, all clear`,
    line: canPay ? `Scan to pay ${bill.payee_name}` : "Nothing to pay right now",
    amount: canPay ? `Rs ${bill.due.toLocaleString("en-IN")}` : "",
    upiId: canPay ? bill.upi_id : "",
  });
}
