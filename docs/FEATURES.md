# TUFGER — Feature Checklist

Bulk turf booking → collect each player's share without chasing people one by one.
Legend: `[x]` built · `[ ]` planned · `[~]` partly built

_Last updated: 2026-10-28_

---

## 1. Core booking flow (must-have)

- [x] **Ground selection**: pick from saved grounds (name, area, sport, price per hour)
- [x] Add a new ground straight from the booking form
- [x] **Date** of the game
- [x] **Start time**
- [x] **Duration** (30 min steps; end time shown automatically)
- [x] **Weekday & weekend rates** per ground (weekend falls back to the weekday rate if not set)
- [x] Rate picked automatically from the date (Sat/Sun = weekend), with a manual switch for holidays
- [x] **Discounts**: ₹ off or % off per booking, with an optional reason shown to players
- [x] **Ground amount**: rate/hr × duration − discount, with an editable rate
- [x] **Player list: paste**: paste a WhatsApp list in any shape (`1. Rahul 98765 43210`, `+91…`, emojis, dashes)
- [x] **Player list: Excel / CSV upload** (.xlsx / .csv; finds the name and phone columns automatically)
- [x] **Total player count**: counted live from the pasted or uploaded list, duplicates removed
- [x] **Split among players**: equal split, with optional rounding up to ₹5 / ₹10 / ₹50
- [x] Per-player custom amount override (e.g. a guest pays less)
- [x] "I'm playing too": organiser's own share is marked paid automatically

## 2. Collecting payments

- [x] One public **pay link** per booking: share it once in the WhatsApp group
- [x] Player taps their name → sees their amount → pays via **UPI deep link** (GPay / PhonePe / Paytm open with the amount filled in)
- [x] **UPI QR code** for paying from a laptop or another phone
- [x] Player taps "I've paid" and adds an optional UTR / reference → status becomes **Claimed**
- [x] Organiser confirms a claim → **Paid** (or rejects it → back to Pending)
- [x] Organiser can mark someone paid manually (cash, or paid outside the app)
- [x] Live scoreboard on the public page (collected vs target, who is still pending)

## 3. Reminders (the "chasing" part)

- [x] **Nudge Run**: go through unpaid players one by one; each tap opens WhatsApp with a personalised message, then moves to the next player
- [x] **Copy group message**: ready-to-paste status message (✅ paid / ⏳ pending + pay link)
- [x] Editable reminder template with `{name}`, `{amount}`, `{ground}`, `{date}`, `{link}`
- [ ] Automatic scheduled reminders (needs WhatsApp Business API / SMS provider)
- [ ] Escalating tone for 2nd / 3rd reminder

## 4. Squad / ledger

- [x] Player roster built automatically from every booking (matched by phone number)
- [x] Per-player totals: games, paid, outstanding
- [x] **Reliability rating**: how quickly each player usually pays
- [ ] Carry an old unpaid balance forward into the next booking
- [ ] Player groups (e.g. "Sunday Cricket Gang") for one-tap roster selection

## 5. Organiser tools

- [x] Passcode-protected organiser area
- [x] Settings: UPI ID, payee name, default reminder template
- [x] Dashboard: all bookings, money to collect, upcoming games
- [x] Activity log per booking (claims, confirmations, edits)
- [ ] Export a booking / ledger to Excel
- [x] Free hosting setup: one Vercel project (Next.js + FastAPI services) on Neon
- [ ] Multiple organisers / co-admins
- [ ] Recurring bookings (every Sunday 7 AM)

## 6. Future / nice-to-have

- [ ] Payment-gateway auto-verification (Razorpay / Cashfree UPI collect + webhook)
- [ ] Turf-owner side: share payment straight to the ground's UPI
- [ ] Waitlist when a player drops out, with automatic re-split
- [ ] Team picker (balanced teams) once everyone has paid
- [ ] PWA / installable app, push notifications

---

## Design direction

"Floodlit night match": a dark mowed-turf background with floodlight glows, an amber LED **scoreboard**
for the money (Target / Collected / Yet to pay), and players drawn as jersey tokens on a pitch that
light up as they pay. Fonts: Big Shoulders (stadium signage), Doto (dot-matrix LED digits),
Instrument Sans (body text).
