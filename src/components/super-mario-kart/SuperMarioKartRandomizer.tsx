"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { SuperMarioKartSetupConfig } from "@/data/config-types";
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
  SMK_MAX_PLAYERS, battleArt, characterArt, characterColor, characterPool, classOf, courseArt, cupArt, drawCharacters, rollCharacter,
} from "@/lib/super-mario-kart/roll";
import type { SmkClass, SmkGame } from "@/lib/super-mario-kart/types";
import "@/styles/super-mario-kart.css";

/**
 * Super Mario Kart randomizer (Retro Mario Kart picks 2026-11-12). Racers: a different character for each of the two
 * players, with the manual's class. Races: a cup in its order or races from every cup, with the engine class.
 * Battle: Battle Mode's courses. Only rolls.
 */

type Tab = "racers" | "races" | "battle";
interface Seat { id: number; name: string }

const RACE_KINDS: KartRaceKind[] = [
  { value: "any", label: "A cup" },
  { value: "races", label: "Races from every cup", races: true },
];
const BALLOON = [{ id: "balloon", name: "Balloon Battle", line: "Each player has three balloons; pop all of the other player's to win." }];

export function SuperMarioKartRandomizer({ game }: { game: SmkGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("racers");
  const [animateReel, setAnimateReel] = useAnimationPref();

  // ── Players (one or two) ────────────────────────────────────────────────────
  const nextId = useRef(3);
  const [seats, setSeats] = useState<Seat[]>([{ id: 1, name: "" }, { id: 2, name: "" }]);
  const label = (id: number) => {
    const i = seats.findIndex((p) => p.id === id);
    return seats[i]?.name.trim() || `Player ${i + 1}`;
  };
  const addPlayer = () => {
    if (seats.length >= SMK_MAX_PLAYERS) return;
    setSeats((ps) => [...ps, { id: nextId.current++, name: "" }]);
    trackEvent("Add Racer");
  };
  const removePlayer = (id: number) => {
    setSeats((ps) => ps.filter((p) => p.id !== id));
    setRolls((r) => { const n = { ...r }; delete n[id]; return n; });
  };
  const rename = (id: number, name: string) => setSeats((ps) => ps.map((p) => (p.id === id ? { ...p, name } : p)));

  // ── Racers ──────────────────────────────────────────────────────────────────
  const [classes, setClasses] = useState<SmkClass[]>([]);
  const [rolls, setRolls] = useState<Record<number, string>>({});
  const charReel = useMemo(() => game.characters.map((c) => ({ name: c.name, img: characterArt(game, c.name)!, color: c.color })), [game]);
  const pool = characterPool(game, classes);
  const rollEveryone = () => {
    const picks = drawCharacters(game, seats.length, classes);
    setRolls(Object.fromEntries(seats.map((p, i) => [p.id, picks[i]])));
    track(EVENTS.superMarioKartRolled, { players: seats.length, slot: "all" });
  };
  const rollOne = (id: number) => {
    setRolls((r) => ({ ...r, [id]: rollCharacter(game, classes, Object.entries(r).filter(([k]) => Number(k) !== id).map(([, x]) => x)) }));
    track(EVENTS.superMarioKartRolled, { players: seats.length, slot: "one" });
  };

  // ── Races and battles (the shared tabs) ─────────────────────────────────────
  const raceTab = useKartRaces({
    cups: game.cups, engines: game.engines, kinds: RACE_KINDS, counts: [5, 10, 15, 20], defaultCount: 10, laps: 5,
    courseArt: (n) => courseArt(game, n), cupArt: (slug) => cupArt(game, slug), animate: animateReel,
    line: "Roll a cup to race its five courses in order, or races from all four cups, and the engine class to race them in.",
    note: "No class picked means any of the three. 150cc opens once every cup is cleared in 100cc, and the engine class is for Mario Kart GP: Match Race always runs at 100cc. Every course is five laps. A race list never repeats a course.",
    onRolled: (p) => track(EVENTS.superMarioKartRacesRolled, { kind: p.kind === "any" ? "cup" : p.kind, count: p.count, engine: p.engine }),
  });
  const battleTab = useKartBattles({
    courses: game.battleCourses, modes: BALLOON, counts: [1, 2, 4], battleArt: (n) => battleArt(game, n), animate: animateReel,
    line: "Pick how many battles to play and let GameShuffle choose each course.",
    note: "Battle Mode is for two players, Balloon Battle on any of the four courses. A list never repeats a course until all four have come up.",
    onRolled: (p) => track(EVENTS.superMarioKartRacesRolled, { kind: "battle", count: p.count, engine: "none" }),
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
        const cfg = row?.config_data as SuperMarioKartSetupConfig | undefined;
        if (!row || cfg?.type !== "super-mario-kart-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(row.config_name); setLoadedId(row.id);
        const racers = (cfg.racers ?? []).slice(0, SMK_MAX_PLAYERS);
        if (racers.length) {
          nextId.current = racers.length + 1;
          setSeats(racers.map((r, i) => ({ id: i + 1, name: /^Player \d+$/.test(r.name) ? "" : r.name })));
          setRolls(Object.fromEntries(racers.map((r, i) => [i + 1, r.character] as const).filter(([, c]) => game.characters.some((x) => x.name === c))));
        }
        loadRaces(cfg.races);
        loadBattles(cfg.battles);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, loadRaces, loadBattles, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: SuperMarioKartSetupConfig = {
      type: "super-mario-kart-setup", gameSlug: game.slug,
      racers: seats.filter((p) => rolls[p.id]).map((p) => ({ name: label(p.id), character: rolls[p.id] })),
      races: raceTab.races ? { title: raceTab.races.title, engine: raceTab.races.engine, courses: raceTab.races.courses } : null,
      battles: battleTab.battles.map((b) => ({ course: b.course, mode: b.mode })),
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved"); setSaveOpen(false);
  };

  const racersTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A racer for each player.</h2>
          <p>Name the two players, or remove one if you&apos;re racing alone, then randomize. The two always get different characters.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={seats.length >= SMK_MAX_PLAYERS} onClick={addPlayer}>Add Player</Button>
            <Button variant="primary" onClick={rollEveryone}>Randomize Racers</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Options" summary={classes.length ? [game.classes.filter((k) => classes.includes(k.id)).map((k) => k.name).join(", ")] : []}
            empty={`All ${game.characters.length} drivers`}>
            <FilterGroup label="Classes" activeValues={classes}
              onToggle={(v) => setClasses((cur) => (cur.includes(v as SmkClass) ? cur.filter((x) => x !== v) : [...cur, v as SmkClass]))}
              options={game.classes.map((k) => ({ value: k.id, label: `${k.name} (${game.characters.filter((c) => c.class === k.id).map((c) => c.name).join(" and ")})` }))} />
            <p className="party-muted">
              The manual splits the eight drivers into four pairs with the same stats. No class picked means all of them;
              {" "}{pool.length} in the pool now. With one class picked, the two players get its two drivers.
            </p>
          </RandomizerOptions>
        </div>
      </div>

      <div className="randomizer-grid">
        {seats.map((p, i) => {
          const pick = rolls[p.id];
          const cls = pick ? classOf(game, pick) : null;
          return (
            <SeatCard key={p.id} rolled={Boolean(pick)} animate={animateReel}
              name={<Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={p.name} maxLength={24} onChange={(e) => rename(p.id, e.target.value)} />}
              actions={
                <CardActions
                  refreshLabel={`New racer for ${label(p.id)}`} onRefresh={() => rollOne(p.id)}
                  removeLabel={`Remove ${label(p.id)}`} onRemove={seats.length > 1 ? () => removePlayer(p.id) : undefined} />
              }
              tile={<KartSlot label="Racer" portrait name={pick ?? null} imageSrc={pick ? characterArt(game, pick) : null}
                color={pick ? characterColor(game, pick) : null} pool={charReel} animate={animateReel} />}>
              {cls && (
                <dl className="splat-kit smk-facts">
                  <div><dt>Class</dt><dd>{cls.name}</dd></div>
                  <div><dt>Good at</dt><dd>{cls.line}</dd></div>
                </dl>
              )}
            </SeatCard>
          );
        })}
      </div>
    </section>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "racers", label: "Racer Randomizer", content: racersTab },
    { id: "races", label: "Race Randomizer", content: raceTab.node },
    { id: "battle", label: "Battle Randomizer", content: battleTab.node },
  ];
  return (
    <div className="smk-randomizer">
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
        Character art is Nintendo&apos;s official artwork for the game; course maps and cup emblems are from the game.
        GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo.
      </p>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday kart night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
