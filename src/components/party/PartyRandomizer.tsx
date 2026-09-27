"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Accordion, Avatar, Badge, Button, Chip, IconButton, Input, Modal, Radio, RadioGroup, Select, Switch, Tabs,
} from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy, IconDice5, IconLock, IconLockOpen, IconRefresh, IconUsersGroup } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useCardHands } from "@/components/cards/useCardHands";
import { NightLineupPicker } from "@/components/nights/NightLineupPicker";
import { CardHandsPanel } from "@/components/cards/CardHandsPanel";
import { useGameCollection } from "@/hooks/useGameCollection";
import { CollectionBar } from "@/components/collection/CollectionBar";
import { createClient } from "@/lib/supabase/client";
import { saveConfig } from "@/lib/configs";
import { inEdition, type PartyEdition, type PartyGame, type PartyMinigame } from "@/lib/party/types";
import {
  drawCharacters, drawMinigames, drawTeams, minigamePool, pick, planNight, rollSetup,
  type NightSegment, type PartySetup, type SetupField,
} from "@/lib/party/roll";
import { cardText, type CardDraw } from "@/data/party/cards";
import type { PartySetupConfig } from "@/data/config-types";
import { PARTY_FAMILY } from "@/data/party";
import { CODE_DECK } from "@/lib/party/deck";

/**
 * The party randomizer: one client for every Mario Party game, driven entirely
 * by the game's data (src/data/party/*). Four tabs: board and rules, players,
 * minigames, house rules and missions.
 */

type Tab = "night" | "setup" | "players" | "minigames" | "cards";
type MgMode = "roulette" | "gauntlet";

interface Prefs { edition: PartyEdition; boardIds: string[]; unlockables: boolean }

const GAUNTLET_SIZES = [5, 10, 20];
const DEFAULT_CATEGORIES = ["ffa", "1v3", "2v2", "duel"];

function prefsKey(slug: string) { return `gs-party-prefs:${slug}`; }
function readPrefs(slug: string): Partial<Prefs> | null {
  try { return JSON.parse(localStorage.getItem(prefsKey(slug)) ?? "null"); } catch { return null; }
}


function Stars({ n }: { n: number }) {
  return (
    <span className="party-stars" aria-label={`Difficulty ${n} of 5`}>
      {"★".repeat(n)}<span aria-hidden="true">{"★".repeat(5 - n)}</span>
    </span>
  );
}

