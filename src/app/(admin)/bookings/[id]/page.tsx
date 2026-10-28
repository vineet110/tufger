import { Suspense } from "react";
import { ControlRoom } from "./ControlRoom";

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <Suspense fallback={<div className="led py-20 text-center text-2xl">LOADING…</div>}>
      <ControlRoom params={params} />
    </Suspense>
  );
}
