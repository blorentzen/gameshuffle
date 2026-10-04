"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SplatoonSetupConfig } from "@/data/config-types";
import { Badge, Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy, IconDice5 } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { saveConfig } from "@/lib/configs";
import { drawWeapons, rollBattle, rollSalmon, rollSet, splitTeams, weaponPool, type BattleRoll } from "@/lib/splatoon/roll";
import type { SplatModeKind, SplatWeapon, SplatoonGame, WeaponClass } from "@/lib/splatoon/types";

/**
 * Splatoon 3 randomizer: a weapon kit (main, sub, special) for up to 8
 * players, a battle or a set of battles (mode + stage), a Salmon Run stage,
 * and Alpha/Bravo teams for a Private Battle. Same shape as the Mario Kart and
 * Smash randomizers. Only rolls; the meta game lives in game nights.
 */

type Tab = "weapons" | "battles" | "teams";

export function SplatoonRandomizer({ game }: { game: SplatoonGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("weapons");

  // Players
  const [players, setPlayers] = useState(4);
  const [names, setNames] = useState<string[]>(Array(8).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);

  // Weapons
  const [classes, setClasses] = useState<WeaponClass[]>([]);
  const [replicas, setReplicas] = useState(false);
  const [noRepeats, setNoRepeats] = useState(false);
  const [used, setUsed] = useState<string[]>([]);
  const [kits, setKits] = useState<SplatWeapon[]>([]);
  const [animateReel, setAnimateReel] = useState(true);
  const pool = useMemo(() => weaponPool(game, { classes, replicas }), [game, classes, replicas]);
  const classColor = useCallback((c: WeaponClass) => game.classes.find((x) => x.id === c)?.color ?? "#555", [game]);
  const art = (w: SplatWeapon) => (game.artReady ? `${game.assetBase}${w.img}` : "");
  const reelPool = useMemo(
    () => pool.map((w) => ({ name: w.name, img: game.artReady ? `${game.assetBase}${w.img}` : "", color: classColor(w.cls) })),
    [pool, classColor, game],
  );

  const rollKits = (seat?: number) => {
    const avoid = noRepeats ? [...used, ...kits.map((k) => k.name)] : seat === undefined ? [] : kits.map((k) => k.name);
    const roll = drawWeapons(pool, seat === undefined ? players : 1, { used: avoid });
    if (seat === undefined) setKits(roll);
    else setKits((cur) => cur.map((k, i) => (i === seat ? roll[0] : k)));
    trackEvent("Splatoon Weapons Rolled", { players: String(players) });
  };
  const nextGame = () => { setUsed((u) => [...u, ...kits.map((k) => k.name)]); rollKits(); };
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setKits((cur) => cur.filter((_, j) => j !== seat));
  };
  const toggleClass = (v: string) => setClasses((c) => (c.includes(v as WeaponClass) ? c.filter((x) => x !== v) : [...c, v as WeaponClass]));
  const toggleInclude = (v: string) => {
    if (v === "replicas") setReplicas((r) => !r);
    if (v === "norepeat") { setNoRepeats((n) => !n); setUsed([]); }
  };

  // Battles
  const [kinds, setKinds] = useState<SplatModeKind[]>(["turf", "ranked"]);
  const [setSize, setSetSize] = useState("1");
  const [battles, setBattles] = useState<BattleRoll[]>([]);
  const [salmon, setSalmon] = useState<string | null>(null);
  const toggleKind = (v: string) => setKinds((k) => (k.includes(v as SplatModeKind) ? (k.length > 1 ? k.filter((x) => x !== v) : k) : [...k, v as SplatModeKind]));
  const rollBattles = () => {
    const n = Number(setSize);
    setBattles(n === 1 ? [rollBattle(game, kinds)] : rollSet(game, kinds, n));
    trackEvent("Splatoon Battle Rolled", { count: setSize });
  };
  const mode = (id: string) => game.modes.find((m) => m.id === id);

  // Teams
  const [teams, setTeams] = useState<{ alpha: string[]; bravo: string[] } | null>(null);

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
        const cfg = data?.config_data as SplatoonSetupConfig | undefined;
        if (!data || cfg?.type !== "splatoon-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        setPlayers(Math.max(1, Math.min(8, cfg.players.length)));
        setNames(Array.from({ length: 8 }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        setKits(cfg.players.map((p) => game.weapons.find((w) => w.name === p.weapon)).filter((w): w is SplatWeapon => !!w));
        setBattles(cfg.battles ?? []); setSalmon(cfg.salmon ?? null); setTeams(cfg.teams ?? null);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: SplatoonSetupConfig = {
      type: "splatoon-setup", gameSlug: game.slug,
      players: Array.from({ length: players }, (_, i) => ({ name: seatName(i), weapon: kits[i]?.name ?? "" })),
      battles, salmon, teams,
    };
    const res = await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Setup saved"); setSaveOpen(false);
  };

  const weaponsTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A weapon kit for everyone.</h2>
          <p>Up to eight players, each with a main weapon, its sub and its special. {pool.length} kits in the pool{noRepeats ? `, ${used.length} already played tonight` : ""}.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players >= 8} onClick={() => setPlayers((n) => Math.min(8, n + 1))}>Add Player</Button>
            <Button variant="primary" onClick={() => rollKits()}>Randomize Weapons</Button>
            {noRepeats && kits.length > 0 && <Button variant="secondary" onClick={nextGame}>Next battle (no repeats)</Button>}
            {noRepeats && used.length > 0 && <Button variant="ghost" onClick={() => setUsed([])}>Reset the night</Button>}
            <span style={{ marginLeft: "var(--spacing-12)" }}>
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div>
          <h2 style={{ marginBottom: "var(--spacing-32)" }}>Any special modifiers you want to add?</h2>
          <div className="filter-section">
            <FilterGroup label="Classes" activeValues={classes} onToggle={toggleClass}
              options={game.classes.map((c) => ({ value: c.id, label: c.label }))} />
            <FilterGroup label="Include" activeValues={[...(replicas ? ["replicas"] : []), ...(noRepeats ? ["norepeat"] : [])]} onToggle={toggleInclude}
              options={[{ value: "replicas", label: "Replicas" }, { value: "norepeat", label: "No repeats tonight" }]} />
          </div>
          {classes.length === 0 && <p className="party-muted">No classes picked means every class.</p>}
        </div>
      </div>
      <div className="randomizer-grid">
        {Array.from({ length: players }, (_, i) => {
          const k = kits[i];
          return (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
                <div className="player-card__actions">
                  <Button variant="primary" size="small" onClick={() => (kits.length ? rollKits(i) : rollKits())}>Refresh Weapon</Button>
                  {players > 1 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                </div>
              </div>
              <ul className="player-card__slots">
                <KartSlot label="Weapon" portrait name={k?.name ?? null} imageSrc={k ? art(k) || null : null}
                  color={k ? classColor(k.cls) : null} pool={reelPool} animate={animateReel} />
              </ul>
              {k && (
                <dl className="splat-kit">
                  <div><dt>Class</dt><dd>{k.cls}</dd></div>
                  <div><dt>Sub</dt><dd>{k.sub}</dd></div>
                  <div><dt>Special</dt><dd>{k.special}</dd></div>
                </dl>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  const battlesTab = (
    <div className="party-section">
      <div className="filter-section">
        <FilterGroup label="Modes" activeValues={kinds} onToggle={toggleKind}
          options={[{ value: "turf", label: "Turf War" }, { value: "ranked", label: "Anarchy modes" }]} />
      </div>
      <div className="party-row">
        <Select floatingLabel="Battles" value={setSize} onChange={(v) => setSetSize(String(v))}
          options={[{ value: "1", label: "One battle" }, { value: "3", label: "A set of 3" }, { value: "5", label: "A set of 5" }]} />
        <Button variant="primary" iconBefore={IconDice5} onClick={rollBattles}>{battles.length ? "Roll again" : "Roll the battle"}</Button>
      </div>
      <p className="party-muted">A set never repeats a stage. Anarchy modes are Splat Zones, Tower Control, Rainmaker and Clam Blitz.</p>
      {battles.length > 0 && (
        <ol className="splat-battles">
          {battles.map((b, i) => (
            <li key={i} className="party-board" style={{ "--party-board": "#2c2f6b" } as React.CSSProperties}>
              <div className="party-board__body">
                <div className="party-board__head">
                  <span className="party-board__label">{battles.length > 1 ? `Battle ${i + 1}` : "Battle"}</span>
                  <Badge variant={mode(b.modeId)?.kind === "turf" ? "success" : "info"} size="small">{mode(b.modeId)?.name}</Badge>
                </div>
                <p className="party-board__name">{b.stage}</p>
                <p className="party-board__blurb">{mode(b.modeId)?.blurb}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <h3 className="party-h3" style={{ marginTop: "var(--spacing-24)" }}>Salmon Run</h3>
      <div className="party-row">
        <Button variant="secondary" iconBefore={IconDice5} onClick={() => setSalmon(rollSalmon(game))}>{salmon ? "Roll again" : "Roll a Salmon Run stage"}</Button>
        {salmon && <strong>{salmon}</strong>}
      </div>
    </div>
  );

  const teamsTab = (
    <div className="party-section">
      <p className="party-muted">Splits the {players} players on the Weapons tab into Alpha and Bravo. A Private Battle takes up to four a side.</p>
      <Button variant="primary" iconBefore={IconDice5} disabled={players < 2} onClick={() => setTeams(splitTeams(Array.from({ length: players }, (_, i) => seatName(i))))}>
        {teams ? "Shuffle the teams" : "Make teams"}
      </Button>
      {teams && (
        <div className="party-hands">
          {([["Alpha", teams.alpha], ["Bravo", teams.bravo]] as const).map(([label, list]) => (
            <div key={label} className="party-hand">
              <p className="party-missions__who"><strong>{label} Team</strong></p>
              <ol className="party-list">{list.map((n) => {
                const k = kits[Array.from({ length: players }, (_, i) => seatName(i)).indexOf(n)];
                return <li key={n}>{n}{k ? `: ${k.name}` : ""}</li>;
              })}</ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "weapons", label: "Weapon Randomizer", content: weaponsTab },
    { id: "battles", label: "Battles & Salmon Run", content: battlesTab },
    { id: "teams", label: "Teams", content: teamsTab },
  ];
  return (
    <div className="splatoon-randomizer">
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
        <Input floatingLabel="Name this setup" placeholder="Friday Splatfest" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
