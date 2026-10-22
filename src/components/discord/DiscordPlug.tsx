import { EVENTS, tagged } from "@/lib/analytics/events";
import { ArrowLink } from "@/components/ui/ArrowLink";

/**
 * One line that points a page's visitors at /discord: under the Daily, the
 * Weekly and the homepage's Play today module. Quiet on purpose: it sits
 * below the game, never in front of it.
 */
export function DiscordPlug({ from, text = "Play with your server in Discord." }: { from: string; text?: string }) {
  return (
    <p className="discord-plug">
      {/* eslint-disable-next-line @next/next/no-img-element -- brand mark, decorative */}
      <img src="/images/icons/discord.svg" alt="" width={20} height={20} />
      <span>{text}</span>
      <ArrowLink href="/discord" className={tagged(EVENTS.discordLinkClicked, { from })}>GameShuffle for Discord</ArrowLink>
    </p>
  );
}
