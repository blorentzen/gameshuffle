"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SonicSetupConfig } from "@/data/config-types";
import { Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy, IconDice5 } from "@tabler/icons-react";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { RollingText } from "@/components/randomizer/RollingText";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { CardActions } from "@/components/randomizer/CardActions";
import { SeatCard } from "@/components/randomizer/PlayerCard";
import { RandomTile } from "@/components/randomizer/RandomTile";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { EVENTS, track } from "@/lib/analytics/events";
import { saveConfig, updateConfig } from "@/lib/configs";
import {
  cupPool, drawLoadouts, gadgetPool, machinePool, racerPool, rollGrandPrix, rollRaces, statColor, statLabel, trackPool,
  type SonicLoadout, type SonicRace,
} from "@/lib/sonic/roll";
import { otherSeats, seatLabel, withSeat } from "@/lib/randomizers/seats";
import type { SonicCup, SonicGame, SonicPack, SonicStat } from "@/lib/sonic/types";
import "@/styles/sonic-randomizer.css";

/**
 * Sonic Racing: CrossWorlds randomizer: a racer, machine and Gadget Plate for up to 12 players, then races (a
 * track and its CrossWorld) or a Grand Prix. Names only until art is cleared ("Image coming soon"). Only rolls.
 */

type Tab = "racers" | "races";
const MAX_PLAYERS = 12;
const RACE_COUNTS = ["1", "3", "4", "6", "8", "12"];

