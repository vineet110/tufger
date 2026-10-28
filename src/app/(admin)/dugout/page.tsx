"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { copyText, toast } from "@/components/Toast";
import { useMe } from "@/components/AdminShell";
import { LockButton, VaultGate } from "@/components/VaultGate";
import { ApiError, api } from "@/lib/api";
import { fmtDate, fmtDuration, fmtTime, rupees, sportEmoji } from "@/lib/format";
import { fillNote, payLink, upiLink, whatsappLink } from "@/lib/messages";
import { copyQrCard, qrCard } from "@/lib/qr";
import { parseTeamSheet } from "@/lib/teamsheet";
import type { Ground, Sport } from "@/lib/types";

// This page only renders in the browser (AdminShell shows a loader until login is checked),
// so storage can be read in state initialisers.
const DRAFT_STORE = "tufger.sheetDrafts";
const DEFAULT_MESSAGE = "{sport} *{ground}* · {date} · {time}\n₹{amount} each. Pay here 👉 {link}";
const SPORTS: Sport[] = ["football", "cricket", "other"];

interface DraftPlayer {
  id: string;
  name: string;
  phone: string | null;
  amount: number | null; // null = use the game's per-player price
  paid: boolean;
  isOrganizer: boolean;
}

interface Draft {
  id: string;
  ground: string;
  sport: Sport;
  date: string;
  start: string;
  end: string;
  perHead: number | null;
  info: string[];
  players: DraftPlayer[];
  message: string;
  state: "draft" | "saving" | "done";
  bookingId?: number;
  slug?: string;
  total?: number;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function durationOf(d: Draft): number {
  const diff = minutes(d.end) - minutes(d.start);
  return diff > 0 ? diff : diff + 24 * 60;
}

const shareOf = (d: Draft, p: DraftPlayer) => p.amount ?? d.perHead ?? 0;

/** Fill the parts of a message that are known before the booking exists. */
function fillGameInfo(message: string, d: Draft): string {
  return message
    .replaceAll("{sport}", sportEmoji[d.sport])
    .replaceAll("{ground}", d.ground || "Game")
    .replaceAll("{date}", d.date ? fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" }) : "")
    .replaceAll("{time}", `${fmtTime(d.start)}–${fmtTime(d.end)}`);
}

export default function DugoutPage() {
  return (
    <VaultGate title="Dugout" blurb="Paste your WhatsApp game posts and turn them into pay links. Enter your Dugout & Scorebook password to open it.">
      <Dugout />
    </VaultGate>
  );
}

function Dugout() {
  const { me } = useMe();
  const draftKey = `${DRAFT_STORE}.${me.id}`; // drafts belong to whoever is signed in on this browser
  const [drafts, setDrafts] = useState<Draft[]>(() => read<Draft[]>(draftKey, []));
  const [paste, setPaste] = useState("");
  const [grounds, setGrounds] = useState<Ground[]>([]);
  const [organizer, setOrganizer] = useState("");
  const [upi, setUpi] = useState("");
  const [creatingAll, setCreatingAll] = useState(false);
  const [phoneBook, setPhoneBook] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    api.grounds().then(setGrounds, () => {});
    api.settings().then((s) => (setOrganizer(s.organizer_name), setUpi(s.upi_id)), () => {});
    // name → WhatsApp number from the Scorebook, so known players come pre-filled
    api.khata().then((rows) => {
      const seen = new Map<string, string | null>();
      rows.forEach((r) => {
        const k = r.name.toLowerCase();
        seen.set(k, seen.has(k) ? null : r.phone); // two players with one name: don't guess
      });
      setPhoneBook(new Map([...seen].filter((e): e is [string, string] => !!e[1])));
    }, () => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(drafts));
    } catch {}
  }, [drafts, draftKey]);

  const detected = useMemo(() => (paste.trim() ? parseTeamSheet(paste) : []), [paste]);

  function addFromPaste() {
    const games = parseTeamSheet(paste);
    if (!games.length) {
      toast("No game found. Does the post have a time and a player list?", "err");
      return;
    }
    const org = organizer.trim().toLowerCase();
    const added: Draft[] = games.map((g) => {
      const match = grounds.find((x) => x.name.toLowerCase() === g.ground.toLowerCase());
      return {
        id: uid(),
        ground: match?.name ?? g.ground,
        sport: g.sport ?? match?.sport ?? "football",
        date: g.date,
        start: g.start,
        end: g.end,
        perHead: g.perHead,
        info: g.info,
        players: g.players.map((p) => {
          const isOrganizer = !!org && p.name.toLowerCase() === org;
          const phone = p.phone ?? phoneBook.get(p.name.toLowerCase()) ?? null;
          return { id: uid(), name: p.name, phone, amount: p.amount, paid: p.paid || isOrganizer, isOrganizer };
        }),
        message: DEFAULT_MESSAGE,
        state: "draft",
      };
    });
    setDrafts((d) => [...d, ...added]); // keep the order the games were posted in
    setPaste("");
    toast(`${added.length} game${added.length > 1 ? "s" : ""} added to the sheet`);
  }

  const update = (id: string, patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) =>
    setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d)));

  async function create(d: Draft): Promise<boolean> {
    update(d.id, { state: "saving" });
    try {
      const res = await api.createDugoutGame({
        ground_name: d.ground.trim(),
        sport: d.sport,
        play_date: d.date,
        start_time: d.start,
        duration_min: durationOf(d),
        message: fillGameInfo(d.message, d),
        players: d.players.map((p) => ({
          name: p.name.trim(),
          phone: p.phone,
          amount: shareOf(d, p),
          paid: p.paid,
          is_organizer: p.isOrganizer,
        })),
      });
      update(d.id, { state: "done", bookingId: res.id, slug: res.slug, total: res.total_amount });
      return true;
    } catch (e) {
      update(d.id, { state: "draft" });
      // a 403 (key changed) re-locks the page via VaultGate
      if (!(e instanceof ApiError && e.status === 403)) toast(e instanceof Error ? e.message : "Couldn't create the game", "err");
      return false;
    }
  }

  async function createAll() {
    setCreatingAll(true);
    let made = 0;
    for (const d of drafts.filter((x) => x.state === "draft" && !problem(x))) {
      if (await create(d)) made++;
    }
    setCreatingAll(false);
    if (made) toast(`${made} game${made > 1 ? "s" : ""} created`);
  }

  const ready = drafts.filter((d) => d.state === "draft" && !problem(d)).length;
  const done = drafts.filter((d) => d.state === "done").length;

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="eyebrow !text-led">● Dugout</div>
          <h1 className="display mt-2 text-6xl sm:text-7xl">Paste. Check. Collect.</h1>
          <p className="mt-2 max-w-xl text-chalk-dim">
            Paste your game posts from WhatsApp, one at a time or all together. Each game becomes a card you can tweak before it goes live.
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <LockButton />
        </div>
      </div>

      <section className="slab p-5">
        <textarea
          className="field min-h-[180px] font-[family-name:var(--font-jet)] text-sm leading-relaxed"
          placeholder={"[15:33, 28/10/2026] Vineet: 7 - 8 30 pm\nMatch at prokick\n\nVineet\nRanjan\nSyed +1\n\nSlot booked\n[15:33, 28/10/2026] Vineet: 140 each"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-lime" disabled={!detected.length} onClick={addFromPaste}>
            + Add {detected.length || ""} game{detected.length === 1 ? "" : "s"} to sheet
          </button>
          {paste.trim() && (
            <span className="text-sm text-chalk-dim">
              {detected.length
                ? detected.map((g) => `${g.ground || "?"} (${g.players.length})`).join(" · ")
                : "No game found yet. Include the time line and the player list."}
            </span>
          )}
        </div>
      </section>

      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-led" disabled={!ready || creatingAll} onClick={createAll}>
            {creatingAll ? "Creating…" : `⚡ Create all ready (${ready})`}
          </button>
          {done > 0 && (
            <button className="btn btn-sm" onClick={() => setDrafts((list) => list.filter((d) => d.state !== "done"))}>
              Clear {done} created
            </button>
          )}
          {done > 0 && (
            <Link href="/scorebook" className="btn btn-wa btn-sm">
              📤 Send bills from Scorebook
            </Link>
          )}
          <span className="text-sm text-muted">Drafts are saved in this browser until you create or remove them.</span>
        </div>
      )}

      <div className="space-y-5">
        {drafts.map((d, i) => (
          <GameCard
            key={d.id}
            d={d}
            index={i + 1}
            grounds={grounds}
            upi={upi}
            organizer={organizer}
            onChange={(patch) => update(d.id, patch)}
            onRemove={() => setDrafts((list) => list.filter((x) => x.id !== d.id))}
            onCreate={() => create(d).then((ok) => ok && toast("Game created"))}
          />
        ))}
      </div>

      {drafts.length === 0 && (
        <div className="slab p-10 text-center text-chalk-dim">
          <div className="text-5xl">📋</div>
          <p className="mt-3">Your sheet is empty. Paste a game post above to start.</p>
        </div>
      )}
    </div>
  );
}

