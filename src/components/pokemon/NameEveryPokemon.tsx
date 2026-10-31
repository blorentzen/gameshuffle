"use client";

/**
 * Name every Pokémon (search pages round, picks 2026-10-20): pick all 1,025 or
 * one generation and a clock, then type as many as you can. A name counts the
 * moment it's spelled right; Enter also takes a close spelling that can only
 * mean one Pokémon. The board shows every dex number, filling in as you go,
 * and at the end the ones you missed. Your best per set and clock stays in this
 * browser, and Share makes a score card. Names only, never art.
 * Rules in src/lib/pokemon/nameQuiz.ts.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Button, Input, Progress, Switch, Tabs } from "@empac/cascadeds";
import { IconFlag, IconRefresh } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { ShareButton } from "@/components/share/ShareButton";
import { POKEMON_TYPES } from "@/components/pokemon/TypeCard";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { GEN_REGIONS, pokemonByDex } from "@/lib/pokemon/generator";
import {
  clockLabel, clockText, endGame, nameIt, newGame, quizMatcher, readGame, secondsLeft, secondsUsed, setLabel, setPool, waitsForMore,
  QUIZ_CLOCKS, QUIZ_SETS, isQuizClock, isQuizSet, type QuizClock, type QuizGame, type QuizSet,
} from "@/lib/pokemon/nameQuiz";
import type { ShareRequest } from "@/lib/share/types";
import "@/styles/name-quiz.css";

const KEY = "gs-name-every-pokemon";
type Best = Record<string, { count: number; seconds: number }>;
const bestKey = (set: QuizSet, clock: QuizClock) => `${set}-${clock}`;
const nameOf = (dex: number) => pokemonByDex(dex)?.name ?? `#${dex}`;
/** A named Pokémon fills in with its first type's color (darkened under white text so it reads). */
function typeFill(type: string | undefined): CSSProperties {
  const t = POKEMON_TYPES[type ?? ""] ?? POKEMON_TYPES.Normal;
  const bg = t.ink === "dark" ? t.color : `color-mix(in srgb, ${t.color} 76%, #000)`;
  return { background: bg, borderColor: bg, color: t.ink === "dark" ? "#1c1a10" : "#ffffff" };
}
const pad = (dex: number) => `#${String(dex).padStart(dex >= 1000 ? 4 : 3, "0")}`;

interface Saved { set?: unknown; clock?: unknown; best?: Best; game?: unknown }

