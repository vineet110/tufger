"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BillRun } from "@/components/BillRun";
import { toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { initials, rupees, timeAgo } from "@/lib/format";
import type { Bill, KhataRow } from "@/lib/types";

type Filter = "owes" | "all" | "advance" | "hidden";

export default function KhataPage() {
  const [rows, setRows] = useState<KhataRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [organizer, setOrganizer] = useState("");
  const [upi, setUpi] = useState("");
  const [busy, setBusy] = useState("");

  const load = () => api.khata().then(setRows, (e) => toast(e.message, "err"));
  useEffect(() => {
    load();
    api.settings().then((s) => (setOrganizer(s.organizer_name), setUpi(s.upi_id)), () => {});
  }, []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "hidden" ? !r.archived : r.archived) return false;
      if (filter === "owes" && r.balance <= 0) return false;
      if (filter === "advance" && r.balance >= 0) return false;
      return !needle || r.name.toLowerCase().includes(needle) || (r.phone ?? "").includes(needle);
    });
  }, [rows, q, filter]);

  const active = (rows ?? []).filter((r) => !r.archived);
  const toGet = active.reduce((s, r) => s + Math.max(r.balance, 0), 0);
  const advance = active.reduce((s, r) => s + Math.max(-r.balance, 0), 0);
  const owers = active.filter((r) => r.balance > 0).length;
  const noPhone = active.filter((r) => !r.phone).length;

  async function startBills() {
    setBusy("bills");
    try {
      const list = await api.bills();
      if (!list.length) toast("Nobody owes anything right now 🎉");
      else setBills(list);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't load bills", "err");
    } finally {
      setBusy("");
    }
  }

  async function backup() {
    setBusy("backup");
    try {
      await api.downloadBackup();
      toast("Backup downloaded");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Backup failed", "err");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="eyebrow !text-led">● Khata</div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">Every player&apos;s account</h1>
          <p className="mt-2 max-w-xl text-chalk-dim">
            Games, payments and dues for each player, saved in the cloud. Nothing is lost if your phone is.
          </p>
        </div>
        <div className="board grid grid-cols-2 gap-6 px-6 pt-7 pb-5">
          <div>
            <div className="eyebrow">You&apos;ll get</div>
            <div className="led dot mt-2 text-4xl leading-none">{rupees(toGet)}</div>
            <div className="mt-1 text-xs text-muted">
              from {owers} player{owers === 1 ? "" : "s"}
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow">Advance held</div>
            <div className="led dot led-lime mt-2 text-4xl leading-none">{rupees(advance)}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-wa" disabled={busy === "bills"} onClick={startBills}>
          📤 {busy === "bills" ? "Loading…" : "Send bills on WhatsApp"}
        </button>
        <button className="btn btn-lime" onClick={() => setAdding((a) => !a)}>
          + Add player
        </button>
        <button className="btn" disabled={busy === "backup"} onClick={backup}>
          ⬇ {busy === "backup" ? "Preparing…" : "Excel backup"}
        </button>
      </div>
      {noPhone > 0 && (
        <p className="text-sm text-led">
          {noPhone} player{noPhone > 1 ? "s have" : " has"} no WhatsApp number yet. Open them to add one, or add it while sending bills.
        </p>
      )}

      {adding && (
        <AddPlayer
          onDone={(id) => {
            setAdding(false);
            load();
            toast("Player added");
            void id;
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input className="field max-w-xs" placeholder="Search name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(
            [
              ["all", "Everyone"],
              ["owes", "Owes you"],
              ["advance", "Advance"],
              ["hidden", "Hidden"],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <div className="slab h-64 animate-pulse opacity-50" />
      ) : visible.length === 0 ? (
        <div className="slab p-10 text-center text-chalk-dim">
          {rows.length ? "No one matches that." : "No players yet. They're added automatically from bookings and Team Sheet, or add one above."}
        </div>
      ) : (
        <div className="slab divide-y divide-line overflow-hidden">
          {visible.map((r) => (
            <Link key={r.id} href={`/khata/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03]">
              <div
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-[family-name:var(--font-shoulders)] text-base font-black ${
                  r.balance > 0 ? "border-2 border-dashed border-chalk/50 text-chalk-dim" : "bg-lime text-[#0a1404]"
                }`}
              >
                {initials(r.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{r.name}</div>
                <div className="truncate text-xs text-muted">
                  {r.phone ? <span className="font-[family-name:var(--font-jet)]">+91 {r.phone}</span> : <span className="text-led">no number</span>}
                  {" · "}
                  {r.games} game{r.games === 1 ? "" : "s"}
                  {r.last_activity && ` · ${timeAgo(r.last_activity)}`}
                </div>
              </div>
              <div className="text-right">
                {r.balance > 0 ? (
                  <>
                    <div className="led text-lg">{rupees(r.balance)}</div>
                    <div className="text-[0.72rem] text-muted">{r.under_review ? `${rupees(r.under_review)} being checked` : "due"}</div>
                  </>
                ) : r.balance < 0 ? (
                  <>
                    <div className="led led-lime text-lg">{rupees(-r.balance)}</div>
                    <div className="text-[0.72rem] text-muted">advance</div>
                  </>
                ) : (
                  <div className="text-sm font-semibold text-lime">settled ✓</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {bills && (
        <BillRun
          bills={bills}
          organizer={organizer}
          upi={upi}
          onClose={() => {
            setBills(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddPlayer({ onDone }: { onDone: (id: number) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="slab rise flex flex-wrap items-end gap-3 border-lime/40 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
          const p = await api.addPlayer(name, phone.trim() || null);
          onDone(p.id);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Couldn't add player", "err");
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">Name</span>
        <input className="field" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ganesh" />
      </label>
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">WhatsApp number</span>
        <input className="field font-[family-name:var(--font-jet)]" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
      </label>
      <button className="btn btn-lime" disabled={!name.trim() || saving}>
        {saving ? "Saving…" : "Save player"}
      </button>
    </form>
  );
}
