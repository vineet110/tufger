"use client";

import { useEffect, useState } from "react";
import { isPremium, useMe } from "@/components/AdminShell";
import { toast } from "@/components/Toast";
import { Upgrade } from "@/components/VaultGate";
import { api, setToken, setVaultKey } from "@/lib/api";
import { DEFAULT_LAST_MINUTE, DEFAULT_REFUNDS } from "@/lib/rules";
import type { Settings } from "@/lib/types";
import { AdminPanel } from "./AdminPanel";

const VARS = ["{name}", "{fullname}", "{amount}", "{ground}", "{date}", "{time}", "{upi}", "{link}"];

const DEFAULT_REFUNDS_TEXT = DEFAULT_REFUNDS.join("\n");
const DEFAULT_LAST_MINUTE_TEXT = DEFAULT_LAST_MINUTE.join("\n");

export default function SettingsPage() {
  const { me } = useMe();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // show the defaults in the boxes so hosts start from something sensible
    api.settings().then((x) =>
      setS({ ...x, house_refunds: x.house_refunds || DEFAULT_REFUNDS_TEXT, house_last_minute: x.house_last_minute || DEFAULT_LAST_MINUTE_TEXT }),
    );
  }, []);

  if (!s) return <div className="slab h-96 animate-pulse opacity-50" />;

  const preview = s.reminder_template
    .replaceAll("{name}", "Rahul")
    .replaceAll("{fullname}", "Rahul Sharma")
    .replaceAll("{amount}", "450")
    .replaceAll("{ground}", "Smash Arena")
    .replaceAll("{date}", "Sun, 2 Nov")
    .replaceAll("{time}", "7:00 AM")
    .replaceAll("{upi}", s.upi_id || "you@upi")
    .replaceAll("{link}", "https://…/pay/abc123");

  async function save() {
    setBusy(true);
    try {
      // unchanged defaults are stored as "" so future default improvements reach this host too
      const saved = await api.saveSettings({
        ...s!,
        house_refunds: s!.house_refunds.trim() === DEFAULT_REFUNDS_TEXT ? "" : s!.house_refunds.trim(),
        house_last_minute: s!.house_last_minute.trim() === DEFAULT_LAST_MINUTE_TEXT ? "" : s!.house_last_minute.trim(),
      });
      setS({
        ...saved,
        house_refunds: saved.house_refunds || DEFAULT_REFUNDS_TEXT,
        house_last_minute: saved.house_last_minute || DEFAULT_LAST_MINUTE_TEXT,
      });
      toast("Settings saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rise">
        <div className="eyebrow !text-led">● Settings</div>
        <h1 className="display mt-2 text-6xl sm:text-7xl">Captain&apos;s desk</h1>
      </div>

      <section className="slab p-6">
        <h2 className="display text-3xl">Where the money goes</h2>
        <p className="mt-1 text-sm text-muted">Players pay this UPI ID directly. Tufger never holds any money.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="eyebrow label">Your name</label>
            <input className="field" value={s.organizer_name} onChange={(e) => setS({ ...s, organizer_name: e.target.value })} />
          </div>
          <div>
            <label className="eyebrow label">Name on UPI (payee)</label>
            <input className="field" value={s.payee_name} placeholder={s.organizer_name} onChange={(e) => setS({ ...s, payee_name: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="eyebrow label">UPI ID</label>
            <input
              className="field led !text-2xl"
              value={s.upi_id}
              placeholder="yourname@okicici"
              onChange={(e) => setS({ ...s, upi_id: e.target.value.trim() })}
            />
            {s.upi_id && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(s.upi_id) && (
              <p className="mt-1 text-xs text-red">That doesn&apos;t look like a UPI ID (it should look like name@bank)</p>
            )}
          </div>
        </div>
      </section>

      <section className="slab p-6">
        <h2 className="display text-3xl">Reminder message</h2>
        <p className="mt-1 text-sm text-muted">Used for every Nudge Run and single reminder. Tap a tag to insert it.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {VARS.map((v) => (
            <button key={v} className="chip chip-claimed font-mono !normal-case" onClick={() => setS({ ...s, reminder_template: s.reminder_template + v })}>
              {v}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <textarea
            className="field min-h-[180px] text-sm leading-relaxed"
            value={s.reminder_template}
            onChange={(e) => setS({ ...s, reminder_template: e.target.value })}
          />
          <div className="rounded-2xl bg-[#0b141a] p-4">
            <div className="eyebrow mb-2 !text-[0.68rem]">WhatsApp preview</div>
            <div className="max-w-[90%] rounded-lg rounded-tl-none bg-[#005c4b] px-3 py-2 text-sm whitespace-pre-wrap text-[#e9edef] shadow">
              {preview}
            </div>
          </div>
        </div>
      </section>

      <section className="slab p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="display text-3xl">House rules</h2>
          <a href={me.role === "admin" ? "/policies" : `/policies?host=${me.username}`} target="_blank" className="text-xs text-chalk-dim underline">
            See what players see ↗
          </a>
        </div>
        <p className="mt-1 text-sm text-muted">Players open these from the footer of your pay links. One rule per line. Privacy rules are the same for everyone.</p>
        <RulesBox label="Refunds" value={s.house_refunds} onChange={(v) => setS({ ...s, house_refunds: v })} onReset={() => setS({ ...s, house_refunds: DEFAULT_REFUNDS_TEXT })} />
        <RulesBox
          label="Last-minute rules"
          value={s.house_last_minute}
          onChange={(v) => setS({ ...s, house_last_minute: v })}
          onReset={() => setS({ ...s, house_last_minute: DEFAULT_LAST_MINUTE_TEXT })}
        />
      </section>

      <div className="flex items-center gap-3">
        <button className="btn btn-lime !px-8" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>

      <Account />
      {me.role === "admin" && <AdminPanel />}
      {!isPremium(me) && <Upgrade title="Premium" name={me.display_name} />}

      <div className="flex justify-end">
        <button
          className="btn btn-ghost"
          onClick={() => {
            setVaultKey(null);
            setToken(null);
            window.dispatchEvent(new Event("tufger:logout"));
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

function RulesBox({ label, value, onChange, onReset }: { label: string; value: string; onChange: (v: string) => void; onReset: () => void }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <label className="eyebrow label">{label}</label>
        <button className="text-xs text-chalk-dim underline" onClick={onReset}>
          Use Tufger defaults
        </button>
      </div>
      <textarea className="field min-h-[170px] text-sm leading-relaxed" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Account() {
  const { me } = useMe();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const word = me.role === "admin" ? "Pavilion passcode" : "password";
  const problem = next.length < 8 ? `New ${word} needs at least 8 characters` : next !== confirm ? "They don't match" : "";

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return toast(problem, "err");
    setBusy(true);
    try {
      const session = await api.changePassword(current, next);
      setToken(session.token); // this device stays signed in; others are signed out
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(`${word[0].toUpperCase() + word.slice(1)} changed. Other devices are signed out`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change it", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="account" className="slab scroll-mt-24 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-3xl">Account</h2>
        <span className="text-sm text-chalk-dim">
          @{me.username} · <span className="chip chip-pending !text-[0.65rem]">{me.role}</span>
        </span>
      </div>
      <form onSubmit={change} className="mt-4 grid gap-3 sm:grid-cols-3">
        <input type="password" className="field" autoComplete="current-password" placeholder={`Current ${word}`} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input type="password" className="field" autoComplete="new-password" placeholder={`New ${word}`} value={next} onChange={(e) => setNext(e.target.value)} />
        <input type="password" className="field" autoComplete="new-password" placeholder="Confirm new" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <button className="btn btn-sm sm:col-span-3 sm:justify-self-start" disabled={busy || !current || !next}>
          {busy ? "Saving…" : `Change ${word}`}
        </button>
      </form>
    </section>
  );
}