export function SonicRandomizer({ game }: { game: SonicGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("racers");

  // Players
  const [players, setPlayers] = useState(4);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);

  // Options (one set for both tabs: the packs a group owns apply to tracks too)
  const [racerTypes, setRacerTypes] = useState<SonicStat[]>([]);
  const [machineTypes, setMachineTypes] = useState<SonicStat[]>([]);
  const [guests, setGuests] = useState(true);
  const [supers, setSupers] = useState(false);
  const [repeats, setRepeats] = useState(false);
  const [newSave, setNewSave] = useState(false);
  const [packs, setPacks] = useState<SonicPack[]>([]);
  const [plateId, setPlateId] = useState("grand-master");
  const [kits, setKits] = useState(true);
  const plate = game.plates.find((p) => p.id === plateId) ?? game.plates[game.plates.length - 1];

  const opts = useMemo(() => ({ racerTypes, machineTypes, guests, supers, packs, newSave }), [racerTypes, machineTypes, guests, supers, packs, newSave]);
  const racers = useMemo(() => racerPool(game, opts), [game, opts]);
  const machines = useMemo(() => machinePool(game, opts), [game, opts]);
  const gadgets = useMemo(() => gadgetPool(game, { kits }), [game, kits]);
  const gadgetSlots = useMemo(() => new Map(game.gadgets.map((g) => [g.name, g.slots])), [game]);
  const racerReel = useMemo(() => racers.map((r) => ({ name: r.name, img: "", color: statColor(game, r.type) })), [game, racers]);
  const machineReel = useMemo(() => machines.map((x) => ({ name: x.name, img: "", color: statColor(game, x.type) })), [game, machines]);

  // One entry per seat; null = not rolled yet.
  const [loadouts, setLoadouts] = useState<(SonicLoadout | null)[]>([]);
  const [animateReel, setAnimateReel] = useState(true);

  /** Everyone (the intro's Randomize button) or one seat (that card's refresh), never more than asked. */
  const rollLoadouts = (seat?: number) => {
    if (seat === undefined) {
      setLoadouts(drawLoadouts(racers, machines, gadgets, plate, players, { repeats }));
    } else {
      // Racers stay different: skip the ones the other seats hold.
      const taken = repeats ? [] : otherSeats(loadouts, seat).map((l) => l.racer);
      const pool = racers.filter((r) => !taken.includes(r.name));
      const [one] = drawLoadouts(pool.length ? pool : racers, machines, gadgets, plate, 1, { repeats });
      setLoadouts((cur) => withSeat(cur, seat, one));
    }
    track(EVENTS.sonicRacersRolled, { players, slot: seat === undefined ? "all" : "one" });
  };
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setLoadouts((cur) => cur.filter((_, j) => j !== seat));
  };
  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: string) =>
    set((cur) => (cur.includes(v as T) ? cur.filter((x) => x !== v) : [...cur, v as T]));

  // Races + Grand Prix
  const [raceCount, setRaceCount] = useState("4");
  const [crossWorlds, setCrossWorlds] = useState(true);
  const [races, setRaces] = useState<SonicRace[]>([]);
  const [grandPrix, setGrandPrix] = useState<SonicCup | null>(null);
  const [raceSpins, setRaceSpins] = useState(0);
  const trackNames = useMemo(() => game.tracks.map((t) => t.name), [game]);
  const ownTracks = useMemo(() => trackPool(game, packs), [game, packs]);
  const cups = useMemo(() => cupPool(game, packs), [game, packs]);
  const rollRacesNow = () => {
    setRaces(rollRaces(game, { count: Number(raceCount), packs, crossWorlds }));
    setGrandPrix(null); setRaceSpins((n) => n + 1);
    track(EVENTS.sonicRacesRolled, { kind: "races", count: Number(raceCount) });
  };
  const rollGrandPrixNow = () => {
    setGrandPrix(rollGrandPrix(game, packs));
    setRaces([]); setRaceSpins((n) => n + 1);
    track(EVENTS.sonicRacesRolled, { kind: "grand-prix", count: 4 });
  };

  // Saving + loading (?config=)
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
        const cfg = data?.config_data as SonicSetupConfig | undefined;
        if (!data || cfg?.type !== "sonic-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        if (game.plates.some((p) => p.id === cfg.plate)) setPlateId(cfg.plate);
        setPlayers(Math.max(1, Math.min(MAX_PLAYERS, cfg.players.length)));
        setNames(Array.from({ length: MAX_PLAYERS }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        setLoadouts(cfg.players.map((p) => (p.racer ? { racer: p.racer, machine: p.machine, gadgets: p.gadgets ?? [], superSlot: p.superSlot ?? null } : null)));
        setRaces(cfg.races ?? []);
        setGrandPrix(game.cups.find((c) => c.name === cfg.grandPrix) ?? null);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: SonicSetupConfig = {
      type: "sonic-setup", gameSlug: game.slug, plate: plate.id,
      players: Array.from({ length: players }, (_, i) => ({
        name: seatName(i), racer: loadouts[i]?.racer ?? "", machine: loadouts[i]?.machine ?? "",
        gadgets: loadouts[i]?.gadgets ?? [], superSlot: loadouts[i]?.superSlot ?? null,
      })),
      races, grandPrix: grandPrix?.name ?? null,
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved"); setSaveOpen(false);
  };

  const typeOptions = game.stats.map((s) => ({ value: s.id, label: s.label }));
  const summary = [
    racerTypes.length ? `${racerTypes.map((t) => statLabel(game, t)).join(", ")} racers` : null,
    !guests && "No guest racers",
    supers && "Super Sonic and Super Shadow",
    repeats && "Racers can repeat",
    machineTypes.length ? `${machineTypes.map((t) => statLabel(game, t)).join(", ")} machines` : null,
    newSave && "New save",
    plate.label.replace(/ \(.*\)$/, ""),
    !kits && "No kits",
    packs.length ? `${packs.length} paid ${packs.length === 1 ? "pack" : "packs"}` : "No paid DLC",
  ].filter((x): x is string => !!x);

  const racersTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A racer, machine and gadgets for everyone.</h2>
          <p>
            {players > racers.length && !repeats
              ? `The pool has ${racers.length} racers, so with ${players} players some share one.`
              : repeats ? "Add a player for each racer, then randomize." : "Add a player for each racer, then randomize. Nobody gets the same racer."}{" "}
            {racers.length} racers, {machines.length} machines and {gadgets.length} gadgets in the pool.
          </p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={() => setPlayers((n) => Math.min(MAX_PLAYERS, n + 1))}>Add Player</Button>
            <Button variant="primary" onClick={() => rollLoadouts()}>Randomize Racers</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Options" summary={summary}>
            <FilterGroup label="Racer types" activeValues={racerTypes} onToggle={toggle(setRacerTypes)} options={typeOptions} />
            <FilterGroup label="Racers"
              activeValues={[...(guests ? ["guests"] : []), ...(supers ? ["supers"] : []), ...(repeats ? ["repeats"] : [])]}
              onToggle={(v) => (v === "guests" ? setGuests((x) => !x) : v === "supers" ? setSupers((x) => !x) : setRepeats((x) => !x))}
              options={[{ value: "guests", label: "Guest racers" }, { value: "supers", label: "Super Sonic and Super Shadow" }, { value: "repeats", label: "Same racer more than once" }]} />
            <FilterGroup label="Machine types" activeValues={machineTypes} onToggle={toggle(setMachineTypes)}
              options={game.stats.map((s) => ({ value: s.id, label: s.id === "boost" ? "Boost (boards)" : s.label }))} />
            <FilterGroup label="Unlocks" activeValues={newSave ? ["new"] : []} onToggle={() => setNewSave((x) => !x)}
              options={[{ value: "new", label: "New save (only what's open from the start)" }]} />
            <div className="sonic-options__plate">
              <Select floatingLabel="Gadget Plate" value={plate.id} onChange={(v) => setPlateId(String(v))}
                options={game.plates.map((p) => ({ value: p.id, label: p.label }))} fullWidth />
            </div>
            <FilterGroup label="Gadgets" activeValues={kits ? [] : ["nokits"]} onToggle={() => setKits((x) => !x)}
              options={[{ value: "nokits", label: "Leave out kits" }]} />
            <FilterGroup label="Paid DLC you own" activeValues={packs} onToggle={toggle(setPacks)}
              options={game.packs.map((p) => ({ value: p.id, label: p.label }))} />
            <p className="party-muted">
              No types picked means every type. Free update racers and machines are always in; paid ones only with their pack.
              Super Sonic and Super Shadow race in Grand Prix only, and Super Shadow also needs both season passes.
            </p>
          </RandomizerOptions>
        </div>
      </div>
      <div className="randomizer-grid">
        {Array.from({ length: players }, (_, i) => {
          const l = loadouts[i];
          const r = l ? game.racers.find((x) => x.name === l.racer) : undefined;
          const mc = l ? game.machines.find((x) => x.name === l.machine) : undefined;
          return (
            <SeatCard key={i} rolled={Boolean(l)} animate={animateReel}
              name={<Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />}
              actions={
                <CardActions
                  refreshLabel={`New racer, machine and gadgets for ${seatLabel(names, i)}`} onRefresh={() => rollLoadouts(i)}
                  removeLabel={`Remove ${seatLabel(names, i)}`} onRemove={players > 1 ? () => removePlayer(i) : undefined} />
              }
              tile={<KartSlot label="Racer" portrait name={l?.racer ?? null} imageSrc={null} fallback={IMAGE_COMING_SOON} color={r ? statColor(game, r.type) : null} pool={racerReel} animate={animateReel} empty={<RandomTile look="sonic" />} />}>
              <ul className="player-card__parts player-card__parts--row">
                <KartSlot label="Machine" portrait name={l?.machine ?? null} imageSrc={null} fallback={IMAGE_COMING_SOON} color={mc ? statColor(game, mc.type) : null} pool={machineReel} animate={animateReel} empty={<RandomTile look="sonic" />} />
              </ul>
              {l && (
                <dl className="splat-kit">
                  <div><dt>Racer type</dt><dd>{r ? statLabel(game, r.type) : "?"}</dd></div>
                  <div><dt>Machine type</dt><dd>{mc ? statLabel(game, mc.type) : "?"}</dd></div>
                </dl>
              )}
              {l && l.gadgets.length > 0 && (
                <div className="sonic-plate">
                  <p className="sonic-plate__label">Gadgets</p>
                  <ul className="sonic-plate__list">
                    {l.gadgets.map((g) => <GadgetRow key={g} name={g} slots={gadgetSlots.get(g) ?? 1} />)}
                    {l.superSlot && <GadgetRow name={l.superSlot} slots={1} superSlot />}
                  </ul>
                </div>
              )}
            </SeatCard>
          );
        })}
      </div>
    </section>
  );

  const racesTab = (
    <div className="party-section">
      <div className="randomizer-setup">
        <RandomizerOptions title="Race options"
          summary={[crossWorlds ? "A CrossWorld on lap 2" : "No CrossWorlds", packs.length ? `${packs.length} paid ${packs.length === 1 ? "pack" : "packs"}` : "No paid tracks"]}>
          <FilterGroup label="Laps" activeValues={crossWorlds ? ["cw"] : []} onToggle={() => setCrossWorlds((x) => !x)}
            options={[{ value: "cw", label: "A CrossWorld on lap 2" }]} />
          <FilterGroup label="Paid DLC you own" activeValues={packs} onToggle={toggle(setPacks)}
            options={game.packs.map((p) => ({ value: p.id, label: p.label }))} />
          <p className="party-muted">Without a CrossWorld, a race is three laps of its track. Packs picked here count on the Racers tab too.</p>
        </RandomizerOptions>
      </div>
      <div className="party-row sonic-races__row">
        <Select floatingLabel="Races" value={raceCount} onChange={(v) => setRaceCount(String(v))}
          options={RACE_COUNTS.map((n) => ({ value: n, label: n === "1" ? "One race" : `${n} races` }))} />
        <Button variant="primary" iconBefore={IconDice5} onClick={rollRacesNow}>{races.length ? "Roll again" : "Roll the races"}</Button>
        <Button variant="secondary" iconBefore={IconDice5} onClick={rollGrandPrixNow}>Roll a Grand Prix</Button>
      </div>
      <p className="party-muted">
        A track comes up again only after all {ownTracks.length} have. {cups.length} Grands Prix in the pool.
      </p>
      {races.length > 0 && (
        <ol className="splat-battles">
          {races.map((race, i) => (
            <li key={i} className="party-board sonic-board">
              <div className="party-board__body">
                <div className="party-board__head"><span className="party-board__label">{races.length > 1 ? `Race ${i + 1}` : "Race"}</span></div>
                <p className="party-board__name"><RollingText key={raceSpins} value={race.track} pool={trackNames} spin={animateReel && raceSpins > 0} /></p>
                {race.crossWorld && <p className="party-board__blurb">CrossWorld on lap 2: {race.crossWorld}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {grandPrix && (
        <div className="party-board sonic-board sonic-gp">
          <div className="party-board__body">
            <div className="party-board__head"><span className="party-board__label">4 races</span></div>
            <p className="party-board__name"><RollingText key={raceSpins} value={grandPrix.name} pool={game.cups.map((c) => c.name)} spin={animateReel && raceSpins > 0} /></p>
            <ol className="sonic-gp__races">
              {grandPrix.tracks.map((t) => <li key={t}>{t}</li>)}
              <li>Final race: a lap of each</li>
            </ol>
            <p className="party-board__blurb">The game picks each race&apos;s CrossWorld.</p>
          </div>
        </div>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "racers", label: "Racers", content: racersTab },
    { id: "races", label: "Races", content: racesTab },
  ];
  return (
    <div className="sonic-randomizer">
      <div className="randomizer-controls">
        <Tabs variant="pills" size="medium" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: <></> }))} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : void save())} iconBefore={IconDeviceFloppy}>
            {saveName && loadedId ? `Update: ${saveName}` : "Save Complete Setup"}
          </Button>
        </div>
      </div>
      <div className="party">{tabs.find((t) => t.id === tab)?.content}</div>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday race night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}

/** One gadget on the plate: its name and a square per slot it takes. */
function GadgetRow({ name, slots, superSlot = false }: { name: string; slots: number; superSlot?: boolean }) {
  return (
    <li className={`sonic-plate__gadget${superSlot ? " sonic-plate__gadget--super" : ""}`}>
      <span className="sonic-plate__name">{name}</span>
      {superSlot
        ? <span className="sonic-plate__super">Super Slot</span>
        : (
          <span className="sonic-plate__slots" aria-label={`${slots} ${slots === 1 ? "slot" : "slots"}`} role="img">
            {Array.from({ length: slots }, (_, i) => <span key={i} className="sonic-plate__pip" />)}
          </span>
        )}
    </li>
  );
}
