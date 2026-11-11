/**
 * `/pb [player]` on GameShuffle Competitive (speedrun Discord picks 2026-11-10, free): a runner's PB, sum of best and
 * attempts from their GameShuffle speedrun setup, and the run going now. No player: the server owner's (the account
 * that added the bot); in a DM, your own. A player: any member who connected GameShuffle with Discord.
 * The relay read can outrun Discord's 3 seconds, so it defers and follows up.
 */

import { after } from "next/server";
import { actionRow, deferredResponse, ephemeralMessage, followUp, linkButton } from "../respond";
import { getDiscordUser, resolveDiscordUser } from "../user";
import { getAppGuild } from "../appGuilds";
import { SITE_URL } from "@/lib/seo";
import { pbLookupEmbed } from "@/lib/speedrun/discordPosts";

type Opt = { name: string; value?: string };

export async function handlePbCommand(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { options?: Opt[]; resolved?: { users?: Record<string, { username?: string; global_name?: string | null }> } } | undefined;
  const picked = data?.options?.find((o) => o.name === "player")?.value ?? null;
  const guildId = typeof interaction.guild_id === "string" ? interaction.guild_id : null;
  const appId = String(interaction.application_id ?? "");
  const token = String(interaction.token ?? "");
  const setUp = actionRow(linkButton("Set up your speedrun", `${SITE_URL}/speedrun`));

  let userId: string | null = null;
  if (picked) {
    const u = data?.resolved?.users?.[picked];
    const name = u?.global_name || u?.username || "That member";
    const resolved = await resolveDiscordUser(picked, u?.username ?? "");
    if (!resolved.linked || !resolved.gsUserId) return ephemeralMessage(`${name} hasn't connected GameShuffle with Discord, so there's no speedrun to show.`);
    userId = resolved.gsUserId;
  } else if (guildId) {
    userId = (await getAppGuild("comp", guildId))?.ownerUserId ?? null;
    if (!userId) return ephemeralMessage("Pick a player: this server's owner hasn't set GameShuffle Competitive up on gameshuffle.co.");
  } else {
    const me = getDiscordUser(interaction);
    const resolved = me?.id ? await resolveDiscordUser(me.id, me.username) : null;
    if (!resolved?.linked || !resolved.gsUserId) return ephemeralMessage(`Connect Discord on GameShuffle to see your own PB here, or pick a player.`, [setUp]);
    userId = resolved.gsUserId;
  }

  const who = userId;
  after(async () => {
    try {
      const out = await pbLookupEmbed(who);
      if (!out) { await followUp(appId, token, { content: "No speedrun set up on GameShuffle for them yet.", components: [setUp] }); return; }
      await followUp(appId, token, { embeds: [out.embed], components: [actionRow(...(out.watch ? [linkButton("Watch live", out.watch)] : []), linkButton("Set up your speedrun", `${SITE_URL}/speedrun`))] });
    } catch (e) {
      console.error("[pb]", e);
      await followUp(appId, token, { content: "Couldn't read that run right now. Try again in a minute." });
    }
  });
  return deferredResponse();
}
