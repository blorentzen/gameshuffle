/**
 * `/gs-poll` — live polling in Discord (GS Pro).
 *
 *   /gs-poll open  question:<text>  options:<a, b, c>   (server managers)
 *   /gs-poll close                                       (server managers)
 *
 * Opening posts an embed-less message with a button per option; clicks route
 * back through `handlePollVote` (custom_id `poll:{pollId}:{optionId}`) and cast
 * a vote keyed to the clicker's Discord gs_identity. The poll is the SAME poll
 * that shows on /live + the OBS overlay and that Twitch `!vote` feeds — one
 * community runs one open poll at a time.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { resolveCommunityIdForOwner } from "@/lib/economy/communityResolver";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import { resolveIdentity } from "@/lib/economy/identity";
import {
  castVote,
  closePoll,
  createPoll,
  getOpenPollForCommunity,
  isPollError,
  tally,
} from "@/lib/polls/store";
import type { PollOption } from "@/lib/polls/types";
import { actionRow, button, channelMessage, ephemeralMessage } from "../respond";

type ActionRow = ReturnType<typeof actionRow>;

export const POLL_VOTE_PREFIX = "poll:";

// Discord permission bits (BigInt via constructor — `n` literals need ES2020).
const MANAGE_GUILD = BigInt(32); // 1 << 5
const ADMINISTRATOR = BigInt(8); // 1 << 3
const ZERO = BigInt(0);

interface DiscordUser {
  id: string;
  username?: string;
}

function callerFrom(interaction: Record<string, unknown>): DiscordUser | null {
  const member = interaction.member as { user?: DiscordUser } | undefined;
  return member?.user ?? (interaction.user as DiscordUser | undefined) ?? null;
}

function canManage(interaction: Record<string, unknown>): boolean {
  const perms = (interaction.member as { permissions?: string } | undefined)?.permissions;
  if (!perms) return false;
  try {
    const bits = BigInt(perms);
    return (bits & MANAGE_GUILD) !== ZERO || (bits & ADMINISTRATOR) !== ZERO;
  } catch {
    return false;
  }
}

async function ownerCommunityForGuild(
  guildId: string | null,
): Promise<{ ownerId: string; communityId: string; isPro: boolean } | null> {
  if (!guildId) return null;
  const { data } = await createServiceClient()
    .from("users")
    .select("id, subscription_tier, role")
    .eq("discord_guild_id", guildId)
    .maybeSingle();
  const u = data as { id: string; subscription_tier: string | null; role: string | null } | null;
  if (!u) return null;
  const communityId = await resolveCommunityIdForOwner(u.id);
  if (!communityId) return null;
  const isPro =
    effectiveTier({ tier: normalizeTier(u.subscription_tier), role: u.role }) === "pro";
  return { ownerId: u.id, communityId, isPro };
}

/** Chunk options into action rows of ≤5 buttons (Discord's per-row cap). */
function pollButtons(pollId: string, options: PollOption[]): ActionRow[] {
  const rows: ActionRow[] = [];
  for (let i = 0; i < options.length; i += 5) {
    rows.push(
      actionRow(
        ...options
          .slice(i, i + 5)
          .map((o) => button(o.label.slice(0, 80), `${POLL_VOTE_PREFIX}${pollId}:${o.id}`, 1)),
      ),
    );
  }
  return rows;
}

interface SubOption {
  name: string;
  value?: string | number | boolean;
}

export async function handleGsPoll(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { options?: { name: string; options?: SubOption[] }[] };
  const sub = data.options?.[0];
  const guildId = (interaction.guild_id as string | undefined) ?? null;

  const ctx = await ownerCommunityForGuild(guildId);
  if (!ctx) {
    return ephemeralMessage(
      "GameShuffle isn't linked to this server yet — the streamer connects it in their GameShuffle account.",
    );
  }
  if (!ctx.isPro) return ephemeralMessage("📊 Polls are a GS Pro feature.");
  if (!canManage(interaction)) {
    return ephemeralMessage("Only members who can manage the server can run polls.");
  }

  if (sub?.name === "close") {
    const open = await getOpenPollForCommunity(ctx.communityId);
    if (!open) return ephemeralMessage("📊 No open poll to close.");
    const closed = await closePoll(open.id);
    if (isPollError(closed)) return ephemeralMessage("Couldn't close the poll — try again.");
    const t = await tally(open.id);
    const lines = open.options.map((o) => {
      const c = t.byOption[o.id] ?? 0;
      const pct = t.total ? Math.round((c / t.total) * 100) : 0;
      return `**${o.label}** — ${c} (${pct}%)`;
    });
    return channelMessage(
      `📊 **Poll closed:** ${open.question}\n${lines.join("\n")}\n_${t.total} vote${t.total === 1 ? "" : "s"}_`,
    );
  }

  // Default subcommand: open.
  const opts = sub?.options ?? [];
  const question = String(opts.find((o) => o.name === "question")?.value ?? "").trim();
  const optionsRaw = String(opts.find((o) => o.name === "options")?.value ?? "");
  const optionLabels = optionsRaw.split(/[|,]/).map((s) => s.trim()).filter(Boolean);
  if (!question || optionLabels.length < 2) {
    return ephemeralMessage(
      "Give a question and at least two options — separate options with commas or `|`.",
    );
  }

  const result = await createPoll({
    communityId: ctx.communityId,
    question,
    options: optionLabels,
    open: true,
    createdBy: ctx.ownerId,
  });
  if (isPollError(result)) return ephemeralMessage("Couldn't open the poll — try again.");
  return channelMessage(
    `📊 **${result.question}**\nClick to vote — results show live on the stream.`,
    undefined,
    pollButtons(result.id, result.options),
  );
}

export async function handlePollVote(interaction: Record<string, unknown>): Promise<Response> {
  const customId = (interaction.data as { custom_id: string }).custom_id;
  const [, pollId, optionId] = customId.split(":");
  const user = callerFrom(interaction);
  if (!user?.id || !pollId || !optionId) return ephemeralMessage("Couldn't record your vote.");

  const identity = await resolveIdentity({
    platform: "discord",
    platformId: user.id,
    displayName: user.username ?? null,
  });
  const result = await castVote({ pollId, optionId, gsIdentityId: identity.identityId });
  if (!result.ok) {
    return ephemeralMessage(
      result.reason === "not_open" ? "📊 This poll has closed." : "Couldn't record your vote.",
    );
  }
  return ephemeralMessage("✅ Vote recorded — click another option to change it.");
}
