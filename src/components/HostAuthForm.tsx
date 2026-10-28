"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, setToken } from "@/lib/api";
import { SiteFooter } from "./SiteFooter";
import { Wordmark } from "./Wordmark";

/** Username + password login or sign-up for hosts. */
export function HostAuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  const problem = signup
    ? !/^[a-zA-Z0-9_.]{3,30}$/.test(username)
      ? "Username: 3–30 letters, numbers, _ or ."
      : !name.trim()
        ? "Add your name"
        : password.length < 8
          ? "Password needs at least 8 characters"
          : password !== confirm
            ? "Passwords don't match"
            : ""
    : !username || !password
      ? "Enter your username and password"
      : "";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    try {
      const s = signup ? await api.hostSignup(username.trim(), name.trim(), password) : await api.hostLogin(username.trim(), password);
      setToken(s.token);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="grid flex-1 place-items-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Wordmark size="lg" />
            <p className="mt-3 text-chalk-dim">{signup ? "Run your own games. Collect without chasing." : "Welcome back, captain."}</p>
          </div>
          <form onSubmit={submit} className="board rise space-y-4 p-7 pt-9">
            <div className="text-center">
              <div className="eyebrow !text-led">{signup ? "New host" : "Host entry"}</div>
              <div className="led dot mt-1 text-4xl">{signup ? "SIGN UP" : "LOG IN"}</div>
            </div>
            <label className="block">
              <span className="eyebrow label">Username</span>
              <input
                className="field"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                placeholder="ravi_turf"
              />
            </label>
            {signup && (
              <label className="block">
                <span className="eyebrow label">Your name (players see this)</span>
                <input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ravi" />
              </label>
            )}
            <label className="block">
              <span className="eyebrow label">Password</span>
              <input
                type="password"
                className="field"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {signup && (
              <label className="block">
                <span className="eyebrow label">Confirm password</span>
                <input type="password" className="field" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </label>
            )}
            {error && <p className="text-sm text-red">✕ {error}</p>}
            <button className="btn btn-lime w-full !py-3.5 text-lg" disabled={busy}>
              {busy ? "Please wait…" : signup ? "Create my account →" : "Log in →"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-chalk-dim">
            {signup ? (
              <>
                Already have an account?{" "}
                <Link href="/host/login" className="text-lime underline">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{" "}
                <Link href="/host/signup" className="text-lime underline">
                  Sign up as a host
                </Link>
              </>
            )}
            {" · "}
            <Link href="/" className="underline">
              Pavilion
            </Link>
          </p>
          {!signup && <p className="mt-2 text-center text-xs text-muted">Forgot your password? Ask the Tufger admin to reset it.</p>}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
