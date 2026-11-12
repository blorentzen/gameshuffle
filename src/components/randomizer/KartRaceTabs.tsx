"use client";

/**
 * The Race and Battle tabs shared by the retro Mario Kart randomizers (Mario Kart DS, Mario Kart 7, Super Mario
 * Kart). Each is a hook so its state lives in the randomizer (tabs unmount when you switch away, and the save button
 * needs the rolls): `useKartRaces` rolls a cup in its order or races from every cup with an engine class,
 * `useKartBattles` rolls battles, a course and a mode each. Both return the tab's content as `node`, and the roll and
 * a setter for loading a saved setup.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Button, Select } from "@empac/cascadeds";
import type { SelectedTrack } from "@/data/types";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { TrackList } from "@/components/randomizer/TrackList";
import { pick } from "@/lib/party/roll";
import { rollBattleList, rollEngineFrom, rollRaceList, type BattleRoll } from "@/lib/randomizers/raceLists";
import "@/styles/kart-races.css";

export interface KartRaceCourse { name: string; laps?: number; sections?: boolean }
export interface KartRaceCup { name: string; slug: string; kind?: string; courses: KartRaceCourse[] }
/** One choice in the Race list Select: `races` = races from every cup; otherwise a cup, of `cupKind` when set. */
export interface KartRaceKind { value: string; label: string; races?: boolean; cupKind?: string }
/** What was rolled: a cup (its slug) or races from every cup (`cupSlug` null), with the engine class. */
export interface KartRacesRoll { title: string; engine: string | null; courses: string[]; cupSlug: string | null }

const toggle = (cur: string[], v: string) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);

export function useKartRaces(o: {
  cups: KartRaceCup[];
  engines: string[];
  kinds: KartRaceKind[];
  counts: number[];
  defaultCount: number;
  /** The laps a race usually has; other counts get a note on the tile. */
  laps: number;
  courseArt: (name: string) => string | null;
  cupArt: (slug: string) => string | null;
  animate: boolean;
  /** The line under the tab's heading. */
  line: string;
  /** The explainer at the bottom of the options drawer. */
  note: ReactNode;
  onRolled?: (p: { kind: string; count: number; engine: string }) => void;
}) {
  const [kind, setKind] = useState(o.kinds[0].value);
  const [count, setCount] = useState(String(o.defaultCount));
  const [engines, setEngines] = useState<string[]>([]);
  const [races, setRaces] = useState<KartRacesRoll | null>(null);
  const [spins, setSpins] = useState(0);
  const all = useMemo(() => o.cups.flatMap((c) => c.courses), [o.cups]);
  const kindInfo = o.kinds.find((k) => k.value === kind) ?? o.kinds[0];

  const roll = () => {
    const engine = rollEngineFrom(o.engines, engines);
    let rolled: KartRacesRoll;
    if (kindInfo.races) {
      const n = Number(count);
      rolled = { title: `${n} races`, engine, courses: rollRaceList(all, n).map((c) => c.name), cupSlug: null };
    } else {
      const pool = o.cups.filter((c) => !kindInfo.cupKind || c.kind === kindInfo.cupKind);
      const cup = pick(pool.length ? pool : o.cups)!;
      rolled = { title: cup.name, engine, courses: cup.courses.map((c) => c.name), cupSlug: cup.slug };
    }
    setRaces(rolled);
    setSpins((n) => n + 1);
    o.onRolled?.({ kind: kindInfo.value, count: rolled.courses.length, engine });
  };

  const cupOf = (name: string) => o.cups.find((c) => c.courses.some((x) => x.name === name)) ?? null;
  const note = (c: KartRaceCourse | undefined) => (!c ? undefined : c.sections ? "3 sections" : c.laps && c.laps !== o.laps ? `${c.laps} laps` : undefined);
  const tiles: SelectedTrack[] = (races?.courses ?? []).map((name, i) => ({
    raceNumber: i + 1,
    course: { name, img: o.courseArt(name) ?? "", note: note(all.find((c) => c.name === name)) },
    cupImg: races && !races.cupSlug ? o.cupArt(cupOf(name)?.slug ?? "") ?? "" : "",
  }));

  const node = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your races.</h2>
          <p>{o.line}</p>
          <div className="kart-intro__actions kart-races__actions">
            <Select floatingLabel="Race list" value={kind} onChange={(v) => setKind(String(v))} options={o.kinds.map((k) => ({ value: k.value, label: k.label }))} />
            {kindInfo.races && (
              <Select floatingLabel="Races" value={count} onChange={(v) => setCount(String(v))}
                options={o.counts.map((n) => ({ value: String(n), label: `${n} races` }))} />
            )}
            <Button variant="primary" onClick={roll}>Randomize Races</Button>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Race options" summary={engines.length ? [engines.join(", ")] : []} empty="Any engine class">
            <FilterGroup label="Engine classes" activeValues={engines} onToggle={(v) => setEngines((cur) => toggle(cur, v))}
              options={o.engines.map((e) => ({ value: e, label: e }))} />
            <p className="party-muted">{o.note}</p>
          </RandomizerOptions>
        </div>
      </div>
      {races && (
        <div className="kart-races">
          <h3 className="kart-races__title">
            {/* eslint-disable-next-line @next/next/no-img-element -- the game's cup emblem; the title names it */}
            {races.cupSlug && o.cupArt(races.cupSlug) && <img src={o.cupArt(races.cupSlug)!} alt="" className="kart-races__cup" />}
            <span>{races.engine ? `${races.title}, ${races.engine}` : races.title}</span>
          </h3>
          <TrackList key={spins} tracks={tiles} showCupIcon={!races.cupSlug}
            reel={o.animate && spins ? all.map((c) => ({ name: c.name, img: o.courseArt(c.name) ?? "" })) : undefined} />
        </div>
      )}
    </section>
  );

  /** Loads a saved race list ({ title, engine, courses }), keeping only courses the game has. Stable while the cups
   *  are (pass the game's own list), so a loader effect can depend on it. */
  const cups = o.cups;
  const load = useCallback((saved: { title: string; engine: string | null; courses: string[] } | null | undefined) => {
    if (!saved?.courses?.length) return;
    const courses = saved.courses.filter((n) => all.some((c) => c.name === n));
    const cup = cups.find((c) => c.name === saved.title);
    setRaces({ title: saved.title, engine: saved.engine, courses, cupSlug: cup?.slug ?? null });
  }, [all, cups]);
  return { races, load, node };
}

