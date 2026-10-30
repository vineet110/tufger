"use client";

import { useEffect, useState } from "react";
import { Popup } from "@/components/Popup";
import { toast } from "@/components/Toast";
import { copyText } from "@/components/Toast";
import { api, type HostAdminResult, setVaultKey } from "@/lib/api";
import type { HostAdminRow } from "@/lib/types";

/** Site admin only: hosts, premium access and the Tufger key. */
/** Ask for a passcode; empty means "generate one". Returns undefined when cancelled. */
function askPasscode(who: string): string | null | undefined {
  const v = prompt(`Pavilion passcode for ${who} (6+ characters).\nLeave empty to generate a random one.`);
  if (v === null) return undefined;
  if (v.trim() && v.trim().length < 6) {
    toast("Passcodes need at least 6 characters", "err");
    return undefined;
  }
  return v.trim() || null;
}

export function AdminPanel() {
  const [hosts, setHosts] = useState<HostAdminRow[] | null>(null);
  const [revealed, setRevealed] = useState<{ who: string; code: string } | null>(null);
  const [asking, setAsking] = useState<Confirming | null>(null); // a credential change waiting for the admin's passcode or Tufger key
  const load = () => api.hosts().then(setHosts, (e) => toast(e.message, "err"));
  useEffect(() => {
    load();
  }, []);

  async function update(h: HostAdminRow, patch: Parameters<typeof api.updateHost>[1], ok: string) {
    const send = async (secret?: string) => {
      const row: HostAdminResult = await api.updateHost(h.id, secret ? { ...patch, confirm: secret } : patch);
      setHosts((list) => list?.map((x) => (x.id === row.id ? row : x)) ?? null);
      if (row.passcode) setRevealed({ who: `${row.display_name} (@${row.username})`, code: row.passcode });
      toast(ok);
    };
    if (patch.password || patch.passcode !== undefined || patch.new_passcode || patch.role === "premium") {
      const what = patch.role === "premium" ? `Make @${h.username} premium` : patch.password ? `Reset @${h.username}'s password` : `New passcode for @${h.username}`;
      return setAsking({ what, run: send });
    }
    try {
      await send();
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
          Hosts sign up from the Pavilion page. Make someone <b className="text-led">premium</b> to give them Dugout, Scorebook (with the Tufger key),
          bulk contact upload and their own Pavilion passcode. Each passcode opens only that person&apos;s account.
        </p>

        {revealed && <PasscodeReveal who={revealed.who} code={revealed.code} onClose={() => setRevealed(null)} />}

        <div className="mt-4 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {hosts?.map((h) => (
            <div key={h.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${h.active ? "" : "opacity-50"}`}>
              <div className="min-w-[160px] flex-1">
                <div className="font-semibold">
                  {h.display_name} <span className="text-xs text-muted">@{h.username}</span>
                  {h.has_passcode && <span className="ml-2 text-xs text-led" title="Can sign in on the Pavilion with a passcode">🔑 Pavilion</span>}
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
                        onClick={() => {
                          if (h.role === r) return;
                          if (r === "host") {
                            if (confirm(`Make ${h.display_name} a normal host? Their Pavilion passcode stops working. Their data stays.`))
                              update(h, { role: "host" }, `${h.display_name} is now a normal host`);
                            return;
                          }
                          const passcode = askPasscode(h.display_name);
                          if (passcode !== undefined) update(h, { role: "premium", passcode }, `${h.display_name} is now premium ⭐`);
                        }}
                      >
                        {r === "premium" ? "⭐ premium" : "host"}
                      </button>
                    ))}
                  </div>
                  {h.role === "premium" && (
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        const passcode = askPasscode(h.display_name);
                        if (passcode !== undefined)
                          update(h, passcode ? { passcode } : { new_passcode: true }, `New Pavilion passcode for @${h.username}`);
                      }}
                    >
                      New passcode
                    </button>
                  )}
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

        <CreateHost
          ask={setAsking}
          onCreated={(row) => {
            setHosts((list) => [...(list ?? []), row]);
            if (row.passcode) setRevealed({ who: `${row.display_name} (@${row.username})`, code: row.passcode });
          }}
        />
      </section>

      {asking && <ConfirmPopup {...asking} onClose={() => setAsking(null)} />}
    </>
  );
}

type Confirming = { what: string; run: (secret: string) => Promise<void> };

/** Runs the action with the admin's passcode or Tufger key. Stays open on a wrong one, so nothing happens until it's right. */
function ConfirmPopup({ what, run, onClose }: Confirming & { onClose: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await run(secret);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't do that");
      setBusy(false);
    }
  }

  return (
    <Popup onClose={onClose}>
      <form onSubmit={submit} className="board rise p-7 pt-9">
        <div className="eyebrow !text-led">🔐 Confirm it&apos;s you</div>
        <div className="display mt-2 text-3xl break-words">{what}</div>
        <label className="eyebrow label mt-5" htmlFor="admin-secret">
          Your passcode or Tufger key
        </label>
        <input
          id="admin-secret"
          type="password"
          autoFocus
          className="field"
          autoComplete="current-password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        {error && <p className="mt-3 text-sm text-red">✕ {error}</p>}
        <div className="mt-5 flex gap-2">
          <button className="btn btn-lime" disabled={!secret || busy}>
            {busy ? "Checking…" : "Confirm"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Popup>
  );
}

function TufgerKey() {
  const [key, setKey] = useState("");
  const [confirmKey, setConfirmKey] = useState("");
  const [me, setMeSecret] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="slab p-6">
      <h2 className="display text-3xl">Tufger key</h2>
      <p className="mt-1 text-sm text-muted">
        The backup key: it opens Dugout and Scorebook for any premium host, and confirms sensitive steps (password and passcode changes) when someone forgets
        their password. Keep it private.
      </p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (key.length < 4) return toast("At least 4 characters", "err");
          if (key !== confirmKey) return toast("The keys don't match", "err");
          setBusy(true);
          try {
            await api.setTufgerKey(key, me);
            setVaultKey(null); // this tab unlocks again with the new key
            setKey("");
            setConfirmKey("");
            setMeSecret("");
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
        <input type="password" className="field" autoComplete="current-password" placeholder="Your passcode or current key" value={me} onChange={(e) => setMeSecret(e.target.value)} />
        <button className="btn" disabled={busy || !key || !me}>
          {busy ? "Saving…" : "Change key"}
        </button>
      </form>
    </section>
  );
}

function PasscodeReveal({ who, code, onClose }: { who: string; code: string; onClose: () => void }) {
  return (
    <div className="board rise mt-4 p-5 pt-7">
      <div className="eyebrow !text-led">Pavilion passcode for {who}</div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="led dot text-4xl tracking-widest">{code}</span>
        <button className="btn btn-sm" onClick={() => copyText(code, "Passcode copied")}>
          Copy
        </button>
        <button className="btn btn-sm btn-ghost" onClick={onClose}>
          Done
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">Share it with them privately. It won&apos;t be shown again (you can always make a new one).</p>
    </div>
  );
}

function CreateHost({ ask, onCreated }: { ask: (c: Confirming) => void; onCreated: (row: HostAdminResult) => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"premium" | "host">("premium");
  const [passcode, setPasscode] = useState("");

  if (!open)
    return (
      <button className="btn btn-led btn-sm mt-4" onClick={() => setOpen(true)}>
        + Create a host
      </button>
    );

  return (
    <form
      className="mt-4 grid gap-3 rounded-xl border border-led/40 p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) return toast("Username: 3–30 letters, numbers, _ or .", "err");
        if (password.length < 8) return toast("Password needs at least 8 characters", "err");
        if (role === "premium" && passcode && passcode.length < 6) return toast("Passcodes need at least 6 characters", "err");
        ask({
          what: `Create @${username}`,
          run: async (secret) => {
            const row = await api.createHost({ username, display_name: name, password, role, passcode: role === "premium" ? passcode || null : null, confirm: secret });
            onCreated(row);
            toast(`@${row.username} created. Share the username and password with them`);
            setOpen(false);
            setUsername("");
            setName("");
            setPassword("");
            setPasscode("");
          },
        });
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
      {role === "premium" && (
        <input
          className="field sm:col-span-2"
          type="text"
          autoComplete="off"
          placeholder="Pavilion passcode (6+), or leave empty to generate one"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value.trim())}
        />
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button className="btn btn-lime btn-sm" disabled={!username || !name.trim() || !password}>
          Create host
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
