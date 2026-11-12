"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconDeviceFloppy, IconDice5, IconRefresh } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { WonderSetupConfig } from "@/data/config-types";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { RollingText } from "@/components/randomizer/RollingText";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { CardActions } from "@/components/randomizer/CardActions";
import { SeatCard } from "@/components/randomizer/PlayerCard";
import { RandomTile } from "@/components/randomizer/RandomTile";
import { IconAction } from "@/components/actions/IconAction";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { EVENTS, track } from "@/lib/analytics/events";
import { saveConfig, updateConfig } from "@/lib/configs";
import { otherSeats, seatLabel, withSeat } from "@/lib/randomizers/seats";
import {
  BADGE_TYPE_COLOR, BADGE_TYPE_LABEL, LASTS_LABEL, LEVEL_GROUPS, LEVEL_TYPE_LABEL, RULE_KIND_LABEL,
  badgePool, badgeWorn, characterPool, drawPlayers, drawSeat, levelPool, rerollRule, rollLevel, rollLevels, rollRules,
  ruleDetail, ruleOf, rulePool, worldLabel, worldOf, worldsFor,
  type BadgeSet, type RolledRule, type WonderPick,
} from "@/lib/wonder/roll";
import type { WonderBadgeType, WonderGame, WonderLevel, WonderLevelType, WonderRuleKind, WonderWorldId } from "@/lib/wonder/types";
import "@/styles/wonder-randomizer.css";

/**
 * Super Mario Bros. Wonder randomizer (game space picks 2026-11-11): Wonder is four-player co-op with no winner, so a
 * roll turns a play-through into a challenge: a character and a badge for each player, a level from a world, and a
 * rule or two for the next levels. The Levels tab rolls a run of levels for the night. Only rolls.
 */

type Tab = "challenge" | "levels";
const MAX_PLAYERS = 4;
const ANY = "any";
const LEVEL_COUNTS = ["1", "3", "5", "8"];
const RULE_COUNTS = ["0", "1", "2", "3"];
const BADGE_SETS: { value: BadgeSet; label: string }[] = [
  { value: "all", label: "Every badge" },
  { value: "before-ending", label: "Before the ending (no badges from after Bowser)" },
  { value: "first-world", label: "First world only (a new save)" },
];
const DEFAULT_GROUPS = ["course", "bosses", "showdown"];
const STAR_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? "1 star" : `${n} stars` }));

