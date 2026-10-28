/** Tufger's default house rules. Hosts can replace Refunds and Last-minute rules from Settings. */

export const PRIVACY_RULES = [
  "We keep only what's needed to run games: your name, your WhatsApp number (if you share it), the games you play, how much you owe or paid, and any UPI reference you type in.",
  "Your number is used only to send your game details, reminders and bills. It's never sold, shared or used for marketing.",
  "Payments happen in your own UPI app (GPay, PhonePe, Paytm…), straight to the host. Tufger never sees your bank account, card or UPI PIN.",
  "Records are stored in a secure cloud database so nothing is lost if a phone is. Only your host can open them, behind a login.",
  "Want your number removed or your record hidden? Ask your host and it's done. Past payments stay on file so everyone's accounts add up.",
];

export const DEFAULT_REFUNDS = [
  "Money goes directly to the host over UPI, so refunds are sent back by the host over UPI too.",
  "Game cancelled by the host or the ground: you get your full share back, or keep it as an advance for your next game. Your choice.",
  "Paid twice or paid too much: the extra is kept as an advance on your account, or refunded if you ask.",
  "Refunds are usually sent within 2–3 days of asking. If something looks wrong, message the host with your UPI reference number.",
  "Once a slot is booked and paid to the ground, a share can't be refunded just because you can't make it (see the last-minute rules below).",
];

export const DEFAULT_LAST_MINUTE = [
  "Dropping out after the slot is booked: your share is still due, because the ground is already paid. If someone takes your spot, your share moves to them and you owe nothing.",
  "Dropping out more than 24 hours before the game: tell the host early. If the spot is filled, you're free.",
  "Rain or the ground cancels: the game is moved or cancelled. A moved game keeps your share for the new slot; a cancelled one is refunded or kept as an advance.",
  "Fewer players turn up: the ground still costs the same, so the host may re-split the amount among the players who came, and will say so in the group first.",
  "More players join late: shares may be re-split lower, and anyone who already paid the higher share gets the difference as an advance.",
  "Bringing a guest (+1): whoever adds the guest is responsible for the guest's share if they don't pay or don't turn up.",
  "Arriving late or leaving early doesn't change your share.",
];

/** One rule per line; blank text means "use the defaults". */
export function rulesFromText(text: string, fallback: string[]): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : fallback;
}

/** Who to contact for a premium upgrade. */
export const ADMIN_CONTACT = {
  whatsapp: "917382016152",
  whatsappLabel: "+91 73820 16152",
  email: "vineetp.work@gmail.com",
};
