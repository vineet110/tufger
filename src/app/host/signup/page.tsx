import type { Metadata } from "next";
import { HostAuthForm } from "@/components/HostAuthForm";

export const metadata: Metadata = { title: "Sign up as a host" };

export default function HostSignupPage() {
  return <HostAuthForm mode="signup" />;
}
