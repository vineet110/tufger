import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { Wordmark } from "@/components/Wordmark";
import { DEFAULT_LAST_MINUTE, DEFAULT_REFUNDS } from "@/lib/rules";
import { HostRules } from "./HostRules";
import { HostRulesView } from "./RulesView";

export const metadata: Metadata = {
  title: "Privacy, refunds & last-minute rules",
  description: "How Tufger handles your details, refunds, and drop-outs, rain or no-shows before a game.",
};

export default function PoliciesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">
        <Wordmark />
        <Suspense fallback={<HostRulesView hostName="" refunds={DEFAULT_REFUNDS} lastMinute={DEFAULT_LAST_MINUTE} />}>
          <HostRules />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
