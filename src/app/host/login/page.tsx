import type { Metadata } from "next";
import { HostAuthForm } from "@/components/HostAuthForm";

export const metadata: Metadata = { title: "Host login" };

export default function HostLoginPage() {
  return <HostAuthForm mode="login" />;
}
