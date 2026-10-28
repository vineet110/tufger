"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";
import { Toaster } from "./Toast";
import { Wordmark } from "./Wordmark";

const NAV = [
  { href: "/", label: "Pavilion" },
  { href: "/bookings/new", label: "New booking" },
  { href: "/teamsheet", label: "Team Sheet" },
  { href: "/khata", label: "Khata" },
  { href: "/grounds", label: "Grounds" },
  { href: "/settings", label: "Settings" },
];

const TICKER = [
  "FLOODLIGHTS ON",
  "ONE LINK · WHOLE SQUAD · ZERO CHASING",
  "UPI IN 10 SECONDS",
  "NO MORE “BHAI PAISE BHEJ DE”",
  "THIRD UMPIRE: YOU",
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "out" | "in">("checking");

  useEffect(() => {
    const check = () => {
      if (!getToken()) return setState("out");
      api.me().then(
        () => setState("in"),
        () => setState("out"),
      );
    };
    check();
    const onLogout = () => setState("out");
    window.addEventListener("tufger:logout", onLogout);
    return () => window.removeEventListener("tufger:logout", onLogout);
  }, []);

  if (state === "checking") return <Floodlights />;
  if (state === "out") return <Login onIn={() => setState("in")} />;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="border-b border-line bg-black/50 py-1.5">
        <div className="ticker eyebrow text-[0.72rem] !text-led">
          <div>
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="mx-6">
                ● {t}
              </span>
            ))}
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-line bg-night/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Wordmark />
          <nav className="ml-auto flex items-center gap-1 overflow-x-auto">
            <Suspense fallback={<NavLinks pathname="" />}>
              <ActiveNav />
            </Suspense>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24">{children}</main>
      <div className="fixed right-4 bottom-5 z-40 sm:hidden">
        <Link href="/bookings/new" className="btn btn-lime rounded-full !px-5 !py-4 shadow-2xl">
          + Booking
        </Link>
      </div>
      <Toaster />
    </div>
  );
}

function ActiveNav() {
  return <NavLinks pathname={usePathname()} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  return NAV.map((n) => {
    const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
    return (
      <Link
        key={n.href}
        href={n.href}
        className={`display relative px-3 py-2 text-[0.95rem] tracking-wider whitespace-nowrap transition-colors ${
          active ? "text-lime" : "text-chalk-dim hover:text-chalk"
        } ${n.href === "/bookings/new" ? "hidden sm:block" : ""}`}
      >
        {n.label}
        {active && <span className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full bg-lime shadow-[0_0_12px_var(--lime)]" />}
      </Link>
    );
  });
}

function Floodlights() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="led text-2xl">
        LOADING<span className="blink">_</span>
      </div>
    </div>
  );
}

function Login({ onIn }: { onIn: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await api.login(code);
      setToken(token);
      onIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wrong passcode");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Wordmark size="lg" />
          <p className="mt-3 text-chalk-dim">Turf money, collected. Without the chasing.</p>
        </div>
        <form onSubmit={submit} className="board rise p-7 pt-9">
          <div className="eyebrow mb-1 text-center !text-led">Organiser entry</div>
          <div className="led mb-6 text-center text-4xl dot">PAVILION</div>
          <label className="eyebrow label" htmlFor="code">
            Passcode
          </label>
          <input
            id="code"
            type="password"
            autoFocus
            className="field led !text-2xl tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="••••••"
          />
          {error && <p className="mt-3 text-sm text-red">✕ {error}</p>}
          <button className="btn btn-lime mt-6 w-full !py-3.5 text-lg" disabled={busy || !code}>
            {busy ? "Checking…" : "Walk out to bat →"}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-muted">Players don&apos;t need this. They pay from the link you share.</p>
      </div>
    </div>
  );
}
