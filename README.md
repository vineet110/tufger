# TUFGER

Bulk turf booking → collect every player's share over UPI without chasing anyone.

- **Frontend**: Next.js 16.4.3 (App Router, Cache Components, Tailwind v4) in `src/`
- **Backend**: FastAPI + SQLAlchemy 2 in `server/`
- **Database**: Neon Postgres (falls back to a local SQLite file when `DATABASE_URL` is empty)
- **Feature checklist**: [`docs/FEATURES.md`](docs/FEATURES.md)

## Run it

```bash
# one-time
npm install
python -m venv .venv
.venv/Scripts/pip install -r server/requirements.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env                               # then fill it in

# two terminals
npm run api     # FastAPI on :8100 (tables are created automatically)
npm run dev     # Next.js on :3100, forwards /api/py to FastAPI
```

Open http://localhost:3100 and log in with `ADMIN_PASSCODE` from `.env`. Then go to **Settings**,
add your UPI ID, add a ground, and create a booking.

### Connecting Neon

Paste the Neon connection string into `.env`:

```
DATABASE_URL=postgresql://user:password@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Restart `npm run api`. Tables are created on first start.

### Testing on your phone

Run both servers and open `http://<your-PC-LAN-IP>:3100` on a phone on the same Wi-Fi. The site
always calls the API at `/api/py` on its own address, and Next.js forwards it to FastAPI.

## Deploy (free, Vercel Hobby)

One Vercel project runs both apps using [Vercel Services](https://vercel.com/docs/services)
(`vercel.json`): `/api/py/*` goes to FastAPI in `server/`, and everything else goes to Next.js.

1. On [vercel.com/new](https://vercel.com/new), import the GitHub repo. Leave the framework and
   root settings as they are, because `vercel.json` defines both services.
2. Add **Environment Variables** (Production): `DATABASE_URL` (the Neon string), `ADMIN_PASSCODE`,
   `SECRET_KEY` (a long random string) and `TUFGER_KEY` (unlocks Team Sheet; leave it out to switch
   Team Sheet off).
3. **Settings → Functions → Function Region → Singapore (`sin1`)**, the same region as the Neon
   database. Otherwise every query crosses the Pacific.
4. Deploy. Every `git push` to `main` redeploys.

Players then open `https://<your-project>.vercel.app/pay/<code>`.

## How it works

1. **New booking**: pick a ground → date, time, duration → paste the WhatsApp list or upload
   Excel → the ground amount (price/hr × duration) is split per head.
2. Share the **one pay link** in the group. Each player taps their name and pays over UPI (deep
   link or QR), then taps **I've paid** (optionally with the UTR).
3. Claims land in the **Third umpire** queue on the booking page. Confirm or reject.
4. **Team Sheet** (needs `TUFGER_KEY`): paste your WhatsApp game posts and each game becomes a card
   with its players, time and price per player. Adjust anything, then create them all at once.
5. **Nudge run** goes through the unpaid players one by one, opening WhatsApp with a personal
   reminder for each.

## Layout

```
src/app/(admin)/        organiser pages (Pavilion, booking, squad, grounds, settings)
src/app/pay/[slug]/     public pay page for players
src/components/         scoreboard, pitch, shell, QR, toasts
src/lib/                API client, roster parser + split, formatting, UPI/WhatsApp messages
server/                 FastAPI app: models, routes, Excel parsing, split logic
docs/FEATURES.md        feature checklist
```