export function WonderRandomizer({ game }: { game: WonderGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const [tab, setTab] = useState<Tab>("challenge");
  const [animateReel, setAnimateReel] = useState(true);

  // Players
  const [players, setPlayers] = useState(2);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);

  // Options (one set for both tabs: the Switch 2 Edition and the level types apply to both)
  const [switch2, setSwitch2] = useState(false);
  const [noDamage, setNoDamage] = useState(true);
  const [badgeTypes, setBadgeTypes] = useState<WonderBadgeType[]>([]);
  const [badgeSet, setBadgeSet] = useState<BadgeSet>("all");
  const [soundOff, setSoundOff] = useState(true);
  const [badgeRepeats, setBadgeRepeats] = useState(false);
  const [groups, setGroups] = useState<string[]>(DEFAULT_GROUPS);
  const [stars, setStars] = useState<string[]>([]);
  const [ruleCount, setRuleCount] = useState("2");
  const [ruleKinds, setRuleKinds] = useState<WonderRuleKind[]>([]);
  const [worldPick, setWorldPick] = useState<string>(ANY);

  const worlds = useMemo(() => worldsFor(game, switch2), [game, switch2]);
  // Bellabel Park only exists in the Switch 2 Edition: turning it off falls back to any world.
  const world = worlds.some((w) => w.id === worldPick) ? (worldPick as WonderWorldId) : null;
  const shownGroups = useMemo(() => LEVEL_GROUPS.filter((g) => switch2 || !g.switch2), [switch2]);
  const levelTypes = useMemo<WonderLevelType[]>(() => shownGroups.filter((g) => groups.includes(g.id)).flatMap((g) => g.types), [shownGroups, groups]);
  const starNums = useMemo(() => stars.map(Number), [stars]);

  const chars = useMemo(() => characterPool(game, { switch2, noDamage }), [game, switch2, noDamage]);
  const badges = useMemo(() => badgePool(game, { switch2, types: badgeTypes.filter((t) => switch2 || t !== "dual"), set: badgeSet, soundOff }), [game, switch2, badgeTypes, badgeSet, soundOff]);
  const levels = useMemo(() => levelPool(game, { switch2, world, types: levelTypes, stars: starNums }), [game, switch2, world, levelTypes, starNums]);
  const rules = useMemo(() => rulePool(game, ruleKinds), [game, ruleKinds]);

  const charImg = useCallback((slug: string) => `${game.assetBase}characters/${slug}.webp`, [game]);
  const badgeImg = useCallback((slug: string) => `${game.assetBase}badges/${slug}.webp`, [game]);
  const charReel = useMemo(() => chars.map((c) => ({ name: c.name, img: charImg(c.slug), color: c.color })), [chars, charImg]);
  const badgeReel = useMemo(() => badges.map((b) => ({ name: b.name, img: badgeImg(b.slug) })), [badges, badgeImg]);
  const levelNames = useMemo(() => game.levels.map((l) => l.name), [game]);

  // The challenge: one entry per seat (null = not rolled yet), the level and the rules.
  const [picks, setPicks] = useState<(WonderPick | null)[]>([]);
  const [level, setLevel] = useState<WonderLevel | null>(null);
  const [levelSpins, setLevelSpins] = useState(0);
  const [rolledRules, setRolledRules] = useState<RolledRule[]>([]);
  const [ruleSpins, setRuleSpins] = useState<number[]>([]);

  const trackRoll = (part: "all" | "player" | "level" | "rule") =>
    track(EVENTS.wonderChallengeRolled, { part, players, switch2: switch2 ? "yes" : "no" });

  /** The intro's Randomize: everyone, the level and the rules. */
  const rollChallenge = () => {
    setPicks(drawPlayers(chars, badges, players, { badgeRepeats }));
    setLevel(rollLevel(levels, level?.name ?? null));
    setLevelSpins((n) => n + 1);
    const next = rollRules(rules, Number(ruleCount), badges);
    setRolledRules(next);
    setRuleSpins(next.map((_, i) => (ruleSpins[i] ?? 0) + 1));
    trackRoll("all");
  };
  /** One card's refresh: that seat only, keeping clear of the others' characters and badges. */
  const rollSeat = (seat: number) => {
    setPicks((cur) => withSeat(cur, seat, drawSeat(chars, badges, otherSeats(cur, seat), { badgeRepeats })));
    trackRoll("player");
  };
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setPicks((cur) => cur.filter((_, j) => j !== seat));
  };
  const rollLevelOnly = () => {
    setLevel(rollLevel(levels, level?.name ?? null));
    setLevelSpins((n) => n + 1);
    trackRoll("level");
  };
  const rollRuleAt = (i: number) => {
    const one = rerollRule(rules, rolledRules, i, badges);
    if (!one) { toast.info("No other rule fits the kinds of rules you picked."); return; }
    setRolledRules((cur) => cur.map((r, j) => (j === i ? one : r)));
    setRuleSpins((cur) => cur.map((n, j) => (j === i ? n + 1 : n)));
    trackRoll("rule");
  };

  // The Levels tab: a run of levels for the night.
  const [levelCount, setLevelCount] = useState("3");
  const [run, setRun] = useState<WonderLevel[]>([]);
  const [runSpins, setRunSpins] = useState(0);
  const rollRun = () => {
    setRun(rollLevels(levels, Number(levelCount)));
    setRunSpins((n) => n + 1);
    track(EVENTS.wonderLevelsRolled, { count: Number(levelCount), world: world ?? "any" });
  };

  const toggle = <T extends string>(set: React.Dispatch<React.SetStateAction<T[]>>) => (v: string) =>
    set((cur) => (cur.includes(v as T) ? cur.filter((x) => x !== v) : [...cur, v as T]));

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
        const cfg = data?.config_data as WonderSetupConfig | undefined;
        if (!data || cfg?.type !== "wonder-setup" || cfg.gameSlug !== game.slug) return;
        setSaveName(data.config_name); setLoadedId(data.id);
        setSwitch2(!!cfg.switch2);
        setWorldPick(cfg.world && game.worlds.some((w) => w.id === cfg.world) ? cfg.world : ANY);
        setPlayers(Math.max(1, Math.min(MAX_PLAYERS, cfg.players.length || 1)));
        setNames(Array.from({ length: MAX_PLAYERS }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        setPicks(cfg.players.map((p) => (p.character ? { character: p.character, badge: p.badge ?? null } : null)));
        setLevel(game.levels.find((l) => l.name === cfg.level) ?? null);
        setRun((cfg.levels ?? []).map((n) => game.levels.find((l) => l.name === n)).filter((l): l is WonderLevel => !!l));
        const kept = (cfg.rules ?? []).filter((r) => game.rules.some((x) => x.id === r.id));
        setRolledRules(kept); setRuleSpins(kept.map(() => 0));
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    const cfg: WonderSetupConfig = {
      type: "wonder-setup", gameSlug: game.slug, world, switch2,
      players: Array.from({ length: players }, (_, i) => ({ name: seatName(i), character: picks[i]?.character ?? "", badge: picks[i]?.badge ?? null })),
      level: level?.name ?? null, levels: run.map((l) => l.name), rules: rolledRules,
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, game.slug, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Challenge updated" : "Challenge saved"); setSaveOpen(false);
  };

  const worldOptions = [{ value: ANY, label: "Any world" }, ...worlds.map((w) => ({ value: w.id, label: worldLabel(w) }))];
  const badgeTypeOptions = (["action", "boost", "expert", "dual"] as WonderBadgeType[])
    .filter((t) => switch2 || t !== "dual").map((t) => ({ value: t, label: `${BADGE_TYPE_LABEL[t]}s` }));

  const levelSummary = [
    switch2 && "Switch 2 Edition",
    groups.join() === DEFAULT_GROUPS.join() ? null : shownGroups.filter((g) => groups.includes(g.id)).map((g) => g.label).join(", ") || "No level types",
    stars.length ? `${[...stars].sort().join(", ")} star levels` : null,
  ].filter((x): x is string => !!x);
  const summary = [
    ...levelSummary,
    !noDamage && "No Yoshis or Nabbit",
    badgeTypes.length ? badgeTypes.filter((t) => switch2 || t !== "dual").map((t) => `${BADGE_TYPE_LABEL[t]}s`).join(", ") : null,
    badgeSet !== "all" && BADGE_SETS.find((s) => s.value === badgeSet)?.label.replace(/ \(.*\)$/, ""),
    !soundOff && "No Sound Off?",
    badgeRepeats && "Badges can repeat",
    ruleCount === "0" ? "No rules" : `${ruleCount} ${ruleCount === "1" ? "rule" : "rules"}`,
    ruleKinds.length ? `Rules: ${ruleKinds.map((k) => RULE_KIND_LABEL[k]).join(", ")}` : null,
  ].filter((x): x is string => !!x);

  const switch2Group = (
    <FilterGroup label="Version" activeValues={switch2 ? ["s2"] : []} onToggle={() => setSwitch2((x) => !x)}
      options={[{ value: "s2", label: "Nintendo Switch 2 Edition" }]} />
  );
  const levelGroups = (
    <>
      <FilterGroup label="Levels" activeValues={groups} onToggle={toggle(setGroups)} options={shownGroups.map((g) => ({ value: g.id, label: g.label }))} />
      <FilterGroup label="Star rating" activeValues={stars} onToggle={toggle(setStars)} options={STAR_OPTIONS} />
    </>
  );
  const levelNote = (
    <p className="party-muted">
      No star rating picked means every rating. Break Time!, Search Parties and KO Arenas have no rating, so they stay in
      when you pick one. The Switch 2 Edition adds Rosalina, the Koopaling showdowns, Bellabel Park and its badges.
    </p>
  );

  const ruleShown = rolledRules.map((r) => ({ r, rule: ruleOf(game, r) })).filter((x) => !!x.rule);

  const challengeTab = (
    <section>
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>A character, a badge and a challenge for everyone.</h2>
          <p>
            Add a player for each of you, pick a world, then randomize. Nobody gets the same character.{" "}
            {chars.length} characters, {badges.length} badges and {levels.length} levels in the pool.
          </p>
          <div className="kart-intro__actions">
            <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={() => setPlayers((n) => Math.min(MAX_PLAYERS, n + 1))}>Add Player</Button>
            <Button variant="primary" onClick={rollChallenge}>Randomize Challenge</Button>
            <span className="kart-intro__switch">
              <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
            </span>
          </div>
        </div>
        <div className="randomizer-setup">
          <Select floatingLabel="World" value={world ?? ANY} onChange={(v) => setWorldPick(String(v))} options={worldOptions} fullWidth />
          <RandomizerOptions title="Options" summary={summary}>
            {switch2Group}
            <FilterGroup label="Characters" activeValues={noDamage ? ["nodamage"] : []} onToggle={() => setNoDamage((x) => !x)}
              options={[{ value: "nodamage", label: "The Yoshis and Nabbit (they take no damage)" }]} />
            <FilterGroup label="Badge groups" activeValues={badgeTypes} onToggle={toggle(setBadgeTypes)} options={badgeTypeOptions} />
            <div className="wonder-options__select">
              <Select floatingLabel="Badges you have" value={badgeSet} onChange={(v) => setBadgeSet(String(v) as BadgeSet)} options={BADGE_SETS} fullWidth />
            </div>
            <FilterGroup label="Badges"
              activeValues={[...(soundOff ? ["soundoff"] : []), ...(badgeRepeats ? ["repeats"] : [])]}
              onToggle={(v) => (v === "soundoff" ? setSoundOff((x) => !x) : setBadgeRepeats((x) => !x))}
              options={[{ value: "soundoff", label: "Sound Off? (it only changes voices)" }, { value: "repeats", label: "Same badge on more than one player" }]} />
            {levelGroups}
            <div className="wonder-options__select">
              <Select floatingLabel="Rules" value={ruleCount} onChange={(v) => setRuleCount(String(v))} fullWidth
                options={RULE_COUNTS.map((n) => ({ value: n, label: n === "0" ? "No rules" : n === "1" ? "1 rule" : `${n} rules` }))} />
            </div>
            <FilterGroup label="Kinds of rules" activeValues={ruleKinds} onToggle={toggle(setRuleKinds)}
              options={(Object.keys(RULE_KIND_LABEL) as WonderRuleKind[]).map((k) => ({ value: k, label: RULE_KIND_LABEL[k] }))} />
            <p className="party-muted">
              No badge group or kind of rule picked means all of them. Players get different badges unless a rule
              gives everyone one, and a roll never takes two rules of one kind. Dual Badges come with the Switch 2
              Edition.
            </p>
            {levelNote}
          </RandomizerOptions>
        </div>
      </div>
      <div className="randomizer-grid">
        {Array.from({ length: players }, (_, i) => {
          const p = picks[i];
          const c = p ? game.characters.find((x) => x.name === p.character) : undefined;
          const worn = badgeWorn(game, p?.badge ?? null, rolledRules);
          const b = worn.badge ? game.badges.find((x) => x.name === worn.badge) : undefined;
          return (
            <SeatCard key={i} rolled={Boolean(p)} animate={animateReel}
              name={<Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />}
              actions={
                <CardActions
                  refreshLabel={`New character and badge for ${seatLabel(names, i)}`} onRefresh={() => rollSeat(i)}
                  removeLabel={`Remove ${seatLabel(names, i)}`} onRemove={players > 1 ? () => removePlayer(i) : undefined} />
              }
              tile={<KartSlot label="Character" portrait name={p?.character ?? null} imageSrc={c ? charImg(c.slug) : null} color={c?.color ?? null} pool={charReel} animate={animateReel} empty={<RandomTile look="party" />} />}>
              {worn.rule === "none" || (p && !worn.badge) ? (
                p && <p className="wonder-card__nobadge">{worn.rule === "none" ? "No badge: tonight's rule." : "No badge fits the options."}</p>
              ) : (
                <ul className="player-card__parts player-card__parts--row">
                  <KartSlot label="Badge" name={worn.badge} imageSrc={b ? badgeImg(b.slug) : null} pool={badgeReel} animate={animateReel} />
                </ul>
              )}
              {p && b && (
                <div className="wonder-card__badge">
                  <p className="wonder-card__type" style={{ "--wonder-badge": BADGE_TYPE_COLOR[b.type] } as React.CSSProperties}>
                    {BADGE_TYPE_LABEL[b.type]}{worn.rule === "same" ? ", everyone's badge" : ""}
                  </p>
                  <p className="wonder-card__what">{b.what}</p>
                </div>
              )}
              {p && c?.noDamage && <p className="wonder-card__note">Takes no damage, and no power-ups.</p>}
            </SeatCard>
          );
        })}
      </div>

      <div className="wonder-tonight">
        <LevelBoard game={game} level={level} label="Level" spin={animateReel && levelSpins > 0} spinKey={levelSpins} pool={levelNames}
          empty={levels.length ? "Randomize to pick a level" : "No level fits these options"}
          action={level ? <IconAction label="New level" icon={IconRefresh} variant="secondary" onClick={rollLevelOnly} disabled={!levels.length} /> : null} />
        {ruleCount !== "0" && (
          <section className="wonder-rules" aria-labelledby="wonder-rules-heading">
            <h3 id="wonder-rules-heading" className="wonder-rules__heading">Rules</h3>
            {ruleShown.length ? (
              <ul className="wonder-rules__list">
                {ruleShown.map(({ r, rule }, i) => rule && (
                  <li key={i} className="wonder-rule">
                    <div className="wonder-rule__body">
                      <p className="wonder-rule__title">
                        <RollingText key={ruleSpins[i] ?? 0} value={rule.title} pool={game.rules.map((x) => x.title)} spin={animateReel && (ruleSpins[i] ?? 0) > 0} />
                      </p>
                      <p className="wonder-rule__detail">{ruleDetail(rule, r)}</p>
                      <p className="wonder-rule__lasts">{LASTS_LABEL[rule.lasts]}</p>
                    </div>
                    <IconAction label={`New rule in place of ${rule.title}`} icon={IconRefresh} variant="secondary" onClick={() => rollRuleAt(i)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="party-muted">Randomize to get {ruleCount === "1" ? "a rule" : `${ruleCount} rules`}. Each lasts one level, the next three levels or all night.</p>
            )}
          </section>
        )}
      </div>
    </section>
  );

  const levelsTab = (
    <div className="party-section">
      <div className="randomizer-setup">
        <RandomizerOptions title="Level options" summary={levelSummary} empty="Courses, palaces, battleships and Bowser">
          {switch2Group}
          {levelGroups}
          {levelNote}
        </RandomizerOptions>
      </div>
      <div className="party-row wonder-levels__row">
        <Select floatingLabel="World" value={world ?? ANY} onChange={(v) => setWorldPick(String(v))} options={worldOptions} />
        <Select floatingLabel="Levels" value={levelCount} onChange={(v) => setLevelCount(String(v))}
          options={LEVEL_COUNTS.map((n) => ({ value: n, label: n === "1" ? "One level" : `${n} levels` }))} />
        <Button variant="primary" iconBefore={IconDice5} onClick={rollRun} disabled={!levels.length}>{run.length ? "Roll again" : "Roll the levels"}</Button>
      </div>
      <p className="party-muted">
        {levels.length
          ? `${levels.length} levels fit${world ? ` in ${worldOf(game, world).name}` : ""}. A level comes up again only after all of them have.`
          : "No level fits these options. Turn on more level types or star ratings."}
      </p>
      {run.length > 0 && (
        <ol className="wonder-run">
          {run.map((l, i) => (
            <li key={i}>
              <LevelBoard game={game} level={l} label={run.length > 1 ? `Level ${i + 1}` : "Level"} spin={animateReel && runSpins > 0} spinKey={runSpins} pool={levelNames} empty="" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "challenge", label: "Challenge", content: challengeTab },
    { id: "levels", label: "Levels", content: levelsTab },
  ];
  return (
    <div className="wonder-randomizer">
      <div className="randomizer-controls">
        <Tabs variant="pills" size="medium" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: <></> }))} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)" }}>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : void save())} iconBefore={IconDeviceFloppy}>
            {saveName && loadedId ? `Update: ${saveName}` : "Save Challenge"}
          </Button>
        </div>
      </div>
      <div className="party">{tabs.find((t) => t.id === tab)?.content}</div>
      <p className="type-card-disclaimer">
        Character and badge art is Nintendo&apos;s, from the official Super Mario Bros. Wonder websites and the game.
        GameShuffle is a fan-made tool and isn&apos;t affiliated with or endorsed by Nintendo.
      </p>
      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update challenge" : "Save this challenge"} size="small"
        primaryAction={{ label: loadedId ? "Update challenge" : "Save challenge", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name this challenge" placeholder="Friday co-op night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}

/** A level as a board in its world's color: the name (rolling in), then its world, kind and star rating. */
function LevelBoard({ game, level, label, spin, spinKey, pool, empty, action }: {
  game: WonderGame; level: WonderLevel | null; label: string; spin: boolean; spinKey: number; pool: string[]; empty: string; action?: React.ReactNode;
}) {
  const w = level ? worldOf(game, level.world) : null;
  return (
    <div className="party-board wonder-board" style={{ "--party-board": w?.color ?? "#3b2f7a" } as React.CSSProperties}>
      <div className="party-board__body">
        <div className="party-board__head">
          <span className="party-board__label">{label}</span>
          {action}
        </div>
        <p className="party-board__name">{level ? <RollingText key={spinKey} value={level.name} pool={pool} spin={spin} /> : empty}</p>
        {level && w && (
          <p className="party-board__blurb wonder-board__facts">
            <span>{worldLabel(w)}</span>
            <span>{LEVEL_TYPE_LABEL[level.type]}{level.switch2 ? " (Switch 2 Edition)" : ""}</span>
            {level.stars ? <span><span aria-hidden>{"★".repeat(level.stars)}</span><span className="sr-only">{level.stars === 1 ? "1 star" : `${level.stars} stars`}</span></span> : null}
          </p>
        )}
      </div>
    </div>
  );
}
