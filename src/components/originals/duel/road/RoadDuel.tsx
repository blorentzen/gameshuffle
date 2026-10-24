"use client";

/**
 * A trainer's page on Trainer Road (picks 2026-10-23, https://claude.ai/artifact/Va86Xd5w5G44gPudmzsKDe):
 * their teams (one per game; pick one), that team's duel this month (their team, your six, Normal or
 * Hard, your best and par once you've played, Battle now), the arena while you play (the Daily
 * Duel's own, DuelArena), the result with its stars, and the team's board. Every run counts and
 * your best this month is kept; stars and the board need a free account.
 *
 * Its parts are direct children of the page's `.duel-page` column, so the arena gets the Daily
 * Duel's widths; while a duel is on, everything marked `road-quiet` steps aside (trainer-road.css).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconArrowRight, IconRoute, IconSkull, IconStar, IconStarFilled, IconSwords } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { guestRequestId, storedGuestId } from "@/components/originals/DailyBoard";
import { formatTime } from "@/lib/originals/dailies";
import type { DuelCardView } from "@/lib/originals/duel/view";
import type { RoadBoardRow, RoadPathResult, RoadPathView, RoadProgressView, RoadRunView, RoadTeamHome } from "@/lib/originals/duel/roadView";
import { pathSpot } from "@/lib/originals/duel/roadPath";
import { useRoadPath } from "./RoadPath";
import { battleLabel, encounterLine } from "./RoadEncounter";
import { DuelArena } from "../DuelArena";
import { DuelScoreCard, LevelTag, PracticeButton } from "../DuelEnd";
import { DuelModePick, DuelTeamCards, LEVEL_KEY, openLevel, readLevel, type DuelLevelPick } from "../DuelStart";
import { DuelZoom } from "../DuelZoom";
import { CardThumb } from "../DuelBits";
import { TrainerArt } from "../TrainerArt";
import { reducedMotion } from "../duelLook";
import { useDuelPlay } from "../useDuelPlay";
import { EVENTS, track } from "@/lib/analytics/events";

export interface RoadTeamOption {
  id: string;
  gameLabel: string;
  title: string;
  tierLabel: string;
  species: string[];
}


function roadFetch(path: string, init: RequestInit & { makeGuest?: boolean } = {}) {
  const { makeGuest, ...rest } = init;
  const id = makeGuest ? guestRequestId() : storedGuestId();
  return fetch(path, { ...rest, headers: { ...(rest.headers ?? {}), ...(id ? { "x-daily-guest": id } : {}), ...(rest.body ? { "Content-Type": "application/json" } : {}) } });
}
const runPath = (id: string) => `/api/trainer-road/${id}`;

const noop = () => () => {};
const urlTeam = () => new URLSearchParams(window.location.search).get("team");

/** "1 turn" / "3 turns". */
const turnsWord = (n: number) => `${n} ${n === 1 ? "turn" : "turns"}`;

/** Three stars, filled up to `n`. */
export function RoadStars({ n, size = 18 }: { n: number; size?: number }) {
  return (
    <span className="road-stars" role="img" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (i < n ? <IconStarFilled key={i} size={size} aria-hidden="true" className="road-stars__on" /> : <IconStar key={i} size={size} aria-hidden="true" className="road-stars__off" />))}
    </span>
  );
}

/** A player's stars per team this month (accounts; an empty map for guests). Shared by the region tiles and the team list. */
export function useRoadStars(refresh = 0): Record<string, number> {
  const [stars, setStars] = useState<Record<string, number>>({});
  useEffect(() => {
    let live = true;
    void roadFetch("/api/trainer-road?stars=1").then((r) => (r.ok ? r.json() : null)).then((b: { stars?: Record<string, number> } | null) => { if (live && b?.stars) setStars(b.stars); }).catch(() => {});
    return () => { live = false; };
  }, [refresh]);
  return stars;
}

