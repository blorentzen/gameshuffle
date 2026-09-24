"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getImagePath } from "@/lib/images";
import { computeStandings, DEFAULT_SCORING_TABLE, type TournamentRace } from "@/lib/tournaments/scoring";
import { currentRace } from "@/lib/tournaments/races";
import { RandomizerNowRacing } from "@/components/tournament/RandomizerNowRacing";
import { BracketView } from "@/components/tournament/BracketView";
import { HeatMainsView } from "@/components/tournament/HeatMainsView";
import { GroupBracketView } from "@/components/tournament/GroupBracketView";
import { bracketChampion, currentBracketMatch, matchRoundLabel, computeBracketPlacements, type Bracket } from "@/lib/tournaments/bracket";
import { heatMainsChampion, currentHeatMainsRace, heatMainsStandings, type HeatMains } from "@/lib/tournaments/heatMains";
import { groupChampion, computeGroupPlacements, type GroupBracket } from "@/lib/tournaments/groups";
import type { GeneratedRound, LivePointer } from "@/lib/tournaments/randomizer";

/**
 * In-person / stream display for a tournament — a chrome-free big-screen board:
 * the current race ("Now racing", including randomized rounds) and live
 * standings. For paid (Circuit) tournaments it live-updates via Supabase
 * realtime; otherwise it shows the current snapshot. Project it at the venue or
 * add it as an OBS source.
 */

interface Tournament {
  id: string; title: string; status: string; mode: string; game_slug: string;
  scoring_table?: number[] | null;
  settings: Record<string, unknown> | null;
  format?: string | null;
  bracket?: Bracket | null;
  heat_mains?: HeatMains | null;
  group_bracket?: GroupBracket | null;
}
interface Participant { id: string; user_id: string | null; display_name: string; team: number | null; status: string }

