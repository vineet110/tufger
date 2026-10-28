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

## 2b. Team Sheet (locked with TUFGER_KEY)

- [x] Paste WhatsApp game posts (one or many, with or without chat timestamps) and get a card per game
- [x] Reads times ("7 - 8 30 pm", "4 30-6pm (Today)", "Sunday 7am"), ground ("Ramp", "Match at prokick"), format ("7v 7"), status lines
- [x] Reads players with numbering, guests ("+1", "Ganesh+1", "+1 (sovit frnd)", "+Ganesh") and "(100 paid)"
- [x] "140 each" in the next message sets that game's price per player
- [x] Edit date, start/end time, ground, sport, price per player, and any player's own amount (no need to match a ground total)
- [x] Tick players as already paid; the organiser is ticked automatically
- [x] Custom group message per game with {ground} {date} {time} {sport} {amount} {link}
- [x] Create one or all games; share each in WhatsApp; drafts survive a page reload
- [ ] Save a "regulars" list per ground to add players in one tap

## 3. Reminders (the "chasing" part)

- [x] **Nudge Run**: go through unpaid players one by one; each tap opens WhatsApp with a personalised message, then moves to the next player
- [x] **Copy group message**: ready-to-paste status message (✅ paid / ⏳ pending + pay link)
- [x] Editable reminder template with `{name}`, `{amount}`, `{ground}`, `{date}`, `{link}`
- [ ] Automatic scheduled reminders (needs WhatsApp Business API / SMS provider)
- [ ] Escalating tone for 2nd / 3rd reminder

## 4. Khata (player accounts) & WhatsApp

- [x] Every player's running balance: games charged, payments, extra dues (owes you / settled / advance)
- [x] Per-player history with the balance after each entry, like Khatabook
- [x] **Got payment** ticks off the oldest unpaid games first; leftover is kept as an advance
- [x] **Add due** for extra amounts (ball money, old dues); manual entries can be removed
- [x] Add, edit, hide players; delete only when they have no history
- [x] WhatsApp number saved on each player and reused everywhere (bookings, Team Sheet, Nudge run)
- [x] Team Sheet fills known numbers automatically and lets you type new ones
- [x] **Send bills**: one tap per player opens their own WhatsApp chat with their total bill (free click-to-chat links)
- [x] Personal bill link per player: all unpaid games, one UPI payment, "I've paid everything"
- [x] Excel backup of all players and full history
- [x] UPI QR shown on every pay/bill page, with **Save QR** for "scan from gallery"
- [x] WhatsApp messages carry the UPI ID and the link; the link's preview image is the payment QR
- [x] **Copy QR image** in Send bills and Team Sheet to paste the QR into a chat
- [x] Pay-speed rating per player
- [ ] Fully automatic WhatsApp sending (needs the paid WhatsApp Business API)
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
