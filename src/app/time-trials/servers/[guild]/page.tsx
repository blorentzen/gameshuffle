import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TimeTrialsHub } from "@/components/timeTrials/TimeTrialsHub";
import { guildPlayers } from "@/lib/timeTrials/store";
import { serverName } from "@/lib/timeTrials/server";
import { hasPanel } from "@/lib/discord/ttPanel";
import { gameBySlug, isClassFor, TT_GAMES, TT_GAME_ORDER, type TtClass } from "@/lib/timeTrials/tracks";
import { readCategory } from "@/lib/timeTrials/categories";
import "@/styles/time-trials.css";

/**
 * One Discord server's time trial board (the time trial panel's Server board; picks 2026-10-30,
 * Nn8Qv4EVRDL6zojwHVCcdN): every track's best time among the players that server has seen.
 * /time-trials/servers/<server id>?game=mario-kart-8-deluxe. Not indexed (servers are found from Discord), and only
 * while the server has a panel up: a server that never chose one doesn't get a page.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ guild: string }>; searchParams: Promise<{ game?: string; cc?: string; items?: string; vehicle?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guild } = await params;
  const name = /^\d{5,25}$/.test(guild) ? await serverName(guild) : null;
  return { title: name ? `${name} time trials` : "Server time trials", robots: { index: false, follow: true } };
}

export default async function ServerTimeTrialsPage({ params, searchParams }: Props) {
  const [{ guild }, sp] = await Promise.all([params, searchParams]);
  if (!/^\d{5,25}$/.test(guild)) notFound();
  const [players, name, panel] = await Promise.all([guildPlayers(guild), serverName(guild), hasPanel(guild)]);
  if (!panel || !players.length) notFound();
  const game = (sp.game ? gameBySlug(sp.game)?.id : null) ?? TT_GAME_ORDER[0];
  const c = Number(sp.cc);
  const cc = (isClassFor(game, c) ? c : TT_GAMES[game].classes[0]) as TtClass;
  return <TimeTrialsHub game={game} cc={cc} {...readCategory(game, sp)} gamePage server={{ guildId: guild, name: name || "This server" }} />;
}
