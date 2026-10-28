import type { Metadata } from "next";
import { Suspense } from "react";
import { PayView } from "./PayView";

export const metadata: Metadata = {
  title: "Pay your share",
  description: "Tap your name, pay your turf share over UPI. Done in 10 seconds.",
};

export default function PayPage({ params }: PageProps<"/pay/[slug]">) {
  return (
    <Suspense fallback={<div className="led grid min-h-dvh place-items-center text-2xl">LOADING…</div>}>
      <PayView params={params} />
    </Suspense>
  );
}
