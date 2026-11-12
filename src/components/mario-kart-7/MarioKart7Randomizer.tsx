"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { MarioKart7SetupConfig } from "@/data/config-types";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { PlayerCard } from "@/components/randomizer/PlayerCard";
import { useKartBattles, useKartRaces, type KartRaceKind } from "@/components/randomizer/KartRaceTabs";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useAnimationPref } from "@/hooks/useAnimationPref";
import { EVENTS, track } from "@/lib/analytics/events";
import { saveConfig, updateConfig } from "@/lib/configs";
import {
  DEFAULT_PARTS, MK7_CLASSES, PARTS_LEVELS, battleArt, characterPool, comboFits, courseArt, cupArt, drawCombos, kartData,
  partsLevel, rollCombo, toKartCombo, type Mk7Combo, type Mk7Options,
} from "@/lib/mario-kart-7/roll";
import type { Mk7Class, Mk7Game, Mk7PartsLevel } from "@/lib/mario-kart-7/types";
import "@/styles/mario-kart-7.css";

/**
 * Mario Kart 7 randomizer (Retro Mario Kart picks 2026-11-12). Karts: a character and a body, tires and glider for
 * each player on the shared Mario Kart card, from the parts the save has (the seven from the start, or every part).
 * Races: a cup in its order or races from every cup, with the engine class. Battle: courses and modes. Only rolls.
 */

type Tab = "karts" | "races" | "battle";
interface Seat { id: number; name: string }

const MAX_PLAYERS = 8;
const RACE_KINDS: KartRaceKind[] = [
  { value: "any", label: "A cup" },
  { value: "new", label: "A new cup", cupKind: "new" },
  { value: "classic", label: "A classic cup", cupKind: "classic" },
  { value: "races", label: "Races from every cup", races: true },
];

