"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SmashSetupConfig } from "@/data/config-types";
import { Badge, Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy, IconDice5 } from "@tabler/icons-react";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useGameCollection } from "@/hooks/useGameCollection";
import { CollectionBar } from "@/components/collection/CollectionBar";
import { saveConfig } from "@/lib/configs";
import {
  COMPETITIVE_RULES, drawFighters, drawSquads, fighterPool, rollCustomSmash, rollPartyRules, rollStage, stagePool,
  type FighterRoll, type SmashRules, type StageRoll,
} from "@/lib/smash/roll";
import type { SmashGame } from "@/lib/smash/types";
import { fighterColor } from "@/data/smash/ultimate";

/**
 * Smash randomizer: fighters for 2 to 8 players, stages from the competitive
 * list or everything, Competitive or Party rules, Custom Smash and Squad
 * Strike rolls, like the Mario Kart randomizers. The meta game (cards,
 * missions, points) lives in game nights and tournaments. Respects the
 * person's collection, starting from base game only.
 */

type Tab = "fighters" | "stage" | "squad";
const RULE_ITEMS: Record<SmashRules["items"], string> = { off: "Items off", low: "Items low", medium: "Items medium", high: "Items high", "very high": "Items very high" };

function describeRules(r: SmashRules): string {
  const mins = r.minutes ? `, ${r.minutes} minutes` : ", no time limit";
  const how = r.kind === "stock" ? `${r.stocks} stock${r.stocks === 1 ? "" : "s"}${mins}` : r.kind === "time" ? `Time${mins}` : `Stamina${mins}`;
  return `${how} · ${RULE_ITEMS[r.items]}${r.finalSmashMeter ? " · Final Smash meter on" : ""}`;
}

