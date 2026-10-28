/**
 * Team Sheet parser: turns WhatsApp game posts like
 *
 *   [15:33, 28/10/2026] Vineet: 7 - 8 30 pm
 *   Match at prokick
 *
 *   1. Vineet
 *   Ranjan +1
 *   +1 (100 paid)
 *
 *   Slot booked
 *
 * into game drafts. Kept free of app imports so it can be tested with plain Node.
 */

export type SheetSport = "cricket" | "football" | "other";

export interface ParsedPlayer {
  name: string;
  phone: string | null;
  guest: boolean;
  paid: boolean;
  amount: number | null; // only set when the post says e.g. "(100 paid)"
}

export interface ParsedGame {
  ground: string;
  sport: SheetSport | null; // null = couldn't tell
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  timeFound: boolean;
  perHead: number | null;
  info: string[]; // "Slot booked", "7v7", ...
  players: ParsedPlayer[];
}

// [15:32, 28/10/2026] Vineet: text      (WhatsApp Web / iOS copy)
const HEADER_BRACKET = /^\[(\d{1,2}):(\d{2})(?:\s*[ap]\.?m\.?)?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]\s*[^:]{1,60}:\s?(.*)$/i;
// 28/10/2026, 15:32 - Vineet: text      (Android export)
const HEADER_DASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?:\s*[ap]\.?m\.?)?\s+-\s+[^:]{1,60}:\s?(.*)$/i;

const TIME_PART = String.raw`(\d{1,2})(?:\s*[:.]\s*|\s+)?(\d{2})?`;
const TIME_LINE = new RegExp(
  String.raw`^${TIME_PART}\s*(am|pm)?\s*(?:-\s*${TIME_PART}\s*(am|pm)?)?$`,
  "i",
);
const PRICE_LINE =
  /^(?:rs\.?|₹|inr)?\s*(\d{2,5})\s*(?:rs\.?|₹|\/-|inr)?\s*(?:each|per\s*head|per\s*person|per\s*player|pp|\/\s*head|\/\s*person|a\s*head)\b.*$/i;
const INFO_LINE =
  /\b(slot|booked|booking|confirm(?:ed)?|series|opponents?|available|cancel+ed|postponed|game\s+on|match\s+on|pending|full|waitlist|waiting|reserved)\b/i;
