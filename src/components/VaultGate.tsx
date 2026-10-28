"use client";

import { useEffect, useState } from "react";
import { api, getVaultKey, setVaultKey } from "@/lib/api";

/**
 * Second lock for Dugout and Scorebook. One Tufger key opens both, for this browser tab.
 * Rendered inside AdminShell, which only mounts its children in the browser.
 */
export function VaultGate({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => !!getVaultKey());

  useEffect(() => {
    const onLocked = () => setOpen(false);
    window.addEventListener("tufger:locked", onLocked);
    return () => window.removeEventListener("tufger:locked", onLocked);
  }, []);

  if (open) return <>{children}</>;
  return <Unlock title={title} blurb={blurb} onOpen={() => setOpen(true)} />;
}

export function LockButton() {
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => setVaultKey(null)}>
      🔒 Lock
    </button>
  );
}

function Unlock({ title, blurb, onOpen }: { title: string; blurb: string; onOpen: () => void }) {
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
        <input
          type="password"
          autoFocus
          className="field led mt-6 text-center !text-2xl tracking-[0.4em]"
          placeholder="••••"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="mt-3 text-sm text-red">✕ {error}</p>}
        <button className="btn btn-lime mt-5 w-full !py-3.5" disabled={!value || busy}>
          {busy ? "Checking…" : "Unlock"}
        </button>
        <p className="mt-3 text-xs text-muted">One Tufger key opens both Dugout and Scorebook.</p>
      </form>
    </div>
  );
}