export function MarioKart7Randomizer({ game }: { game: Mk7Game }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("karts");
  const [animateReel, setAnimateReel] = useAnimationPref();
  const data = useMemo(() => kartData(game), [game]);

  // ── Players ─────────────────────────────────────────────────────────────────
  const nextId = useRef(3);
  const [seats, setSeats] = useState<Seat[]>([{ id: 1, name: "" }, { id: 2, name: "" }]);
  const label = (id: number) => {
    const i = seats.findIndex((p) => p.id === id);
    return seats[i]?.name.trim() || `Player ${i + 1}`;
  };
  const addPlayer = () => {
    if (seats.length >= MAX_PLAYERS) return;
    setSeats((ps) => [...ps, { id: nextId.current++, name: "" }]);
    trackEvent("Add Racer");
  };
  const removePlayer = (id: number) => {
    setSeats((ps) => ps.filter((p) => p.id !== id));
    setRolls((r) => { const n = { ...r }; delete n[id]; return n; });
  };
  const rename = (id: number, name: string) => setSeats((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Options ─────────────────────────────────────────────────────────────────
  const [parts, setParts] = useState<Mk7PartsLevel>(DEFAULT_PARTS);
  const [classes, setClasses] = useState<Mk7Class[]>([]);
  const [unlockables, setUnlockables] = useState(true);
  const [unique, setUnique] = useState(false);
  const opts: Mk7Options = useMemo(() => ({ classes, unlockables, parts, unique }), [classes, unlockables, parts, unique]);
  const chars = useMemo(() => characterPool(game, opts), [game, opts]);
  const partsInfo = PARTS_LEVELS.find((l) => l.id === parts)!;

  // ── Karts ───────────────────────────────────────────────────────────────────
  const [rolls, setRolls] = useState<Record<number, Mk7Combo>>({});
  const rollEveryone = () => {
    const combos = drawCombos(game, seats.length, opts);
    setRolls(Object.fromEntries(seats.map((p, i) => [p.id, combos[i]])));
    track(EVENTS.mario7Rolled, { karts: seats.length, slot: "all", parts });
  };
  const rollOne = (id: number) => {
    setRolls((r) => ({ ...r, [id]: rollCombo(game, opts, Object.entries(r).filter(([k]) => Number(k) !== id).map(([, x]) => x.character)) }));
    track(EVENTS.mario7Rolled, { karts: seats.length, slot: "one", parts });
  };

  // ── Races and battles (the shared tabs) ─────────────────────────────────────
  const raceTab = useKartRaces({
    cups: game.cups, engines: game.engines, kinds: RACE_KINDS, counts: [4, 8, 12, 16, 32], defaultCount: 8, laps: 3,
    courseArt: (n) => courseArt(game, n), cupArt: (slug) => cupArt(game, slug), animate: animateReel,
    line: "Roll a cup to race in its order, or races from all eight cups, and the engine class to race them in.",
    note: "No class picked means any of the four. Mirror opens once every cup is won in 50cc, 100cc and 150cc. The four new cups are the game's own courses; the four classic cups bring back courses from the SNES, N64, Game Boy Advance, GameCube, DS and Wii games. Wuhu Loop, Maka Wuhu and Rainbow Road are one lap in three sections. A race list never repeats a course.",
    onRolled: (p) => track(EVENTS.mario7RacesRolled, { kind: p.kind === "any" ? "cup" : p.kind, count: p.count, engine: p.engine }),
  });
  const battleTab = useKartBattles({
    courses: game.battleCourses, modes: game.battleModes, counts: [1, 3, 5], battleArt: (n) => battleArt(game, n), animate: animateReel,
    line: "Pick how many battles to play and let GameShuffle choose each course and mode.",
    note: "No mode picked means both. All six courses are open from the start, and in Battle you keep the kart you built.",
    onRolled: (p) => track(EVENTS.mario7RacesRolled, { kind: "battle", count: p.count, engine: "none" }),
  });
  const loadRaces = raceTab.load, loadBattles = battleTab.load;

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
      .then(({ data: row }) => {
        const cfg = row?.config_data as MarioKart7SetupConfig | undefined;
        if (!row || cfg?.type !== "mario-kart-7-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(row.config_name); setLoadedId(row.id);
        setParts(partsLevel(cfg.parts));
        const racers = (cfg.racers ?? []).slice(0, MAX_PLAYERS);
        if (racers.length) {
          nextId.current = racers.length + 1;
          setSeats(racers.map((r, i) => ({ id: i + 1, name: /^Player \d+$/.test(r.name) ? "" : r.name })));
          setRolls(Object.fromEntries(racers.map((r, i) => [i + 1, { character: r.character, body: r.body, tires: r.tires, glider: r.glider }] as const)
            .filter(([, r]) => comboFits(game, r, "all"))));
        }
        loadRaces(cfg.races);
        loadBattles(cfg.battles);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, loadRaces, loadBattles, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: MarioKart7SetupConfig = {
      type: "mario-kart-7-setup", gameSlug: game.slug, parts,
      racers: seats.filter((p) => rolls[p.id]).map((p) => ({ name: label(p.id), ...rolls[p.id] })),
      races: raceTab.races ? { title: raceTab.races.title, engine: raceTab.races.engine, courses: raceTab.races.courses } : null,
      battles: battleTab.battles,
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved"); setSaveOpen(false);
  };

  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: string) =>
    set((cur) => (cur.includes(v as T) ? cur.filter((x) => x !== v) : [...cur, v as T]));
  const summary = [
    classes.length ? `${classes.join(", ")} characters` : null,
    !unlockables && "Starting characters only",
    unique && "Everyone a different character",
  ].filter((x): x is string => !!x);

  const kartsTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A character and a kart for everyone.</h2>
          <p>Add a player for each racer, then randomize. Each kart is a body, tires and a glider from the parts your save has. {chars.length} characters in the pool.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={seats.length >= MAX_PLAYERS} onClick={addPlayer}>Add Player</Button>
            <Button variant="primary" onClick={rollEveryone}>Randomize Karts</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <div className="mk7-parts">
            <Select floatingLabel="Parts unlocked" value={parts} onChange={(v) => setParts(partsLevel(String(v)))}
              options={PARTS_LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
            <p className="party-muted">{partsInfo.line}</p>
          </div>
          <RandomizerOptions title="Options" summary={summary} empty="All 17 characters, repeats allowed">
            <FilterGroup label="Weight classes" activeValues={classes} onToggle={toggle(setClasses)}
              options={MK7_CLASSES.map((c) => ({ value: c, label: c }))} />
            <FilterGroup label="Characters"
              activeValues={[...(unlockables ? ["unlockables"] : []), ...(unique ? ["unique"] : [])]}
              onToggle={(v) => (v === "unlockables" ? setUnlockables((x) => !x) : setUnique((x) => !x))}
              options={[
                { value: "unlockables", label: "The nine you unlock, Mii included" },
                { value: "unique", label: "Everyone a different character" },
              ]} />
            <p className="party-muted">
              No weight class picked means every class, Feather to Heavy. Daisy, Wario, Rosalina, Metal Mario, Shy Guy,
              Honey Queen, Wiggler and Lakitu unlock by winning 150cc cups, and the Mii by finishing every cup. Characters
              can repeat unless you pick Everyone a different character; parts always can.
            </p>
          </RandomizerOptions>
        </div>
      </div>

      <div className="randomizer-grid">
        {seats.map((p, i) => (
          <PlayerCard key={p.id} seat={i} gameSlug={game.slug} gameData={data} animate={animateReel}
            player={{ id: String(p.id), name: p.name, combo: rolls[p.id] ? toKartCombo(game, rolls[p.id]) : null }}
            onRefresh={() => rollOne(p.id)} onRemove={() => removePlayer(p.id)} onNameChange={(name) => rename(p.id, name)}
            canRemove={seats.length > 1} />
        ))}
      </div>
    </section>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "karts", label: "Kart Randomizer", content: kartsTab },
    { id: "races", label: "Race Randomizer", content: raceTab.node },
    { id: "battle", label: "Battle Randomizer", content: battleTab.node },
  ];
  return (
    <div className="mk7-randomizer">
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
        Character, part, course and cup art is Nintendo&apos;s, from the game and its official artwork. GameShuffle is a
        fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo.
      </p>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday kart night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
