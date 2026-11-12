"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy, IconUserMinus } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { DoubleDashSetupConfig } from "@/data/config-types";
import type { SelectedTrack } from "@/data/types";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { CardActions } from "@/components/randomizer/CardActions";
import { SeatCard } from "@/components/randomizer/PlayerCard";
import { TrackList } from "@/components/randomizer/TrackList";
import { IconAction } from "@/components/actions/IconAction";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAnimationPref } from "@/hooks/useAnimationPref";
import { EVENTS, track } from "@/lib/analytics/events";
import { saveConfig, updateConfig } from "@/lib/configs";
import {
  DD_CLASSES, battleArt, battlePool, characterArt, characterColor, characterPool, chunkPeople, courseArt, cupArt, cupOf,
  drawPairs, kartArt, modeArt, pairClass, pairPeople, pairSpecials, rollAllCupTour, rollBattles, rollCup, rollEngine,
  rollPair, rollRaces, specialArt,
  type DdBattle, type DdOptions, type DdPair,
} from "@/lib/double-dash/roll";
import type { DdBattleMode, DdClass, DdCourse, DdGame } from "@/lib/double-dash/types";
import "@/styles/double-dash.css";

/**
 * Mario Kart: Double Dash!! randomizer (Retro Mario Kart picks 2026-11-12). Every kart in the game carries two
 * characters, one driving and one throwing items, and the kart must fit the heavier of the two. Karts: a pair and a
 * kart for each player, or "Two to a kart": the people in the room paired into karts, one driving and one throwing
 * (the game's co-op), with an optional swap of seats after each race. Races: a cup, the All Cup Tour or races, with
 * the engine class. Battle: courses and modes. Only rolls.
 */

type Tab = "karts" | "races" | "battle";
type RaceKind = "cup" | "tour" | "races";
interface Person { id: number; name: string }
interface RacesRoll { kind: RaceKind; title: string; engine: string | null; courses: DdCourse[]; cupSlug: string | null }

const MAX_PEOPLE = 8;
const RACE_COUNTS = ["4", "8", "12", "16"];
const BATTLE_COUNTS = ["1", "3", "5"];
const RACE_KINDS: { value: RaceKind; label: string }[] = [
  { value: "cup", label: "A cup" },
  { value: "tour", label: "The All Cup Tour (16 races)" },
  { value: "races", label: "Races from every cup" },
];

const lapNote = (laps: number) => (laps === 3 ? undefined : `${laps} laps`);

