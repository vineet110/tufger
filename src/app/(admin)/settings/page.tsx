"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/Toast";
import { api, setToken } from "@/lib/api";
import type { Settings } from "@/lib/types";

const VARS = ["{name}", "{fullname}", "{amount}", "{ground}", "{date}", "{time}", "{link}"];

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.settings().then(setS);
  }, []);

  if (!s) return <div className="slab h-96 animate-pulse opacity-50" />;

  const preview = s.reminder_template
    .replaceAll("{name}", "Rahul")
    .replaceAll("{fullname}", "Rahul Sharma")
    .replaceAll("{amount}", "450")
    .replaceAll("{ground}", "Smash Arena")
    .replaceAll("{date}", "Sun, 2 Nov")
    .replaceAll("{time}", "7:00 AM")
    .replaceAll("{link}", "https://…/pay/abc123");

  async function save() {
    setBusy(true);
    try {
      setS(await api.saveSettings(s!));
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

      <div className="flex items-center gap-3">
        <button className="btn btn-lime !px-8" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save settings"}
        </button>
        <button
          className="btn btn-ghost ml-auto"
          onClick={() => {
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