export function NameEveryPokemon() {
  const confirm = useConfirm();
  const [loaded, setLoaded] = useState(false);
  const [set, setSet] = useState<QuizSet>("all");
  const [clock, setClock] = useState<QuizClock>("standard");
  const [best, setBest] = useState<Best>({});
  const [game, setGame] = useState<QuizGame | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ good: boolean; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reveal, setReveal] = useState(false);
  const [newBest, setNewBest] = useState(false);
  const matcher = useMemo(() => quizMatcher(), []);
  const gameRef = useRef<QuizGame | null>(null);
  const waitRef = useRef<number | null>(null);
  const recorded = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { gameRef.current = game; }, [game]);

  // This browser's last set, clock, bests and any game in progress.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
      /* eslint-disable react-hooks/set-state-in-effect -- read once from this browser */
      if (isQuizSet(saved.set)) setSet(saved.set);
      if (isQuizClock(saved.clock)) setClock(saved.clock);
      if (saved.best && typeof saved.best === "object") setBest(saved.best);
      const g = readGame(saved.game);
      if (g) { setGame(g); recorded.current = g.endedAt ? g.startedAt : null; }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* private window or bad data: start fresh */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(KEY, JSON.stringify({ set, clock, best, game })); } catch { /* storage blocked */ }
  }, [loaded, set, clock, best, game]);

  // The clock: ticks while a game runs and ends it at zero.
  const running = !!game && !game.endedAt;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const g = gameRef.current;
      if (g && !g.endedAt && secondsLeft(g, t) === 0) setGame(endGame(g, "time", t));
    }, 250);
    return () => window.clearInterval(id);
  }, [running]);

  // A finished game: keep the best and count it once.
  useEffect(() => {
    if (!game?.endedAt || recorded.current === game.startedAt) return;
    recorded.current = game.startedAt;
    const k = bestKey(game.set, game.clock);
    const seconds = secondsUsed(game);
    const was = best[k];
    const better = !was || game.named.length > was.count || (game.named.length === was.count && seconds < was.seconds);
    /* eslint-disable react-hooks/set-state-in-effect -- once per finished game */
    setNewBest(better && game.named.length > 0);
    if (better && game.named.length > 0) setBest((b) => ({ ...b, [k]: { count: game.named.length, seconds } }));
    /* eslint-enable react-hooks/set-state-in-effect */
    track(EVENTS.nameQuizFinished, { set: game.set, clock: game.clock, count: game.named.length, reason: game.reason ?? "time" });
  }, [game, best]);

  const start = () => {
    const g = newGame(set, clock);
    recorded.current = null;
    setGame(g); setText(""); setNote(null); setReveal(false); setNewBest(false); setNow(Date.now());
    track(EVENTS.nameQuizStarted, { set, clock });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const giveUp = async () => {
    const g = gameRef.current;
    if (!g || g.endedAt) return;
    if (!(await confirm({ title: "Give up?", body: "You'll see the ones you missed.", confirmLabel: "Give up" }))) return;
    setGame(endGame(g, "gave-up"));
  };

  /** Tries what's typed. `loose` = Enter (close spellings count too). */
  const attempt = (raw: string, loose: boolean) => {
    const g = gameRef.current;
    if (!g || g.endedAt) return;
    const cands = loose ? matcher.loose(raw) : matcher.exact(raw);
    if (!cands) {
      if (loose && raw.trim()) setNote({ good: false, text: `"${raw.trim()}" isn't a Pokémon we know. Check the spelling.` });
      return;
    }
    const { game: next, result } = nameIt(g, cands);
    if (result.kind === "named") {
      gameRef.current = next;
      setGame(next);
      setNote({ good: true, text: `${nameOf(result.dex)} ${pad(result.dex)}` });
    } else if (result.kind === "already") {
      setNote({ good: false, text: `Already named ${nameOf(result.dex)}.` });
    } else if (result.kind === "other-set") {
      setNote({ good: false, text: `${nameOf(result.dex)} isn't in ${setLabel(g.set)}.` });
    }
    setText("");
  };

  const onType = (v: string) => {
    setText(v);
    if (waitRef.current) { window.clearTimeout(waitRef.current); waitRef.current = null; }
    const g = gameRef.current;
    if (!g || !matcher.exact(v)) return;
    // "Mew" could still become "Mewtwo": count it after a moment unless more is typed.
    if (waitsForMore(v, g)) { waitRef.current = window.setTimeout(() => attempt(v, false), 900); return; }
    attempt(v, false);
  };

  if (!loaded) return <div className="tool-panel nq" aria-busy="true" />;

  const pool = game ? setPool(game.set) : setPool(set);
  const named = new Set(game?.named ?? []);
  const left = game ? secondsLeft(game, now) : null;
  const used = game ? secondsUsed(game, now) : 0;
  const ended = !!game?.endedAt;
  const gens = [...new Set(pool.map((p) => p.gen))];
  const shareReq: ShareRequest | null = ended && game ? { kind: "names", names: { set: game.set, clock: game.clock, named: game.named, seconds: secondsUsed(game) } } : null;
  const myBest = best[bestKey(game?.set ?? set, game?.clock ?? clock)];

  return (
    <div className="nq">
      {!game ? (
        <div className="tool-panel nq-setup">
          <div className="nq-setup__grid">
            <Select
              floatingLabel="Which Pokémon"
              value={set}
              onChange={(v) => isQuizSet(v) && setSet(v)}
              options={QUIZ_SETS.map((s) => ({ value: s, label: s === "all" ? setLabel(s) : `${setLabel(s)} (${setPool(s).length})` }))}
            />
            <div className="nq-setup__clock">
              <span className="nq-label" id="nq-clock-label">Clock</span>
              <Tabs
                variant="pills"
                size="small"
                fullWidth
                activeTab={clock}
                onChange={(id) => isQuizClock(id) && setClock(id)}
                tabs={QUIZ_CLOCKS.map((c) => ({ id: c, label: c === "none" ? "No limit" : clockLabel(set, c).replace(" minutes", " min"), content: null }))}
                className="nq-tabs"
              />
            </div>
          </div>
          <p className="nq-muted">
            {pool.length.toLocaleString("en-US")} Pokémon, {clockLabel(set, clock).toLowerCase()}. A name counts as soon as it&apos;s spelled right; press Enter for a close spelling.
            {myBest ? ` Your best here: ${myBest.count.toLocaleString("en-US")} in ${clockText(myBest.seconds)}.` : ""}
          </p>
          <div><Button variant="primary" onClick={start}>Start</Button></div>
        </div>
      ) : (
        <div className="tool-panel nq-play">
          <div className={`nq-bar${ended ? " is-ended" : ""}`}>
            <div className="nq-bar__stats">
              <p className="nq-count" aria-live="off"><strong>{named.size.toLocaleString("en-US")}</strong> of {pool.length.toLocaleString("en-US")}</p>
              {!ended && (
                <p className={`nq-clock${left != null && left <= 30 ? " is-low" : ""}`}>
                  {left != null ? clockText(left) : clockText(used)}
                  <span className="sr-only">{left != null ? " left" : " played"}</span>
                </p>
              )}
            </div>
            <Progress value={named.size} max={pool.length} size="small" label={`${named.size} of ${pool.length} named`} className="admin-progress-quiet" />
            {!ended && (
              <div className="nq-bar__type">
                <Input
                  ref={inputRef}
                  floatingLabel="Type a Pokémon"
                  value={text}
                  onChange={(e) => onType(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (waitRef.current) { window.clearTimeout(waitRef.current); waitRef.current = null; } attempt(text, true); } }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  fullWidth
                  size="large"
                />
                <Button variant="ghost" size="small" iconBefore={IconFlag} onClick={() => void giveUp()}>Give up</Button>
              </div>
            )}
            {!ended && <p className={`nq-note${note?.good ? " is-good" : ""}`} role="status" aria-live="polite">{note?.text ?? ""}</p>}
          </div>

          {ended && game && (
            <section className="nq-result" aria-labelledby="nq-result-title">
              <h2 id="nq-result-title" className="nq-result__title">
                {game.reason === "done" ? `You named every one of the ${pool.length.toLocaleString("en-US")}!` : `You named ${named.size.toLocaleString("en-US")} of ${pool.length.toLocaleString("en-US")}`}
              </h2>
              <p className="nq-muted">
                {game.reason === "time" ? "Time's up. " : ""}{setLabel(game.set)}, {clockLabel(game.set, game.clock).toLowerCase()}, in {clockText(secondsUsed(game))}.{" "}
                {newBest ? "Your new best." : myBest ? `Your best: ${myBest.count.toLocaleString("en-US")} in ${clockText(myBest.seconds)}.` : ""}
              </p>
              <div className="nq-result__actions">
                <ShareButton
                  request={shareReq}
                  game="names"
                  fallbackUrl="https://www.gameshuffle.co/name-every-pokemon"
                  title="Name every Pokémon"
                  text={(url) => `I named ${named.size.toLocaleString("en-US")} of ${pool.length.toLocaleString("en-US")} Pokémon${game.set === "all" ? "" : ` (${setLabel(game.set)})`} in ${clockText(secondsUsed(game))}. How many can you name?\n${url}`}
                />
                <Button variant="secondary" iconBefore={IconRefresh} onClick={() => setGame(null)}>Play again</Button>
                {game.reason !== "done" && <Switch label="Show the ones I missed" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />}
              </div>
            </section>
          )}

          <div className="nq-board">
            {gens.map((gen) => {
              const list = pool.filter((p) => p.gen === gen);
              const got = list.filter((p) => named.has(p.dex)).length;
              return (
                <section key={gen} className="nq-gen" aria-labelledby={`nq-gen-${gen}`}>
                  <h2 id={`nq-gen-${gen}`} className="nq-gen__title">
                    Gen {gen}{GEN_REGIONS[gen] ? ` · ${GEN_REGIONS[gen]}` : ""} <span className="nq-gen__count">{got} of {list.length}</span>
                  </h2>
                  <ol className="nq-grid">
                    {list.map((p) => {
                      const has = named.has(p.dex);
                      const missed = ended && reveal && !has;
                      return (
                        <li key={p.dex} className={`nq-cell${has ? " is-named" : ""}${missed ? " is-missed" : ""}`} style={has ? typeFill(p.types[0]) : undefined}>
                          <span className="nq-cell__num">{pad(p.dex)}</span>
                          <span className="nq-cell__name">{has || missed ? p.name : <span className="sr-only">not named yet</span>}</span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

