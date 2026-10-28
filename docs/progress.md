# Tufger: Progress

_Last updated: 2026-10-28. Read this first when picking the project back up._

Tufger collects turf-booking money from players. An organiser (host) books a box-cricket/football slot, shares one
link in the WhatsApp group, and players pay their share over UPI. It started as a single-organiser tool and is now
multi-host.

- **Live:** https://tufger.vercel.app (Vercel Hobby, auto-deploys on every push to `main`)
- **Repo:** https://github.com/vineet110/tufger
- **Feature checklist:** [`FEATURES.md`](FEATURES.md) · **Next version ideas:** [`backlog.md`](backlog.md)

## Stack & layout

| Part | Tech | Where |
|---|---|---|
| Frontend | Next.js 16.4.3 (App Router, Cache Components on), React 19, Tailwind v4 | `src/` (repo root is the Next app) |
| Backend | FastAPI + SQLAlchemy 2 (psycopg 3) | `server/` (flat modules, absolute imports) |
| Database | Neon Postgres (`ap-southeast-1`); local runs fall back to SQLite `tufger.db` | `DATABASE_URL` in `.env` |
| Hosting | One Vercel project, two **Services** (`vercel.json`): `/api/py/*` → FastAPI, everything else → Next | `vercel.json` |

- The browser always calls the API at **`/api/py`** on the same domain (no CORS). Locally, `next.config.ts` rewrites
  `/api/py` to uvicorn (`API_PROXY_TARGET`, default `http://127.0.0.1:8100`). On Vercel the rewrite is off.
- **Schema changes:** `create_all()` makes new tables. New columns/indexes on existing tables go in
  `server/db.py → _ADDED_COLUMNS / _ADDED_INDEXES` (run on every start, idempotent). Pre-account data is assigned to
  the admin by `adopt_orphans()`; the admin account is created by `routes_accounts.bootstrap()`.

### Run locally

```bash
npm install
python -m venv .venv && .venv/Scripts/pip install -r server/requirements.txt
cp .env.example .env        # fill in DATABASE_URL, ADMIN_PASSCODE, SECRET_KEY, TUFGER_KEY
npm run api                 # FastAPI on :8100
npm run dev                 # Next on :3100 (ports 3000/8000 are taken by other projects on this PC)
```

### Env vars (Vercel + `.env`)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Neon connection string |
| `SECRET_KEY` | Signs login tokens and passcode lookups. **Never change it** or all passcodes stop matching |
| `ADMIN_PASSCODE` | Only used once, to create the admin account on first start. After that, change it in Settings |
| `TUFGER_KEY` | Starting Tufger key. Once the admin sets a key in Settings, the DB value wins |

**Vercel setting:** Functions region should be Singapore (`sin1`), same as Neon.

## Roles & security model

| Role | Sign in | Gets |
|---|---|---|
| **admin** (owner: Vineet) | Pavilion passcode | Everything, plus the admin panel (Settings → Hosts, Tufger key) |
| **premium** host | Pavilion passcode (their own) **or** username + password | Dugout + Scorebook, locked by their own Dugout & Scorebook password |
| **host** | Username + password (`/host/login`, `/host/signup`) | Bookings, grounds, settings, house rules. Sees an Upgrade card for premium features |

- **Every query is scoped by `host_id`.** Hosts never see each other's data. A phone number is unique per host only.
- Each Pavilion passcode maps to exactly one account (HMAC lookup with `SECRET_KEY` + unique index). The admin sets or
  generates passcodes (shown once). Premium hosts can only *generate* a new one (choosing could leak someone else's).
- The **Tufger key** is the backup credential. It opens Dugout/Scorebook and confirms sensitive steps: password,
  passcode and key changes, and admin actions (upgrade, create host, reset password).
- Passwords are PBKDF2 hashed. Changing a password or passcode bumps `token_version`, which signs out other devices.
- Lockouts: 5 wrong tries per account → 10 min lock; 10 wrong tries per network → 15 min block (`login_throttle`).
- Upgrade contact shown to normal hosts: WhatsApp +91 73820 16152, vineetp.work@gmail.com (`src/lib/rules.ts`).

## What's built (all live)

- **Bookings:** ground with weekday/weekend rates, date, time, duration, discount (₹ or %), paste a WhatsApp list
  or upload Excel/CSV, equal split with rounding, custom per-player amounts, "I'm playing too".
- **Pay page** `/pay/[slug]`: player taps their name, pays via UPI deep link or QR (Save QR), taps "I've paid"
  (+UTR). Claims go to the **Third umpire** queue for the host to confirm. The WhatsApp preview image is a QR card
  (`opengraph-image.tsx`).
- **Booking control room:** scoreboard, pitch view, scorecard, Nudge run (one-tap WhatsApp per unpaid player),
  group status message, re-split (paid shares stay locked), add late players, activity log.
- **Dugout** (premium; was "Team Sheet"): paste WhatsApp game posts (one or many). Parser in `src/lib/teamsheet.ts`
  reads times, grounds, formats, guests (+1), "(100 paid)" and "140 each". Each game becomes an editable card with
  per-player amounts, phones and a custom message, then a booking.
- **Scorebook** (premium; was "Khata"): every player's running balance and history, Got payment (settles oldest
  games first), Add due, hide or delete players, Excel backup, **Send bills** (one WhatsApp per player with a
  personal `/bill/[slug]` page to pay all dues at once).