export interface KartBattleMode { id: string; name: string; line: string }

export function useKartBattles(o: {
  courses: { name: string }[];
  modes: KartBattleMode[];
  counts: number[];
  battleArt: (name: string) => string | null;
  animate: boolean;
  line: string;
  note: ReactNode;
  onRolled?: (p: { count: number }) => void;
}) {
  const [count, setCount] = useState(String(o.counts[0]));
  const [modes, setModes] = useState<string[]>([]);
  const [battles, setBattles] = useState<BattleRoll[]>([]);
  const [spins, setSpins] = useState(0);
  const several = o.modes.length > 1;

  const roll = () => {
    const pool = o.modes.filter((m) => !modes.length || modes.includes(m.id));
    setBattles(rollBattleList(o.courses, pool.length ? pool : o.modes, Number(count)));
    setSpins((n) => n + 1);
    o.onRolled?.({ count: Number(count) });
  };
  const tiles: SelectedTrack[] = battles.map((b, i) => ({
    raceNumber: i + 1, course: { name: b.course, img: o.battleArt(b.course) ?? "", ...(several ? { note: b.mode } : {}) }, cupImg: "",
  }));

  const node = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your battles.</h2>
          <p>{o.line}</p>
          <div className="kart-intro__actions kart-races__actions">
            <Select floatingLabel="Battles" value={count} onChange={(v) => setCount(String(v))}
              options={o.counts.map((n) => ({ value: String(n), label: n === 1 ? "1 battle" : `${n} battles` }))} />
            <Button variant="primary" onClick={roll}>Randomize Battles</Button>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Battle options" empty={several ? "Every mode" : "Every course"}
            summary={modes.length ? [o.modes.filter((m) => modes.includes(m.id)).map((m) => m.name).join(", ")] : []}>
            {several && (
              <FilterGroup label="Modes" activeValues={modes} onToggle={(v) => setModes((cur) => toggle(cur, v))}
                options={o.modes.map((m) => ({ value: m.id, label: m.name }))} />
            )}
            <p className="party-muted">{o.note}</p>
          </RandomizerOptions>
        </div>
      </div>
      {battles.length > 0 && (
        <>
          <ul className="kart-modes" aria-label="How each mode is won">
            {o.modes.filter((m) => battles.some((b) => b.mode === m.name)).map((m) => (
              <li key={m.id}><b>{m.name}</b> {m.line}</li>
            ))}
          </ul>
          <TrackList key={spins} tracks={tiles} showCupIcon={false} unit="Battle"
            reel={o.animate && spins ? o.courses.map((c) => ({ name: c.name, img: o.battleArt(c.name) ?? "" })) : undefined} />
        </>
      )}
    </section>
  );

  /** Loads saved battles, keeping only courses the game has. Stable while the courses are. */
  const courses = o.courses;
  const load = useCallback((saved: BattleRoll[] | null | undefined) => setBattles((saved ?? []).filter((b) => courses.some((c) => c.name === b.course))), [courses]);
  return { battles, load, node };
}