export function TournamentDisplay({ tournamentId, live }: { tournamentId: string; live: boolean }) {
  const supabase = createClient();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [races, setRaces] = useState<TournamentRace[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [tRes, pRes, rRes] = await Promise.all([
      supabase.from("tournaments").select("id, title, status, mode, game_slug, scoring_table, settings, format, bracket, heat_mains, group_bracket").eq("id", tournamentId).single(),
      supabase.from("tournament_participants").select("id, user_id, display_name, team, status").eq("tournament_id", tournamentId).order("joined_at"),
      supabase.from("tournament_races").select("id, race_number, placements").eq("tournament_id", tournamentId).order("race_number"),
    ]);
    if (tRes.data) setTournament(tRes.data as Tournament);
    if (pRes.data) setParticipants(pRes.data as Participant[]);
    if (rRes.data) setRaces(rRes.data as TournamentRace[]);
    setLoading(false);
  }, [tournamentId, supabase]);

  useEffect(() => {
    // Async fetch: state updates happen after the network await, not synchronously.
    load();
    if (!live) return;
    const channel = supabase
      .channel(`tourney-display-${tournamentId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` }, (p) => { if (p.new) setTournament(p.new as Tournament); })
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${tournamentId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_races", filter: `tournament_id=eq.${tournamentId}` }, () => void load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tournamentId, live, load, supabase]);

  if (loading || !tournament) {
    return <main className="tourney-display"><div className="tourney-display__inner"><p style={{ opacity: 0.7 }}>Loading…</p></div></main>;
  }

  const s = tournament.settings ?? {};
  const scoringTable = Array.isArray(tournament.scoring_table) && tournament.scoring_table.length ? tournament.scoring_table : DEFAULT_SCORING_TABLE;
  const activeParticipants = participants.filter((p) => p.status !== "dropped");
  const standings = computeStandings(
    activeParticipants.map((p) => ({ id: p.id, display_name: p.display_name, team: p.team })),
    races,
    scoringTable,
  ).filter((x) => x.racesPlayed > 0).slice(0, tournament.status === "complete" ? 32 : 12);

  const randomizerOn = (s.randomizer as { enabled?: boolean } | undefined)?.enabled && Array.isArray(s.rounds);
  const rounds = randomizerOn ? (s.rounds as GeneratedRound[]) : [];
  const randomizerLive = (s.randomizerLive ?? null) as LivePointer | null;
  const trackNow = currentRace(tournament as unknown as Parameters<typeof currentRace>[0]);
  // A generated bracket / heats / groups means the event is underway.
  const hasStructure = !!tournament.bracket || !!tournament.heat_mains || !!tournament.group_bracket;
  const racingStarted = standings.length > 0 || !!trackNow.race || !!randomizerLive || hasStructure;
  const nameOf = (id: string | null) => (id ? participants.find((p) => p.id === id)?.display_name ?? "Unknown" : "TBD");

  // Unified "Now racing" across bracket + heat/mains formats (the race-scoring /
  // randomizer banner below covers the other formats).
  let nowLabel: string | null = null;
  let nowNames: string[] = [];
  if (tournament.heat_mains) {
    const r = currentHeatMainsRace(tournament.heat_mains);
    if (r) { nowLabel = r.label; nowNames = r.drivers.map(nameOf); }
  } else if (tournament.bracket) {
    const m = currentBracketMatch(tournament.bracket);
    if (m) { nowLabel = matchRoundLabel(tournament.bracket, m); nowNames = [nameOf(m.a), nameOf(m.b)]; }
  }

  // Confirmed results once the deciding race is done (A Main / bracket champion /
  // group final), and the full ranking once the tournament is finalized. For
  // race-scoring formats the "standings" panel below already covers this.
  const finalized = tournament.status === "complete";
  let resultRows: { participantId: string; placement: number }[] = [];
  if (tournament.heat_mains && tournament.heat_mains.mains[0]?.results) {
    resultRows = heatMainsStandings(tournament.heat_mains);
  } else if (tournament.bracket && bracketChampion(tournament.bracket)) {
    resultRows = computeBracketPlacements(tournament.bracket);
  } else if (tournament.group_bracket && groupChampion(tournament.group_bracket)) {
    resultRows = computeGroupPlacements(tournament.group_bracket);
  }
  const resultsTitle = resultRows.length > 0 ? (finalized ? "Final rankings" : "Final results") : null;

  // Display phase drives what the board leads with:
  //   registration → the entry list; checkin → who's here vs not; racing → the
  //   race + standings. "In progress" before any race = the check-in window.
  const phase: "registration" | "checkin" | "racing" =
    racingStarted ? "racing" : tournament.status === "in_progress" ? "checkin" : "registration";
  const checkedIn = activeParticipants.filter((p) => p.status === "checked_in");
  const waiting = activeParticipants.filter((p) => p.status !== "checked_in");

  // Flights = participants grouped by team (team modes). Falls back to one flat
  // "Entries" flight for FFA. Shown before racing so the board isn't empty on a
  // freshly-opened tournament, and stays as a roster reference during the event.
  const hasTeams = activeParticipants.some((p) => p.team != null);
  const flights = hasTeams
    ? Object.entries(
        activeParticipants.reduce<Record<string, Participant[]>>((acc, p) => {
          const key = p.team != null ? `Flight ${p.team}` : "Unassigned";
          (acc[key] ??= []).push(p);
          return acc;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    : [["Entries", activeParticipants] as [string, Participant[]]];

  // Circuit personalization hook: an optional display accent + subtitle authored
  // on the tournament (settings.display). Additive — absent on free tournaments.
  const display = (s.display ?? {}) as { accent?: string; subtitle?: string };
  const accentStyle = live && display.accent
    ? ({ ["--tourney-accent" as string]: display.accent } as React.CSSProperties)
    : undefined;

  return (
    <main className="tourney-display" style={accentStyle}>
      <div className="tourney-display__inner">
        <header className="tourney-display__head">
          <p className="tourney-display__eyebrow">🏁 Tournament{live ? <span className="bgn-live-dot"> ● Live</span> : null}</p>
          <h1 className="tourney-display__title">{tournament.title}</h1>
          <p className="tourney-display__status">
            {tournament.status.replace(/_/g, " ")}
            {activeParticipants.length > 0 ? <> · {activeParticipants.length} {activeParticipants.length === 1 ? "entry" : "entries"}</> : null}
          </p>
          {live && display.subtitle ? <p className="tourney-display__subtitle">{display.subtitle}</p> : null}
        </header>

        {/* Now racing — bracket + heat/mains (the current match/heat/main). */}
        {nowLabel && (
          <section className="tourney-display__now">
            <span className="tourney-display__now-eyebrow">● Now racing</span>
            <span className="tourney-display__now-title">{nowLabel}</span>
            {nowNames.length > 0 && (
              <span className="tourney-display__now-names">
                {nowNames.length === 2 ? nowNames.join("  vs  ") : nowNames.join(" · ")}
              </span>
            )}
          </section>
        )}

        {/* Confirmed results / final rankings (bracket · heat-mains · groups). */}
        {resultsTitle && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">{resultsTitle}</h2>
            <ol className="tourney-display__standings">
              {resultRows.slice(0, finalized ? 32 : 16).map((row) => {
                const medal = row.placement === 1 ? "🥇" : row.placement === 2 ? "🥈" : row.placement === 3 ? "🥉" : null;
                return (
                  <li key={row.participantId} className="tourney-display__row">
                    <span className="tourney-display__rank">{medal ?? row.placement}</span>
                    <span className="tourney-display__name">{nameOf(row.participantId)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Now racing (race-scoring / randomizer) — heat-mains + bracket use the
            dedicated banner above, so suppress this one when that's showing. */}
        {randomizerOn ? (
          <RandomizerNowRacing rounds={rounds} live={randomizerLive} />
        ) : trackNow.race && !nowLabel ? (
          <div className="tournament-nowracing" style={{ fontSize: "var(--font-size-12)" }}>
            {trackNow.race.img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={getImagePath(trackNow.race.img)} alt="" className="tournament-nowracing__img" />
            ) : null}
            <div className="tournament-nowracing__body">
              <span className="tournament-nowracing__eyebrow">Now racing · {trackNow.index + 1} / {trackNow.total}</span>
              <span className="tournament-nowracing__name">{trackNow.race.sublabel || trackNow.race.label}</span>
            </div>
            <span className="tournament-nowracing__live">● LIVE</span>
          </div>
        ) : null}

        {/* Bracket / Heats → Mains / Groups — the generated structure. */}
        {tournament.bracket && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Bracket{bracketChampion(tournament.bracket) ? <span className="tourney-display__checkin-count">🏆 {nameOf(bracketChampion(tournament.bracket))}</span> : null}</h2>
            <div className="tourney-display__structure"><BracketView bracket={tournament.bracket} nameOf={nameOf} /></div>
          </section>
        )}
        {tournament.heat_mains && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Heats → Mains{heatMainsChampion(tournament.heat_mains) ? <span className="tourney-display__checkin-count">🏆 {nameOf(heatMainsChampion(tournament.heat_mains))}</span> : null}</h2>
            <div className="tourney-display__structure"><HeatMainsView hm={tournament.heat_mains} nameOf={nameOf} /></div>
          </section>
        )}
        {tournament.group_bracket && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Groups{groupChampion(tournament.group_bracket) ? <span className="tourney-display__checkin-count">🏆 {nameOf(groupChampion(tournament.group_bracket))}</span> : null}</h2>
            <div className="tourney-display__structure"><GroupBracketView gb={tournament.group_bracket} nameOf={nameOf} /></div>
          </section>
        )}

        {/* Upcoming randomized rounds — a look-ahead when the randomizer is on. */}
        {randomizerOn && rounds.length > 0 && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Randomized rounds</h2>
            <ol className="tourney-display__rounds">
              {rounds.map((r) => {
                const isNow = randomizerLive?.round === r.n;
                return (
                  <li key={r.n} className={`tourney-display__round${isNow ? " tourney-display__round--now" : ""}${r.revealed ? "" : " tourney-display__round--hidden"}`}>
                    <span className="tourney-display__round-n">Round {r.n}</span>
                    <span className="tourney-display__round-state">{isNow ? "● Now" : r.revealed ? "Revealed" : "Hidden"}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* Check-in board — the "in progress, not yet racing" window: who's here
            vs who we're still waiting on. */}
        {phase === "checkin" && activeParticipants.length > 0 && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Check-in <span className="tourney-display__checkin-count">{checkedIn.length}/{activeParticipants.length} here</span></h2>
            <div className="tourney-display__flights">
              <div className="tourney-display__flight">
                <h3 className="tourney-display__flight-name">✅ Checked in <span className="tourney-display__flight-count">{checkedIn.length}</span></h3>
                <ul className="tourney-display__entries">
                  {checkedIn.length === 0
                    ? <li className="tourney-display__entry tourney-display__entry--muted">No one yet</li>
                    : checkedIn.map((p) => <li key={p.id} className="tourney-display__entry tourney-display__entry--in">{p.display_name}</li>)}
                </ul>
              </div>
              <div className="tourney-display__flight">
                <h3 className="tourney-display__flight-name">⏳ Not checked in <span className="tourney-display__flight-count">{waiting.length}</span></h3>
                <ul className="tourney-display__entries">
                  {waiting.length === 0
                    ? <li className="tourney-display__entry tourney-display__entry--muted">Everyone&rsquo;s here</li>
                    : waiting.map((p) => <li key={p.id} className="tourney-display__entry tourney-display__entry--out">{p.display_name}</li>)}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Entry list — the pre-tournament roster (registration phase only). */}
        {phase === "registration" && activeParticipants.length > 0 && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">Who&rsquo;s playing</h2>
            <div className="tourney-display__flights">
              {flights.map(([name, members]) => (
                <div key={name} className="tourney-display__flight">
                  {hasTeams && <h3 className="tourney-display__flight-name">{name} <span className="tourney-display__flight-count">{members.length}</span></h3>}
                  <ul className="tourney-display__entries">
                    {members.map((p) => (
                      <li key={p.id} className="tourney-display__entry">{p.display_name}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live standings */}
        {standings.length > 0 && (
          <section className="tourney-display__panel">
            <h2 className="tourney-display__h2">{tournament.status === "complete" ? "Final standings" : "Live standings"}</h2>
            <ol className="tourney-display__standings">
              {standings.map((row, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                return (
                  <li key={row.participantId} className="tourney-display__row">
                    <span className="tourney-display__rank">{medal ?? i + 1}</span>
                    <span className="tourney-display__name">{row.name}</span>
                    <span className="tourney-display__pts">{row.points}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
