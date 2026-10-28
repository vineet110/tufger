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
- [ ] **Regulars / squads:** saved player groups (e.g. "Sunday cricket gang") to add a whole roster in one tap.
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
