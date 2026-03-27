import { createClient } from "@supabase/supabase-js";
import {
  deferredResponse,
  ephemeralMessage,
  followUp,
  linkButton,
  actionRow,
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

export async function handleResult(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { options?: { name: string; value: string }[] };
  const opts = parseOptions(data?.options);
  const discordUser = interaction.member
    ? (interaction.member as Record<string, unknown>).user as { id: string; username: string }
    : interaction.user as { id: string; username: string };

  if (!discordUser) {
    return ephemeralMessage("Could not identify your Discord account.");
  }

  // We need to defer since we're hitting the DB
  // But we can't defer AND return — so we do the async work after deferring
  const applicationId = process.env.DISCORD_APPLICATION_ID!;
  const token = (interaction as { token: string }).token;

  // Do async work in the background
  handleResultAsync(discordUser.id, opts, applicationId, token).catch(console.error);

  return deferredResponse();
}

async function handleResultAsync(
  discordUserId: string,
  opts: CommandOptions,
  applicationId: string,
  interactionToken: string
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Find linked GameShuffle user
  const { data: gsUser } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("discord_id", discordUserId)
    .single();

  if (!gsUser) {
    await followUp(applicationId, interactionToken, {
      content: "🔗 Link your GameShuffle account to use this command.\nGo to **gameshuffle.co/account** → Connections → Link Discord.",
    });
    return;
  }

  // Query most recent lounge session results
  if (!opts.type || opts.type === "lounge") {
    const { data: sessions } = await supabase
      .from("lounge_sessions")
      .select("id, mode, status, created_at")
      .or(`host_id.eq.${gsUser.id}`)
      .eq("status", "complete")
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessions && sessions.length > 0) {
      const session = sessions[0];

      // Get placements for this session
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
              linkButton("Full Results", `https://gameshuffle.co/competitive/mario-kart-8-deluxe`, "🔗")
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
