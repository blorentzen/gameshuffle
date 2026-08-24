/**
 * `/gs-tag` — custom text snippets (Carlbot-style tags), GS Pro.
 *
 *   /gs-tag show   name:<tag>                 (everyone) → posts the content
 *   /gs-tag list                              (everyone) → lists tag names
 *   /gs-tag set    name:<tag> content:<text>  (managers, Pro)
 *   /gs-tag delete name:<tag>                 (managers, Pro)
 *
 * Tags are owner-scoped (resolved from the guild's linked streamer), so the
 * same tag set is available in the streamer's server.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { callerFrom, canManageGuild, guildOwner } from "../guildOwner";
import { channelMessage, ephemeralMessage } from "../respond";

interface SubOption {
  name: string;
  value?: string | number | boolean;
}

function readSub(interaction: Record<string, unknown>): { name?: string; opt: (n: string) => string } {
  const data = interaction.data as { options?: { name: string; options?: SubOption[] }[] };
  const sub = data.options?.[0];
  return {
    name: sub?.name,
    opt: (n: string) => String(sub?.options?.find((o) => o.name === n)?.value ?? "").trim(),
  };
}

export async function handleGsTag(interaction: Record<string, unknown>): Promise<Response> {
  const { name: subName, opt } = readSub(interaction);
  const owner = await guildOwner((interaction.guild_id as string | undefined) ?? null);
  if (!owner) {
    return ephemeralMessage("GameShuffle isn't linked to this server yet.");
  }
  const admin = createServiceClient();

  if (subName === "show") {
    const tag = opt("name").toLowerCase();
    const { data } = await admin
      .from("discord_tags")
      .select("content")
      .eq("owner_user_id", owner.ownerId)
      .eq("name", tag)
      .maybeSingle();
    if (!data) return ephemeralMessage(`No tag named \`${tag}\`.`);
    return channelMessage((data as { content: string }).content);
  }

  if (subName === "list") {
    const { data } = await admin
      .from("discord_tags")
      .select("name")
      .eq("owner_user_id", owner.ownerId)
      .order("name", { ascending: true });
    const names = ((data as { name: string }[] | null) ?? []).map((r) => `\`${r.name}\``);
    return ephemeralMessage(names.length ? `📌 Tags: ${names.join(", ")}` : "No tags yet.");
  }

  // set / delete — Pro + Manage-Server.
  if (!owner.isPro) return ephemeralMessage("📌 Tags are a GS Pro feature.");
  if (!canManageGuild(interaction)) {
    return ephemeralMessage("Only members who can manage the server can edit tags.");
  }
  const tag = opt("name").toLowerCase();
  if (!tag) return ephemeralMessage("Give a tag name.");

  if (subName === "delete") {
    await admin.from("discord_tags").delete().eq("owner_user_id", owner.ownerId).eq("name", tag);
    return ephemeralMessage(`🗑️ Deleted tag \`${tag}\`.`);
  }

  const content = opt("content");
  if (!content) return ephemeralMessage("Give the tag content.");
  const caller = callerFrom(interaction);
  const { error } = await admin.from("discord_tags").upsert(
    {
      owner_user_id: owner.ownerId,
      name: tag,
      content,
      created_by_discord_id: caller?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_user_id,name" },
  );
  if (error) return ephemeralMessage("Couldn't save that tag — try again.");
  return ephemeralMessage(`📌 Saved \`${tag}\`. Use \`/gs-tag show name:${tag}\`.`);
}
