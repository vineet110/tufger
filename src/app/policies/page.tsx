import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = {
  title: "Privacy, refunds & last-minute rules",
  description: "How Tufger handles your details, refunds, and drop-outs, rain or no-shows before a game.",
};

const SECTIONS = [
  {
    id: "privacy",
    title: "Privacy",
    points: [
      "We keep only what's needed to run games: your name, your WhatsApp number (if you share it), the games you play, how much you owe or paid, and any UPI reference you type in.",
      "Your number is used only to send your game details, reminders and bills. It's never sold, shared or used for marketing.",
      "Payments happen in your own UPI app (GPay, PhonePe, Paytm…), straight to the organiser. Tufger never sees your bank account, card or UPI PIN.",
      "Records are stored in a secure cloud database so nothing is lost if a phone is. Only the organiser can open them, behind a login and a second key.",
      "Want your number removed or your record hidden? Ask the organiser and it's done. Past payments stay on file so everyone's accounts add up.",
    ],
  },
  {
    id: "refunds",
    title: "Refunds",
    points: [
      "Money goes directly to the organiser over UPI, so refunds are sent back by the organiser over UPI too.",
      "Game cancelled by the organiser or the ground: you get your full share back, or keep it as an advance for your next game. Your choice.",
      "Paid twice or paid too much: the extra is kept as an advance on your account, or refunded if you ask.",
      "Refunds are usually sent within 2–3 days of asking. If something looks wrong, message the organiser with your UPI reference number.",
      "Once a slot is booked and paid to the ground, a share can't be refunded just because you can't make it (see the last-minute rules below).",
    ],
  },
  {
    id: "last-minute",
    title: "Last-minute rules",
    points: [
      "Dropping out after the slot is booked: your share is still due, because the ground is already paid. If someone takes your spot, your share moves to them and you owe nothing.",
      "Dropping out more than 24 hours before the game: tell the organiser early. If the spot is filled, you're free.",
      "Rain or the ground cancels: the game is moved or cancelled. A moved game keeps your share for the new slot; a cancelled one is refunded or kept as an advance.",
      "Fewer players turn up: the ground still costs the same, so the organiser may re-split the amount among the players who came, and will say so in the group first.",
      "More players join late: shares may be re-split lower, and anyone who already paid the higher share gets the difference as an advance.",
      "Bringing a guest (+1): whoever adds the guest is responsible for the guest's share if they don't pay or don't turn up.",
      "Arriving late or leaving early doesn't change your share.",
    ],
  },
];

export default function PoliciesPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">
        <Wordmark />
        <div className="rise mt-8">
          <div className="eyebrow !text-led">● House rules</div>
          <h1 className="display mt-2 text-5xl sm:text-6xl">Privacy, refunds &amp; last-minute rules</h1>
          <p className="mt-3 text-chalk-dim">
            Short and plain, so everyone knows where they stand before the toss. These are the organiser&apos;s rules for games run on Tufger.
          </p>
          <nav className="mt-5 flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="chip chip-pending !text-[0.75rem] hover:!text-lime">
                {s.title}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="slab scroll-mt-6 p-6">
              <h2 className="display text-3xl">{s.title}</h2>
              <ul className="mt-4 space-y-3">
                {s.points.map((p, i) => (
                  <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-8 text-sm text-muted">Questions about a payment? Message the organiser on WhatsApp with your UPI reference number.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
