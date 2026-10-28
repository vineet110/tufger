"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { api, setVaultKey } from "@/lib/api";
import type { HostAdminRow } from "@/lib/types";

/** Site admin only: hosts, premium access and the Tufger key. */
export function AdminPanel() {
  const [hosts, setHosts] = useState<HostAdminRow[] | null>(null);
  const load = () => api.hosts().then(setHosts, (e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  async function update(h: HostAdminRow, patch: Parameters<typeof api.updateHost>[1], ok: string) {
    try {
      const row = await api.updateHost(h.id, patch);
      setHosts((list) => list?.map((x) => (x.id === row.id ? row : x)) ?? null);
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update", "err");
    }
  }

  const premium = hosts?.filter((h) => h.role === "premium").length ?? 0;

  return (
    <>
      <TufgerKey />

      <section className="slab p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-3xl">Hosts</h2>
          <span className="text-sm text-chalk-dim">
            {hosts ? `${hosts.length - 1} host${hosts.length === 2 ? "" : "s"} · ${premium} premium` : "…"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          Hosts sign up from the Pavilion page. Make someone <b className="text-led">premium</b> to give them Dugout and Scorebook (they still need the
          Tufger key).
        </p>

        <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {hosts?.map((h) => (
            <div key={h.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${h.active ? "" : "opacity-50"}`}>
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold">
                  {h.display_name} <span className="text-xs text-muted">@{h.username}</span>
                </div>
                <div className="text-xs text-muted">
                  {h.bookings} booking{h.bookings === 1 ? "" : "s"} · {h.players} players · joined{" "}
                  {new Date(h.created_at.endsWith("Z") || h.created_at.includes("+") ? h.created_at : h.created_at + "Z").toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              {h.role === "admin" ? (
                <span className="chip chip-claimed">admin (you)</span>
              ) : (
                <>
                  <div className="seg !p-1">
                    {(["host", "premium"] as const).map((r) => (
                      <button
                        key={r}
                        aria-pressed={h.role === r}
                        className="!px-2.5 !py-1 !text-xs"
                        onClick={() => h.role !== r && update(h, { role: r }, r === "premium" ? `${h.display_name} is now premium ⭐` : `${h.display_name} is now a normal host`)}
                      >
                        {r === "premium" ? "⭐ premium" : "host"}
                      </button>
                    ))}
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      const pw = prompt(`New password for @${h.username} (at least 8 characters)`);
                      if (pw === null) return;
                      if (pw.length < 8) return toast("At least 8 characters", "err");
                      update(h, { password: pw }, `Password reset for @${h.username}. Tell them the new one`);
                    }}
                  >
                    Reset password
                  </button>
                  <button
                    className={`btn btn-sm ${h.active ? "hover:!border-red hover:!text-red" : ""}`}
                    onClick={() =>
                      (h.active ? confirm(`Switch off @${h.username}? They'll be signed out and can't log in.`) : true) &&
                      update(h, { active: !h.active }, h.active ? `@${h.username} switched off` : `@${h.username} switched on`)
                    }
                  >
                    {h.active ? "Switch off" : "Switch on"}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <CreateHost onCreated={(row) => setHosts((list) => [...(list ?? []), row])} />
      </section>
    </>
  );
}

function TufgerKey() {
  const [key, setKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="slab p-6">
      <h2 className="display text-3xl">Tufger key</h2>
      <p className="mt-1 text-sm text-muted">The second lock on Dugout and Scorebook, shared by you and every premium host. Changing it locks everyone out until they enter the new one.</p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (key.length < 4) return toast("At least 4 characters", "err");
          if (key !== confirmKey) return toast("The keys don't match", "err");
          setBusy(true);
          try {
            await api.setTufgerKey(key);
            setVaultKey(null); // this tab unlocks again with the new key
            setKey("");
            setConfirmKey("");
            toast("Tufger key changed. Tell your premium hosts");
          } catch (err) {
            toast(err instanceof Error ? err.message : "Couldn't change the key", "err");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="password" className="field" autoComplete="new-password" placeholder="New Tufger key" value={key} onChange={(e) => setKey(e.target.value)} />
        <input type="password" className="field" autoComplete="new-password" placeholder="Confirm key" value={confirmKey} onChange={(e) => setConfirmKey(e.target.value)} />
        <button className="btn" disabled={busy || !key}>
          {busy ? "Saving…" : "Change key"}
        </button>
      </form>
    </section>
  );
}

function CreateHost({ onCreated }: { onCreated: (row: HostAdminRow) => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"premium" | "host">("premium");
  const [busy, setBusy] = useState(false);

  if (!open)
    return (
      <button className="btn btn-led btn-sm mt-4" onClick={() => setOpen(true)}>
        + Create a host
      </button>
    );

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-led/40 p-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return toast("Username: 3–30 letters, numbers, _ or .", "err");
        if (password.length < 8) return toast("Password needs at least 8 characters", "err");
        setBusy(true);
        try {
          const row = await api.createHost({ username, display_name: name, password, role });
          onCreated(row);
          toast(`@${row.username} created. Share the username and password with them`);
          setOpen(false);
          setUsername("");
          setName("");
          setPassword("");
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't create the host", "err");
        } finally {
          setBusy(false);
        }
      }}
    >
      <input className="field" placeholder="Username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))} />
      <input className="field" placeholder="Their name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="field" type="text" autoComplete="off" placeholder="Starting password (8+)" value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="seg">
        {(["premium", "host"] as const).map((r) => (
          <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)}>
            {r === "premium" ? "⭐ premium" : "host"}
          </button>
        ))}
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-lime btn-sm" disabled={busy || !username || !name.trim() || !password}>
          {busy ? "Creating…" : "Create host"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
