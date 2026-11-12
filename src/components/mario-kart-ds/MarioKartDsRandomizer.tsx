"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { MarioKartDsSetupConfig } from "@/data/config-types";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { CardActions } from "@/components/randomizer/CardActions";
import { SeatCard } from "@/components/randomizer/PlayerCard";
import { useKartBattles, useKartRaces, type KartRaceKind } from "@/components/randomizer/KartRaceTabs";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAnimationPref } from "@/hooks/useAnimationPref";
import { EVENTS, track } from "@/lib/analytics/events";
import { saveConfig, updateConfig } from "@/lib/configs";
import {
  DEFAULT_KART_LEVEL, DS_CLASSES, KART_LEVELS, battleArt, characterArt, characterColor, characterPool, courseArt, cupArt,
  drawRacers, kartArt, kartLevel, kartNote, missionArt, missionId, missionPlace, missionPool, missionShows, missionTitle, rollMissions,
  rollRacer, type DsOptions, type DsRacer,
} from "@/lib/mario-kart-ds/roll";
import type { DsClass, DsGame, DsKartLevel, DsMission } from "@/lib/mario-kart-ds/types";
import "@/styles/mario-kart-ds.css";

/**
 * Mario Kart DS randomizer (Retro Mario Kart picks 2026-11-12). Karts: a character and a kart for each player, the
 * kart one that character can take on the save (starting karts, their own karts, own and borrowed, or every kart).
 * Races: a cup in its order or races from every cup, with the engine class. Battle: courses and modes. Missions: a
 * Mission Mode mission or boss as a challenge. Only rolls.
 */

type Tab = "karts" | "races" | "battle" | "missions";
interface Player { id: number; name: string }

const MAX_PLAYERS = 8;
const RACE_COUNTS = [4, 8, 12, 16, 32];
const MISSION_COUNTS = ["1", "3", "5"];
const RACE_KINDS: KartRaceKind[] = [
  { value: "any", label: "A cup" },
  { value: "nitro", label: "A Nitro cup", cupKind: "nitro" },
  { value: "retro", label: "A Retro cup", cupKind: "retro" },
  { value: "races", label: "Races from every cup", races: true },
];
const LEVELS = ["any", "1", "2", "3", "4", "5", "6", "7"];

