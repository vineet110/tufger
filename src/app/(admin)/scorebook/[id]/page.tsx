import { Suspense } from "react";
import { VaultGate } from "@/components/VaultGate";
import { PlayerKhata } from "./PlayerKhata";

export default function PlayerKhataPage({ params }: PageProps<"/scorebook/[id]">) {
  return (
    <VaultGate title="Scorebook" blurb="Every player's account, payments and bills. Enter the Tufger key to open it.">
      <Suspense fallback={<div className="led py-20 text-center text-2xl">LOADING…</div>}>
        <PlayerKhata params={params} />
      </Suspense>
    </VaultGate>
  );
}
