import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getDiscordUser, resolveDiscordUser } from "../user";
import { hasCapability, requiredTier, TIER_LABELS } from "@/lib/subscription";
import {
  deferredResponse,
  ephemeralMessage,
  followUp,
  linkButton,
  actionRow,
  button,
  COLORS,
} from "../respond";

interface CommandOptions {
  type?: "lounge" | "tournament";
}

function parseOptions(options: { name: string; value: string }[] | undefined): CommandOptions {
  const opts: CommandOptions = {};
  if (!options) return opts;
  for (const opt of options) {
    if (opt.name === "type") opts.type = opt.value as "lounge" | "tournament";
  }
  return opts;
}

export function handleResult(interaction: Record<string, unknown>): Response {
  const data = interaction.data as { options?: { name: string; value: string }[] };
  const opts = parseOptions(data?.options);
  const discordUser = getDiscordUser(interaction);

  if (!discordUser) {
    return ephemeralMessage("Could not identify your Discord account.");
  }

  const applicationId = process.env.DISCORD_APPLICATION_ID!;
  const token = (interaction as { token: string }).token;

  after(async () => {
    await handleResultAsync(discordUser.id, discordUser.global_name || discordUser.username, opts, applicationId, token);
  });

  return deferredResponse();
}

async function handleResultAsync(
  discordId: string,
  discordUsername: string,
  opts: CommandOptions,
  applicationId: string,
  interactionToken: string
): Promise<void> {
  // Resolve user — check linking + tier
  const cmdUser = await resolveDiscordUser(discordId, discordUsername);

  if (!cmdUser.linked) {
    await followUp(applicationId, interactionToken, {
      content: "🔗 **Link your GameShuffle account** to use this command.\nGo to **gameshuffle.co/account** → Connections → Link Discord.",
    });
    return;
  }

  // Capability gate: gs-result requires Pro. cmdUser.tier is already the
  // staff-resolved effective tier (resolveDiscordUser ran effectiveTier),
  // so we pass role=null here to skip a redundant staff-elevation pass.
  if (!hasCapability({ tier: cmdUser.tier, role: null }, "gs-result-command")) {
    const needed = requiredTier("gs-result-command");
    await followUp(applicationId, interactionToken, {
      content: `🔒 This command requires **GameShuffle ${TIER_LABELS[needed]}**.\nYou're currently on the **${TIER_LABELS[cmdUser.tier]}** plan.\nUpgrade at **gameshuffle.co/account?tab=plans**`,
    });
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Query most recent lounge session results
  if (!opts.type || opts.type === "lounge") {
    const { data: sessions } = await supabase
      .from("lounge_sessions")
      .select("id, mode, status, created_at")
      .or(`host_id.eq.${cmdUser.gsUserId}`)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessions && sessions.length > 0) {
      const session = sessions[0];

      const { data: placements } = await supabase
        .from("lounge_placements")
        .select("player_name, placement, points")
        .eq("session_id", session.id)
        .order("placement", { ascending: true });

      if (placements && placements.length > 0) {
        const fields = placements.map((p) => ({
          name: `${getMedal(p.placement)} ${p.player_name}`,
          value: `${p.points || 0} pts`,
          inline: true,
        }));

        const date = new Date(session.created_at).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });

        await followUp(applicationId, interactionToken, {
          embeds: [
            {
              title: `Lounge Results — ${session.mode.toUpperCase()}`,
              description: `${placements.length} Players · ${date}`,
              color: COLORS.SUCCESS,
              fields,
              footer: { text: "GameShuffle · gameshuffle.co" },
            },
          ],
          components: [
            actionRow(
              linkButton("Full Results", "https://gameshuffle.co/competitive/mario-kart-8-deluxe", "🔗")
            ),
          ],
        });
        return;
      }
    }
  }

  await followUp(applicationId, interactionToken, {
    content: "No recent results found. Play a lounge match on GameShuffle first!",
  });
}

function getMedal(placement: number): string {
  switch (placement) {
    case 1: return "🥇";
    case 2: return "🥈";
    case 3: return "🥉";
    default: return `**${placement}th**`;
  }
}
