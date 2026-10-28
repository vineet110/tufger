import type { Metadata } from "next";
import { Suspense } from "react";
import { BillView } from "./BillView";

export const metadata: Metadata = {
  title: "Your bill",
  description: "All your turf dues in one place. Pay them together over UPI.",
};

export default function BillPage({ params }: PageProps<"/bill/[slug]">) {
  return (
    <Suspense fallback={<div className="led grid min-h-dvh place-items-center text-2xl">LOADING…</div>}>
      <BillView params={params} />
    </Suspense>
  );
}
