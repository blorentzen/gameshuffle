import { IconBrandDiscord } from "@tabler/icons-react";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { TtConnectDiscord } from "./TtConnectDiscord";

/**
 * Time trials in Discord, as one line under a board (round 2 tightening, 4A): an account without
 * Discord gets Connect Discord (so its /tt times land on the account); everyone else gets the
 * commands and the link to add the bot.
 */
export function TtDiscordLine({ returnTo, needsLink }: { returnTo: string; needsLink: boolean }) {
  if (needsLink) {
    return <TtConnectDiscord returnTo={returnTo} text={<>Add times from Discord with <code>/tt add</code>. Connect Discord so they land on this account.</>} />;
  }
  return (
    <div className="tt-connect">
      <IconTile icon={IconBrandDiscord} tone="violet" />
      <p className="tt-connect__text">Add times from Discord with <code>/tt add</code>, and see this board for your server with <code>/tt track</code>.</p>
      <ArrowLink href="/discord/add?app=comp" plain>Add GameShuffle Competitive</ArrowLink>
    </div>
  );
}
