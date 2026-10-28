"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_LAST_MINUTE, DEFAULT_REFUNDS, rulesFromText } from "@/lib/rules";
import type { PublicRules } from "@/lib/types";
import { HostRulesView } from "./RulesView";

/** Loads the house rules of the host in ?host= (the site admin's when missing). */
export function HostRules() {
  const host = useSearchParams().get("host") ?? "";
  const [rules, setRules] = useState<PublicRules | null>(null);

  useEffect(() => {
    api.publicRules(host).then(setRules, () => setRules(null));
  }, [host]);

  return (
    <HostRulesView
      hostName={rules?.host_name ?? ""}
      refunds={rulesFromText(rules?.refunds ?? "", DEFAULT_REFUNDS)}
      lastMinute={rulesFromText(rules?.last_minute ?? "", DEFAULT_LAST_MINUTE)}
    />
  );
}
