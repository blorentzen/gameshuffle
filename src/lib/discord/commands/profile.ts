/**
 * `/gs-profile` — share your GameShuffle profile in the channel.
 *
 * Resolves the invoking Discord user to their linked GS account and posts a
 * public embed with a link so others can follow + find players. Unlinked or
 * private profiles get an ephemeral nudge (only the caller sees it).
 */

import { getDiscordUser, resolveDiscordUser } from "../user";
import { resolveProfileShareForUser, profileUrl } from "@/lib/social/profileShare";
import { channelMessage, ephemeralMessage, actionRow, linkButton, COLORS } from "../respond";
import { SITE_URL } from "@/lib/seo";

export async function handleGsProfile(
  interaction: Record<string, unknown>,
): Promise<Response> {
  const user = getDiscordUser(interaction);
  if (!user?.id) return ephemeralMessage("Couldn't read your user info. Try again?");

  const resolved = await resolveDiscordUser(user.id, user.username);
  if (!resolved.linked || !resolved.gsUserId) {
    return ephemeralMessage(
      `You haven't linked a GameShuffle account yet. Create or link one at ${SITE_URL}/account, then run \`/gs-profile\` to share it.`,
      [actionRow(linkButton("Create a profile", `${SITE_URL}/signup`))],
    );
  }

  const share = await resolveProfileShareForUser(resolved.gsUserId);
  if (!share) return ephemeralMessage("Couldn't find your profile. Try again?");
  if (!share.visible) {
    return ephemeralMessage(
      "Your GameShuffle profile is set to private. Make it public in your account settings to share it.",
    );
  }

  const url = profileUrl(share.username);
  return channelMessage(
    `<@${user.id}> shared their GameShuffle profile:`,
    [
      {
        title: `${share.displayName} on GameShuffle`,
        description: `Follow me and find players you match with.\n${url}`,
        color: COLORS.PRIMARY,
        footer: { text: "gameshuffle.co" },
      },
    ],
    [actionRow(linkButton("View profile", url))],
  );
}
