import { Suspense } from "react";
import { PlayerKhata } from "./PlayerKhata";

export default function PlayerKhataPage({ params }: PageProps<"/khata/[id]">) {
  return (
    <Suspense fallback={<div className="led py-20 text-center text-2xl">LOADING…</div>}>
      <PlayerKhata params={params} />
    </Suspense>
  );
}
