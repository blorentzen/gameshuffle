/**
 * `!gs-tourney` — drive a tournament's current race from chat (broadcaster +
 * mods, Pro). Acts on the broadcaster's currently in-progress tournament.
 * (`!gs-race` is the randomizer's track picker — this is the tournament one.)
 *   !gs-tourney            → announce the current race
 *   !gs-tourney next       → advance to the next race
 *   !gs-tourney prev|back  → go back a race
 *   !gs-tourney <n>        → jump to race #n
 * Advancing updates the overlay card + posts to chat (handled by the shared
 * currentRace lib); this handler only messages edges/errors.
 */

import { sendChatMessage } from "@/lib/twitch/client";
import { createServiceClient } from "@/lib/supabase/admin";
import { effectiveTier, normalizeTier } from "@/lib/subscription";
import {
  getLiveTournamentForOrganizer,
  setTournamentCurrentRace,
  stepTournamentCurrentRace,
} from "@/lib/tournaments/currentRace";
import { listRaces, currentRace } from "@/lib/tournaments/races";
import type { ShuffleContext } from "./shuffle";

export async function handleTournamentRaceCommand(ctx: ShuffleContext, args: string): Promise<void> {
  const admin = createServiceClient();
  const { data: profile } = await admin
    .from("users")
    .select("subscription_tier, role")
    .eq("id", ctx.userId)
    .maybeSingle();
  const tier = effectiveTier({
    tier: normalizeTier(profile?.subscription_tier as string | null),
    role: (profile?.role as string | null) ?? null,
  });
  if (tier !== "pro") return; // Pro-gated; silent for non-Pro.

  const send = (message: string) =>
    sendChatMessage({ broadcasterId: ctx.broadcasterTwitchId, senderId: ctx.botTwitchId, message });

  const t = await getLiveTournamentForOrganizer(ctx.userId);
  if (!t) {
    if (ctx.isBroadcaster) await send("🏁 No tournament is in progress. Set one to “In Progress” to control races.");
    return;
  }

  const [sub, a1] = (args ?? "").trim().split(/\s+/);
  const subLower = (sub ?? "").toLowerCase();

  // Advance / go back.
  if (subLower === "next" || subLower === "prev" || subLower === "back") {
    const res = await stepTournamentCurrentRace({ tournamentId: t.id, dir: subLower === "next" ? 1 : -1 });
    if (!res.moved) await send(subLower === "next" ? "🏁 That's the last race." : "🏁 Already at the first race.");
    return; // a successful move already announced via the overlay/chat broadcast.
  }

  // Jump to race #n.
  const n = parseInt(subLower, 10);
  if (Number.isFinite(n)) {
    const races = listRaces(t);
    if (n < 1 || n > races.length) {
      await send(`🏁 No race #${n} — this tournament has ${races.length}.`);
      return;
    }
    await setTournamentCurrentRace({ tournamentId: t.id, key: races[n - 1].key });
    return;
  }

  // Bare `!gs-race` / `!gs-race now` → announce current.
  const { race, index, total } = currentRace(t);
  if (!race) {
    if (ctx.isBroadcaster) await send("🏁 No current race set yet. Use !gs-race next to start.");
    return;
  }
  const what = race.sublabel ? `${race.label}: ${race.sublabel}` : race.label;
  await send(`🏁 Current — ${what} (${index + 1}/${total}) · ${t.title}`);
  void a1;
}