export function SmashRandomizer({ game }: { game: SmashGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("fighters");

  // Collection: DLC starts off (base game only) until someone ticks their packs.
  const defaults = useMemo(() => ({
    enabled: true,
    off: { fighters: game.fighters.filter((f) => f.pack).map((f) => f.name), stages: game.stages.filter((s) => s.pack).map((s) => s.id) },
    prefs: {},
  }), [game]);
  const col = useGameCollection(game.slug, defaults);
  const offFighters = useMemo(() => (col.collection.enabled ? col.collection.off.fighters ?? [] : []), [col.collection]);
  const offStages = useMemo(() => (col.collection.enabled ? col.collection.off.stages ?? [] : []), [col.collection]);

  // Players
  const [players, setPlayers] = useState(2);
  const [names, setNames] = useState<string[]>(Array(8).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);

  // Fighters
  const [echoes, setEchoes] = useState<"separate" | "merged">("separate");
  const [miis, setMiis] = useState(false);
  const [series, setSeries] = useState<string[]>([]);
  const [noRepeats, setNoRepeats] = useState(false);
  const [used, setUsed] = useState<string[]>([]);
  const [fighters, setFighters] = useState<FighterRoll[]>([]);
  const [animateReel, setAnimateReel] = useState(true);
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(2, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setFighters((cur) => cur.filter((_, j) => j !== seat));
  };
  const pool = useMemo(() => fighterPool(game, { echoes, miis, series, exclude: offFighters }), [game, echoes, miis, series, offFighters]);
  const rollFighters = (seat?: number) => {
    const roll = drawFighters(pool, seat === undefined ? players : 1, { used: noRepeats ? [...used, ...fighters.map((f) => f.name)] : [] });
    if (seat === undefined) setFighters(roll);
    else setFighters((cur) => cur.map((f, i) => (i === seat ? roll[0] : f)));
    trackEvent("Smash Fighters Rolled", { players: String(players) });
  };
  const nextGame = () => { setUsed((u) => [...u, ...fighters.map((f) => f.name)]); rollFighters(); };

  // Stage and rules
  const [preset, setPreset] = useState<"party" | "competitive">("party");
  const [stageList, setStageList] = useState<"competitive" | "all">("all");
  const [sometimes, setSometimes] = useState(false);
  const [stage, setStage] = useState<StageRoll | null>(null);
  const [rules, setRules] = useState<SmashRules | null>(null);
  const [custom, setCustom] = useState<Record<string, string> | null>(null);
  const stages = useMemo(() => stagePool(game, { list: preset === "competitive" ? "competitive" : stageList, sometimes, exclude: offStages }), [game, preset, stageList, sometimes, offStages]);
  const rollStageNow = () => {
    setStage(rollStage(stages, preset === "competitive"));
    setRules(preset === "competitive" ? COMPETITIVE_RULES : rollPartyRules());
  };
  const stageRow = game.stages.find((s) => s.id === stage?.stageId);

  // Squad Strike
  const [squadSize, setSquadSize] = useState<3 | 5>(3);
  const [squads, setSquads] = useState<string[][]>([]);


  // Cards (shared with Mario Party), counted in games.

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  // Hydrate a saved setup (?config=). Re-runs once the database deck loads so custom cards resolve.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("config");
    if (!id || !user) return;
    void createClient().from("saved_configs").select("id, config_name, config_data")
      .eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const cfg = data?.config_data as SmashSetupConfig | undefined;
        if (!data || cfg?.type !== "smash-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        const n = Math.max(2, Math.min(8, cfg.players.length));
        setPlayers(n);
        setNames(Array.from({ length: 8 }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        setFighters(cfg.players.filter((p) => p.fighter).map((p) => ({ name: p.fighter, costume: p.costume })));
        setPreset(cfg.preset); setStage(cfg.stage); setRules(cfg.rules as SmashRules | null); setCustom(cfg.custom);
        setSquads(cfg.squads ?? []);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  // Saving
  const summary = () => {
    const lines = [`${game.label} night`];
    if (fighters.length) lines.push(fighters.map((f, i) => `${seatName(i)}: ${f.name} (costume ${f.costume})`).join(", "));
    if (stageRow && rules) lines.push(`${stageRow.name}${stage?.form !== "normal" ? ` (${stage?.form === "omega" ? "Omega" : "Battlefield"} form)` : ""} · ${describeRules(rules)}${stage?.hazards ? " · hazards on" : ""}`);
    if (custom) lines.push(`Custom Smash: ${Object.entries(custom).filter(([, v]) => v !== "Normal").map(([k, v]) => `${game.customSmash.find((o) => o.id === k)?.label} ${v}`).join(", ")}`);
    return lines.join("\n");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary()); toast.success("Copied, ready to paste"); } catch { toast.error("Couldn't copy. Your browser blocked the clipboard."); }
  };
  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: SmashSetupConfig = {
      type: "smash-setup", gameSlug: game.slug, players: Array.from({ length: players }, (_, i) => ({ name: seatName(i), fighter: fighters[i]?.name ?? "", costume: fighters[i]?.costume ?? 1 })),
      stage, rules, custom, squads, plan: [], preset, rulesCards: [], chance: [], missions: [],
    };
    const res = await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Setup saved"); setSaveOpen(false);
  };

  const seriesOptions = useMemo(() => [...new Set(game.fighters.map((f) => f.series))].map((k) => ({ value: k, label: game.series[k] ?? k })).sort((a, b) => a.label.localeCompare(b.label)), [game]);

  // Fighters: same shape as the Mario Kart kart tab (intro + filters, then a grid of player cards).
  const includeValues = [...(echoes === "separate" ? ["echoes"] : []), ...(miis ? ["miis"] : []), ...(noRepeats ? ["norepeat"] : [])];
  const toggleInclude = (v: string) => {
    if (v === "echoes") setEchoes((e) => (e === "separate" ? "merged" : "separate"));
    if (v === "miis") setMiis((m) => !m);
    if (v === "norepeat") { setNoRepeats((n) => !n); setUsed([]); }
  };
  const fighterArt = (name: string) => { const f = game.fighters.find((x) => x.name === name); return f && game.artReady ? `${game.assetBase}${f.img}` : ""; };
  const reelPool = useMemo(() => pool.map((f) => ({ name: f.name, img: game.artReady ? `${game.assetBase}${f.img}` : "", color: fighterColor(f.series) })), [pool, game]);
  const fightersTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Pick fighters for everyone.</h2>
          <p>Two to eight players, a different fighter each. {pool.length} fighters in the pool{noRepeats ? `, ${used.length} already played tonight` : ""}.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players >= 8} onClick={() => setPlayers((n) => Math.min(8, n + 1))}>Add Player</Button>
            <Button variant="primary" onClick={() => rollFighters()}>Randomize Fighters</Button>
            {noRepeats && fighters.length > 0 && <Button variant="secondary" onClick={nextGame}>Next game (no repeats)</Button>}
            {noRepeats && used.length > 0 && <Button variant="ghost" onClick={() => setUsed([])}>Reset the night</Button>}
            <span style={{ marginLeft: "var(--spacing-12)" }}>
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div>
          <h2 style={{ marginBottom: "var(--spacing-32)" }}>Any special modifiers you want to add?</h2>
          <div className="filter-section">
            <FilterGroup label="Include" activeValues={includeValues} onToggle={toggleInclude}
              options={[{ value: "echoes", label: "Echo Fighters" }, { value: "miis", label: "Mii Fighters" }, { value: "norepeat", label: "No repeats (Smashdown)" }]} />
            <div className="filter-group">
              <span className="filter-group__label"><b>Series</b></span>
              <Select multiple size="small" placeholder="Every series" value={series} onChange={(v) => setSeries(v as string[])} options={seriesOptions} />
            </div>
          </div>
        </div>
      </div>
      <div className="randomizer-grid">
        {Array.from({ length: players }, (_, i) => {
          const f = fighters[i];
          return (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  <Input type="text" placeholder="Player Name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                </div>
                <div className="player-card__actions">
                  <Button variant="primary" size="small" onClick={() => (fighters.length ? rollFighters(i) : rollFighters())}>Refresh Fighter</Button>
                  {players > 2 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                </div>
              </div>
              <ul className="player-card__slots">
                <KartSlot label="Fighter" portrait name={f?.name ?? null} imageSrc={f ? fighterArt(f.name) || null : null}
                  color={f ? fighterColor(game.fighters.find((x) => x.name === f.name)?.series ?? "") : null} pool={reelPool} animate={animateReel} />
              </ul>
              {f && <p className="party-muted">Costume {f.costume} · {game.series[game.fighters.find((x) => x.name === f.name)?.series ?? ""] ?? ""}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );

  const stageTab = (
    <div className="party-section">
      <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
        <Button variant={preset === "party" ? "primary" : "secondary"} size="small" onClick={() => { setPreset("party"); setStage(null); setRules(null); }}>Party Rules</Button>
        <Button variant={preset === "competitive" ? "primary" : "secondary"} size="small" onClick={() => { setPreset("competitive"); setStage(null); setRules(null); }}>Competitive Rules</Button>
      </div>
      <p className="party-muted">{preset === "party" ? "Any stage, with the rules rolled too." : "Legal stages, 3 stocks, 7 minutes, no items."}</p>
      <div className="party-row">
        {preset === "party" && (
          <Select floatingLabel="Stages" value={stageList} onChange={(v) => setStageList(v as typeof stageList)}
            options={[{ value: "all", label: "Every stage" }, { value: "competitive", label: "Competitive list" }]} />
        )}
        {(preset === "competitive" || stageList === "competitive") && <Switch label="Include stages some events allow" checked={sometimes} onChange={(e) => setSometimes(e.target.checked)} />}
      </div>
      <div className="party-board" style={{ "--party-board": "#34405a" } as React.CSSProperties}>
        <div className="party-board__body">
          <div className="party-board__head"><span className="party-board__label">Stage</span>
            {stageRow && <Badge variant={stageRow.status === "starter" ? "success" : stageRow.status === "counterpick" ? "info" : "default"} size="small">{stageRow.status === "starter" ? "Starter" : stageRow.status === "counterpick" ? "Counterpick" : stageRow.status === "sometimes" ? "Sometimes legal" : "Casual"}</Badge>}
          </div>
          <p className="party-board__name">{stageRow?.name ?? "Roll to pick a stage"}</p>
          {stage && <p className="party-board__blurb">{stage.form === "normal" ? "Normal form" : stage.form === "omega" ? "Omega form" : "Battlefield form"} · hazards {stage.hazards ? "on" : "off"} · from {stageRow?.origin}</p>}
        </div>
      </div>
      {rules && <p><strong>Rules:</strong> {describeRules(rules)}</p>}
      <div className="party-actions">
        <Button variant="primary" iconBefore={IconDice5} onClick={rollStageNow}>{stage ? "Roll again" : "Roll the stage and rules"}</Button>
        <Button variant="secondary" onClick={() => setCustom(rollCustomSmash(game))}>Roll Custom Smash</Button>
      </div>
      <p className="party-muted">{stages.length} stages in the pool.</p>
      {custom && (
        <ul className="party-list">
          {game.customSmash.filter((o) => custom[o.id] !== "Normal").map((o) => <li key={o.id}><strong>{o.label}:</strong> {custom[o.id]}</li>)}
        </ul>
      )}
    </div>
  );

  const squadTab = (
    <div className="party-section">
      <div className="party-row">
        <Select floatingLabel="Squad size" value={String(squadSize)} onChange={(v) => setSquadSize(Number(v) === 5 ? 5 : 3)} options={[{ value: "3", label: "3 fighters" }, { value: "5", label: "5 fighters" }]} />
        <Button variant="primary" iconBefore={IconDice5} onClick={() => setSquads(drawSquads(pool, players, squadSize))}>{squads.length ? "Draw new squads" : "Draw squads"}</Button>
      </div>
      {squads.length > 0 && (
        <div className="party-hands">
          {squads.map((sq, i) => (
            <div key={i} className="party-hand">
              <p className="party-missions__who"><strong>{seatName(i)}</strong></p>
              <ol className="party-list">{sq.map((n) => <li key={n}>{n}</li>)}</ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "fighters", label: "Fighter Randomizer", content: fightersTab },
    { id: "stage", label: "Stage & Rules", content: stageTab },
    { id: "squad", label: "Squad Strike", content: squadTab },
  ];
  return (
    <div className="smash-randomizer">
      <CollectionBar slug={game.slug} col={col} />
      <div className="randomizer-controls">
        <Tabs variant="pills" size="medium" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: <></> }))} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
          <Button variant="secondary" size="small" onClick={copy} iconBefore={IconCopy}>Copy setup</Button>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : void save())} iconBefore={IconDeviceFloppy}>
            {saveName && loadedId ? `Update: ${saveName}` : "Save Complete Setup"}
          </Button>
        </div>
      </div>
      <div className="party">{tabs.find((t) => t.id === tab)?.content}</div>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update setup" : "Save this setup"} size="small"
        primaryAction={{ label: loadedId ? "Update setup" : "Save setup", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this setup" placeholder="Friday Night Smash" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
