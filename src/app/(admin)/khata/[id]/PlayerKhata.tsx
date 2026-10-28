"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { BillRun } from "@/components/BillRun";
import { copyText, toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { initials, rupees } from "@/lib/format";
import { billLink, whatsappLink } from "@/lib/messages";
import type { Bill, KhataDetail, KhataItem } from "@/lib/types";

export function PlayerKhata({ params }: { params: Promise<{ id: string }> }) {
  const id = Number(use(params).id);
  const router = useRouter();
  const [p, setP] = useState<KhataDetail | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState<"got" | "due" | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [organizer, setOrganizer] = useState("");
  const [upi, setUpi] = useState("");

  const load = useCallback(() => api.khataPlayer(id).then(setP, (e) => setError(e.message)), [id]);
  useEffect(() => {
    load();
    api.settings().then((s) => (setOrganizer(s.organizer_name), setUpi(s.upi_id)), () => {});
  }, [load]);

  const act = async (work: Promise<KhataDetail>, ok: string) => {
    try {
      setP(await work);
      toast(ok);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong", "err");
      return false;
    }
  };

  async function openBill() {
    try {
      const all = await api.bills();
      const mine = all.find((b) => b.player_id === id);
      if (!mine) toast(`${p?.name ?? "This player"} has nothing to pay right now`);
      else setBill(mine);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't build the bill", "err");
    }
  }

  if (error) return <p className="slab p-6 text-red">✕ {error}</p>;
  if (!p) return <div className="led py-20 text-center text-2xl">LOADING…</div>;

  return (
    <div className="space-y-6">
      <Link href="/khata" className="eyebrow inline-block hover:text-chalk">
        ← Khata
      </Link>

      <header className="rise flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-chalk/10 font-[family-name:var(--font-shoulders)] text-2xl font-black">
            {initials(p.name)}
          </div>
          <div className="min-w-0">
            <h1 className="display truncate text-5xl sm:text-6xl">{p.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-chalk-dim">
              {p.phone ? <span className="font-[family-name:var(--font-jet)]">+91 {p.phone}</span> : <span className="text-led">No WhatsApp number</span>}
              <span>·</span>
              <span>
                {p.games} game{p.games === 1 ? "" : "s"}
              </span>
              {p.rating !== "New" && (
                <>
                  <span>·</span>
                  <span>{p.rating === "Lightning" ? "⚡ pays fast" : p.rating === "Slow" ? "🐢 slow payer" : p.rating}</span>
                </>
              )}
              {p.archived && <span className="chip chip-pending">hidden</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.phone && (
            <a className="btn btn-sm" href={whatsappLink(p.phone, "")} target="_blank" rel="noreferrer">
              💬 Chat
            </a>
          )}
          <button className="btn btn-sm" onClick={() => setEditing((x) => !x)}>
            ✏️ Edit
          </button>
          <button className="btn btn-sm" onClick={() => copyText(billLink(p.pay_slug), "Bill link copied")}>
            🔗 Bill link
          </button>
          <button className="btn btn-wa btn-sm" onClick={openBill}>
            📤 Send bill
          </button>
        </div>
      </header>

      {editing && <EditPlayer p={p} onSaved={(d) => (setP(d), setEditing(false), toast("Saved"))} onDeleted={() => router.push("/khata")} />}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="board px-6 pt-8 pb-6 text-center">
            <div className="eyebrow !text-led">{p.balance > 0 ? `${p.name.split(" ")[0]} owes you` : p.balance < 0 ? "Advance with you" : "All settled"}</div>
            <div className={`led dot mt-3 text-6xl leading-none ${p.balance <= 0 ? "led-lime" : ""}`}>{rupees(Math.abs(p.balance))}</div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <Stat k="Charged" v={rupees(p.charged)} />
              <Stat k="Paid" v={rupees(p.paid)} />
              <Stat k="Being checked" v={rupees(p.under_review)} />
            </div>
          </div>

          <section className="slab overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="display text-2xl">History</h2>
              <span className="text-xs text-muted">newest first · balance after each entry</span>
            </div>
            {p.history.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted">No entries yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {p.history.map((h) => (
                  <HistoryRow key={h.id} h={h} onDelete={(txnId) => act(api.deleteTxn(txnId), "Entry removed")} />
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="grid grid-cols-2 gap-2">
            <button className={`btn !py-4 ${entry === "got" ? "btn-lime" : ""}`} onClick={() => setEntry(entry === "got" ? null : "got")}>
              ⬇ Got payment
            </button>
            <button className={`btn !py-4 ${entry === "due" ? "btn-led" : ""}`} onClick={() => setEntry(entry === "due" ? null : "due")}>
              ⬆ Add due
            </button>
          </div>
          {entry && (
            <MoneyForm
              key={entry}
              kind={entry}
              name={p.name}
              onSubmit={async (amount, note, settle) => {
                const ok = await act(
                  entry === "got" ? api.gotPayment(p.id, amount, note, settle) : api.addDue(p.id, amount, note),
                  entry === "got" ? `${rupees(amount)} received from ${p.name}` : `${rupees(amount)} added to ${p.name}'s dues`,
                );
                if (ok) setEntry(null);
              }}
            />
          )}
          <div className="slab p-4 text-sm text-chalk-dim">
            <div className="eyebrow mb-2">How it adds up</div>
            Games and dues add to the balance. Payments take it down. <b className="text-chalk">Got payment</b> ticks off the oldest unpaid games first, and
            anything left over is kept as an advance.
          </div>
        </aside>
      </div>

      {bill && <BillRun bills={[bill]} organizer={organizer} upi={upi} onClose={() => (setBill(null), load())} />}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-black/40 py-2">
      <div className="eyebrow !text-[0.68rem]">{k}</div>
      <div className="led text-base">{v}</div>
    </div>
  );
}

const KIND_STYLE: Record<KhataItem["kind"], { sign: string; tone: string; label: string }> = {
  charge: { sign: "+", tone: "text-led", label: "Game" },
  due: { sign: "+", tone: "text-led", label: "Due" },
  paid: { sign: "−", tone: "text-lime", label: "Paid" },
  got: { sign: "−", tone: "text-lime", label: "Got" },
};

function HistoryRow({ h, onDelete }: { h: KhataItem; onDelete: (txnId: number) => void }) {
  const s = KIND_STYLE[h.kind];
  const when = new Date(h.at.endsWith("Z") || h.at.includes("+") ? h.at : h.at + "Z");
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="w-14 shrink-0 text-center">
        <div className="text-xs font-semibold">{when.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
        <div className="text-[0.7rem] text-muted">{when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`chip !px-1.5 !text-[0.65rem] ${h.kind === "charge" || h.kind === "due" ? "chip-claimed" : "chip-paid"}`}>{s.label}</span>
          {h.booking_id ? (
            <Link href={`/bookings/${h.booking_id}`} className="truncate font-semibold hover:underline">
              {h.title}
            </Link>
          ) : (
            <span className="truncate font-semibold">{h.title}</span>
          )}
        </div>
        <div className="truncate text-xs text-muted">
          {h.subtitle}
          {h.kind === "charge" && h.status && h.status !== "paid" && ` · ${h.status === "claimed" ? "being checked" : "unpaid"}`}
        </div>
      </div>
      <div className="text-right">
        <div className={`font-[family-name:var(--font-jet)] font-bold ${s.tone}`}>
          {s.sign}
          {rupees(h.amount)}
        </div>
        <div className="text-[0.7rem] text-muted">bal {rupees(h.balance_after)}</div>
      </div>
      {h.txn_id ? (
        <button
          className="px-1 text-muted hover:text-red"
          aria-label="Remove entry"
          onClick={() => confirm(`Remove "${h.title}" (${rupees(h.amount)})?`) && onDelete(h.txn_id!)}
        >
          ✕
        </button>
      ) : (
        <span className="w-5" />
      )}
    </li>
  );
}

function MoneyForm({
  kind,
  name,
  onSubmit,
}: {
  kind: "got" | "due";
  name: string;
  onSubmit: (amount: number, note: string, settle: boolean) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [settle, setSettle] = useState(true);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className={`slab rise space-y-3 p-4 ${kind === "got" ? "border-lime/40" : "border-led/40"}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSubmit(Number(amount), note, settle);
        setSaving(false);
      }}
    >
      <div className="eyebrow">{kind === "got" ? `Money received from ${name}` : `Extra amount ${name} owes`}</div>
      <div className="relative">
        <span className="led absolute top-1/2 left-4 -translate-y-1/2 text-2xl">₹</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          autoFocus
          className="field led !pl-10 !text-3xl"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <input
        className="field"
        placeholder={kind === "got" ? "Note (optional), e.g. cash at ground" : "What for, e.g. ball money"}
        maxLength={200}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {kind === "got" && (
        <label className="flex cursor-pointer items-center gap-2 text-sm text-chalk-dim">
          <input type="checkbox" className="h-4 w-4 accent-[var(--lime)]" checked={settle} onChange={(e) => setSettle(e.target.checked)} />
          Tick off the oldest unpaid games with this money
        </label>
      )}
      <button className={`btn w-full ${kind === "got" ? "btn-lime" : "btn-led"}`} disabled={!(Number(amount) > 0) || saving}>
        {saving ? "Saving…" : kind === "got" ? "Save payment" : "Add due"}
      </button>
    </form>
  );
}

function EditPlayer({ p, onSaved, onDeleted }: { p: KhataDetail; onSaved: (d: KhataDetail) => void; onDeleted: () => void }) {
  const [name, setName] = useState(p.name);
  const [phone, setPhone] = useState(p.phone ?? "");
  const [saving, setSaving] = useState(false);

  async function save(patch: Parameters<typeof api.updatePlayer>[1]) {
    setSaving(true);
    try {
      onSaved(await api.updatePlayer(p.id, patch));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save", "err");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="slab rise flex flex-wrap items-end gap-3 border-sky/40 p-4">
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">Name</span>
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="min-w-[180px] flex-1">
        <span className="eyebrow label">WhatsApp number</span>
        <input
          className="field font-[family-name:var(--font-jet)]"
          inputMode="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <button className="btn btn-lime" disabled={!name.trim() || saving} onClick={() => save({ name, phone: phone.trim() || null })}>
        Save
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => save({ archived: !p.archived })}>
        {p.archived ? "Unhide" : "Hide from list"}
      </button>
      {!p.has_history && (
        <button
          className="btn btn-sm btn-ghost !text-red"
          onClick={async () => {
            if (!confirm(`Delete ${p.name}?`)) return;
            try {
              await api.deletePlayer(p.id);
              toast("Player deleted");
              onDeleted();
            } catch (e) {
              toast(e instanceof Error ? e.message : "Couldn't delete", "err");
            }
          }}
        >
          Delete
        </button>
      )}
    </div>
  );
}