export function DoubleDashRandomizer({ game }: { game: DdGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("karts");
  const [animateReel, setAnimateReel] = useAnimationPref();

  // ── People ──────────────────────────────────────────────────────────────────
  const nextId = useRef(3);
  const [people, setPeople] = useState<Person[]>([{ id: 1, name: "" }, { id: 2, name: "" }]);
  const label = (id: number) => {
    const i = people.findIndex((p) => p.id === id);
    return people[i]?.name.trim() || `Player ${i + 1}`;
  };
  const addPerson = () => {
    if (people.length >= MAX_PEOPLE) return;
    setPeople((ps) => [...ps, { id: nextId.current++, name: "" }]);
    trackEvent("Add Racer");
  };
  const removePerson = (id: number) => {
    setPeople((ps) => ps.filter((p) => p.id !== id));
    setSolo((r) => { const n = { ...r }; delete n[id]; return n; });
    setDuoRolls((r) => { const n = { ...r }; delete n[id]; return n; });
  };
  const rename = (id: number, name: string) => setPeople((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Options ─────────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<DdClass[]>([]);
  const [teams, setTeams] = useState(false);
  const [toads, setToads] = useState(true);
  const [bosses, setBosses] = useState(true);
  const [unlockKarts, setUnlockKarts] = useState(true);
  const [parade, setParade] = useState(true);
  const opts: DdOptions = useMemo(() => ({ classes, teams, toads, bosses, unlockKarts, parade }), [classes, teams, toads, bosses, unlockKarts, parade]);
  const chars = useMemo(() => characterPool(game, opts), [game, opts]);
  const charReel = useMemo(() => game.characters.map((c) => ({ name: c.name, img: characterArt(game, c.name)!, color: c.color })), [game]);
  const kartReel = useMemo(() => game.karts.map((k) => ({ name: k.name, img: kartArt(game, k.name)! })), [game]);

  // ── Karts: one per person, or two to a kart ─────────────────────────────────
  const [duo, setDuo] = useState(false);
  const [swap, setSwap] = useState(true);
  /** One person, one kart: the roll for each person, by their id. */
  const [solo, setSolo] = useState<Record<number, DdPair>>({});
  /** Two to a kart: who sits where (person ids, two to a kart in this order) and each kart's roll, by its first id. */
  const [order, setOrder] = useState<number[]>([]);
  const [duoRolls, setDuoRolls] = useState<Record<number, DdPair>>({});
  const seated = useMemo(() => {
    const here = new Set(people.map((p) => p.id));
    return [...order.filter((id) => here.has(id)), ...people.map((p) => p.id).filter((id) => !order.includes(id))];
  }, [order, people]);
  const karts = useMemo(() => chunkPeople(seated), [seated]);

  const usedBy = (rolls: Record<number, DdPair>, skip: number) =>
    Object.entries(rolls).filter(([k]) => Number(k) !== skip).flatMap(([, p]) => [p.driver, p.thrower]);

  const rollEveryone = () => {
    if (duo) {
      const seats = pairPeople(people.map((p) => p.id));
      const pairs = drawPairs(game, seats.length, opts);
      setOrder(seats.flat());
      setDuoRolls(Object.fromEntries(seats.map((s, i) => [s[0], pairs[i]])));
      track(EVENTS.doubleDashRolled, { mode: "duo", karts: seats.length, slot: "all" });
    } else {
      const pairs = drawPairs(game, people.length, opts);
      setSolo(Object.fromEntries(people.map((p, i) => [p.id, pairs[i]])));
      track(EVENTS.doubleDashRolled, { mode: "solo", karts: people.length, slot: "all" });
    }
  };
  const rollOne = (key: number) => {
    if (duo) {
      setDuoRolls((r) => ({ ...r, [key]: rollPair(game, opts, usedBy(r, key)) }));
      track(EVENTS.doubleDashRolled, { mode: "duo", karts: karts.length, slot: "one" });
    } else {
      setSolo((r) => ({ ...r, [key]: rollPair(game, opts, usedBy(r, key)) }));
      track(EVENTS.doubleDashRolled, { mode: "solo", karts: people.length, slot: "one" });
    }
  };

  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: string) =>
    set((cur) => (cur.includes(v as T) ? cur.filter((x) => x !== v) : [...cur, v as T]));

  // ── Races and battles ───────────────────────────────────────────────────────
  const [raceKind, setRaceKind] = useState<RaceKind>("cup");
  const [raceCount, setRaceCount] = useState("4");
  const [engines, setEngines] = useState<string[]>([]);
  const [races, setRaces] = useState<RacesRoll | null>(null);
  const [raceSpins, setRaceSpins] = useState(0);
  const allCourses = useMemo(() => game.cups.flatMap((c) => c.courses), [game]);
  const rollRacesNow = () => {
    const engine = rollEngine(game, engines);
    if (raceKind === "cup") {
      const cup = rollCup(game);
      setRaces({ kind: "cup", title: cup.name, engine, courses: cup.courses, cupSlug: cup.slug });
    } else if (raceKind === "tour") {
      setRaces({ kind: "tour", title: "All Cup Tour", engine, courses: rollAllCupTour(game), cupSlug: "all-cup-tour" });
    } else {
      const n = Number(raceCount);
      setRaces({ kind: "races", title: `${n} races`, engine, courses: rollRaces(game, n), cupSlug: null });
    }
    setRaceSpins((n) => n + 1);
    track(EVENTS.doubleDashRacesRolled, { kind: raceKind, count: raceKind === "cup" ? 4 : raceKind === "tour" ? 16 : Number(raceCount), engine });
  };
  const raceTiles: SelectedTrack[] = (races?.courses ?? []).map((c, i) => ({
    raceNumber: i + 1,
    course: { name: c.name, img: courseArt(game, c.name) ?? "", note: lapNote(c.laps) },
    cupImg: races?.kind === "cup" ? "" : cupArt(game, cupOf(game, c.name)?.slug ?? "") ?? "",
  }));

  const [battleCount, setBattleCount] = useState("1");
  const [modes, setModes] = useState<DdBattleMode["id"][]>([]);
  const [battleUnlocks, setBattleUnlocks] = useState(true);
  const [battles, setBattles] = useState<DdBattle[]>([]);
  const [battleSpins, setBattleSpins] = useState(0);
  const rollBattlesNow = () => {
    setBattles(rollBattles(game, Number(battleCount), { modes, unlockables: battleUnlocks }));
    setBattleSpins((n) => n + 1);
    track(EVENTS.doubleDashRacesRolled, { kind: "battle", count: Number(battleCount), engine: "none" });
  };
  const battleTiles: SelectedTrack[] = battles.map((b, i) => ({
    raceNumber: i + 1, course: { name: b.course, img: battleArt(game, b.course) ?? "", note: b.mode }, cupImg: "",
  }));

  // ── Saving and loading (?config=) ───────────────────────────────────────────
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("config");
    if (!id || !user) return;
    void createClient().from("saved_configs").select("id, config_name, config_data")
      .eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const cfg = data?.config_data as DoubleDashSetupConfig | undefined;
        if (!data || cfg?.type !== "double-dash-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        const known = (n: string) => game.characters.some((c) => c.name === n);
        const rows = cfg.karts.slice(0, MAX_PEOPLE).filter((k) => known(k.driver) && known(k.thrower));
        const loaded: Person[] = [];
        const rolls: Record<number, DdPair> = {};
        let id2 = 1;
        for (const k of rows) {
          const ids = (cfg.duo ? k.people.slice(0, 2) : k.people.slice(0, 1)).map((n) => {
            const pid = id2++;
            loaded.push({ id: pid, name: /^Player \d+$/.test(n) ? "" : n });
            return pid;
          });
          if (ids[0]) rolls[ids[0]] = { driver: k.driver, thrower: k.thrower, kart: k.kart };
        }
        if (!loaded.length) return;
        nextId.current = id2;
        setPeople(loaded.slice(0, MAX_PEOPLE));
        setDuo(cfg.duo); setSwap(cfg.swap);
        if (cfg.duo) { setOrder(loaded.map((p) => p.id)); setDuoRolls(rolls); } else setSolo(rolls);
        if (cfg.races?.courses.length) {
          const courses = cfg.races.courses.map((n) => allCourses.find((c) => c.name === n)).filter((c): c is DdCourse => !!c);
          const cup = game.cups.find((c) => c.name === cfg.races!.title);
          const kind: RaceKind = cup ? "cup" : cfg.races.title === "All Cup Tour" ? "tour" : "races";
          setRaces({ kind, title: cfg.races.title, engine: cfg.races.engine, courses, cupSlug: cup?.slug ?? (kind === "tour" ? "all-cup-tour" : null) });
        }
        setBattles((cfg.battles ?? []).filter((b) => game.battleCourses.some((c) => c.name === b.course)));
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, allCourses, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const rows = duo
      ? karts.map((ids) => ({ ids, roll: duoRolls[ids[0]] }))
      : people.map((p) => ({ ids: [p.id], roll: solo[p.id] }));
    const cfg: DoubleDashSetupConfig = {
      type: "double-dash-setup", gameSlug: game.slug, duo, swap,
      karts: rows.filter((r) => r.roll).map((r) => ({ people: r.ids.map(label), driver: r.roll!.driver, thrower: r.roll!.thrower, kart: r.roll!.kart })),
      races: races ? { title: races.title, engine: races.engine, courses: races.courses.map((c) => c.name) } : null,
      battles,
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved"); setSaveOpen(false);
  };

  // ── The kart card ───────────────────────────────────────────────────────────
  const kartCard = (key: number, roll: DdPair | undefined, head: React.ReactNode, actions: React.ReactNode, seats: { drives: string; throws: string } | null, next: string | null) => {
    const cls = roll ? pairClass(game, roll) : null;
    const k = roll ? game.karts.find((x) => x.name === roll.kart) : undefined;
    const specials = roll ? pairSpecials(game, roll) : [];
    return (
      <SeatCard key={key} rolled={Boolean(roll)} animate={animateReel} name={head} actions={actions}
        tile={<KartSlot label="Kart" name={roll?.kart ?? null} imageSrc={roll ? kartArt(game, roll.kart) : null} pool={kartReel} animate={animateReel} />}>
        <ul className="player-card__parts dd-pair">
          <KartSlot label="Driver" tag={seats ? seats.drives : "Drives"} portrait name={roll?.driver ?? null}
            imageSrc={roll ? characterArt(game, roll.driver) : null} color={roll ? characterColor(game, roll.driver) : null} pool={charReel} animate={animateReel} />
          <KartSlot label="Item thrower" tag={seats ? seats.throws : "Throws"} portrait name={roll?.thrower ?? null}
            imageSrc={roll ? characterArt(game, roll.thrower) : null} color={roll ? characterColor(game, roll.thrower) : null} pool={charReel} animate={animateReel} />
        </ul>
        {roll && (
          <dl className="splat-kit dd-facts">
            <div><dt>Kart class</dt><dd>{k?.weight === null ? "Fits any pair" : cls}</dd></div>
            <div>
              <dt>Special</dt>
              <dd className="dd-facts__special">
                {specials.map((s) => {
                  const src = specialArt(game, s);
                  return (
                    <span key={s.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the game's item icon; the name follows */}
                      {src && <img src={src} alt="" className="dd-facts__item" />}
                      {s.name}
                    </span>
                  );
                })}
              </dd>
            </div>
          </dl>
        )}
        {roll && next && <p className="party-muted dd-swap">{next}</p>}
      </SeatCard>
    );
  };

  const summary = [
    classes.length ? `${classes.join(", ")} karts` : null,
    teams && "The game's own pairs",
    !toads && "No Toad or Toadette",
    !bosses && "No Petey Piranha or King Boo",
    !unlockKarts && "Starting karts only",
    !parade && "No Parade Kart",
  ].filter((x): x is string => !!x);

  const kartsTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>{duo ? "Two to a kart." : "A pair and a kart for everyone."}</h2>
          <p>
            {duo
              ? "Add everyone in the room, then randomize. Each kart gets two people: one drives, one throws items. Nobody gets the same character, and every kart fits the heavier of its two."
              : "Add a player for each kart, then randomize. Each kart gets a driver and an item thrower, nobody gets the same character, and every kart fits the heavier of its two."}
            {" "}{chars.length} characters in the pool.
          </p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={people.length >= MAX_PEOPLE} onClick={addPerson}>Add Player</Button>
            <Button variant="primary" onClick={rollEveryone}>Randomize Karts</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <div className="dd-duo">
            <Switch label="Two to a kart" checked={duo} onChange={(e) => setDuo(e.target.checked)} />
            {duo && <Switch label="Swap seats after each race" checked={swap} onChange={(e) => setSwap(e.target.checked)} />}
          </div>
          <RandomizerOptions title="Options" summary={summary} empty="Every pair and kart is in the mix">
            <FilterGroup label="Kart classes" activeValues={classes} onToggle={toggle(setClasses)}
              options={DD_CLASSES.map((c) => ({ value: c, label: `${c} karts` }))} />
            <FilterGroup label="Pairs" activeValues={teams ? ["teams"] : []} onToggle={() => setTeams((x) => !x)}
              options={[{ value: "teams", label: "Only the game's own pairs (Mario and Luigi, Peach and Daisy...)" }]} />
            <FilterGroup label="Unlocks"
              activeValues={[...(toads ? ["toads"] : []), ...(bosses ? ["bosses"] : []), ...(unlockKarts ? ["karts"] : []), ...(parade ? ["parade"] : [])]}
              onToggle={(v) => (v === "toads" ? setToads((x) => !x) : v === "bosses" ? setBosses((x) => !x) : v === "karts" ? setUnlockKarts((x) => !x) : setParade((x) => !x))}
              options={[
                { value: "toads", label: "Toad and Toadette" },
                { value: "bosses", label: "Petey Piranha and King Boo" },
                { value: "karts", label: "Karts you unlock" },
                { value: "parade", label: "Parade Kart" },
              ]} />
            <p className="party-muted">
              No class picked means every class. A kart&apos;s class comes from the heavier of its two characters: two
              light characters drive a light kart, anyone with a heavy character drives a heavy kart. The Parade Kart
              fits any pair. With Karts you unlock off, only the eight karts open on a new save come up.
            </p>
          </RandomizerOptions>
        </div>
      </div>

      {duo && (
        <section className="dd-people" aria-labelledby="dd-people-heading">
          <h3 id="dd-people-heading" className="dd-people__heading">Who&apos;s playing</h3>
          <ul className="dd-people__list">
            {people.map((p, i) => (
              <li key={p.id} className="dd-people__person">
                <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={p.name} maxLength={24} onChange={(e) => rename(p.id, e.target.value)} />
                {people.length > 1 && <IconAction label={`Remove ${label(p.id)}`} icon={IconUserMinus} variant="danger" onClick={() => removePerson(p.id)} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="randomizer-grid">
        {duo
          ? karts.map((ids, i) => {
            const roll = duoRolls[ids[0]];
            const [a, b] = ids.map(label);
            const seats = b ? { drives: `${a} drives`, throws: `${b} throws` } : { drives: `${a} drives`, throws: `${a} throws` };
            const next = b && swap ? `After each race, swap seats: ${b} drives next, ${a} throws.` : !b ? `${a} has this kart alone, so ${a} drives and throws.` : null;
            // Keyed by place, not by who's in it: re-pairing the room moves people between cards, and each card's
            // pictures spin from what it showed to the new pick.
            return kartCard(-(i + 1), roll,
              <p className="dd-kart-name"><b>Kart {i + 1}</b><span>{b ? `${a} and ${b}` : a}</span></p>,
              <CardActions refreshLabel={`New pair and kart for Kart ${i + 1}`} onRefresh={() => rollOne(ids[0])} />,
              seats, next);
          })
          : people.map((p, i) => kartCard(p.id, solo[p.id],
            <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={p.name} maxLength={24} onChange={(e) => rename(p.id, e.target.value)} />,
            <CardActions
              refreshLabel={`New pair and kart for ${label(p.id)}`} onRefresh={() => rollOne(p.id)}
              removeLabel={`Remove ${label(p.id)}`} onRemove={people.length > 1 ? () => removePerson(p.id) : undefined} />,
            null, null))}
      </div>
    </section>
  );

  const racesTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your races.</h2>
          <p>Roll a cup, the All Cup Tour or races from every cup, and the engine class to race them in.</p>
          <div className="kart-intro__actions dd-races__actions">
            <Select floatingLabel="Race list" value={raceKind} onChange={(v) => setRaceKind(String(v) as RaceKind)} options={RACE_KINDS} />
            {raceKind === "races" && (
              <Select floatingLabel="Races" value={raceCount} onChange={(v) => setRaceCount(String(v))}
                options={RACE_COUNTS.map((n) => ({ value: n, label: `${n} races` }))} />
            )}
            <Button variant="primary" onClick={rollRacesNow}>Randomize Races</Button>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Race options" summary={engines.length ? [engines.join(", ")] : []} empty="Any engine class">
            <FilterGroup label="Engine classes" activeValues={engines} onToggle={toggle(setEngines)}
              options={game.engines.map((e) => ({ value: e, label: e }))} />
            <p className="party-muted">
              No class picked means any of the four. Mirror races 150cc on the courses flipped, and opens once the 150cc
              All Cup Tour is won. A race list never repeats a course.
            </p>
          </RandomizerOptions>
        </div>
      </div>
      {races && (
        <div className="dd-races">
          <h3 className="dd-races__title">
            {/* eslint-disable-next-line @next/next/no-img-element -- the game's cup icon; the title names it */}
            {races.cupSlug && <img src={cupArt(game, races.cupSlug)!} alt="" className="dd-races__cup" />}
            <span>{races.engine ? `${races.title}, ${races.engine}` : races.title}</span>
          </h3>
          {races.kind === "tour" && <p className="party-muted">Luigi Circuit opens the tour and Rainbow Road closes it, as in the game.</p>}
          <TrackList key={raceSpins} tracks={raceTiles} showCupIcon={races.kind !== "cup"}
            reel={animateReel && raceSpins ? allCourses.map((c) => ({ name: c.name, img: courseArt(game, c.name) ?? "" })) : undefined} />
        </div>
      )}
    </section>
  );

  const battleTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your battles.</h2>
          <p>Pick how many battles to play and let GameShuffle choose each course and mode.</p>
          <div className="kart-intro__actions dd-races__actions">
            <Select floatingLabel="Battles" value={battleCount} onChange={(v) => setBattleCount(String(v))}
              options={BATTLE_COUNTS.map((n) => ({ value: n, label: n === "1" ? "1 battle" : `${n} battles` }))} />
            <Button variant="primary" onClick={rollBattlesNow}>Randomize Battles</Button>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Battle options" empty="Every course and mode"
            summary={[modes.length ? game.battleModes.filter((m) => modes.includes(m.id)).map((m) => m.name).join(", ") : null, !battleUnlocks && "Starting courses only"].filter((x): x is string => !!x)}>
            <FilterGroup label="Modes" activeValues={modes} onToggle={toggle(setModes)}
              options={game.battleModes.map((m) => ({ value: m.id, label: m.name }))} />
            <FilterGroup label="Courses" activeValues={battleUnlocks ? ["unlocks"] : []} onToggle={() => setBattleUnlocks((x) => !x)}
              options={[{ value: "unlocks", label: "Luigi's Mansion and Tilt-a-Kart" }]} />
            <p className="party-muted">
              No mode picked means all three. Luigi&apos;s Mansion and Tilt-a-Kart unlock by playing; the other{" "}
              {battlePool(game, false).length} courses are open from the start. In Battle, any pair can get any
              special item.
            </p>
          </RandomizerOptions>
        </div>
      </div>
      {battles.length > 0 && (
        <>
          <ul className="dd-modes" aria-label="How each mode is won">
            {game.battleModes.filter((m) => battles.some((b) => b.mode === m.name)).map((m) => (
              <li key={m.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the game's mode icon; the name follows */}
                <img src={modeArt(game, m.name)!} alt="" />
                <span><b>{m.name}</b> {m.line}</span>
              </li>
            ))}
          </ul>
          <TrackList key={battleSpins} tracks={battleTiles} showCupIcon={false} unit="Battle"
            reel={animateReel && battleSpins ? game.battleCourses.map((c) => ({ name: c.name, img: battleArt(game, c.name) ?? "" })) : undefined} />
        </>
      )}
    </section>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "karts", label: "Kart Randomizer", content: kartsTab },
    { id: "races", label: "Race Randomizer", content: racesTab },
    { id: "battle", label: "Battle Randomizer", content: battleTab },
  ];
  return (
    <div className="dd-randomizer">
      <div className="randomizer-controls">
        <Tabs variant="pills" size="medium" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: <></> }))} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : void save())} iconBefore={IconDeviceFloppy}>
            {saveName && loadedId ? `Update: ${saveName}` : "Save Complete Setup"}
          </Button>
        </div>
      </div>
      {tabs.find((t) => t.id === tab)?.content}
      <p className="type-card-disclaimer">
        Character, kart, item and course art is Nintendo&apos;s, from the game and its official website. GameShuffle is a
        fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo.
      </p>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday kart night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
