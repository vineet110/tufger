"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/Toast";
import { api } from "@/lib/api";
import { isoDay, useToday } from "@/lib/client";
import { endTime, fmtDate, fmtDuration, fmtTime, parseDate, rupees, sportEmoji, sportLabel } from "@/lib/format";
import { mergeRosters, parseRoster, splitAmount } from "@/lib/roster";
import type { Contact, Ground, RosterRow, Settings, Sport } from "@/lib/types";

const DURATIONS = [60, 90, 120, 150, 180];
const START_PRESETS = ["06:00", "07:00", "08:00", "19:00", "21:00", "23:00"];
const DISCOUNT_MODES = [
  { v: "none", label: "None" },
  { v: "flat", label: "₹ off" },
  { v: "percent", label: "% off" },
] as const;
type DiscountMode = (typeof DISCOUNT_MODES)[number]["v"];

const ROUNDING = [
  { v: 1, label: "Exact" },
  { v: 5, label: "₹5" },
  { v: 10, label: "₹10" },
  { v: 50, label: "₹50" },
];

const rowKey = (r: RosterRow) => r.phone ?? r.name.toLowerCase();

export default function NewBookingPage() {
  const router = useRouter();
  const [grounds, setGrounds] = useState<Ground[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [groundId, setGroundId] = useState<number | null>(null);
  const [addingGround, setAddingGround] = useState(false);

  const today = useToday();
  const quickDays = useMemo(() => {
    if (!today) return [];
    const base = new Date(`${today}T00:00:00`);
    const shift = (n: number) => {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return isoDay(d);
    };
    return [
      { label: "Today", iso: today },
      { label: "Tomorrow", iso: shift(1) },
      { label: "This Sat", iso: shift((6 - base.getDay() + 7) % 7 || 7) },
      { label: "This Sun", iso: shift((7 - base.getDay()) % 7 || 7) },
    ];
  }, [today]);
  const [pickedDate, setPickedDate] = useState("");
  const date = pickedDate || quickDays[1]?.iso || "";
  const [start, setStart] = useState("07:00");
  const [duration, setDuration] = useState(120);

  const [paste, setPaste] = useState("");
  const [uploaded, setUploaded] = useState<RosterRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [dayOverride, setDayOverride] = useState<"weekday" | "weekend" | null>(null);
  const [manualRate, setRate] = useState(0);
  const [rateTouched, setRateTouched] = useState(false);
  const [discountMode, setDiscountMode] = useState<DiscountMode>("none");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountNote, setDiscountNote] = useState("");
  const [roundTo, setRoundTo] = useState(10);
  const [includeMe, setIncludeMe] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.grounds().then((g) => {
      setGrounds(g);
      if (g.length) setGroundId((id) => id ?? g[0].id);
      else setAddingGround(true);
    });
    api.settings().then(setSettings);
    api.contacts().then(setContacts, () => {});
  }, []);

  const ground = grounds?.find((g) => g.id === groundId) ?? null;
  const sport: Sport = ground?.sport ?? "cricket";

  // a new date re-detects weekday/weekend and goes back to the ground's rate
  const setDate = (iso: string) => {
    setPickedDate(iso);
    setDayOverride(null);
    setRateTouched(false);
  };

  // Sat/Sun use the weekend rate; the organiser can flip it (e.g. public holidays)
  const dateIsWeekend = date ? [0, 6].includes(parseDate(date).getDay()) : false;
  const isWeekend = dayOverride ? dayOverride === "weekend" : dateIsWeekend;
  const groundRate = ground ? (isWeekend ? (ground.weekend_price_per_hour ?? ground.price_per_hour) : ground.price_per_hour) : 0;
  const rate = rateTouched ? manualRate : groundRate;
  const baseAmount = Math.round((rate * duration) / 60);
  const discount =
    discountMode === "flat"
      ? Math.min(discountValue, baseAmount)
      : discountMode === "percent"
        ? Math.round((baseAmount * Math.min(discountValue, 100)) / 100)
        : 0;
  const amount = baseAmount - discount;
  const chooseDay = (d: "weekday" | "weekend") => {
    setDayOverride(d === (dateIsWeekend ? "weekend" : "weekday") ? null : d);
    setRateTouched(false);
  };

  const roster = useMemo(() => {
    return mergeRosters(parseRoster(paste), uploaded)
      .filter((r) => !removed.has(rowKey(r)))
      .map((r) => ({ ...r, key: rowKey(r), amount: custom[rowKey(r)] ?? null }));
  }, [paste, uploaded, removed, custom]);

  const headcount = roster.length + (includeMe ? 1 : 0);
  const shares = useMemo(
    () => splitAmount(amount, [...(includeMe ? [null] : []), ...roster.map((r) => r.amount)], roundTo),
    [amount, roster, includeMe, roundTo],
  );
  const flexShare = shares.find((_, i) => (includeMe && i === 0) || roster[i - (includeMe ? 1 : 0)]?.amount == null) ?? 0;
  const collectTotal = shares.reduce((a, b) => a + b, 0);
  const surplus = collectTotal - amount;
  const myShare = includeMe ? shares[0] : 0;

  function addContact(c: Contact) {
    const row = { name: c.name, phone: c.phone };
    setUploaded((u) => mergeRosters(u, [row]));
    setRemoved((s) => {
      const next = new Set(s);
      next.delete(rowKey(row));
      return next;
    });
  }

  async function onUpload(file: File) {
    setUploading(true);
    try {
      const { players } = await api.uploadRoster(file);
      setUploaded((u) => mergeRosters(u, players));
      toast(`${players.length} players read from ${file.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "err");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit() {
    if (!groundId || !date || !roster.length || amount <= 0) return;
    setSaving(true);
    try {
      const b = await api.createBooking({
        ground_id: groundId,
        play_date: date,
        start_time: start,
        duration_min: duration,
        rate_per_hour: rate,
        is_weekend: isWeekend,
        discount,
        discount_note: discount ? discountNote : "",
        round_to: roundTo,
        include_organizer: includeMe,
        notes,
        players: roster.map(({ name, phone, amount }) => ({ name, phone, amount })),
      });
      router.push(`/bookings/${b.id}?fresh=1`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't create booking", "err");
      setSaving(false);
    }
  }

  const missing = !groundId ? "Pick a ground" : !date ? "Pick a date" : !roster.length ? "Add players" : rate <= 0 ? "Enter the rate per hour" : amount <= 0 ? "Discount is more than the charges" : "";

  return (
    <div>
      <div className="rise mb-8">
        <div className="eyebrow !text-led">● New booking</div>
        <h1 className="display mt-2 text-6xl sm:text-7xl">Set the field</h1>
        <p className="mt-2 text-chalk-dim">Four quick steps. The split and the pay link are worked out for you.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* 01 GROUND */}
          <Step n="01" title="Ground" hint="Where are you playing?">
            {grounds === null ? (
              <div className="h-24 animate-pulse rounded-xl bg-white/5" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {grounds.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setGroundId(g.id);
                      setRateTouched(false);
                    }}
                    className={`rounded-xl border p-4 text-left transition-all ${
                      groundId === g.id
                        ? "border-lime bg-lime/[0.07] shadow-[0_0_0_3px_rgba(198,255,58,0.12)]"
                        : "border-line bg-black/30 hover:border-chalk/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="display text-2xl">{g.name}</div>
                      <span className="text-xl">{sportEmoji[g.sport]}</span>
                    </div>
                    <div className="text-xs text-muted">{g.area || sportLabel[g.sport]}</div>
                    <div className="mt-2 flex gap-5">
                      <div>
                        <div className="eyebrow !text-[0.68rem]">Weekday</div>
                        <div className="led text-lg">
                          {rupees(g.price_per_hour)}
                          <span className="text-xs opacity-60">/hr</span>
                        </div>
                      </div>
                      <div>
                        <div className="eyebrow !text-[0.68rem]">Weekend</div>
                        <div className="led text-lg">
                          {rupees(g.weekend_price_per_hour ?? g.price_per_hour)}
                          <span className="text-xs opacity-60">/hr</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
                {!addingGround && (
                  <button
                    type="button"
                    onClick={() => setAddingGround(true)}
                    className="grid min-h-[116px] place-items-center rounded-xl border border-dashed border-chalk/25 text-chalk-dim transition-colors hover:border-lime hover:text-lime"
                  >
                    <span className="display text-xl">+ Add a ground</span>
                  </button>
                )}
              </div>
            )}
            {addingGround && (
              <QuickGround
                onCancel={grounds?.length ? () => setAddingGround(false) : undefined}
                onCreated={(g) => {
                  setGrounds((list) => [...(list ?? []), g]);
                  setGroundId(g.id);
                  setRateTouched(false);
                  setAddingGround(false);
                }}
              />
            )}
          </Step>

          {/* 02 WHEN */}
          <Step n="02" title="Date, time & duration" hint="When does the match start?">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="eyebrow label">Date</label>
                <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickDays.map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => setDate(d.iso)}
                      className={`chip !text-[0.72rem] ${date === d.iso ? "chip-paid" : "chip-pending"}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="eyebrow label">Start time</label>
                <input type="time" className="field" value={start} step={900} onChange={(e) => setStart(e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {START_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStart(t)}
                      className={`chip !text-[0.72rem] ${start === t ? "chip-paid" : "chip-pending"}`}
                    >
                      {fmtTime(t)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <label className="eyebrow label">Duration</label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="seg">
                  {DURATIONS.map((d) => (
                    <button key={d} type="button" aria-pressed={duration === d} onClick={() => setDuration(d)}>
                      {fmtDuration(d)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="btn btn-sm" onClick={() => setDuration((d) => Math.max(30, d - 30))}>
                    −30
                  </button>
                  <span className="led w-20 text-center text-lg">{fmtDuration(duration)}</span>
                  <button type="button" className="btn btn-sm" onClick={() => setDuration((d) => Math.min(720, d + 30))}>
                    +30
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-chalk-dim">
                {fmtTime(start)} → <span className="text-chalk">{fmtTime(endTime(start, duration))}</span>
              </p>
            </div>
          </Step>

          {/* 03 SQUAD */}
          <Step n="03" title="Squad" hint="Paste the WhatsApp list or upload Excel">
            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <textarea
                className="field min-h-[160px] font-mono text-sm leading-relaxed"
                placeholder={"Paste straight from WhatsApp, any format works:\n\n1. Rahul 98765 43210\n2. Amit +91 99887 76655\n3. Sid 🏏\nKaran - 9000011111"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="flex flex-row gap-3 md:w-40 md:flex-col">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-chalk/25 p-4 text-center transition-colors hover:border-lime hover:text-lime"
                >
                  <span className="text-2xl">📄</span>
                  <span className="display text-lg leading-tight">{uploading ? "Reading…" : "Upload Excel"}</span>
                  <span className="text-[0.72rem] text-muted">.xlsx or .csv</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xlsm,.csv"
                  hidden
                  onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                />
                <div className="board flex flex-1 flex-col items-center justify-center p-3 pt-5">
                  <div className="eyebrow !text-[0.68rem]">Players</div>
                  <div className="led text-5xl leading-none dot">{String(headcount).padStart(2, "0")}</div>
                </div>
              </div>
            </div>

            <ContactPicker contacts={contacts} roster={roster} onPick={addContact} />

            {roster.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="eyebrow">
                    {roster.length} found{uploaded.length ? ` · ${uploaded.length} added` : ""}
                  </span>
                  <span className="text-xs text-muted">Tap an amount to set a custom share</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {roster.map((r, i) => (
                    <div key={r.key} className="flex items-center gap-2 rounded-lg border border-line bg-black/30 px-3 py-2">
                      <span className="w-5 text-right font-mono text-xs text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{r.name}</div>
                        <div className="font-mono text-[0.75rem] text-muted">{r.phone ? `+91 ${r.phone.slice(0, 5)} ${r.phone.slice(5)}` : "no number"}</div>
                      </div>
                      <ShareInput
                        value={shares[i + (includeMe ? 1 : 0)]}
                        isCustom={r.amount != null}
                        onSet={(v) =>
                          setCustom((c) => {
                            const next = { ...c };
                            if (v == null) delete next[r.key];
                            else next[r.key] = v;
                            return next;
                          })
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Remove ${r.name}`}
                        className="px-1 text-muted hover:text-red"
                        onClick={() => setRemoved((s) => new Set(s).add(r.key))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                {removed.size > 0 && (
                  <button type="button" className="mt-2 text-xs text-chalk-dim underline" onClick={() => setRemoved(new Set())}>
                    Restore {removed.size} removed
                  </button>
                )}
              </div>
            )}

            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-black/30 p-3">
              <input type="checkbox" className="h-5 w-5 accent-[var(--lime)]" checked={includeMe} onChange={(e) => setIncludeMe(e.target.checked)} />
              <div>
                <div className="text-sm font-semibold">I&apos;m playing too ({settings?.organizer_name || "Organiser"})</div>
                <div className="text-xs text-muted">Your share is counted in the split and marked as paid.</div>
              </div>
            </label>
          </Step>

          {/* 04 MONEY */}
          <Step n="04" title="Charges & split" hint="Weekday or weekend rate, any discount">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="eyebrow label flex items-center gap-2">
                  Charge as
                  {!dayOverride && date && <span className="chip chip-paid !text-[0.68rem]">auto · {fmtDate(date, { weekday: "long" })}</span>}
                </label>
                <div className="seg">
                  <button type="button" aria-pressed={!isWeekend} onClick={() => chooseDay("weekday")}>
                    Weekday
                  </button>
                  <button type="button" aria-pressed={isWeekend} onClick={() => chooseDay("weekend")}>
                    Weekend
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {dayOverride ? "Changed by you (for example, a public holiday)." : "Picked from the date. Tap to change it for holidays."}
                </p>
              </div>
              <div>
                <label className="eyebrow label flex items-center gap-2">
                  Rate per hour
                  {!rateTouched && ground && <span className="chip chip-paid !text-[0.68rem]">auto</span>}
                </label>
                <div className="relative">
                  <span className="led absolute top-1/2 left-4 -translate-y-1/2 text-xl">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="field led !pl-9 !text-2xl"
                    value={rate || ""}
                    onChange={(e) => {
                      setRateTouched(true);
                      setRate(Math.max(0, Number(e.target.value)));
                    }}
                  />
                </div>
                {ground && (
                  <p className="mt-2 text-xs text-muted">
                    Weekday {rupees(ground.price_per_hour)} · Weekend {rupees(ground.weekend_price_per_hour ?? ground.price_per_hour)}
                    {rateTouched && (
                      <button type="button" className="ml-2 text-lime underline" onClick={() => setRateTouched(false)}>
                        use {rupees(groundRate)}
                      </button>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5">
              <label className="eyebrow label">Discount</label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="seg">
                  {DISCOUNT_MODES.map((d) => (
                    <button key={d.v} type="button" aria-pressed={discountMode === d.v} onClick={() => setDiscountMode(d.v)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                {discountMode !== "none" && (
                  <>
                    <div className="relative w-32">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="field led !pr-9 !text-xl"
                        placeholder={discountMode === "flat" ? "300" : "10"}
                        value={discountValue || ""}
                        onChange={(e) => setDiscountValue(Math.max(0, Number(e.target.value)))}
                      />
                      <span className="led absolute top-1/2 right-3 -translate-y-1/2">{discountMode === "flat" ? "₹" : "%"}</span>
                    </div>
                    <input
                      className="field min-w-[180px] flex-1"
                      placeholder="Reason (optional), e.g. regulars offer"
                      maxLength={120}
                      value={discountNote}
                      onChange={(e) => setDiscountNote(e.target.value)}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-line bg-black/40 p-4 text-sm">
              <BillRow k={`${rupees(rate)}/hr × ${fmtDuration(duration)} · ${isWeekend ? "weekend" : "weekday"} rate`} v={rupees(baseAmount)} />
              {discount > 0 && (
                <BillRow
                  k={`Discount${discountMode === "percent" ? ` (${Math.min(discountValue, 100)}%)` : ""}${discountNote ? ` · ${discountNote}` : ""}`}
                  v={`− ${rupees(discount)}`}
                  tone="lime"
                />
              )}
              <div className="my-2 border-t border-dashed border-line" />
              <BillRow k="Ground amount to split" v={rupees(amount)} tone="strong" />
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <label className="eyebrow label">Round each share up to</label>
                <div className="seg">
                  {ROUNDING.map((r) => (
                    <button key={r.v} type="button" aria-pressed={roundTo === r.v} onClick={() => setRoundTo(r.v)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted">Rounding up means you never end up short on change.</p>
              </div>
              <div>
                <label className="eyebrow label">Note for players (optional)</label>
                <input className="field" placeholder="Bring a white ball 🏏" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </Step>
        </div>

        {/* live receipt */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="board p-6 pt-8">
            <div className="eyebrow text-center !text-led">Per head</div>
            <div className="led mt-1 text-center text-7xl leading-none dot">
              <span className="align-top text-3xl opacity-70">₹</span>
              {headcount ? flexShare : 0}
            </div>
            <div className="mt-1 text-center text-xs text-chalk-dim">
              {rupees(amount)} ÷ {headcount || "?"} players
            </div>

            <div className="chalk-rule my-5" />

            <dl className="space-y-2.5 text-sm">
              <Row k="Ground" v={ground ? `${sportEmoji[sport]} ${ground.name}` : "—"} />
              <Row k="Date" v={date ? fmtDate(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"} />
              <Row k="Time" v={`${fmtTime(start)} – ${fmtTime(endTime(start, duration))}`} />
              <Row k="Duration" v={fmtDuration(duration)} />
              <Row k="Rate" v={`${rupees(rate)}/hr · ${isWeekend ? "weekend" : "weekday"}`} />
              {discount > 0 && <Row k="Discount" v={`− ${rupees(discount)}`} />}
              <Row k="Ground amount" v={rupees(amount)} />
              <Row k="Players" v={String(headcount)} />
              <Row k="You'll collect" v={rupees(collectTotal - myShare)} strong />
              {surplus > 0 && <Row k="Rounding buffer" v={`+${rupees(surplus)}`} />}
              {surplus < 0 && <Row k="Short by" v={rupees(-surplus)} warn />}
            </dl>

            <button type="button" onClick={submit} disabled={!!missing || saving} className="btn btn-lime mt-6 w-full !py-4 text-lg">
              {saving ? "Creating…" : missing || "Create & get pay link →"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Step({ n, title, hint, children }: { n: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="slab rise relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -top-4 -right-1 font-[family-name:var(--font-doto)] text-[7rem] leading-none font-black text-white/[0.03]">
        {n}
      </div>
      <div className="mb-5 flex items-baseline gap-3">
        <span className="led text-xl">{n}</span>
        <h2 className="display text-3xl">{title}</h2>
        <span className="hidden text-sm text-muted sm:inline">{hint}</span>
      </div>
      {children}
    </section>
  );
}

function BillRow({ k, v, tone }: { k: string; v: string; tone?: "lime" | "strong" }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-chalk-dim">{k}</span>
      <span className={`led whitespace-nowrap ${tone === "lime" ? "led-lime" : ""} ${tone === "strong" ? "text-xl" : ""}`}>{v}</span>
    </div>
  );
}

function Row({ k, v, strong, warn }: { k: string; v: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-chalk-dim">{k}</dt>
      <dd className={`text-right ${strong ? "led led-lime text-lg" : ""} ${warn ? "text-red" : ""}`}>{v}</dd>
    </div>
  );
}

function ContactPicker({ contacts, roster, onPick }: { contacts: Contact[]; roster: RosterRow[]; onPick: (c: Contact) => void }) {
  const [q, setQ] = useState("");
  if (!contacts.length) return null;
  const needle = q.trim().toLowerCase();
  const inSquad = new Set(roster.flatMap((r) => [r.phone, r.name.toLowerCase()]));
  const matches = contacts
    .filter((c) => !c.archived && !inSquad.has(c.name.toLowerCase()) && !(c.phone && inSquad.has(c.phone)))
    .filter((c) => !needle || c.name.toLowerCase().includes(needle) || (c.phone ?? "").includes(needle))
    .slice(0, 12);
  return (
    <div className="mt-4">
      <input className="field" placeholder="Add from contacts: search a name or number…" value={q} onChange={(e) => setQ(e.target.value)} />
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map((c) => (
            <button key={c.id} type="button" className="chip chip-pending !text-[0.72rem] hover:text-lime" onClick={() => onPick(c)}>
              + {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareInput({ value, isCustom, onSet }: { value: number; isCustom: boolean; onSet: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        className="field !w-20 !px-2 !py-1 text-right font-mono text-sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          onSet(draft === "" ? null : Math.max(0, Number(draft)));
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(isCustom ? String(value) : "");
        setEditing(true);
      }}
      className={`rounded-md px-2 py-1 font-mono text-sm ${isCustom ? "bg-sky/15 text-sky" : "text-led hover:bg-white/5"}`}
      title={isCustom ? "Custom share (clear to auto-split)" : "Set a custom share"}
    >
      ₹{value}
    </button>
  );
}

function QuickGround({ onCreated, onCancel }: { onCreated: (g: Ground) => void; onCancel?: () => void }) {
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [sport, setSport] = useState<Sport>("cricket");
  const [price, setPrice] = useState("");
  const [weekendPrice, setWeekendPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const g = await api.createGround({
        name,
        area,
        sport,
        price_per_hour: Number(price) || 0,
        weekend_price_per_hour: weekendPrice ? Number(weekendPrice) : null,
      });
      toast(`${g.name} added`);
      onCreated({ ...g, bookings: 0 });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save ground", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-lime/40 bg-lime/[0.04] p-4">
      <div className="eyebrow mb-3 !text-lime">New ground</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input className="field" placeholder="Ground name (e.g. Smash Arena)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="Area (e.g. Andheri West)" value={area} onChange={(e) => setArea(e.target.value)} />
        <div className="seg">
          {(["cricket", "football", "other"] as Sport[]).map((s) => (
            <button key={s} type="button" aria-pressed={sport === s} onClick={() => setSport(s)}>
              {sportEmoji[s]} {s}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2">
          <input className="field" type="number" inputMode="numeric" placeholder="Weekday ₹/hr" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input
            className="field"
            type="number"
            inputMode="numeric"
            placeholder="Weekend ₹/hr (blank = same)"
            value={weekendPrice}
            onChange={(e) => setWeekendPrice(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className="btn btn-lime btn-sm" disabled={!name || busy} onClick={save}>
          Save ground
        </button>
        {onCancel && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
