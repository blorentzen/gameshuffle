/**
 * Support GameShuffle emails (src/lib/support/store.ts): the thank-you after
 * a one-time gift or a new monthly supporter. Stripe sends the receipt; this
 * says thanks, what support does, and where monthly support is managed.
 */

import "server-only";
import { sendTransactionalEmail } from "./mailersend";

const SUPPORT_INBOX = "support@gameshuffle.co";

export async function sendSupportThanksEmail({ to, name, amount, monthly, onWall, shareUrl, levelName = null, pro = false }: {
  to: string;
  name?: string | null;
  /** "$5" */
  amount: string;
  monthly: boolean;
  onWall: boolean;
  /** Where they can share their supporter card (Account ▸ Support, or the thank-you page). */
  shareUrl?: string | null;
  /** The monthly level ("Backer"), when there is one. */
  levelName?: string | null;
  /** The level includes GS Pro. */
  pro?: boolean;
}) {
  const hi = name?.trim() || "there";
  const text = [
    `Hi ${hi},`,
    "",
    monthly
      ? `Thank you for supporting GameShuffle${levelName ? ` as a ${levelName}` : ""} with ${amount} a month. It goes straight into keeping the site running: servers, game and card data, email and the AI features, with no ads.`
      : `Thank you for supporting GameShuffle with ${amount}. It goes straight into keeping the site running: servers, game and card data, email and the AI features, with no ads.`,
    "",
    onWall ? "Your name is on the supporters wall at https://www.gameshuffle.co/support." : "You asked to stay off the supporters wall, so your name isn't shown.",
    "If you have a GameShuffle account, a Supporter badge now shows on your profile.",
    ...(pro ? ["", "GS Pro is included with your level and is on now: the Twitch and Discord tools, themes and the AI features. It stays on while your support does."] : []),
    ...(shareUrl ? ["", `Want to spread the word? Share a card that says you back GameShuffle: ${shareUrl}`] : []),
    ...(monthly ? ["", "Change or stop your monthly support any time from Account > Support: https://www.gameshuffle.co/account?tab=support"] : []),
    "",
    pro
      ? "GameShuffle isn't a charity, so support isn't tax-deductible. Because your level includes GS Pro, it's taxed like GS Pro. Stripe sends your receipt separately."
      : "GameShuffle isn't a charity, so support isn't tax-deductible. Stripe sends your receipt separately.",
    "Support is processed by Empac, the studio behind GameShuffle.",
    "",
    `Questions? Reply to this email or write to ${SUPPORT_INBOX}.`,
    "",
    "Thanks again,",
    "The GameShuffle team",
  ].join("\n");
  return sendTransactionalEmail({
    to,
    toName: name ?? undefined,
    subject: monthly ? "Thank you for supporting GameShuffle every month" : "Thank you for supporting GameShuffle",
    text,
    fromName: "GameShuffle",
    replyTo: SUPPORT_INBOX,
  });
}