/** Why a draft can't be created yet, or "" if it's ready. */
function problem(d: Draft): string {
  if (!d.ground.trim()) return "Add the ground";
  if (!d.date) return "Pick the date";
  if (!d.players.length) return "Add players";
  if (d.players.some((p) => !p.name.trim())) return "A player has no name";
  const badPhone = d.players.find((p) => p.phone && !/^(?:91|0)?[6-9]\d{9}$/.test(p.phone.replace(/\D/g, "")));
  if (badPhone) return `Check ${badPhone.name}'s number`;
  if (d.players.some((p) => shareOf(d, p) <= 0 && !p.isOrganizer)) return "Set the price per player";
  return "";
}

function GameCard({
  d,
  index,
  grounds,
  upi,
  organizer,
  onChange,
  onRemove,
  onCreate,
}: {
  d: Draft;
  index: number;
  grounds: Ground[];
  upi: string;
  organizer: string;
  onChange: (patch: Partial<Draft> | ((d: Draft) => Partial<Draft>)) => void;
  onRemove: () => void;
  onCreate: () => void;
}) {
  const [newPlayer, setNewPlayer] = useState("");
  const total = d.players.reduce((s, p) => s + shareOf(d, p), 0);
  const paidCount = d.players.filter((p) => p.paid).length;
  const issue = problem(d);
  const locked = d.state !== "draft";
  const setPlayer = (pid: string, patch: Partial<DraftPlayer>) =>
    onChange((g) => ({ players: g.players.map((p) => (p.id === pid ? { ...p, ...patch } : p)) }));

  const shareText = d.slug ? fillNote(fillGameInfo(d.message, d), payLink(d.slug), d.perHead ?? 0, upi) : "";

  return (
    <section className={`slab rise overflow-hidden ${d.state === "done" ? "border-lime/50" : ""}`}>
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-black/30 px-5 py-3">
        <span className="led text-lg">GAME {String(index).padStart(2, "0")}</span>
        <span className="display truncate text-2xl">
          {sportEmoji[d.sport]} {d.ground || "Ground?"}
        </span>
        <span className="text-sm text-chalk-dim">
          {d.date && fmtDate(d.date)} · {fmtTime(d.start)}–{fmtTime(d.end)} · {fmtDuration(durationOf(d))}
        </span>
        <span className="ml-auto">
          {d.state === "done" ? (
            <span className="chip chip-paid">live ✓</span>
          ) : issue ? (
            <span className="chip chip-pending">{issue}</span>
          ) : (
            <span className="chip chip-claimed">ready</span>
          )}
        </span>
        {!locked && (
          <button className="px-1 text-muted hover:text-red" aria-label="Remove game" onClick={onRemove}>
            ✕
          </button>
        )}
      </div>

      {d.state === "done" ? (
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
          <div className="flex-1">
            <div className="text-sm text-chalk-dim">
              {d.players.length} players · {rupees(d.total ?? total)} · {paidCount} already paid
            </div>
            <pre className="mt-2 rounded-lg bg-black/40 p-3 text-sm whitespace-pre-wrap text-chalk">{shareText}</pre>
          </div>
          <div className="flex flex-wrap gap-2 lg:flex-col">
            <a className="btn btn-wa" href={whatsappLink(null, shareText)} target="_blank" rel="noreferrer">
              Share in group
            </a>
            <button className="btn btn-sm" onClick={() => copyText(shareText, "Message copied")}>
              Copy message
            </button>
            {upi && d.perHead != null && (
              <button
                className="btn btn-sm"
                onClick={async () => {
                  const blob = await qrCard({
                    upi: upiLink({ upi, payee: organizer, amount: d.perHead!, note: `${d.ground} ${d.date}` }),
                    title: `${d.ground} · ${fmtDate(d.date)} · pay ${organizer}`,
                    amountLine: `${rupees(d.perHead!)} each`,
                    upiId: upi,
                  });
                  const how = await copyQrCard(blob, `tufger-qr-${d.ground.toLowerCase().replace(/\W+/g, "-")}.png`);
                  toast(how === "copied" ? "QR copied. Paste it in the group" : "QR saved. Attach it in the group");
                }}
              >
                ▦ Copy QR
              </button>
            )}
            <Link className="btn btn-sm" href={`/bookings/${d.bookingId}`}>
              Open booking →
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <label className="block">
                <span className="eyebrow label">Ground</span>
                <input
                  className="field"
                  list={`grounds-${d.id}`}
                  value={d.ground}
                  placeholder="Ramp"
                  onChange={(e) => onChange({ ground: e.target.value })}
                />
                <datalist id={`grounds-${d.id}`}>
                  {grounds.map((g) => (
                    <option key={g.id} value={g.name} />
                  ))}
                </datalist>
              </label>
              <label className="block">
                <span className="eyebrow label">Date</span>
                <input type="date" className="field" value={d.date} onChange={(e) => onChange({ date: e.target.value })} />
              </label>
              <div>
                <span className="eyebrow label">Sport</span>
                <div className="seg">
                  {SPORTS.map((s) => (
                    <button key={s} type="button" aria-pressed={d.sport === s} onClick={() => onChange({ sport: s })} title={s}>
                      {sportEmoji[s]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="eyebrow label">Start</span>
                <input type="time" step={900} className="field" value={d.start} onChange={(e) => onChange({ start: e.target.value })} />
              </label>
              <label className="block">
                <span className="eyebrow label">End</span>
                <input type="time" step={900} className="field" value={d.end} onChange={(e) => onChange({ end: e.target.value })} />
              </label>
              <label className="block">
                <span className="eyebrow label">Price per player</span>
                <div className="relative">
                  <span className="led absolute top-1/2 left-3 -translate-y-1/2">₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="field led !pl-8 !text-xl"
                    placeholder="140"
                    value={d.perHead ?? ""}
                    onChange={(e) => onChange({ perHead: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                  />
                </div>
              </label>
            </div>
            {d.info.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.info.map((x, k) => (
                  <span key={k} className="chip chip-pending">
                    {x}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="eyebrow">
                  {d.players.length} players · {paidCount} paid
                </span>
                <span className="text-xs text-muted">Change any amount; it doesn&apos;t have to add up to a ground price</span>
              </div>
              <div className="grid gap-1.5 md:grid-cols-2">
                {d.players.map((p, k) => (
                  <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${p.paid ? "border-lime/30 bg-lime/[0.04]" : "border-line bg-black/30"}`}>
                    <span className="w-5 text-right font-[family-name:var(--font-jet)] text-xs text-muted">{k + 1}</span>
                    <div className="min-w-0 flex-1">
                      <input
                        className="w-full bg-transparent text-sm font-semibold outline-none"
                        value={p.name}
                        onChange={(e) => setPlayer(p.id, { name: e.target.value })}
                      />
                      <input
                        className={`w-full bg-transparent font-[family-name:var(--font-jet)] text-[0.72rem] outline-none placeholder:text-led/70 ${p.phone ? "text-muted" : ""}`}
                        inputMode="tel"
                        placeholder="+ WhatsApp no."
                        value={p.phone ?? ""}
                        onChange={(e) => setPlayer(p.id, { phone: e.target.value.trim() ? e.target.value : null })}
                      />
                    </div>
                    {p.isOrganizer && <span className="chip chip-paid !px-1.5 !text-[0.65rem]">you</span>}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className={`w-16 rounded-md bg-black/40 px-1.5 py-1 text-right font-[family-name:var(--font-jet)] text-sm outline-none focus:ring-1 focus:ring-lime ${
                        p.amount != null ? "text-sky" : "text-led"
                      }`}
                      placeholder={d.perHead != null ? String(d.perHead) : "₹"}
                      value={p.amount ?? ""}
                      title="Leave empty to use the price per player"
                      onChange={(e) => setPlayer(p.id, { amount: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })}
                    />
                    <label className="flex cursor-pointer items-center gap-1 text-xs text-chalk-dim" title="Already paid">
                      <input type="checkbox" className="h-4 w-4 accent-[var(--lime)]" checked={p.paid} onChange={(e) => setPlayer(p.id, { paid: e.target.checked })} />
                      paid
                    </label>
                    <button
                      className="px-1 text-muted hover:text-red"
                      aria-label={`Remove ${p.name}`}
                      onClick={() => onChange((g) => ({ players: g.players.filter((x) => x.id !== p.id) }))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = newPlayer.trim();
                  if (!name) return;
                  onChange((g) => ({
                    players: [...g.players, { id: uid(), name, phone: null, amount: null, paid: false, isOrganizer: false }],
                  }));
                  setNewPlayer("");
                }}
              >
                <input className="field !py-2 text-sm" placeholder="Add a player" value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} />
                <button className="btn btn-sm" disabled={!newPlayer.trim()}>
                  + Add
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-4">
            <div className="board px-5 pt-6 pb-4">
              <div className="grid grid-cols-3 text-center">
                <div>
                  <div className="eyebrow !text-[0.68rem]">Players</div>
                  <div className="led dot text-3xl">{d.players.length}</div>
                </div>
                <div>
                  <div className="eyebrow !text-[0.68rem]">Total</div>
                  <div className="led dot text-3xl">{total}</div>
                </div>
                <div>
                  <div className="eyebrow !text-[0.68rem]">To collect</div>
                  <div className="led dot led-lime text-3xl">{d.players.filter((p) => !p.paid).reduce((s, p) => s + shareOf(d, p), 0)}</div>
                </div>
              </div>
            </div>
            <label className="block">
              <span className="eyebrow label">Message for the group</span>
              <textarea className="field min-h-[120px] text-sm leading-relaxed" value={d.message} onChange={(e) => onChange({ message: e.target.value })} />
              <span className="mt-1 block text-xs text-muted">
                Tags: {"{ground} {date} {time} {sport} {amount} {link}"}. The link is added once the game is created.
              </span>
            </label>
            <button className="btn btn-lime w-full !py-3.5" disabled={!!issue || d.state === "saving"} onClick={onCreate}>
              {d.state === "saving" ? "Creating…" : issue || "Create game & pay link →"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