export function PartyRandomizer({ game }: { game: PartyGame }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const searchParams = useSearchParams();
  const router = useRouter();

  const starterBoards = useMemo(() => game.boards.filter((b) => !b.unlockable).map((b) => b.id), [game]);

  // Prefs that follow the player between visits.
  const [edition, setEdition] = useState<PartyEdition>("switch1");
  const [boardIds, setBoardIds] = useState<string[]>(starterBoards);
  const [unlockables, setUnlockables] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [tab, setTab] = useState<Tab>("night");

  // Board and rules
  const rulesetsInEdition = useMemo(() => inEdition(game.rulesets, edition), [game, edition]);
  const [rulesetIds, setRulesetIds] = useState<string[]>([]);
  const [setup, setSetup] = useState<PartySetup | null>(null);
  const [locks, setLocks] = useState<Partial<Record<SetupField, boolean>>>({});

  // Players
  const [humans, setHumans] = useState(2);
  const [cpuFill, setCpuFill] = useState(true);
  const [names, setNames] = useState<string[]>(["", "", "", ""]);
  const [chars, setChars] = useState<string[]>([]);
  const [teams, setTeams] = useState<[number[], number[]] | null>(null);

  // Minigames
  const [mgMode, setMgMode] = useState<MgMode>("roulette");
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [motion, setMotion] = useState(true);
  const [coinOnly, setCoinOnly] = useState(false);
  const [camera, setCamera] = useState(false);
  const [spun, setSpun] = useState<PartyMinigame | null>(null);
  const [gauntletSize, setGauntletSize] = useState(10);
  const [gauntlet, setGauntlet] = useState<PartyMinigame[]>([]);
  const [winners, setWinners] = useState<(number | null)[]>([]);

  // Night plan
  const [nightMinutes, setNightMinutes] = useState(120);
  const [nightBoard, setNightBoard] = useState<"always" | "maybe" | "never">("always");
  const [nightCoop, setNightCoop] = useState(true);
  const [nightMotion, setNightMotion] = useState(true);
  const [unlockedModes, setUnlockedModes] = useState<string[]>([]);
  const [plan, setPlan] = useState<NightSegment[]>([]);


  // Live night
  const [liveOpen, setLiveOpen] = useState(false);
  const [lineup, setLineup] = useState<string[]>([]);
  const [hostSeat, setHostSeat] = useState("0");
  const [starting, setStarting] = useState(false);

  // Saving
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);

  const seats = cpuFill ? game.seats : humans;
  const seatName = useCallback(
    (i: number) => (i < humans ? names[i]?.trim() || `Player ${i + 1}` : `CPU ${i - humans + 1}`),
    [humans, names],
  );
  const ruleset = game.rulesets.find((r) => r.id === setup?.rulesetId) ?? null;
  const board = game.boards.find((b) => b.id === setup?.boardId) ?? null;
  const bonusMode = game.bonusModes.find((m) => m.id === setup?.bonusModeId) ?? null;
  const categoriesInEdition = useMemo(() => inEdition(game.minigameCategories, edition), [game, edition]);
  const art = (path: string) => (game.artReady ? `${game.assetBase}${path}` : undefined);

  // Cards and missions: shared with every card-layer game (components/cards).
  // Turn counts on cards fit the rolled game; before a roll, assume a 20-turn night.
  const gameTurns = setup?.turns ?? 20;
  // Cards only go to people (seats 0..humans-1). CPUs play normally.
  const people = Math.min(humans, seats);
  const hands = useCardHands({
    gameSlug: game.slug, family: PARTY_FAMILY, fallbackDeck: CODE_DECK, rulesetId: setup?.rulesetId ?? null,
    length: gameTurns, seats, people, seatName, starterOnly: !user, unit: "turn",
    defaultMoments: ["homestretch", "intermission"], viewerKey: user?.id ?? null,
  });
  const { byId, rules, setRules, chance, setChance, missions, setMissions, moments, setMoments, secret, setSecret, turn, setTurn } = hands;
  const nameOf = useCallback((seat: number) => seatName(seat), [seatName]);

  /* ── Your collection: version, boards, characters and modes you have ── */
  // Kept per account (or in this browser). The randomizer's own controls edit
  // it; a saved setup's choices apply to that night only, without saving.
  // Starting state: boards and characters that have to be unlocked are off.
  const collectionDefaults = useMemo(() => ({
    enabled: true,
    off: { boards: game.boards.filter((b) => b.unlockable).map((b) => b.id), characters: game.characters.filter((c) => c.unlockable).map((c) => c.name) },
    prefs: {},
  }), [game]);
  const col = useGameCollection(game.slug, collectionDefaults);
  const unlockableChars = useMemo(() => game.characters.filter((c) => c.unlockable).map((c) => c.name), [game]);
  const [excludedChars, setExcludedChars] = useState<string[]>([]);
  useEffect(() => {
    if (!col.loaded) return;
    void Promise.resolve().then(() => {
      let c = col.collection;
      if (!col.customized) {
        // Older visits kept these in a separate browser key: bring them over once.
        const p = readPrefs(game.slug);
        if (p) {
          c = {
            ...c,
            prefs: { ...c.prefs, edition: p.edition === "switch2" ? "switch2" : "switch1" },
            off: {
              ...c.off,
              ...(Array.isArray(p.boardIds) && p.boardIds.length ? { boards: game.boards.map((b) => b.id).filter((id) => !p.boardIds!.includes(id)) } : {}),
              ...(typeof p.unlockables === "boolean" ? { characters: p.unlockables ? [] : unlockableChars } : {}),
            },
          };
          void col.save(c);
        }
      }
      const on = c.enabled;
      const offBoards = new Set(on ? c.off.boards ?? [] : []);
      const offChars = new Set(on ? c.off.characters ?? [] : []);
      setEdition(c.prefs.edition === "switch2" ? "switch2" : "switch1");
      setBoardIds(game.boards.map((b) => b.id).filter((id) => !offBoards.has(id)));
      setUnlockables(unlockableChars.every((n) => !offChars.has(n)));
      setExcludedChars([...offChars].filter((n) => !unlockableChars.includes(n)));
      setUnlockedModes(Array.isArray(c.prefs.unlockedModes) ? (c.prefs.unlockedModes as string[]) : []);
      setPrefsLoaded(true);
    });
  }, [col.loaded, col.collection]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Save a change made with the randomizer's own controls back to the collection. */
  const persist = (patch: { edition?: PartyEdition; boardIds?: string[]; unlockables?: boolean; unlockedModes?: string[] }) => {
    if (!prefsLoaded) return;
    const c = col.collection;
    const nextBoards = patch.boardIds ?? boardIds;
    const nextUnlock = patch.unlockables ?? unlockables;
    void col.save({
      ...c,
      prefs: { ...c.prefs, edition: patch.edition ?? edition, unlockedModes: patch.unlockedModes ?? unlockedModes },
      off: {
        ...c.off,
        boards: game.boards.map((b) => b.id).filter((id) => !nextBoards.includes(id)),
        characters: [...excludedChars, ...(nextUnlock ? [] : unlockableChars)],
      },
    });
  };

  /* ── Hydrate a saved setup (?config=) ── */
  useEffect(() => {
    const id = searchParams.get("config");
    if (!id || !user) return;
    void createClient().from("saved_configs").select("id, config_name, config_data, randomizer_slug")
      .eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const cfg = data?.config_data as PartySetupConfig | undefined;
        if (!data || cfg?.type !== "party-setup" || cfg.gameSlug !== game.slug) return;
        setLoadedId(data.id); setSaveName(data.config_name);
        setEdition(cfg.edition); setBoardIds(cfg.boardIds); setUnlockables(cfg.unlockables);
        setSetup(cfg.setup);
        const h = cfg.players.filter((p) => !p.cpu).length || 1;
        setHumans(h); setCpuFill(cfg.players.some((p) => p.cpu));
        // Default names ("Player 2") come back as blank inputs, not typed-in text.
        setNames([0, 1, 2, 3].map((i) => { const n = i < h ? cfg.players[i]?.name ?? "" : ""; return /^Player \d+$/.test(n) ? "" : n; }));
        setChars(cfg.players.map((p) => p.character));
        setTeams(cfg.teams);
        const byName = new Map(game.minigames.map((m) => [m.name, m]));
        const g = cfg.gauntlet.map((n) => byName.get(n)).filter((m): m is PartyMinigame => !!m);
        setGauntlet(g); setWinners(g.map(() => null)); if (g.length) setMgMode("gauntlet");
        const known = (d: CardDraw) => !!byId(d.id);
        setRules((cfg.rules ?? []).filter(known));
        setChance((cfg.chance ?? []).filter(known));
        setMissions((cfg.missions ?? []).map((hand) => hand.filter(known)));
        if (cfg.moments) setMoments(cfg.moments);
        if (typeof cfg.secret === "boolean") setSecret(cfg.secret);
        if (typeof cfg.turn === "number") setTurn(cfg.turn);
        if (cfg.plan) setPlan(cfg.plan.filter((sgm) => game.modes.some((m) => m.id === sgm.modeId)));
        trackEvent("Config Loaded", { configId: id });
      });
    // Re-runs once the database deck loads, so a saved setup's custom cards resolve.
    // (The hand setters come from useState in useCardHands and are stable.)
  }, [searchParams, user, game, trackEvent, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Actions ── */
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const rollSetupNow = () => {
    const next = rollSetup(game, { edition, boardIds, rulesetIds }, setup, locks);
    if (!next) { toast.error("Pick at least one board and one ruleset to roll from."); return; }
    setSetup(next);
    const r = game.rulesets.find((x) => x.id === next.rulesetId);
    if (r?.teams && !teams) setTeams(drawTeams(game.seats));
    trackEvent("Party Setup Rolled", { game: game.slug, ruleset: next.rulesetId });
  };

  const rollCharacters = (keepSeat?: number) => {
    const keep = keepSeat === undefined ? [] : chars.map((c, i) => (i === keepSeat ? null : c));
    setChars(drawCharacters(game, seats, { unlockables, exclude: excludedChars }, keepSeat === undefined ? [] : keep));
  };

  const spin = () => {
    const pool = minigamePool(game, { edition, categories, motion, coinOnly, camera, rulesetId: setup?.rulesetId });
    const next = pick(pool.filter((m) => m.name !== spun?.name)) ?? pick(pool);
    if (!next) { toast.error("No minigames match those filters."); return; }
    setSpun(next);
  };
  const drawGauntlet = () => {
    const pool = minigamePool(game, { edition, categories, motion, coinOnly, camera, rulesetId: setup?.rulesetId });
    if (!pool.length) { toast.error("No minigames match those filters."); return; }
    const g = drawMinigames(pool, gauntletSize);
    setGauntlet(g); setWinners(g.map(() => null));
    if (g.length < gauntletSize) toast.info(`Only ${g.length} minigames match, so the set list is ${g.length} long.`);
  };


  const rollNight = () => {
    // The board game uses the rolled setup's ruleset; roll one first if there isn't one.
    const base = setup ?? rollSetup(game, { edition, boardIds, rulesetIds });
    const rs = game.rulesets.find((r) => r.id === base?.rulesetId);
    const next = planNight(game, {
      edition, humans: people, minutes: nightMinutes, board: nightBoard,
      turns: rs?.turns ?? [], coop: nightCoop, motion: nightMotion, unlocked: unlockedModes,
    });
    if (!next.length) { toast.error("No modes fit those settings. Try a longer night or allow co-op and motion modes."); return; }
    const boardSeg = next.find((sgm) => sgm.turns !== null);
    if (base && boardSeg) setSetup({ ...base, turns: boardSeg.turns! });
    setPlan(next);
    trackEvent("Party Night Planned", { game: game.slug, segments: String(next.length) });
  };

  const tally = useMemo(() => {
    const t = Array.from({ length: seats }, () => 0);
    winners.forEach((w) => { if (w !== null && w < seats) t[w]++; });
    return t;
  }, [winners, seats]);

  const summary = () => {
    const lines = [`${game.label} night`];
    if (plan.length) lines.push(`Plan: ${plan.map((sgm) => { const m = game.modes.find((x) => x.id === sgm.modeId); return `${m?.label ?? sgm.modeId}${sgm.option ? ` (${sgm.option})` : ""}`; }).join(" → ")}`);
    if (board && ruleset) lines.push(`${board.name} · ${ruleset.label} · ${setup!.turns} turns · ${bonusMode?.label ?? ""}`);
    if (chars.length) lines.push(chars.map((c, i) => `${seatName(i)}: ${c}`).join(", "));
    if (teams && ruleset?.teams) lines.push(`Teams: ${teams.map((t) => t.map(seatName).join(" + ")).join(" vs ")}`);
    if (rules.length) lines.push(`House rules: ${rules.map((d) => { const c = byId(d.id)!; return `${c.title}${d.seat !== null ? ` (${seatName(d.seat)})` : ""}`; }).join("; ")}`);
    if (chance.length && !secret) lines.push(`Chance cards: ${chance.map((d) => cardText(byId(d.id)!, d, nameOf)).join(" ")}`);
    if (gauntlet.length) lines.push(`Minigames: ${gauntlet.map((m) => m.name).join(", ")}`);
    return lines.join("\n");
  };
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summary()); toast.success("Copied, ready to paste"); }
    catch { toast.error("Couldn't copy. Your browser blocked the clipboard."); }
  };

  const startLive = async () => {
    setStarting(true);
    const r = await fetch("/api/party", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameSlug: game.slug,
        visibility: secret ? "secret" : "open",
        config: { edition, setup, plan, moments, teams: ruleset?.teams ? teams : null },
        seats: Array.from({ length: seats }, (_, i) => ({ name: i < humans ? names[i]?.trim() ?? "" : seatName(i), isCpu: i >= humans, character: chars[i] || null })),
        hostSeat: hostSeat === "none" ? null : Number(hostSeat),
        lineup,
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok) {
      toast.error(j.error === "unavailable" ? "Live nights need a database update first. The randomizer still works here." : "Couldn't start the night. Please try again.");
      return;
    }
    trackEvent("Party Live Night Started", { game: game.slug, games: String(lineup.length + 1) });
    router.push(`/party/${j.code}`);
  };

  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    setSaving(true);
    const data: PartySetupConfig = {
      type: "party-setup", gameSlug: game.slug, edition, setup,
      players: Array.from({ length: seats }, (_, i) => ({ name: seatName(i), character: chars[i] ?? "", cpu: i >= humans })),
      teams: ruleset?.teams ? teams : null, boardIds, unlockables,
      gauntlet: gauntlet.map((m) => m.name), rules, chance, missions, moments, secret, plan, turn,
    };
    let error: string | null = null;
    if (loadedId) {
      const res = await createClient().from("saved_configs").update({ config_name: saveName.trim(), config_data: data }).eq("id", loadedId).eq("user_id", user.id);
      error = res.error?.message ?? null;
    } else {
      const res = await saveConfig(user.id, game.slug, saveName.trim(), data);
      error = res.error ?? null;
      if (!error) setLoadedId(res.data?.id ?? null);
    }
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success(loadedId ? "Setup updated" : "Setup saved");
    setSaveOpen(false);
    trackEvent("Save Party Setup", { game: game.slug });
  };

  /* ── Sections ── */
  const lockButton = (field: SetupField, label: string) => (
    <IconButton
      variant="tertiary"
      size="small"
      aria-pressed={!!locks[field]}
      aria-label={locks[field] ? `Unlock ${label}` : `Lock ${label}`}
      title={locks[field] ? `Unlock ${label}` : `Keep this ${label} on the next roll`}
      onClick={() => setLocks((l) => ({ ...l, [field]: !l[field] }))}
      disabled={!setup}
    >
      {locks[field] ? <IconLock size={18} /> : <IconLockOpen size={18} />}
    </IconButton>
  );

  const modeById = (id: string) => game.modes.find((m) => m.id === id);
  const unlockableModes = inEdition(game.modes, edition).filter((m) => m.unlockable);
  const planMinutes = plan.reduce((sum, sgm) => sum + sgm.minutes, 0);
  const nightTab = (
    <div className="party-section">
      <p className="party-muted">Roll how the night goes: the board game sized to fit, plus other modes around it. Everything after that is on the other tabs.</p>
      <div className="party-row">
        <Select floatingLabel="How long" value={String(nightMinutes)} onChange={(v) => setNightMinutes(Number(v))}
          options={[60, 90, 120, 180, 240].map((m) => ({ value: String(m), label: m < 120 ? `About ${m} minutes` : `About ${m / 60} hours` }))} />
        <Select floatingLabel="Board game" value={nightBoard} onChange={(v) => setNightBoard(v as typeof nightBoard)}
          options={[{ value: "always", label: "Always play one" }, { value: "maybe", label: "Usually" }, { value: "never", label: "Skip it tonight" }]} />
      </div>
      <div className="party-row">
        <Switch label="Co-op modes" checked={nightCoop} onChange={(e) => setNightCoop(e.target.checked)} />
        <Switch label="Motion-control modes" checked={nightMotion} onChange={(e) => setNightMotion(e.target.checked)} />
        {unlockableModes.map((m) => (
          <Switch key={m.id} label={`${m.label} unlocked`} checked={unlockedModes.includes(m.id)} onChange={() => { const next = toggleIn(unlockedModes, m.id); setUnlockedModes(next); persist({ unlockedModes: next }); }} />
        ))}
      </div>
      <div className="party-actions">
        <Button variant="primary" iconBefore={IconDice5} onClick={rollNight}>{plan.length ? "Roll a new night" : "Roll the night"}</Button>
      </div>
      {plan.length > 0 && (
        <>
          <ol className="party-plan">
            {plan.map((sgm, i) => {
              const m = modeById(sgm.modeId)!;
              return (
                <li key={`${sgm.modeId}-${i}`} className={`party-plan__step${m.board ? " party-plan__step--main" : ""}`}>
                  <span className="party-plan__time">~{sgm.minutes} min</span>
                  <strong className="party-plan__name">{m.label}{sgm.option ? `: ${sgm.option}` : ""}</strong>
                  <span className="party-muted">
                    {m.board && board && ruleset ? `${board.name}, ${ruleset.label}, ${sgm.turns} turns. ` : ""}{m.blurb}
                  </span>
                  {m.board && <Button variant="ghost" size="small" onClick={() => setTab("setup")}>Change the board and rules</Button>}
                  {i < plan.length - 1 && moments.includes("intermission") && (
                    <span className="party-plan__break">Intermission: every player draws a Chance card</span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="party-tally"><strong>Total:</strong> about {planMinutes} minutes{people < seats ? ` · ${people} ${people === 1 ? "person" : "people"}, CPUs fill the board game` : ""}</p>
        </>
      )}
    </div>
  );

  const setupTab = (
    <div className="party-section">
      <div className="party-board" style={{ "--party-board": board?.color ?? "var(--bg-secondary)" } as React.CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN art, same as the Mario Kart tiles */}
        {board && art(board.img) && <img className="party-board__art" src={art(board.img)} alt="" />}
        <div className="party-board__body">
          <div className="party-board__head">
            <span className="party-board__label">Board</span>
            {lockButton("boardId", "board")}
          </div>
          <p className="party-board__name">{board?.name ?? "Roll to pick a board"}</p>
          {board && <p className="party-board__blurb"><Stars n={board.difficulty} /> {board.blurb}</p>}
        </div>
      </div>

      <dl className="party-rules">
        <div className="party-rules__row">
          <dt>Rules</dt>
          <dd>{ruleset ? <><strong>{ruleset.label}</strong>{ruleset.edition === "switch2" && <Badge variant="info" size="small">Switch 2</Badge>}<span className="party-muted">{ruleset.blurb}</span></> : <span className="party-muted">Not rolled yet</span>}</dd>
          {lockButton("rulesetId", "ruleset")}
        </div>
        <div className="party-rules__row">
          <dt>Turns</dt>
          <dd>{setup ? <strong>{setup.turns}</strong> : <span className="party-muted">Not rolled yet</span>}{ruleset && ruleset.turns.length === 1 && <span className="party-muted">Fixed by {ruleset.label}</span>}</dd>
          {lockButton("turns", "turn count")}
        </div>
        <div className="party-rules__row">
          <dt>Bonus Stars</dt>
          <dd>{bonusMode ? <><strong>{bonusMode.label}</strong><span className="party-muted">{bonusMode.blurb}</span></> : <span className="party-muted">Not rolled yet</span>}</dd>
          {lockButton("bonusModeId", "Bonus Star mode")}
        </div>
      </dl>

      <div className="party-actions">
        <Button variant="primary" onClick={rollSetupNow} iconBefore={IconDice5}>{setup ? "Roll again" : "Roll the setup"}</Button>
      </div>

      <div className="party-options">
        <p className="party-options__label">Boards you can play</p>
        <div className="party-chips">
          {game.boards.map((b) => (
            <Chip key={b.id} clickable selected={boardIds.includes(b.id)} variant={boardIds.includes(b.id) ? "primary" : "default"} onClick={() => { const next = toggleIn(boardIds, b.id); setBoardIds(next); persist({ boardIds: next }); }}
              label={b.unlockable ? `${b.name} (unlockable)` : b.name} />
          ))}
        </div>
        {rulesetsInEdition.length > 1 && <>
        <p className="party-options__label">Rules in the draw</p>
        <div className="party-chips">
          {rulesetsInEdition.map((r) => (
            <Chip key={r.id} clickable selected={!rulesetIds.length || rulesetIds.includes(r.id)} variant={!rulesetIds.length || rulesetIds.includes(r.id) ? "primary" : "default"} label={r.label}
              onClick={() => setRulesetIds((l) => {
                const all = rulesetsInEdition.map((x) => x.id);
                const cur = l.length ? l : all;
                const next = toggleIn(cur, r.id);
                return next.length === all.length ? [] : next;
              })} />
          ))}
        </div>
        </>}
      </div>

      <Accordion variant="flush" items={[{
        id: "bonus",
        title: "What each Bonus Star rewards",
        content: (
          <ul className="party-list">
            {game.bonusStars.map((b) => <li key={b.name}><strong>{b.name}:</strong> {b.rewards}</li>)}
          </ul>
        ),
      }]} />
    </div>
  );

  const playersTab = (
    <div className="party-section">
      <div className="party-row">
        <Select
          floatingLabel="Players"
          value={String(humans)}
          onChange={(v) => { const n = Number(v); setHumans(n); setChars([]); }}
          options={Array.from({ length: game.seats }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i ? "players" : "player"}` }))}
        />
        <Switch label="Fill empty seats with CPUs" checked={cpuFill} onChange={(e) => { setCpuFill(e.target.checked); setChars([]); }} disabled={humans === game.seats} />
        {game.characters.some((c) => c.unlockable) && (
          <Switch
            label={`${game.characters.filter((c) => c.unlockable).map((c) => c.name).join(" and ")} unlocked`}
            checked={unlockables}
            onChange={(e) => { setUnlockables(e.target.checked); persist({ unlockables: e.target.checked }); }}
          />
        )}
      </div>

      <div className="party-seats">
        {Array.from({ length: seats }, (_, i) => {
          const c = game.characters.find((x) => x.name === chars[i]);
          return (
            <div key={i} className="party-seat">
              <Avatar size="large" shape="rounded" src={c ? art(c.img) : undefined} initials={c ? c.name.slice(0, 2) : "?"} color={i < humans ? "primary" : "neutral"} alt="" />
              <div className="party-seat__body">
                {i < humans ? (
                  <Input
                    floatingLabel={`Player ${i + 1}`}
                    value={names[i] ?? ""}
                    maxLength={24}
                    onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                ) : <span className="party-seat__cpu">{seatName(i)}</span>}
                <span className="party-seat__char">{c?.name ?? "No character yet"}</span>
                {c?.buddy && <span className="party-muted">As a Jamboree Buddy: {c.buddy}</span>}
              </div>
              <IconButton variant="tertiary" size="small" aria-label={`Reroll ${seatName(i)}'s character`} onClick={() => rollCharacters(i)} disabled={!chars.length}>
                <IconRefresh size={18} />
              </IconButton>
            </div>
          );
        })}
      </div>

      {ruleset?.teams && seats === 4 && teams && (
        <div className="party-teams">
          {teams.map((t, i) => (
            <p key={i}><strong>Team {i + 1}:</strong> {t.map(seatName).join(" and ")}</p>
          ))}
          <Button variant="ghost" size="small" onClick={() => setTeams(drawTeams(4))}>Shuffle teams</Button>
        </div>
      )}

      <div className="party-actions">
        <Button variant="primary" onClick={() => rollCharacters()} iconBefore={IconDice5}>{chars.length ? "Reroll everyone" : "Pick characters"}</Button>
      </div>
    </div>
  );

  const minigamesTab = (
    <div className="party-section">
      <RadioGroup name="mg-mode" orientation="horizontal" value={mgMode} onChange={(v) => setMgMode(v as MgMode)}>
        <Radio value="roulette" label="One at a time" />
        <Radio value="gauntlet" label="Set list for a minigame night" />
      </RadioGroup>

      <div className="party-options">
        <p className="party-options__label">Categories</p>
        <div className="party-chips">
          {categoriesInEdition.map((c) => (
            <Chip key={c.id} clickable selected={categories.includes(c.id)} variant={categories.includes(c.id) ? "primary" : "default"} onClick={() => setCategories((l) => toggleIn(l, c.id))}
              label={c.edition === "switch2" ? `${c.label} (Switch 2)` : c.label} />
          ))}
        </div>
        <div className="party-row">
          <Switch label="Motion-control minigames" checked={motion} onChange={(e) => setMotion(e.target.checked)} />
          <Switch label="Coin minigames only" checked={coinOnly} onChange={(e) => setCoinOnly(e.target.checked)} />
          {edition === "switch2" && <Switch label="Camera minigames" helperText="Needs a camera plugged in" checked={camera} onChange={(e) => setCamera(e.target.checked)} />}
        </div>
      </div>

      {mgMode === "roulette" ? (
        <>
          <div className="party-spin" aria-live="polite">
            {spun ? (
              <>
                <span className="party-spin__cat">{game.minigameCategories.find((c) => c.id === spun.category)?.label}</span>
                <span className="party-spin__name">{spun.name}</span>
                <span className="party-badges">
                  {spun.motion && <Badge variant="outline" size="small">Motion</Badge>}
                  {spun.coin && <Badge variant="outline" size="small">Coins</Badge>}
                  {spun.edition === "switch2" && <Badge variant="info" size="small">Switch 2</Badge>}
                  {spun.controls && spun.controls !== "mouse" && <Badge variant="outline" size="small">{spun.controls === "camera" ? "Camera" : "Microphone"}</Badge>}
                </span>
              </>
            ) : <span className="party-muted">Spin for a minigame</span>}
          </div>
          <div className="party-actions"><Button variant="primary" onClick={spin} iconBefore={IconDice5}>Spin</Button></div>
        </>
      ) : (
        <>
          <div className="party-row">
            <Select floatingLabel="How many" value={String(gauntletSize)} onChange={(v) => setGauntletSize(Number(v))}
              options={GAUNTLET_SIZES.map((n) => ({ value: String(n), label: `${n} minigames` }))} />
            <Button variant="primary" onClick={drawGauntlet} iconBefore={IconDice5}>{gauntlet.length ? "Draw a new list" : "Draw the list"}</Button>
          </div>
          {gauntlet.length > 0 && (
            <>
              <ol className="party-gauntlet">
                {gauntlet.map((m, r) => (
                  <li key={m.name} className="party-gauntlet__round">
                    <span className="party-gauntlet__name">{m.name}<span className="party-muted"> · {game.minigameCategories.find((c) => c.id === m.category)?.label}</span></span>
                    <span className="party-chips" role="group" aria-label={`Who won ${m.name}`}>
                      {Array.from({ length: seats }, (_, s) => (
                        <Chip key={s} size="small" clickable selected={winners[r] === s} variant={winners[r] === s ? "primary" : "default"} label={seatName(s)}
                          onClick={() => setWinners((w) => w.map((x, j) => (j === r ? (x === s ? null : s) : x)))} />
                      ))}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="party-tally">
                <strong>Wins:</strong> {tally.map((t, s) => `${seatName(s)}: ${t}`).join(" · ")}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );

  const cardsTab = <CardHandsPanel h={hands} />;

  return (
    <div className="tool-panel party">
      <CollectionBar slug={game.slug} col={col} />
      {game.editions && (
        <div className="party-edition">
          <RadioGroup name="edition" orientation="horizontal" label="Which version do you have?" value={edition}
            onChange={(v) => { setEdition(v as PartyEdition); setRulesetIds([]); persist({ edition: v as PartyEdition }); }}>
            {game.editions.map((e) => <Radio key={e.id} value={e.id} label={e.label} />)}
          </RadioGroup>
          <p className="party-muted">
            {edition === "switch2"
              ? "Includes Tag Team and Frenzy Rules plus the 20 Switch 2 minigames."
              : "Everything here works on the original game. Switch 2 extras stay hidden."}
          </p>
        </div>
      )}

      <Tabs
        variant="pills"
        activeTab={tab}
        onChange={(id) => setTab(id as Tab)}
        tabs={[
          { id: "night", label: "Night plan", content: nightTab },
          { id: "setup", label: "Board & rules", content: setupTab },
          { id: "players", label: "Players", content: playersTab },
          { id: "minigames", label: "Minigames", content: minigamesTab },
          { id: "cards", label: "Cards & missions", content: cardsTab },
        ]}
      />

      <div className="party-footer">
        <Button variant="primary" onClick={() => (user ? setLiveOpen(true) : (window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`))} iconBefore={IconUsersGroup}>Start a live night</Button>
        <Button variant="secondary" onClick={copySummary} iconBefore={IconCopy}>Copy the night</Button>
        <Button variant="secondary" onClick={() => (user ? setSaveOpen(true) : save())} iconBefore={IconDeviceFloppy}>{loadedId ? "Update setup" : "Save setup"}</Button>
      </div>

      <Modal
        isOpen={liveOpen}
        onClose={() => setLiveOpen(false)}
        title="Start a live night"
        size="small"
        primaryAction={{ label: starting ? "Starting…" : "Start", onClick: startLive }}
        secondaryAction={{ label: "Cancel", onClick: () => setLiveOpen(false) }}
      >
        <p className="party-muted">
          Everyone follows the night on their own phone: scan the code, take a seat, and get your cards privately.
          Hands are {secret ? "secret" : "open to everyone"} (change that on Cards &amp; missions). Guests can join; only accounts keep points.
        </p>
        <Select floatingLabel="Are you playing?" value={hostSeat} onChange={(v) => setHostSeat(String(v))}
          options={[...Array.from({ length: humans }, (_, i) => ({ value: String(i), label: `Yes, I'm ${seatName(i)}` })), { value: "none", label: "No, I'm only hosting" }]} />
        <NightLineupPicker first={game.slug} value={lineup} onChange={setLineup} />
      </Modal>

      <Modal
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={loadedId ? "Update this setup" : "Save this setup"}
        size="small"
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: save }}
        secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}
      >
        <Input floatingLabel="Name" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
