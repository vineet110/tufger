# Tufger: Backlog

Ideas for the next version, roughly in priority order within each group. Current state: [`progress.md`](progress.md).

## v2

### Money & payments
- [ ] **Auto payment verification:** Razorpay/Cashfree UPI collect with webhooks, so payments mark themselves paid
      (no "I've paid" + manual confirm). Keep manual UPI as the free fallback.
- [ ] **Partial payments on a game:** a player pays ₹100 of ₹150 and the rest stays due on that game, not just as
      Scorebook credit.
- [ ] **Carry old dues into the next booking automatically:** "Ranjan owes ₹140 from last week" shown on the new
      pay link, collectable in one UPI payment.
- [ ] **Refund helper:** when a game is cancelled, list who to refund, open each player's UPI app with the amount,
      and record it in Scorebook.
- [ ] **Monthly statement per player:** PDF/image of games, payments and balance, shareable on WhatsApp.
- [ ] **Turf-owner payouts:** record what was paid to the ground per booking, so the host's profit/loss per game
      shows.

### Organising games
- [ ] **Recurring bookings:** "every Sunday 7 AM at Ramp" creates the booking and pay link automatically each week.
- [ ] **Regulars / squads:** saved player groups (e.g. "Sunday cricket gang") to add a whole roster in one tap, on top of the contact book.
- [ ] **Waitlist & replacement:** when someone drops out, the next waitlisted player is offered the spot; their share
      moves over automatically (matches the house rule).
- [ ] **RSVP before booking:** share a "who's in?" link, players tap In/Out, then convert the confirmed list
      into a booking.
- [ ] **Balanced team picker:** split confirmed players into two fair teams (by past games or a rating) and post
      them to the group.
- [ ] **Match results & stats:** record score/winner per game, and keep simple player stats (games, wins, MVPs).
- [ ] **Ground calendar:** see all upcoming slots across grounds and avoid double-booking.

### WhatsApp & reminders
- [ ] **Scheduled reminders:** "remind unpaid players 6 hours before the game", sent as a ready-to-tap queue for
      the host (or automatic once the WhatsApp Business API is approved).
- [ ] **Escalating reminder tone:** 1st friendly, 2nd firm, 3rd "you'll be dropped from the next game".
- [ ] **Shareable game poster:** an auto-generated image (ground, time, slots left, pay QR) for WhatsApp status /
      groups.
- [ ] **Hindi / Telugu message templates** for reminders and bills.

### Accounts & admin
- [ ] **Forgot password via email or WhatsApp OTP** (today: admin reset or Tufger key).
- [ ] **Co-hosts:** let a host add a helper who can confirm payments but not delete data.
- [ ] **Admin dashboard for the platform:** total hosts, active hosts, money collected across Tufger, premium
      requests.
- [ ] **Premium billing:** hosts pay for premium inside Tufger (UPI/Razorpay subscription) instead of messaging the
      admin; auto-downgrade on expiry.
- [ ] **Audit log:** who changed what (passcodes, roles, payments marked paid) for the admin.
- [ ] **Session list:** "signed in on 3 devices", with sign-out per device.

### Players' side
- [ ] **Player profile link:** one page per player across all their hosts' games (opt-in), with their dues and
      history.
- [ ] **PWA / installable app** with push notifications for hosts ("Ravi says he paid").
- [ ] **Receipts:** a downloadable/shareable receipt once a payment is confirmed.

