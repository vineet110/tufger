"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, getVaultKey, setVaultKey } from "@/lib/api";
import { ADMIN_CONTACT } from "@/lib/rules";
import { isPremium, useMe } from "./AdminShell";

/**
 * Second lock for Dugout and Scorebook: the host's own password (set in Settings), or the
 * Tufger key as a backup. Unlocking once opens both, for this browser tab.
 * Rendered inside AdminShell, which only mounts its children in the browser.
 */
export function VaultGate({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  const { me } = useMe();
  const [open, setOpen] = useState(() => !!getVaultKey());

  useEffect(() => {
    const onLocked = () => setOpen(false);
    window.addEventListener("tufger:locked", onLocked);
    return () => window.removeEventListener("tufger:locked", onLocked);
  }, []);

  if (!isPremium(me)) return <Upgrade title={title} name={me.display_name} />;
  if (open) return <>{children}</>;
  return <Unlock title={title} blurb={blurb} hasPassword={me.has_vault_password} onOpen={() => setOpen(true)} />;
}

export function LockButton() {
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => setVaultKey(null)}>
      🔒 Lock
    </button>
  );
}

function Unlock({ title, blurb, hasPassword, onOpen }: { title: string; blurb: string; hasPassword: boolean; onOpen: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.unlock(value);
      setVaultKey(value);
      onOpen();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock");
      setVaultKey(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid place-items-center py-10">
      <form onSubmit={submit} className="board rise w-full max-w-md p-7 pt-9 text-center">
        <div className="eyebrow !text-led">🔒 Locked</div>
        <div className="led dot mt-2 text-4xl uppercase">{title}</div>
        <p className="mt-3 text-sm text-chalk-dim">{blurb}</p>
        {!hasPassword && (
          <div className="mt-5 rounded-xl border border-led/40 bg-led/[0.06] p-4 text-left text-sm">
            <div className="font-semibold text-led">Create your Dugout &amp; Scorebook password first</div>
            <p className="mt-1 text-chalk-dim">You haven&apos;t set one yet. It keeps your players&apos; accounts safe even if someone opens your logged-in phone.</p>
            <Link href="/settings#vault" className="btn btn-led btn-sm mt-3">
              Create it in Settings →
            </Link>
          </div>
        )}
        <label className="eyebrow label mt-6 text-left" htmlFor="vault-pass">
          {hasPassword ? "Your Dugout & Scorebook password" : "Or unlock with the Tufger key"}
        </label>
        <input
          id="vault-pass"
          type="password"
          autoFocus
          className="field led text-center !text-2xl tracking-[0.4em]"
          placeholder="••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="mt-3 text-sm text-red">✕ {error}</p>}
        <button className="btn btn-lime mt-5 w-full !py-3.5" disabled={!value || busy}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="mt-3 text-xs text-muted">
          {hasPassword ? "Forgot it? The Tufger key works too. " : ""}Unlocking opens both Dugout and Scorebook.
        </p>
      </form>
    </div>
  );
}

/** What a normal host sees instead of a premium page. */
export function Upgrade({ title, name }: { title: string; name: string }) {
  const msg = encodeURIComponent(`Hi! I'm ${name} on Tufger. I'd like to upgrade to Premium for Dugout and Scorebook.`);
  return (
    <div className="grid place-items-center py-10">
      <div className="board rise w-full max-w-lg p-7 pt-9 text-center">
        <div className="eyebrow !text-led">⭐ Premium</div>
        <div className="led dot mt-2 text-4xl uppercase">{title}</div>
        <p className="mt-3 text-chalk-dim">
          Dugout (paste WhatsApp game posts into pay links) and Scorebook (every player&apos;s account, bills and backups) are part of
          Tufger Premium.
        </p>
        <p className="mt-2 text-sm text-muted">Message the Tufger admin to upgrade your account.</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <a className="btn btn-wa !py-3.5" href={`https://wa.me/${ADMIN_CONTACT.whatsapp}?text=${msg}`} target="_blank" rel="noreferrer">
            WhatsApp {ADMIN_CONTACT.whatsappLabel}
          </a>
          <a className="btn !py-3.5" href={`mailto:${ADMIN_CONTACT.email}?subject=${encodeURIComponent("Tufger Premium")}&body=${msg}`}>
            ✉ Email
          </a>
        </div>
        <p className="mt-3 font-[family-name:var(--font-jet)] text-xs text-muted">{ADMIN_CONTACT.email}</p>
      </div>
    </div>
  );
}