export function MarioKartDsRandomizer({ game }: { game: DsGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("karts");
  const [animateReel, setAnimateReel] = useAnimationPref();

  // ── Players ─────────────────────────────────────────────────────────────────
  const nextId = useRef(3);
  const [players, setPlayers] = useState<Player[]>([{ id: 1, name: "" }, { id: 2, name: "" }]);
  const label = (id: number) => {
    const i = players.findIndex((p) => p.id === id);
    return players[i]?.name.trim() || `Player ${i + 1}`;
  };
  const addPlayer = () => {
    if (players.length >= MAX_PLAYERS) return;
    setPlayers((ps) => [...ps, { id: nextId.current++, name: "" }]);
    trackEvent("Add Racer");
  };
  const removePlayer = (id: number) => {
    setPlayers((ps) => ps.filter((p) => p.id !== id));
    setRolls((r) => { const n = { ...r }; delete n[id]; return n; });
  };
  const rename = (id: number, name: string) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Options ─────────────────────────────────────────────────────────────────
  const [level, setLevel] = useState<DsKartLevel>(DEFAULT_KART_LEVEL);
  const [classes, setClasses] = useState<DsClass[]>([]);
  const [unlockables, setUnlockables] = useState(true);
  const [unique, setUnique] = useState(false);
  const opts: DsOptions = useMemo(() => ({ classes, unlockables, level, unique }), [classes, unlockables, level, unique]);
  const chars = useMemo(() => characterPool(game, opts), [game, opts]);
  const charReel = useMemo(() => game.characters.map((c) => ({ name: c.name, img: characterArt(game, c.name)!, color: c.color })), [game]);
  const kartReel = useMemo(() => game.karts.map((k) => ({ name: k.name, img: kartArt(game, k.name)! })), [game]);
  const levelInfo = KART_LEVELS.find((l) => l.id === level)!;

  // ── Karts ───────────────────────────────────────────────────────────────────
  const [rolls, setRolls] = useState<Record<number, DsRacer>>({});
  const rollEveryone = () => {
    const racers = drawRacers(game, players.length, opts);
    setRolls(Object.fromEntries(players.map((p, i) => [p.id, racers[i]])));
    track(EVENTS.marioKartDsRolled, { karts: players.length, slot: "all", level });
  };
  const rollOne = (id: number) => {
    setRolls((r) => ({ ...r, [id]: rollRacer(game, opts, Object.entries(r).filter(([k]) => Number(k) !== id).map(([, x]) => x.character)) }));
    track(EVENTS.marioKartDsRolled, { karts: players.length, slot: "one", level });
  };

  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: string) =>
    set((cur) => (cur.includes(v as T) ? cur.filter((x) => x !== v) : [...cur, v as T]));

  // ── Races and battles (the shared tabs) ─────────────────────────────────────
  const raceTab = useKartRaces({
    cups: game.cups, engines: game.engines, kinds: RACE_KINDS, counts: RACE_COUNTS, defaultCount: 8, laps: 3,
    courseArt: (n) => courseArt(game, n), cupArt: (slug) => cupArt(game, slug), animate: animateReel,
    line: "Roll a cup to race in its order, or races from all eight cups, and the engine class to race them in.",
    note: "No class picked means any of the four. Mirror opens with gold in every 150cc cup. The Nitro cups are the game's own courses; the Retro cups bring back courses from the SNES, N64, Game Boy Advance and GameCube games. A race list never repeats a course.",
    onRolled: (p) => track(EVENTS.marioKartDsRacesRolled, { kind: p.kind === "any" ? "cup" : p.kind, count: p.count, engine: p.engine }),
  });
  const battleTab = useKartBattles({
    courses: game.battleCourses, modes: game.battleModes, counts: [1, 3, 5], battleArt: (n) => battleArt(game, n), animate: animateReel,
    line: "Pick how many battles to play and let GameShuffle choose each course and mode.",
    note: "No mode picked means both. All six courses are open from the start, and in Battle everyone drives their character's standard kart.",
    onRolled: (p) => track(EVENTS.marioKartDsRacesRolled, { kind: "battle", count: p.count, engine: "none" }),
  });
  const loadRaces = raceTab.load, loadBattles = battleTab.load;

  // ── Missions ────────────────────────────────────────────────────────────────
  const [missionLevel, setMissionLevel] = useState("any");
  const [missionCount, setMissionCount] = useState("1");
  const [bosses, setBosses] = useState(true);
  const [level7, setLevel7] = useState(false);
  const [missions, setMissions] = useState<DsMission[]>([]);
  const missionOpts = useMemo(() => ({ level: missionLevel === "any" ? null : Number(missionLevel), bosses, level7 }), [missionLevel, bosses, level7]);
  const missionReel = useMemo(
    () => game.missions.map((m) => ({ name: missionShows(game, m).name, img: missionArt(game, m) ?? IMAGE_COMING_SOON })).filter((x, i, all) => x.name && all.findIndex((y) => y.name === x.name) === i),
    [game],
  );
  const rollMissionsNow = () => {
    setMissions(rollMissions(game, Number(missionCount), missionOpts));
    track(EVENTS.marioKartDsMissionRolled, { count: Number(missionCount), level: missionLevel, bosses, level7 });
  };
  const rollMissionAt = (i: number) => {
    setMissions((cur) => {
      const others = new Set(cur.filter((_, j) => j !== i).map(missionId));
      const pool = missionPool(game, missionOpts).filter((m) => !others.has(missionId(m)) && missionId(m) !== missionId(cur[i]));
      const next = pool.length ? pool[Math.floor(Math.random() * pool.length)] : rollMissions(game, 1, missionOpts)[0];
      return cur.map((m, j) => (j === i ? next : m));
    });
    track(EVENTS.marioKartDsMissionRolled, { count: 1, level: missionLevel, bosses, level7 });
  };

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
        const cfg = data?.config_data as MarioKartDsSetupConfig | undefined;
        if (!data || cfg?.type !== "mario-kart-ds-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        setLevel(kartLevel(cfg.level));
        const rows = (cfg.racers ?? []).slice(0, MAX_PLAYERS);
        if (rows.length) {
          const loaded = rows.map((r, i) => ({ id: i + 1, name: /^Player \d+$/.test(r.name) ? "" : r.name }));
          const known = (r: { character: string; kart: string }) => game.characters.some((c) => c.name === r.character) && game.karts.some((k) => k.name === r.kart);
          nextId.current = loaded.length + 1;
          setPlayers(loaded);
          setRolls(Object.fromEntries(rows.map((r, i) => [i + 1, r] as const).filter(([, r]) => known(r)).map(([k, r]) => [k, { character: r.character, kart: r.kart }])));
        }
        loadRaces(cfg.races);
        loadBattles(cfg.battles);
        setMissions((cfg.missions ?? []).map((mid) => game.missions.find((m) => missionId(m) === mid)).filter((m): m is DsMission => !!m));
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, loadRaces, loadBattles, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: MarioKartDsSetupConfig = {
      type: "mario-kart-ds-setup", gameSlug: game.slug, level,
      racers: players.filter((p) => rolls[p.id]).map((p) => ({ name: label(p.id), character: rolls[p.id].character, kart: rolls[p.id].kart })),
      races: raceTab.races ? { title: raceTab.races.title, engine: raceTab.races.engine, courses: raceTab.races.courses } : null,
      battles: battleTab.battles,
      missions: missions.map(missionId),
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved"); setSaveOpen(false);
  };

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const summary = [
    classes.length ? `${classes.join(", ")} characters` : null,
    !unlockables && "No unlockable characters",
    unique && "Everyone a different character",
  ].filter((x): x is string => !!x);

  const kartsTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A character and a kart for everyone.</h2>
          <p>
            Add a player for each racer, then randomize. Every kart is one that character can take on your save.{" "}
            {chars.length} characters in the pool.
          </p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players.length >= MAX_PLAYERS} onClick={addPlayer}>Add Player</Button>
            <Button variant="primary" onClick={rollEveryone}>Randomize Karts</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <div className="mkds-level">
            <Select floatingLabel="Karts unlocked" value={level} onChange={(v) => setLevel(kartLevel(String(v)))}
              options={KART_LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
            <p className="party-muted">{levelInfo.line}</p>
          </div>
          <RandomizerOptions title="Options" summary={summary} empty="All 12 characters, repeats allowed">
            <FilterGroup label="Weight classes" activeValues={classes} onToggle={toggle(setClasses)}
              options={DS_CLASSES.map((c) => ({ value: c, label: c }))} />
            <FilterGroup label="Characters"
              activeValues={[...(unlockables ? ["unlockables"] : []), ...(unique ? ["unique"] : [])]}
              onToggle={(v) => (v === "unlockables" ? setUnlockables((x) => !x) : setUnique((x) => !x))}
              options={[
                { value: "unlockables", label: "Daisy, Dry Bones, Waluigi and R.O.B." },
                { value: "unique", label: "Everyone a different character" },
              ]} />
            <p className="party-muted">
              No weight class picked means every class. Daisy, Dry Bones, Waluigi and R.O.B. unlock by winning cups.
              Two players can be the same character in the game, so repeats are on unless you pick Everyone a different
              character.
            </p>
          </RandomizerOptions>
        </div>
      </div>

      <div className="randomizer-grid">
        {players.map((p, i) => {
          const roll = rolls[p.id];
          const c = roll ? game.characters.find((x) => x.name === roll.character) : undefined;
          return (
            <SeatCard key={p.id} rolled={Boolean(roll)} animate={animateReel}
              name={<Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={p.name} maxLength={24} onChange={(e) => rename(p.id, e.target.value)} />}
              actions={
                <CardActions
                  refreshLabel={`New character and kart for ${label(p.id)}`} onRefresh={() => rollOne(p.id)}
                  removeLabel={`Remove ${label(p.id)}`} onRemove={players.length > 1 ? () => removePlayer(p.id) : undefined} />
              }
              tile={<KartSlot label="Character" portrait name={roll?.character ?? null} imageSrc={roll ? characterArt(game, roll.character) : null}
                color={roll ? characterColor(game, roll.character) : null} pool={charReel} animate={animateReel} />}>
              <ul className="player-card__parts player-card__parts--row mkds-kart">
                <KartSlot label="Kart" name={roll?.kart ?? null} imageSrc={roll ? kartArt(game, roll.kart) : null} pool={kartReel} animate={animateReel} />
              </ul>
              {roll && c && (
                <dl className="splat-kit mkds-facts">
                  <div><dt>Weight class</dt><dd>{c.weight}</dd></div>
                  <div><dt>Kart</dt><dd>{kartNote(game, roll)}</dd></div>
                </dl>
              )}
            </SeatCard>
          );
        })}
      </div>
    </section>
  );

  const missionsTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Roll a Mission Mode challenge.</h2>
          <p>Pick a level or leave it to chance, then roll. Each mission comes with the course and the character the game gives you.</p>
          <div className="kart-intro__actions kart-races__actions">
            <Select floatingLabel="Level" value={missionLevel} onChange={(v) => setMissionLevel(String(v))}
              options={LEVELS.map((l) => ({ value: l, label: l === "any" ? "Any level" : `Level ${l}` }))} />
            <Select floatingLabel="Missions" value={missionCount} onChange={(v) => setMissionCount(String(v))}
              options={MISSION_COUNTS.map((n) => ({ value: n, label: n === "1" ? "1 mission" : `${n} missions` }))} />
            <Button variant="primary" onClick={rollMissionsNow}>Randomize Missions</Button>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Mission options" empty="Levels 1 to 6, bosses too"
            summary={[!bosses && "No bosses", level7 && "Level 7 too"].filter((x): x is string => !!x)}>
            <FilterGroup label="Missions"
              activeValues={[...(bosses ? ["bosses"] : []), ...(level7 ? ["level7"] : [])]}
              onToggle={(v) => (v === "bosses" ? setBosses((x) => !x) : setLevel7((x) => !x))}
              options={[
                { value: "bosses", label: "Each level's boss" },
                { value: "level7", label: "Level 7" },
              ]} />
            <p className="party-muted">
              Each level has eight missions and a boss. Level 7 opens once every mission and boss in Levels 1 to 6 has
              at least a ★, so it stays out of Any level until you turn it on. Picking Level 7 from the list rolls it
              either way.
            </p>
          </RandomizerOptions>
        </div>
      </div>
      {missions.length > 0 && (
        <div className="randomizer-grid">
          {missions.map((m, i) => (
            <SeatCard key={i} rolled animate={animateReel}
              name={<p className="mkds-mission-name"><b>{missionTitle(m)}</b>{m.boss && missionShows(game, m).kind === "course" && <span>{m.boss}</span>}</p>}
              actions={<CardActions refreshLabel={`New mission in place of ${missionTitle(m)}`} onRefresh={() => rollMissionAt(i)} />}
              tile={<KartSlot label={missionShows(game, m).kind === "boss" ? "Boss" : "Course"} name={missionShows(game, m).name} imageSrc={missionArt(game, m)}
                fallback={IMAGE_COMING_SOON} pool={missionReel} animate={animateReel} />}>
              <p className="mkds-mission-text">{m.text}</p>
              <dl className="splat-kit mkds-facts">
                {/* The picture's name is the card's heading; Where shows only when the picture is the boss. */}
                {missionShows(game, m).kind === "boss" && <div><dt>Where</dt><dd>{missionPlace(m)}</dd></div>}
                {m.reverse && <div><dt>Direction</dt><dd>Driven the other way</dd></div>}
                <div>
                  <dt>Character</dt>
                  <dd className="mkds-facts__who">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the character's in-game mugshot; the name follows */}
                    <img src={characterArt(game, m.character) ?? ""} alt="" className="mkds-facts__face" />
                    {m.character}
                  </dd>
                </div>
                <div><dt>Time limit</dt><dd>{m.time ?? "A race to the finish"}</dd></div>
              </dl>
            </SeatCard>
          ))}
        </div>
      )}
    </section>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "karts", label: "Kart Randomizer", content: kartsTab },
    { id: "races", label: "Race Randomizer", content: raceTab.node },
    { id: "battle", label: "Battle Randomizer", content: battleTab.node },
    { id: "missions", label: "Mission Randomizer", content: missionsTab },
  ];
  return (
    <div className="mkds-randomizer">
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
        Character, kart, course, cup and boss art is Nintendo&apos;s, from the game. GameShuffle is a fan-made tool and
        isn&apos;t affiliated with or endorsed by Nintendo.
      </p>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday kart night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