### Quality & ops
- [ ] Bring the API test suites into the repo (`server/tests`, pytest) and run them in GitHub Actions on every push.
- [ ] Error tracking (Sentry) for both the Next app and FastAPI.
- [ ] Daily automatic Excel/CSV backup emailed to each premium host.
- [ ] Proper Alembic migrations once the schema settles (today: `_ADDED_COLUMNS` in `server/db.py`).
- [ ] Show "₹" in link-preview images by loading a font with the rupee glyph into `next/og`.
- [ ] Rewrite the first 2 commits to remove the old `Co-Authored-By` lines (needs the owner's OK to force-push).

## Spin-off ideas (separate products)

- **Co-packer client portal (for KJS India first, then as SaaS):** order stages, auto COA PDFs, warehouse stock.
- **"Launch your stick pack" instant quote** for D2C brands, generating leads for KJS.
- **Co-packer marketplace for small Indian D2C brands:** search by format, MOQ, certification and city, then request
  quotes.
- **Tufger engine for other groups:** coaching batches, tournament entry fees, society events (lower priority;
  Paytm Split Bills partly covers it).

## Code & security review (2026-10-30)

Whole-repo review. None of these are fixed yet. **[Reproduced]** = seen failing on a throwaway database. **[Code read]** = found
by reading the code, not run. Severity is for live use. `npm audit --omit=dev` found 0 issues, and git history has no secrets.

### Critical / high
- [ ] **[Code read] Default secrets fail open** (`server/config.py:13-14`). If `SECRET_KEY` is unset in production, anyone can forge
      an admin token. If `ADMIN_PASSCODE` is unset at first start, the passcode is `tufger`. Check Vercel's env vars now.
- [ ] **[Reproduced] Bill claims ignore Scorebook credits and dues** (`server/routes_khata.py`, `claim_bill`). Advance ₹200, game ₹300:
      the bill asks ₹100, but confirming ticks the whole game and the ₹200 advance stays, so the balance shows −₹200 when it should be ₹0.
- [ ] **[Reproduced] Excel backup always fails** (`src/lib/api.ts`, `downloadBackup`). It doesn't send `X-Tufger-Key`, so the export returns 403.
- [ ] **[Reproduced] Removing a paid player erases the payment** (`remove_entry` in `server/routes_admin.py`). The money received
      disappears and the share moves onto unpaid players (X paid ₹150, removed, Y now owes ₹300).
- [ ] **[Code read] Changing the UPI ID needs only a session** (`write_settings`). A stolen 30-day token redirects every open pay link.

### Medium
- [ ] **[Reproduced] Login throttle trusts `X-Forwarded-For`** (`auth.py`, `client_ip`). Rotating the header dodged the block. Check
      whether Vercel overwrites this header; if it does, the bypass only applies off Vercel.
- [ ] **[Reproduced] Accounts can be found by timing and by lockout**: unknown username ~305 ms vs real ~162 ms, because `check_login`
      hashes twice. Only real accounts return 429.
- [ ] **[Reproduced] Anyone can lock a host out**: 5 wrong logins lock the account for 10 minutes, and it can be repeated.
- [ ] **[Code read] No rate limit on vault and identity checks** (`require_key`, `confirm_identity`). `/auth/unlock` and `/auth/password` can be
      brute-forced from a logged-in device, the Tufger key can be 4 characters, and every vault request costs a PBKDF2 run.
- [ ] **[Code read] The shared Tufger key undermines each host's own lock.** One premium host holding another's session can open their
      vault or change their password.
- [ ] **[Code read] One failed poll kills the page** (`PayView`, `BillView`, `ControlRoom`). A player back from the UPI app on weak data
      sees an error page instead of "I've paid".
- [ ] **[Code read] No security headers or CSP** (`next.config.ts`), with tokens in web storage and no backstop.
- [ ] **[Code read] Raw vault secret stays in sessionStorage**, goes out on every request, and survives a 401 logout (`src/lib/api.ts`).
- [ ] **[Code read] Pay-link claims have no rate limit** (`routes_public.py`). Anyone with the link can mark another player as claimed, which
      stops their nudges until the host rejects it.
- [ ] **[Code read] Open sign-up with no throttle or check on the UPI ID**, so strangers can host payment pages on the Tufger domain.
- [ ] **[Code read] Re-split overwrites Dugout prices** when a player is added or removed (10 × ₹140 plus one becomes ~₹127 each).
- [ ] **[Code read] Dugout misreads status words** (`src/lib/teamsheet.ts:264`). "Rohit unpaid" counts as paid; "Rahul confirmed" is dropped.
- [ ] **[Reproduced] `PATCH /bookings/{id}` with `null`** (e.g. `play_date: null`) returns 500.
- [ ] **[Reproduced] No upper limit on rates and amounts**: `rate_per_hour` 10¹² was accepted, and it should overflow Postgres's integer column.
- [ ] **[Reproduced] Spreadsheet formula injection in the export**: the Dugout name `=1+1` is written as a live formula.

### Low
- [ ] **[Reproduced] API docs are public** at `/api/py/docs` and `/openapi.json`; `/health` shows the database type.
- [ ] **[Reproduced] Saved total can differ from the preview by ₹1**: ₹1003/hr × 90 min saves 1504 and previews 1505 (Python `round`).
- [ ] **[Reproduced] UPI ID isn't validated on save**: `not a upi` was accepted, so a typo goes straight to live pay links.
- [ ] **[Code read]** Logout doesn't revoke the token; a non-Latin vault password locks the owner out.
- [ ] **[Code read]** Privacy text says records are "behind a login" but pay links show names and status; pay and bill pages lack noindex.
- [ ] **[Code read]** `pn` differs between `BillRun`/Dugout and public pages; ₹0 shares open UPI with no amount; bill OG QR may go stale.
- [ ] **[Code read]** `date.today()` is UTC on the server, so "next game" is wrong between 00:00 and 05:30 IST.
- [ ] **[Code read]** A Dugout card left in "saving" after a reload stays locked; `settings/page.tsx` has no load error handling; Re-split
      still runs after a failed total update in `ControlRoom`.

### Contact book follow-ups
- [ ] Try the first-start migration on a throwaway Postgres copy before deploying (only tested on SQLite so far).
- [ ] Merge tool for two contacts who are really one person, moving games and balance across.
- [ ] Limit on contacts per host; a downloadable sample sheet; export contacts to CSV.

## Suggested fixes (in this order)

1. **Today:** confirm `SECRET_KEY` and `ADMIN_PASSCODE` on Vercel, then make the server refuse to start on defaults.
2. **Next small batch:** send the key in `downloadBackup`, hide the API docs, return 400 on `null` patches, cap money fields, add security headers.
3. **Money correctness:** record what a bill claim actually paid, and block or record removal of paid players. These need a design choice first.
4. **Logins:** use one lockout for login and vault checks, make the two login paths cost the same, use Vercel's trusted IP, stop treating the
   Tufger key as a stand-in for each host's password.
5. **Sessions:** ask for the password before changing the UPI ID, swap the raw vault secret for a short-lived token, add real logout.
6. **Reliability:** keep the last good data when a poll fails, fix Dugout's status matching, and run `server/tests` in GitHub Actions.