- **WhatsApp:** free click-to-chat links (`wa.me`) only. No paid API, no unofficial automation.
- **Accounts:** host sign-up/login, premium upgrades, Pavilion passcodes, personal vault password, admin panel.
- **House rules:** each host edits Refunds and Last-minute rules in Settings. `/policies?host=<username>` shows
  them; the footer on every page links there.
- **Design:** "floodlit night match" theme. Fonts: Big Shoulders (headings), Doto (big LED numbers only),
  JetBrains Mono (amounts), Instrument Sans (body). Lime-ball favicon. Title: "Tufger · Turf Booking Manager".

## How to test changes (used for every release)

- API suites live in the Claude scratchpad only and are **not in the repo**. Recreate them as needed: run uvicorn
  on :8200 with `DATABASE_URL=` (empty, so a throwaway SQLite DB), then call `/api/py/...`.
- **Never seed test data into the live Neon DB.**
- To test a migration on Postgres safely, create a throwaway schema in Neon over a direct (non-pooler) connection
  with `options=-csearch_path=<schema>`. Build the old schema from `git archive HEAD server`, run the new code on
  it, verify, then `DROP SCHEMA ... CASCADE`.
- UI: `API_PROXY_TARGET=http://127.0.0.1:8200 npm run build && npm run start`, then drive it with Playwright.
- Before pushing: `npx tsc --noEmit`, `npm run lint`, `npm run build` (delete `.next` if stale route types complain).

## Working agreements (owner's preferences)

- Keep replies short. Put the steps the owner must take first.
- Build → test → report → **commit/push only after approval** (unless the request itself says to push).
- **No Claude attribution** in commits or PRs (no `Co-Authored-By`).
- Git identity for this repo: `vineet110 <vineet@kjsindia.com>`.

## Open items / known gaps

- **Old commits with Claude attribution:** the first 2 commits on GitHub still contain a `Co-Authored-By` line.
  Removing it needs a history rewrite + force push, which the owner hasn't approved yet.
- No "forgot password" by email/OTP. The admin resets passwords, or the user uses the Tufger key.
- Payment verification is manual (claim → host confirms). There's no gateway webhook.
- The link-preview QR image says "Rs" instead of "₹" (the OG image font lacks the ₹ glyph).
- Next.js build warning: "Failed to find font override values for Big Shoulders" (harmless).

## Side research: KJS India (owner's company)

The owner asked for ideas to help kjsindia.com, a contract manufacturer in Pashamylaram, Hyderabad (stick packs
0.9–3 g, powder blending, packing, warehousing, QC). Findings, not started yet:

- **Fix first:** kjsindiawarehouse.com is an unedited Wix template (San Francisco address, 123-456-7890,
  info@mysite.com). The kjsindia.com homepage stats show "00", and there's a "Wharehousing" typo, a video placeholder
  and a personal LinkedIn link.
- **Suggested builds:**
  1. Site rebuild with real numbers and certificates.
  2. "Launch your stick pack" instant-quote configurator for D2C brands (no such calculator found online).
  3. Brand client portal: order stages, auto COA PDFs from QC results, warehouse stock and free-storage countdown.
     No Indian co-packer offers one.
  4. Digital QC/HACCP logbook.
- The next step proposed to the owner was the KJS site rebuild. Waiting for a go-ahead.