const FORMAT_LINE = /^\d{1,2}\s*v(?:s)?\s*\d{1,2}$/i;
const SPORT_LINE = /^(?:box\s*|turf\s*)?(?:cricket|football|futsal|soccer)\b[\w\s]*$/i;
const PHONE = /(?:\+?\s?91[\s-]?|0)?[6-9](?:[\s-]?\d){9}/;
const GROUND_HINT = /^(?:match|game|play(?:ing)?)?\s*(?:at|@|venue\s*[:-]?|ground\s*[:-]?|turf\s*[:-]?)\s+(.+)$/i;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WEEKDAY_WORD = /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** "7 - 8 30 pm" → minutes since midnight for start/end. */
export function parseTimeRange(line: string): { start: number; end: number; single: boolean } | null {
  const clean = line
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(today|tonight|tomorrow|tmrw|tmr|at|on|from)\b/g, " ")
    .replace(new RegExp(WEEKDAY_WORD.source, "gi"), " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ") // dates like 28/10 ("6-7" is a time range)
    .replace(/\s*(?:\b(?:to|till|until)\b|[–—])\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
  const m = clean.match(TIME_LINE);
  if (!m) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = m;
  const toMin = (h: string, mm: string | undefined, ap: string | undefined) => {
    let hour = Number(h) % 12;
    if (ap === "pm") hour += 12;
    return hour * 60 + Number(mm ?? 0);
  };
  if (Number(h1) > 23 || (h2 && Number(h2) > 23) || Number(m1 ?? 0) > 59 || Number(m2 ?? 0) > 59) return null;

  if (!h2) {
    // a lone number like "7" is too ambiguous to be a time unless it says am/pm
    if (!ap1 && !m1) return null;
    const start = toMin(h1, m1, ap1 ?? "pm");
    return { start, end: start + 60, single: true };
  }
  const endAp = ap2 ?? ap1 ?? "pm";
  const end = toMin(h2, m2, endAp);
  let start = toMin(h1, m1, ap1 ?? endAp);
  // "11 - 1 pm": the start must be the morning
  if (!ap1 && start >= end) start = toMin(h1, m1, endAp === "pm" ? "am" : "pm");
  return { start, end, single: false };
}

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (/^[a-z]/i.test(w) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function cleanName(raw: string): string {
  const s = raw
    .replace(/[^\p{L}\p{N}\s.'()&-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-.'\s]+|[-'\s]+$/g, ""); // keep a trailing dot: "Rahul sr."
  return titleCase(s).slice(0, 120);
}

function resolveDate(base: Date, header: string): Date {
  const h = header.toLowerCase();
  if (/\b(tomorrow|tmrw|tmr)\b/.test(h)) return addDays(base, 1);
  if (/\b(today|tonight)\b/.test(h)) return base;
  const dm = h.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dm) {
    const year = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : base.getFullYear();
    const d = new Date(year, Number(dm[2]) - 1, Number(dm[1]));
    if (!isNaN(d.getTime())) return d;
  }
  const mon = h.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (mon) return new Date(base.getFullYear(), MONTHS.indexOf(mon[2]), Number(mon[1]));
  const wd = h.match(WEEKDAY_WORD);
  if (wd) {
    const target = WEEKDAYS.findIndex((w) => w.startsWith(wd[1].slice(0, 3)));
    return addDays(base, (target - base.getDay() + 7) % 7);
  }
  return base;
}

type Message = { date: Date | null; lines: string[] };

function splitMessages(text: string): Message[] {
  const messages: Message[] = [];
  let current: Message = { date: null, lines: [] };
  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.replace(/[‎‏‪-‮]/g, "");
    const b = line.match(HEADER_BRACKET);
    const d = b ? null : line.match(HEADER_DASH);
    if (b || d) {
      if (current.lines.some((l) => l.trim())) messages.push(current);
      const [dd, mm, yy, rest] = b ? [b[3], b[4], b[5], b[6]] : [d![1], d![2], d![3], d![6]];
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
      current = { date: new Date(year, Number(mm) - 1, Number(dd)), lines: [rest] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((l) => l.trim())) messages.push(current);
  return messages;
}

/** Split one message into chunks, each starting at a time line that opens a paragraph. */
function splitGames(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let cur: string[] = [];
  lines.forEach((line, i) => {
    const opensParagraph = i === 0 || !lines[i - 1].trim();
    if (opensParagraph && parseTimeRange(line.trim()) && cur.some((l) => l.trim())) {
      chunks.push(cur);
      cur = [];
    }
    cur.push(line);
  });
  if (cur.some((l) => l.trim())) chunks.push(cur);
  return chunks;
}

function guessSport(text: string): SheetSport | null {
  if (/\b(\d{1,2}\s*v(?:s)?\s*\d{1,2}|football|futsal|soccer|kick|offside|goal(?:ie|keeper)?)\b/i.test(text)) return "football";
  if (/\b(cricket|overs?|bat(?:ting)?|bowl(?:ing)?|tennis\s*ball|leather)\b/i.test(text)) return "cricket";
  return null;
}

function parseChunk(chunk: string[], base: Date): ParsedGame | { perHead: number } | null {
  // paragraphs keep the "header / players / status" structure of the post
  const paragraphs: string[][] = [[]];
  for (const l of chunk) {
    const t = l.trim();
    if (!t) {
      if (paragraphs[paragraphs.length - 1].length) paragraphs.push([]);
    } else paragraphs[paragraphs.length - 1].push(t);
  }
  if (!paragraphs[paragraphs.length - 1].length) paragraphs.pop();
  if (!paragraphs.length) return null;

  let time: ReturnType<typeof parseTimeRange> = null;
  let headerIdx = -1;
  let ground = "";
  let hinted = "";
  let perHead: number | null = null;
  const info: string[] = [];
  const headerText: string[] = [];
  const players: ParsedPlayer[] = [];
  let lastHost = "";
  const has = (name: string) => players.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const addGuests = (host: string, n: number, paid: boolean, amount: number | null) => {
    for (let k = 1; k <= Math.min(n, 10); k++) {
      let label = `${host || "Guest"} +${k}`;
      let bump = k;
      while (has(label)) label = `${host || "Guest"} +${++bump}`;
      players.push({ name: label, phone: null, guest: true, paid, amount });
    }
  };

  paragraphs.forEach((para, pi) => {
    para.forEach((line) => {
      if (!time) {
        const t = parseTimeRange(line);
        if (t) {
          time = t;
          headerIdx = pi;
          headerText.push(line);
          return;
        }
      }
      const price = line.match(PRICE_LINE);
      if (price) {
        perHead = Number(price[1]);
        return;
      }
      const hint = line.match(GROUND_HINT);
      if (hint && !/\d{1,2}\s*(am|pm)/i.test(line)) {
        hinted = cleanName(hint[1]);
        headerText.push(line);
        return;
      }
      if (INFO_LINE.test(line) || FORMAT_LINE.test(line.replace(/\s+/g, " ")) || SPORT_LINE.test(line)) {
        info.push(line.replace(/\s+/g, " ").trim());
        headerText.push(line);
        return;
      }
      if (/^(today|tonight|tomorrow|tmrw)\b/i.test(line) || (WEEKDAY_WORD.test(line) && line.split(/\s+/).length <= 3 && pi === headerIdx)) {
        headerText.push(line);
        return;
      }
      // first plain line in the time paragraph is the ground ("Ramp", "Offside")
      if (pi === headerIdx && !ground && !players.length) {
        ground = cleanName(line);
        headerText.push(line);
        return;
      }
      parsePlayerLine(line);
    });
  });

  function parsePlayerLine(line: string) {
    let raw = line
      .replace(/^\s*\d{1,3}\s*[.)\]:-]\s*/, "")
      .replace(/^[•*▪➤>✅☑️🔹🔸-]+\s*/u, "")
      .trim();
    let paid = false;
    let amount: number | null = null;
    const paidMatch = raw.match(/\(?\s*(?:rs\.?|₹)?\s*(\d{2,5})?\s*(?:rs\.?|₹|\/-)?\s*paid\s*\)?/i);
    if (paidMatch) {
      paid = true;
      amount = paidMatch[1] ? Number(paidMatch[1]) : null;
      raw = raw.replace(paidMatch[0], " ").trim();
    }
    let phone: string | null = null;
    const ph = raw.match(PHONE);
    if (ph) {
      phone = ph[0].replace(/\D/g, "").slice(-10);
      raw = raw.replace(ph[0], " ").replace(/\s*[-:,]\s*$/, "").trim();
    }
    if (!raw) return;

    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^\+\s*(\d{1,2})$/))) {
      addGuests(lastHost, Number(m[1]), paid, amount);
    } else if ((m = raw.match(/^\+\s*(\d{1,2})\s*[(:-]?\s*(.+?)\s*\)?$/))) {
      addGuests(cleanName(m[2]), Number(m[1]), paid, amount);
    } else if ((m = raw.match(/^(.*?\p{L}.*?)\s*\+\s*(\d{1,2})$/u))) {
      const host = cleanName(m[1]);
      if (host && !has(host)) players.push({ name: host, phone, guest: false, paid: false, amount: null });
      lastHost = host;
      addGuests(host, Number(m[2]), paid, amount);
    } else {
      const name = cleanName(raw.replace(/^\+\s*/, ""));
      if (!name || !/\p{L}/u.test(name) || has(name)) return;
      players.push({ name, phone, guest: false, paid, amount });
      lastHost = name;
    }
  }

  if (!time && !players.length) return perHead != null ? { perHead } : null;
  if (!time && players.length < 2 && !ground && !hinted) return perHead != null ? { perHead } : null;

  const t = time as ReturnType<typeof parseTimeRange>;
  const start = t ? t.start : 19 * 60;
  const end = t ? (t.end <= t.start ? t.end + 24 * 60 : t.end) : start + 60;
  const all = [...headerText, ...info].join(" ");
  return {
    ground: hinted || ground,
    sport: guessSport(all),
    date: iso(resolveDate(base, headerText.join(" "))),
    start: hhmm(start),
    end: hhmm(end),
    timeFound: !!t,
    perHead,
    info,
    players,
  };
}

/** Parse one or more pasted WhatsApp posts into game drafts. */
export function parseTeamSheet(text: string, today: Date = new Date()): ParsedGame[] {
  const games: ParsedGame[] = [];
  for (const msg of splitMessages(text)) {
    const base = msg.date ?? new Date(today.getFullYear(), today.getMonth(), today.getDate());
    for (const chunk of splitGames(msg.lines)) {
      const result = parseChunk(chunk, base);
      if (!result) continue;
      if ("players" in result) {
        games.push(result);
      } else if (games.length && games[games.length - 1].perHead == null) {
        // a lone "140 each" message belongs to the game posted just before it
        games[games.length - 1].perHead = result.perHead;
      }
    }
  }
  return games;
}
