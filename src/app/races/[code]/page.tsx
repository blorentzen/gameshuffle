import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseHero } from "@/components/events/BrowseHero";
import { RaceRoom } from "@/components/races/RaceRoom";
import { createClient } from "@/lib/supabase/server";
import { boxArt } from "@/data/game-catalog";
import { gameEntry } from "@/lib/games/key";
import { cleanCode } from "@/lib/versus/rules";
import { pageView } from "@/lib/versus/store";
import "@/styles/daily-duel.css";
import "@/styles/races.css";

/**
 * /races/<code>: a speedrun race (speedrun races picks 2026-11-10). Public by link and kept as results after (pick 6A),
 * never indexed. The room before the start, the countdown, the race live, then the results (RaceRoom). Duels and
 * trainer battles (Trainer Road) use the same page.
 */

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const code = cleanCode((await params).code);
  const view = code ? await pageView(code, null) : null;
  const what = view ? [view.game, view.category].filter(Boolean).join(" · ") : "";
  const who = view ? view.entrants.filter((e) => e.status !== "invited").map((e) => e.name).join(", ") : "";
  return {
    title: !view ? "Speedrun race" : view.duel || view.battle ? `${view.game} · ${view.code}` : `${what || "Speedrun"} race ${view.code}`,
    description: !view ? undefined : view.kind === "tag" ? `A tag team duel on GameShuffle: ${who} against ${view.duel?.name ?? "a trainer"}.` : view.battle ? `A trainer battle on GameShuffle between ${who}.` : view.duel ? `A Trainer Road duel on GameShuffle between ${who}.` : `A speedrun race on GameShuffle between ${who}.`,
    robots: { index: false, follow: false },
  };
}

export default async function RacePage({ params }: Params) {
  const code = cleanCode((await params).code);
  if (!code) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const view = await pageView(code, user?.id ?? null);
  if (!view) notFound();
  const title = [view.game, view.category].filter(Boolean).join(" · ") || "Speedrun race";
  const art = view.gameKey ? boxArt(gameEntry(view.gameKey)) : null;
  const d = view.duel;
  const b = view.battle;
  return (
    <main className="race-page">
      {b ? (
        <BrowseHero
          eyebrow="Trainer battle"
          title={`${b.groupLabel} battle`}
          sub="Two players, a Trainer Road team each, 3 cards each, turn by turn. A coin flip decides who goes first."
          subShort="Two players, a team each, turn by turn."
          accent="duel"
          field="compete"
          compact
        />
      ) : d && view.kind === "tag" ? (
        <BrowseHero
          eyebrow="Tag team"
          title={`Team up against ${d.name}`}
          sub={`${d.title} · ${d.game}. Two players share one side: you take turns picking the cards, and whoever owns the card on the field plays the turn.`}
          subShort={`${d.game}. Two players, one side.`}
          accent="duel"
          field="compete"
          compact
        />
      ) : d ? (
        <BrowseHero
          eyebrow="Trainer Road duel"
          title={`Duel ${d.name}`}
          sub={`${d.title} · ${d.game}. Everyone duels this team at once; the fewest turns wins.`}
          subShort={`${d.game}. The fewest turns wins.`}
          accent="duel"
          field="compete"
          compact
        />
      ) : (
        <BrowseHero
          eyebrow="Speedrun race"
          title={title}
          sub={`${view.checkpoints.length} splits. GameShuffle starts every runner's timer at once and shows who's ahead at every split.`}
          subShort={`${view.checkpoints.length} splits, every timer started at once.`}
          accent="blue"
          field="compete"
          backdrop={art}
          compact
        />
      )}
      <div className="race-page__body">
        <RaceRoom initial={view} signedIn={!!user} />
      </div>
    </main>
  );
}
