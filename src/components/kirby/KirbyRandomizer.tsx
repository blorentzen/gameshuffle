"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { KirbySetupConfig } from "@/data/config-types";
import { Badge, Button, Input, Modal, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy, IconDice5 } from "@tabler/icons-react";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { RollingText } from "@/components/randomizer/RollingText";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { saveConfig } from "@/lib/configs";
import { drawCombos, machinePool, riderPool, rollCourse, rollStadium, type KirbyRoll } from "@/lib/kirby/roll";
import type { KirbyGame, MachineType, StadiumKind } from "@/lib/kirby/types";

/**
 * Kirby Air Riders randomizer: a rider and machine for up to 8 players, an Air
 * Ride or Top Ride course, and a City Trial Stadium. Same shape as the Mario
 * Kart randomizers. Only rolls; the meta game lives in game nights.
 */

type Tab = "riders" | "courses" | "city";

export function KirbyRandomizer({ game }: { game: KirbyGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("riders");

  // Players
  const [players, setPlayers] = useState(4);
  const [names, setNames] = useState<string[]>(Array(8).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);

  // Riders + machines
  const [types, setTypes] = useState<MachineType[]>([]);
  const [startersOnly, setStartersOnly] = useState(false);
  const [combos, setCombos] = useState<KirbyRoll[]>([]);
  const [animateReel, setAnimateReel] = useState(true);
  const riders = useMemo(() => riderPool(game, { startersOnly }), [game, startersOnly]);
  const machines = useMemo(() => machinePool(game, { types, startersOnly }), [game, types, startersOnly]);
  const img = useCallback((path: string) => (game.artReady ? `${game.assetBase}${path}` : ""), [game]);
  const typeColor = useCallback((t: MachineType) => game.machineTypes.find((x) => x.id === t)?.color ?? "#555", [game]);
  const riderReel = useMemo(() => riders.map((r) => ({ name: r.name, img: img(r.img), color: "#f08bb4" })), [riders, img]);
  const machineReel = useMemo(() => machines.map((m) => ({ name: m.name, img: img(m.img), color: typeColor(m.type) })), [machines, img, typeColor]);

  const rollCombos = (seat?: number) => {
    const taken = seat === undefined ? [] : combos.filter((_, i) => i !== seat).map((c) => c.rider);
    const pool = seat === undefined ? riders : riders.filter((r) => !taken.includes(r.name));
    const roll = drawCombos(pool.length ? pool : riders, machines, seat === undefined ? players : 1);
    if (seat === undefined) setCombos(roll);
    else setCombos((cur) => cur.map((c, i) => (i === seat ? roll[0] : c)));
    trackEvent("Kirby Riders Rolled", { players: String(players) });
  };
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setCombos((cur) => cur.filter((_, j) => j !== seat));
  };
  const toggleType = (v: string) => setTypes((t) => (t.includes(v as MachineType) ? t.filter((x) => x !== v) : [...t, v as MachineType]));

  // Courses + City Trial
  const [course, setCourse] = useState<{ kind: "air" | "top"; name: string } | null>(null);
  const [kinds, setKinds] = useState<StadiumKind[]>(["battle", "race", "glide", "collect"]);
  const [stadium, setStadium] = useState<string | null>(null);
  const [courseSpins, setCourseSpins] = useState(0);
  const [stadiumSpins, setStadiumSpins] = useState(0);
  const rollCourseNow = (kind: "air" | "top") => { setCourse({ kind, name: rollCourse(game, kind, kind === "air" && startersOnly) }); setCourseSpins((n) => n + 1); };
  const toggleKind = (v: string) => setKinds((k) => (k.includes(v as StadiumKind) ? (k.length > 1 ? k.filter((x) => x !== v) : k) : [...k, v as StadiumKind]));

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
        const cfg = data?.config_data as KirbySetupConfig | undefined;
        if (!data || cfg?.type !== "kirby-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        setPlayers(Math.max(1, Math.min(8, cfg.players.length)));
        setNames(Array.from({ length: 8 }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        setCombos(cfg.players.filter((p) => p.rider).map((p) => ({ rider: p.rider, machine: p.machine })));
        setCourse(cfg.course ?? null); setStadium(cfg.stadium ?? null);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: KirbySetupConfig = {
      type: "kirby-setup", gameSlug: game.slug,
      players: Array.from({ length: players }, (_, i) => ({ name: seatName(i), rider: combos[i]?.rider ?? "", machine: combos[i]?.machine ?? "" })),
      course, stadium,
    };
    const res = await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Setup saved"); setSaveOpen(false);
  };

  const ridersTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A rider and machine for everyone.</h2>
          <p>Up to eight players, each on a different rider. {riders.length} riders and {machines.length} machines in the pool.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players >= 8} onClick={() => setPlayers((n) => Math.min(8, n + 1))}>Add Player</Button>
            <Button variant="primary" onClick={() => rollCombos()}>Randomize Riders</Button>
            <span style={{ marginLeft: "var(--spacing-12)" }}>
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <RandomizerOptions title="Any special modifiers?" empty="Every machine type except Legendary"
            summary={[...types.map((t) => game.machineTypes.find((m) => m.id === t)?.label ?? t), startersOnly && "New save (starters only)"].filter((x): x is string => !!x)}>
            <FilterGroup label="Machines" activeValues={types} onToggle={toggleType}
              options={game.machineTypes.map((t) => ({ value: t.id, label: t.label }))} />
            <FilterGroup label="Unlocks" activeValues={startersOnly ? ["starters"] : []} onToggle={() => setStartersOnly((s) => !s)}
              options={[{ value: "starters", label: "New save (starters only)" }]} />
            <p className="party-muted">No machine types picked means every type except Legendary. Legendary machines aren&apos;t allowed in every mode.</p>
          </RandomizerOptions>
        </div>
      </div>
      <div className="randomizer-grid">
        {Array.from({ length: players }, (_, i) => {
          const c = combos[i];
          const r = c ? game.riders.find((x) => x.name === c.rider) : undefined;
          const m = c ? game.machines.find((x) => x.name === c.machine) : undefined;
          return (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
                <div className="player-card__actions">
                  <Button variant="primary" size="small" onClick={() => (combos.length ? rollCombos(i) : rollCombos())}>Refresh Rider</Button>
                  {players > 1 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                </div>
              </div>
              <ul className="player-card__slots">
                <KartSlot label="Rider" portrait name={r?.name ?? null} imageSrc={r ? img(r.img) || null : null} color={r ? "#f08bb4" : null} pool={riderReel} animate={animateReel} />
                <KartSlot label="Machine" portrait name={m?.name ?? null} imageSrc={m ? img(m.img) || null : null} color={m ? typeColor(m.type) : null} pool={machineReel} animate={animateReel} />
              </ul>
              {m && <p className="party-muted">{game.machineTypes.find((t) => t.id === m.type)?.label.replace(/s$/, "") ?? m.type}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );

  const coursesTab = (
    <div className="party-section">
      <div className="party-actions">
        <Button variant="primary" iconBefore={IconDice5} onClick={() => rollCourseNow("air")}>Roll an Air Ride course</Button>
        <Button variant="secondary" iconBefore={IconDice5} onClick={() => rollCourseNow("top")}>Roll a Top Ride course</Button>
      </div>
      <p className="party-muted">{startersOnly ? "Starters only is on, so Air Ride picks from the 8 courses open on a new save." : `Air Ride picks from all ${game.airRideCourses.length} courses; Top Ride from ${game.topRideCourses.length}.`}</p>
      <div className="party-board" style={{ "--party-board": "#6b2f6b" } as React.CSSProperties}>
        <div className="party-board__body">
          <div className="party-board__head">
            <span className="party-board__label">{course?.kind === "top" ? "Top Ride" : "Air Ride"}</span>
          </div>
          <p className="party-board__name">{course
            ? <RollingText key={courseSpins} value={course.name} pool={(course.kind === "air" ? game.airRideCourses : game.topRideCourses).map((c) => c.name)} spin={animateReel && courseSpins > 0} />
            : "Roll to pick a course"}</p>
        </div>
      </div>
    </div>
  );

  const cityTab = (
    <div className="party-section">
      <p className="party-muted">City Trial ends in a Stadium. Roll one to play, or to call it before the timer runs out.</p>
      <div className="randomizer-setup">
        <RandomizerOptions title="Stadium options"
          summary={kinds.length === game.stadiumKinds.length ? ["Every kind of Stadium"] : game.stadiumKinds.filter((k) => kinds.includes(k.id)).map((k) => k.label)}>
          <div className="filter-section">
            <FilterGroup label="Stadiums" activeValues={kinds} onToggle={toggleKind}
              options={game.stadiumKinds.map((k) => ({ value: k.id, label: k.label }))} />
          </div>
        </RandomizerOptions>
      </div>
      <div className="party-board" style={{ "--party-board": "#2f4f8a" } as React.CSSProperties}>
        <div className="party-board__body">
          <div className="party-board__head">
            <span className="party-board__label">Stadium</span>
            {stadium && <Badge variant="info" size="small">{game.stadiumKinds.find((k) => k.id === game.stadiums.find((s) => s.name === stadium)?.kind)?.label}</Badge>}
          </div>
          <p className="party-board__name">{stadium
            ? <RollingText key={stadiumSpins} value={stadium} pool={game.stadiums.filter((x) => kinds.includes(x.kind)).map((x) => x.name)} spin={animateReel && stadiumSpins > 0} />
            : "Roll to pick a Stadium"}</p>
        </div>
      </div>
      <div className="party-actions">
        <Button variant="primary" iconBefore={IconDice5} onClick={() => { setStadium(rollStadium(game, kinds)); setStadiumSpins((n) => n + 1); }}>{stadium ? "Roll again" : "Roll a Stadium"}</Button>
      </div>
    </div>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "riders", label: "Rider & Machine", content: ridersTab },
    { id: "courses", label: "Courses", content: coursesTab },
    { id: "city", label: "City Trial", content: cityTab },
  ];
  return (
    <div className="kirby-randomizer">
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
        <Input floatingLabel="Name this setup" placeholder="City Trial night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