export function RoadDuel({ region, person, teams, next }: {
  region: string;
  person: { name: string; slug: string };
  teams: RoadTeamOption[];
  /** The next trainer on the road (the result's "Next" button). */
  next: { href: string; name: string } | null;
}) {
  const toast = useToast();
  const fromUrl = useSyncExternalStore(noop, urlTeam, () => null);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? (fromUrl && teams.some((t) => t.id === fromUrl) ? fromUrl : teams[0].id);
  const team = teams.find((t) => t.id === selected) ?? teams[0];
  const [home, setHome] = useState<RoadTeamHome | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [zoom, setZoom] = useState<{ card: DuelCardView; owner: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const stars = useRoadStars(refresh);
  const spot = pathSpot(selected);
  const { progress, path } = useRoadPath(spot?.region ?? null, refresh);
  const [level, setLevel] = useState<DuelLevelPick>(() => readLevel());
  const pickLevel = useCallback((l: DuelLevelPick) => {
    setLevel(l);
    try { window.localStorage.setItem(LEVEL_KEY, l); } catch { /* private window */ }
  }, []);
  // This team's duel; while it's still being built, check back every 8 seconds (up to about 3 minutes).
  useEffect(() => {
    let live = true;
    let tries = 0;
    let timer: number | null = null;
    const fetchHome = async () => {
      const res = await roadFetch(`/api/trainer-road?team=${encodeURIComponent(selected)}`).catch(() => null);
      if (!live) return;
      if (!res?.ok) { setFailed(true); return; }
      const h = (await res.json()) as RoadTeamHome;
      if (!live) return;
      setFailed(false);
      setHome(h);
      if (!h.ready && tries++ < 20) timer = window.setTimeout(() => void fetchHome(), 8000);
    };
    void fetchHome();
    return () => { live = false; if (timer) window.clearTimeout(timer); };
  }, [selected, refresh]);

  const play = useDuelPlay<RoadRunView>({
    fetcher: roadFetch,
    runPath,
    onFinished: (r) => {
      track(EVENTS.roadFinished, { won: r.result === "won", stars: r.stars ?? 0, tier: r.trainer.tier, level: r.level });
      for (const o of r.path?.outcomes ?? []) {
        if (o.kind === "badge") track(EVENTS.roadBadge, { region });
        if (o.kind === "region") track(EVENTS.roadCleared, { region });
        if (o.kind === "encounter_beaten") track(EVENTS.roadEncounterBeaten, { region, kind: home?.encounter?.view.kind ?? "grunt" });
        if (o.kind === "encounter" && r.path?.encounter) track(EVENTS.roadEncounter, { region: r.path.encounter.region, kind: r.path.encounter.kind });
      }
      setRefresh((n) => n + 1);
    },
  });

  const pickTeam = (id: string) => {
    if (id === selected) return;
    setPicked(id);
    setHome(null);
    play.clear();
    const url = new URL(window.location.href);
    url.searchParams.set("team", id);
    window.history.replaceState(null, "", url);
  };

  const scrollToArena = () => requestAnimationFrame(() => {
    const top = document.querySelector(".road-page .duel-arena")?.getBoundingClientRect().top;
    if (top !== undefined) window.scrollTo({ top: Math.max(0, window.scrollY + top - 80), behavior: reducedMotion() ? "auto" : "smooth" });
  });

  const start = async (want: DuelLevelPick) => {
    if (starting) return;
    setStarting(true);
    const res = await roadFetch("/api/trainer-road", { method: "POST", makeGuest: true, body: JSON.stringify({ action: "start", team: selected, level: want }) }).catch(() => null);
    setStarting(false);
    if (!res?.ok) {
      const err = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      toast.error(err === "hard_off" ? "Hard isn't open for this duel. Pick Normal to play." : err === "easy_off" ? "Easy isn't open for this duel. Pick Normal to play." : err === "not_ready" ? "This duel isn't ready yet. Try again in a moment." : err === "rate_limited" ? "Slow down a little, then try again." : "Couldn't start the duel. Try again in a moment.");
      return;
    }
    const body = (await res.json()) as { run: RoadRunView };
    track(EVENTS.roadStarted, { tier: body.run.trainer.tier, level: body.run.level, region });
    play.take(body.run, { fresh: true });
    scrollToArena();
  };

  const zoomer = <DuelZoom card={zoom?.card ?? null} owner={zoom?.owner ?? ""} onClose={() => setZoom(null)} />;
  const onZoom = (card: DuelCardView, owner: string) => setZoom({ card, owner });
  const their = `${person.name}'s`;
  const run = play.run;

  // The arena: a duel being played, or one that just ended (holding its last frame a moment).
  if (run && play.frame && (run.status === "playing" || play.holding)) {
    return (
      <>
        <DuelArena run={run} play={play.frame.play} motion={play.frame.motion} busy={play.busy || play.staging || run.status !== "playing"} staging={play.staging} offset={play.offset}
          onNext={play.onNext} onBring={play.onBring} onTurn={play.onTurn} onTip={play.onTip} onZoom={onZoom} onSkip={play.endBeats}
          askBody="You'll lose this duel's solo bonus: 150 points off its score." />
        {zoomer}
      </>
    );
  }

  const board = home?.ready ? <RoadBoard home={home} team={team} /> : null;

  if (run && run.status === "done" && home) {
    return (
      <>
        <RoadEnd run={run} home={home} team={team} next={next} region={region} person={person}
          onAgain={(l) => void start(l)} onBack={() => play.clear()} onZoom={onZoom} />
        {board}
        {zoomer}
      </>
    );
  }

  return (
    <>
      {teams.length > 1 && (
        <section className="road-teams" aria-labelledby="road-teams-title">
          <h2 id="road-teams-title" className="road-section__title">{their} teams</h2>
          <ul className="road-teams__list">
            {teams.map((t) => (
              <li key={t.id}>
                <button type="button" className="road-team" aria-pressed={t.id === selected} onClick={() => pickTeam(t.id)}>
                  <span className="road-team__game">{t.gameLabel}</span>
                  <span className="road-team__meta">{t.tierLabel} · {t.species.length} Pokémon{stars[t.id] != null ? <> · <RoadStars n={stars[t.id]} size={14} /></> : null}</span>
                  <span className="road-team__species">{t.species.join(", ")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="road-start" aria-labelledby="road-start-title">
        <div className="road-start__head">
          <p className="road-start__kicker">{team.tierLabel} · {team.gameLabel}</p>
          <h2 id="road-start-title" className="road-start__title">Duel {person.name}</h2>
          {teams.length === 1 && <p className="road-start__species">{team.species.join(", ")}</p>}
        </div>
        {failed && <p className="duel-note">This duel couldn&apos;t load. Refresh the page to try again.</p>}
        {!failed && !home && <p className="duel-note" aria-live="polite">Loading the duel…</p>}
        {home && !home.ready && <p className="duel-note" aria-live="polite">This month&apos;s duel against this team is being built. It&apos;s usually ready within a minute, and this page checks on its own.</p>}
        {home?.ready && home.trainer && (
          <>
            <p className="road-start__sig"><b>{their} own event, {home.trainer.signature.title}{/[.!?]$/.test(home.trainer.signature.title) ? "" : ":"}</b> {home.trainer.signature.text}</p>
            <div className="road-start__side">
              <p className="road-start__label">{their} team</p>
              <DuelTeamCards team={home.team} owner={their} onZoom={(c) => onZoom(c, their)} />
            </div>
            <div className="road-start__side">
              <p className="road-start__label">Your six, the same for everyone this month{home.bring < home.pack.length ? `. Bring ${home.bring}.` : ""}</p>
              <div className="road-start__cards" role="group" aria-label="Your six">
                {home.pack.map((c) => <CardThumb key={c.index} card={c} size="md" onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card`} />)}
              </div>
            </div>
            {home.encounter?.role === "villain" ? (
              <p className="road-start__path road-start__path--villain"><IconSkull size={18} aria-hidden="true" />{encounterLine(home.encounter.view)}</p>
            ) : home.encounter?.role === "blocked" ? (
              <p className="road-start__path road-start__path--blocked"><IconSkull size={18} aria-hidden="true" />
                <span>{home.encounter.view.name} is blocking the road: a win here won&apos;t count for {home.encounter.view.blocks.label} until you beat them. <Link href={home.encounter.view.href}>{battleLabel(home.encounter.view)}</Link></span>
              </p>
            ) : (
              <RoadPathLine team={selected} path={spot ? path : null} progress={progress} signedIn={home.signedIn} />
            )}
            <DuelModePick easy={home.easy} hard={{ can: home.hard.can, why: home.hard.can ? "ok" : "off" }} comeback={home.comeback} level={openLevel(level, home)} onLevel={pickLevel} offText="Not open for this duel" stars />
            <RoadYours home={home} />
            {home.current && (
              <p className="road-start__resume">You have a duel in progress against this team. <Button variant="ghost" size="small" onClick={() => { play.resume(home.current as RoadRunView); scrollToArena(); }}>Pick it up</Button></p>
            )}
            <div className="road-start__go">
              <Button variant="primary" size="large" iconBefore={IconSwords} onClick={() => void start(openLevel(level, home))} disabled={starting} loading={starting}>Battle now</Button>
              <p className="road-start__note">Every duel counts: your best this month stays on the board. The clock starts when you tap Battle now.</p>
            </div>
          </>
        )}
      </section>
      {board}
      {zoomer}
    </>
  );
}

/** Where this team sits on your path ("On your path: win for Brock's badge, 1 of 8"). Nothing for free-play teams. */
function RoadPathLine({ team, path, progress, signedIn }: { team: string; path: RoadPathView | null; progress: RoadProgressView | null; signedIn: boolean }) {
  if (!path) return null;
  const steps = [...path.gyms, ...path.league, path.endgame];
  const step = steps.find((s) => s.team === team);
  if (!step) return null;
  const where = step.kind === "gym" ? `${step.label}, ${step.index + 1} of ${path.gyms.length}` : step.kind === "league" ? `${path.leagueLabel}, challenge ${step.index + 1} of ${path.league.length}` : `the end-game battle that clears ${path.regionName}`;
  let line: string;
  if (!signedIn) line = `On the ${path.regionName} path: ${where}. A free account follows the path for you.`;
  else if (step.state === "next") line = step.kind === "gym" ? `On your path: win for ${where}.` : step.kind === "league" ? `On your path: ${where}. Lose and you start again from ${path.league[0].name}.` : `On your path: win ${where}.`;
  else if (step.state === "done") line = step.kind === "league" && !path.leagueDone ? `Beaten in this ${path.leagueLabel} run.` : `Done on your path: ${step.kind === "endgame" ? `${path.regionName} cleared` : where}.`;
  else if (step.state === "locked") line = `On the ${path.regionName} path, which opens once you clear ${path.openedBy}.`;
  else line = `Later on your path (${where}).${progress?.next ? ` Next up: ${progress.next.name}.` : ""}`;
  return <p className={`road-start__path is-${step.state}`}><IconRoute size={18} aria-hidden="true" />{line}</p>;
}

/** Your best against this team this month, and par once you've played it. */
function RoadYours({ home }: { home: RoadTeamHome }) {
  const b = home.best;
  if (!b && home.par == null) return null;
  return (
    <p className="road-yours">
      {b && <><span>Your best this month</span> <RoadStars n={b.stars} size={16} /> <b>{b.score.toLocaleString("en-US")}</b>{b.level === "hard" && <span className="daily-board__hard">Hard</span>}{b.level === "easy" && <span className="daily-board__hard daily-board__easy">Easy</span>}</>}
      {home.par != null && <span className="road-yours__par">Par {home.par}{home.hard.par ? `, Hard ${home.hard.par}` : ""}</span>}
    </p>
  );
}

/** What the next star needs (Easy tops out at two: the third needs Normal or Hard). */
function nextStarLine(stars: number, par: number, level: DuelLevelPick): string {
  if (level === "easy") return stars === 1 ? `Win within ${turnsWord(par + 2)} for a second star. The third needs a win in ${par} on Normal or Hard.` : `The third star needs a win in ${turnsWord(par)} on Normal or Hard.`;
  return stars === 1 ? `Win within ${turnsWord(par + 2)} for a second star, in ${par} for all three.` : `Win in ${turnsWord(par)} for the third star.`;
}

function parLine(run: RoadRunView): string | null {
  if (run.par == null) return null;
  if (run.result !== "won") return `This team can be beaten in ${turnsWord(run.par)}.`;
  const over = run.turns - run.par;
  if (over < 0) return `${turnsWord(-over)} under par.`;
  if (over === 0) return "Right on par.";
  return `${turnsWord(over)} over par.`;
}

function RoadEnd({ run, home, team, next, region, person, onAgain, onBack, onZoom }: {
  run: RoadRunView;
  home: RoadTeamHome;
  team: RoadTeamOption;
  next: { href: string; name: string } | null;
  region: string;
  person: { name: string; slug: string };
  onAgain: (level: DuelLevelPick) => void;
  onBack: () => void;
  onZoom: (card: DuelCardView, owner: string) => void;
}) {
  const won = run.result === "won";
  const name = run.trainer.name;
  const their = `${name}'s`;
  const p = run.play;
  const knocked = p.foe.filter((c) => c.out).length;
  const stars = run.stars ?? 0;
  const signUp = `/signup?redirect=${encodeURIComponent(`/pokemon-trainers/${region}/${person.slug}?team=${team.id}`)}`;
  const router = useRouter();
  const blocking = run.path?.encounter ?? null;
  const nextUp = blocking ? { href: blocking.href, label: battleLabel(blocking) }
    : run.path?.next ? { href: run.path.next.href, label: `Next on your path: ${run.path.next.name}` } : next ? { href: next.href, label: `Next: ${next.name}` } : null;
  return (
    <div className="duel-end road-end">
      <section className="duel-result" aria-labelledby="duel-result-title" tabIndex={-1} id="duel-result">
        {run.trainer.picture && <TrainerArt picture={run.trainer.picture} shape="round" className="duel-result__face" />}
        <p className="duel-result__kicker">{team.gameLabel} team<LevelTag level={run.level} /></p>
        <h2 id="duel-result-title" className="duel-result__title">{won ? `You beat ${name} in ${turnsWord(run.turns)}` : `${name} wins this one`}</h2>
        {won && <div className="road-end__stars"><RoadStars n={stars} size={34} />{run.best && home.signedIn && <span className="road-end__best">New best</span>}</div>}
        {run.score && <DuelScoreCard score={run.score} won={won} level={run.level} askedNote="You asked the professor in this duel, so there's no solo bonus." />}
        <dl className="duel-result__stats">
          {won ? <div><dt>Turns</dt><dd>{run.turns}</dd></div> : <div><dt>Knocked out</dt><dd>{knocked} of {p.foe.length}</dd></div>}
          {run.par != null && <div><dt>Par</dt><dd>{run.par}</dd></div>}
          {run.seconds != null && <div><dt>Time</dt><dd>{formatTime(run.seconds)}</dd></div>}
          <div><dt>Cards left</dt><dd>{run.cardsLeft} of {p.you.filter((c) => !c.sat).length}</dd></div>
        </dl>
        {parLine(run) && <p className="duel-result__line">{parLine(run)}</p>}
        {won && stars < 3 && run.par != null && <p className="duel-result__small">{nextStarLine(stars, run.par, run.level)}</p>}
        {!home.signedIn && <p className="duel-result__small"><Link href={signUp}>Make a free account</Link> to keep your stars, follow the path and get on this team&apos;s board.</p>}
        {run.path && <RoadPathGains gains={run.path} />}
        <div className="duel-result__sides">
          <div>
            <p className="duel-result__label">{p.you.some((c) => c.sat) ? "Your team" : "Your six"}</p>
            <div className="duel-result__cards">{p.you.filter((c) => !c.sat).map((c) => <CardThumb key={c.index} card={c} onPress={() => onZoom(c, "Your")} label={`See the ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP left`}`} />)}</div>
          </div>
          <div>
            <p className="duel-result__label">{their} team</p>
            <div className="duel-result__cards">{p.foe.map((c) => <CardThumb key={c.index} card={c} onPress={() => onZoom(c, their)} label={`See ${their} ${c.name} card${c.out ? ", knocked out" : `, ${c.cur} of ${c.hp} HP left`}`} />)}</div>
          </div>
        </div>
        {/* Three actions at most (Britton, 2026-10-24): after a win the next trainer leads, after a loss playing again does. */}
        <div className="duel-result__actions">
          {won && nextUp && <Button variant="primary" iconBefore={blocking ? IconSwords : undefined} iconAfter={blocking ? undefined : IconArrowRight}
            onClick={() => { if (blocking) track(EVENTS.roadEncounterClicked, { from: "result", kind: blocking.kind }); router.push(nextUp.href); }}>{nextUp.label}</Button>}
          <PracticeButton label="Play again" level={run.level} hardCan={home.hard.can} easyCan={home.easy.can} onPractice={onAgain} variant={won && nextUp ? "secondary" : "primary"} />
          {!won && nextUp && <Button variant="secondary" iconAfter={IconArrowRight} onClick={() => router.push(nextUp.href)}>{nextUp.label}</Button>}
          <Button variant="ghost" onClick={onBack}>Back to {their} teams</Button>
        </div>
      </section>
    </div>
  );
}

/** What the duel did to your path: the milestones, XP (and a new level), tokens and a new card color. */
function RoadPathGains({ gains }: { gains: RoadPathResult }) {
  const levelUp = gains.level > gains.levelBefore;
  const newColor = gains.color !== gains.colorBefore;
  if (!gains.outcomes.length && !gains.xp) return null;
  return (
    <div className="road-gains" role="status">
      {gains.outcomes.map((o, i) => (
        <div key={`${o.kind}-${i}`} className={`road-gains__item road-gains__item--${o.kind}`}>
          {o.kind === "encounter" && gains.encounter?.picture && <span className="road-gains__art" aria-hidden="true"><TrainerArt picture={gains.encounter.picture} shape="tile" /></span>}
          <div>
            <p className="road-gains__title">{o.title}</p>
            <p className="road-gains__line">{o.line}</p>
          </div>
        </div>
      ))}
      <p className="road-gains__xp">
        {gains.xp > 0 && <span><b>+{gains.xp.toLocaleString("en-US")} XP</b>{levelUp ? `, up to level ${gains.level}` : ""}</span>}
        {gains.tokens > 0 && <span className="road-gains__tokens">+{gains.tokens.toLocaleString("en-US")} tokens</span>}
        {newColor && <span>Your trainer card turned {gains.colorLabel.toLowerCase()}.</span>}
      </p>
      {gains.xp === 0 && gains.outcomes.length > 0 && <p className="road-gains__small">You beat this team earlier this month, so no XP for the win itself.</p>}
    </div>
  );
}

/** This team's board this month: each account's best run, score first, then time. */
function RoadBoard({ home, team }: { home: RoadTeamHome; team: RoadTeamOption }) {
  const rows: RoadBoardRow[] = home.you && !home.board.some((r) => r.you) ? [...home.board, home.you] : home.board;
  return (
    <section className="road-board road-quiet" aria-labelledby="road-board-title">
      <h2 id="road-board-title" className="road-section__title">This month&apos;s board</h2>
      {rows.length === 0 ? (
        <p className="duel-note">Nobody&apos;s on this board yet this month. Win to be first.</p>
      ) : (
        <div className="daily-board__table" tabIndex={0} role="region" aria-label={`${team.gameLabel} team board this month`}>
          <Table dense>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Player</TableHead>
                <TableHead>Stars</TableHead>
                <TableHead align="right">Time</TableHead>
                <TableHead align="right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={`${r.place}-${i}`} className={r.you ? "daily-board__you" : undefined}>
                  <TableCell><strong>{r.place}</strong></TableCell>
                  <TableCell>
                    <span className="daily-board__who">
                      {r.profile ? <Link href={r.profile}>{r.name}</Link> : <span>{r.name}</span>}
                      {r.hard && <span className="daily-board__hard">Hard</span>}{r.easy && <span className="daily-board__hard daily-board__easy">Easy</span>}
                    </span>
                  </TableCell>
                  <TableCell>{r.won ? <RoadStars n={r.stars} size={14} /> : "Lost"}</TableCell>
                  <TableCell align="right"><span className="daily-board__time">{r.seconds != null ? formatTime(r.seconds) : ""}</span></TableCell>
                  <TableCell align="right"><strong>{r.score.toLocaleString("en-US")}</strong></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="road-board__foot">{team.gameLabel} team{home.players > 0 ? ` · ${home.players} ${home.players === 1 ? "player" : "players"}` : ""} · each player&apos;s best duel this month, ties to the faster time{home.signedIn ? "" : " · a free account puts you on it"}</p>
    </section>
  );
}
