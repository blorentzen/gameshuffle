"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Accordion, Alert, Avatar, Badge, Button, Checkbox, Chip, IconButton, Input, Modal, Radio, RadioGroup, Select, Switch, Tabs,
} from "@empac/cascadeds";
import { IconCheck, IconCopy, IconDeviceFloppy, IconDice5, IconLock, IconLockOpen, IconRefresh, IconUsersGroup } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { createClient } from "@/lib/supabase/client";
import { saveConfig } from "@/lib/configs";
import { inEdition, type PartyEdition, type PartyGame, type PartyMinigame } from "@/lib/party/types";
import {
  drawCards, drawCharacters, drawMinigames, drawTeams, minigamePool, pick, planNight, rollSetup,
  type NightSegment, type PartySetup, type SetupField,
} from "@/lib/party/roll";
import { cardById, cardParts, cardsFor, cardText, dealCard, momentsFor, simpleTable, type CardDraw, type PartyCard } from "@/data/party/cards";
import type { PartySetupConfig } from "@/data/config-types";
import { PARTY_FAMILY } from "@/data/party";
import { CODE_DECK, type Deck } from "@/lib/party/deck";

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
function writePrefs(slug: string, p: Prefs) {
  try { localStorage.setItem(prefsKey(slug), JSON.stringify(p)); } catch { /* private mode: prefs just don't stick */ }
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

  // The card deck: the code deck until the database deck (official + your own Pro+ cards) loads.
  const [deck, setDeck] = useState<Deck>(CODE_DECK);
  const byId = useCallback((id: string) => cardById(id, deck.cards), [deck]);
  useEffect(() => {
    let live = true;
    void fetch(`/api/decks/public?family=${PARTY_FAMILY}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (live && j?.cards?.length) setDeck({ cards: j.cards, moments: j.moments ?? [] });
    }).catch(() => {});
    return () => { live = false; };
  }, [user?.id]);

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

  // House rules and missions
  const [ruleCount, setRuleCount] = useState(1);
  const [spicy, setSpicy] = useState(false);
  const [rules, setRules] = useState<CardDraw[]>([]);
  const [chanceCount, setChanceCount] = useState(2);
  const [chanceMix, setChanceMix] = useState<"both" | "help" | "crutch">("both");
  const [chance, setChance] = useState<CardDraw[]>([]);
  const [missionsPer, setMissionsPer] = useState(2);
  const [missions, setMissions] = useState<CardDraw[][]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  // Night plan
  const [nightMinutes, setNightMinutes] = useState(120);
  const [nightBoard, setNightBoard] = useState<"always" | "maybe" | "never">("always");
  const [nightCoop, setNightCoop] = useState(true);
  const [nightMotion, setNightMotion] = useState(true);
  const [unlockedModes, setUnlockedModes] = useState<string[]>([]);
  const [plan, setPlan] = useState<NightSegment[]>([]);

  const [secret, setSecret] = useState(false);
  const [peek, setPeek] = useState<number | null>(null);
  const [moments, setMoments] = useState<string[]>(["homestretch", "intermission"]);
  const [drawFor, setDrawFor] = useState("any");

  // Live night
  const [liveOpen, setLiveOpen] = useState(false);
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

  /* ── Prefs ── */
  useEffect(() => {
    void Promise.resolve().then(() => {
      const p = readPrefs(game.slug);
      if (p?.edition === "switch1" || p?.edition === "switch2") setEdition(p.edition);
      if (Array.isArray(p?.boardIds) && p.boardIds.length) setBoardIds(p.boardIds.filter((id) => game.boards.some((b) => b.id === id)));
      if (typeof p?.unlockables === "boolean") setUnlockables(p.unlockables);
      setPrefsLoaded(true);
    });
  }, [game]);
  useEffect(() => {
    if (prefsLoaded) writePrefs(game.slug, { edition, boardIds, unlockables });
  }, [prefsLoaded, game.slug, edition, boardIds, unlockables]);

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
        if (cfg.plan) setPlan(cfg.plan.filter((sgm) => game.modes.some((m) => m.id === sgm.modeId)));
        trackEvent("Config Loaded", { configId: id });
      });
    // Re-runs once the database deck loads, so a saved setup's custom cards resolve.
  }, [searchParams, user, game, trackEvent, byId]);

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
    setChars(drawCharacters(game, seats, { unlockables }, keepSeat === undefined ? [] : keep));
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

  // Turn counts on cards fit the rolled game; before a roll, assume a 20-turn night.
  const gameTurns = setup?.turns ?? 20;
  // Cards only go to people (seats 0..humans-1). CPUs play normally.
  const people = Math.min(humans, seats);
  const randomPerson = () => Math.floor(Math.random() * people);
  // No account: the starter deck. A free account unlocks the full deck (approved tiers).
  const starterOnly = !user;
  const fitsTable = (c: PartyCard) => seats > 1 || !c.text.includes("{rival}");
  const deal = (card: PartyCard, seat: number | null) => dealCard(card, seat, simpleTable(seats, people), gameTurns);
  const drawRules = () => {
    const pool = cardsFor(game.slug, setup?.rulesetId ?? null, "rule", people, gameTurns, starterOnly, deck.cards).filter((c) => fitsTable(c) && (spicy || c.tone === "mild"));
    setRules(drawCards(pool, ruleCount).map((card) => deal(card, card.scope === "player" ? randomPerson() : null)));
  };
  const chanceDeck = (mix: "both" | "help" | "crutch" = chanceMix) => cardsFor(game.slug, setup?.rulesetId ?? null, "chance", people, gameTurns, starterOnly, deck.cards)
    .filter((c) => fitsTable(c) && (mix === "both" || c.effect === mix));
  const drawChance = () => {
    // Deal round the table from a random start, so one person doesn't get the lot.
    const picked = drawCards(chanceDeck(), chanceCount);
    const start = randomPerson();
    setChance(picked.map((card, i) => deal(card, (start + i) % people)));
  };
  /** One more card mid-game, for a chosen person (or anyone) and of a chosen kind. */
  const drawOne = (effect: "help" | "crutch" | "both", seat: number | null) => {
    const [card] = drawCards(chanceDeck(effect), 1, chance.map((d) => d.id));
    if (!card) { toast.info("Every card of that kind is already in play."); return; }
    setChance((cur) => [...cur, deal(card, seat ?? randomPerson())]);
  };
  /** Hand a dealt card to a different person. */
  const passCard = (i: number) => setChance((cur) => cur.map((d, j) => {
    if (j !== i || people < 2) return d;
    const next = ((d.seat ?? 0) + 1 + Math.floor(Math.random() * (people - 1))) % people;
    return { ...deal(byId(d.id)!, next), n: d.n };
  }));
  const discardCard = (i: number) => setChance((cur) => cur.filter((_, j) => j !== i));
  const drawMissions = () => {
    const pool = cardsFor(game.slug, setup?.rulesetId ?? null, "mission", people, gameTurns, starterOnly, deck.cards).filter(fitsTable);
    // Different missions for each person where the deck allows, so no two race for the same card.
    const used: string[] = [];
    setMissions(Array.from({ length: people }, (_, seat) => {
      const hand = drawCards(pool, missionsPer, used.length + missionsPer <= pool.length ? used : []);
      used.push(...hand.map((c) => c.id));
      return hand.map((card) => deal(card, seat));
    }));
    setDone(new Set());
  };
  const nameOf = useCallback((seat: number) => seatName(seat), [seatName]);
  const renderParts = (d: CardDraw) => cardParts(byId(d.id)!, d).map((part, k) =>
    typeof part === "string" ? <span key={k}>{part}</span> : <strong key={k}>{seatName(part.seat)}</strong>);

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
      }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setStarting(false);
    if (!r?.ok) {
      toast.error(j.error === "unavailable" ? "Live nights need a database update first. The randomizer still works here." : "Couldn't start the night. Please try again.");
      return;
    }
    trackEvent("Party Live Night Started", { game: game.slug });
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
      gauntlet: gauntlet.map((m) => m.name), rules, chance, missions, moments, secret, plan,
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
          <Switch key={m.id} label={`${m.label} unlocked`} checked={unlockedModes.includes(m.id)} onChange={() => setUnlockedModes((l) => toggleIn(l, m.id))} />
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
            <Chip key={b.id} clickable selected={boardIds.includes(b.id)} variant={boardIds.includes(b.id) ? "primary" : "default"} onClick={() => setBoardIds((l) => toggleIn(l, b.id))}
              label={b.unlockable ? `${b.name} (unlockable)` : b.name} />
          ))}
        </div>
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
            onChange={(e) => setUnlockables(e.target.checked)}
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

  const missionPoints = (seat: number) => (missions[seat] ?? []).reduce((sum, d) => sum + (done.has(`${seat}:${d.id}`) ? byId(d.id)?.worth ?? 1 : 0), 0);
  const cardsTab = (
    <div className="party-section">
      <h3 className="party-h3">House rules</h3>
      <div className="party-row">
        <Select floatingLabel="Rules" value={String(ruleCount)} onChange={(v) => setRuleCount(Number(v))}
          options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "rule" : "rules"}` }))} />
        <Switch label="Include spicy rules" helperText="They shake the game up more" checked={spicy} onChange={(e) => setSpicy(e.target.checked)} />
        <Button variant="primary" onClick={drawRules} iconBefore={IconDice5}>{rules.length ? "Draw again" : "Draw rules"}</Button>
      </div>
      {rules.length > 0 && (
        <ul className="party-cards">
          {rules.map((d) => {
            const card = byId(d.id)!;
            return (
              <li key={d.id} className="party-card">
                <span className="party-card__who">{d.seat === null ? "Everyone" : seatName(d.seat)}</span>
                <strong className="party-card__title">{card.title}</strong>
                <span>{renderParts(d)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="party-h3">Card moments</h3>
      <p className="party-muted">Moments in the game that bring a Chance card into play. Pick the ones your table likes.</p>
      <div className="party-chips">
        {momentsFor(setup?.rulesetId ?? null, deck.moments).map((m) => (
          <Chip key={m.id} clickable selected={moments.includes(m.id)} variant={moments.includes(m.id) ? "primary" : "default"} label={m.title}
            onClick={() => setMoments((l) => toggleIn(l, m.id))} />
        ))}
      </div>
      {moments.length > 0 && (
        <ul className="party-list">
          {momentsFor(setup?.rulesetId ?? null, deck.moments).filter((m) => moments.includes(m.id)).map((m) => <li key={m.id}><strong>{m.title}:</strong> {m.text}</li>)}
        </ul>
      )}

      <h3 className="party-h3">Hands</h3>
      {starterOnly && (
        <Alert variant="info">
          You&apos;re playing the starter deck: {cardsFor(game.slug, null, "chance", 4, 20, true, deck.cards).length} Chance cards and {cardsFor(game.slug, null, "mission", 4, 20, true, deck.cards).length} missions.{" "}
          <a href={`/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`}>Create a free account</a> for the full deck of {cardsFor(game.slug, null, "chance", 4, 20, false, deck.cards).length} and {cardsFor(game.slug, null, "mission", 4, 20, false, deck.cards).length}, plus a record of your points.
        </Alert>
      )}
      <p className="party-muted">
        Chance cards are helps and crutches for one person. Missions are goals worth points.
        {seats > people && " CPUs play normally, so only the people playing get cards."}
      </p>
      <div className="party-row">
        <Select floatingLabel="Chance cards" value={String(chanceCount)} onChange={(v) => setChanceCount(Number(v))}
          options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: n ? `${n} to deal` : "None to start" }))} />
        <Select floatingLabel="Mix" value={chanceMix} onChange={(v) => setChanceMix(v as typeof chanceMix)}
          options={[{ value: "both", label: "Helps and crutches" }, { value: "help", label: "Helps only" }, { value: "crutch", label: "Crutches only" }]} />
        <Select floatingLabel="Missions" value={String(missionsPer)} onChange={(v) => setMissionsPer(Number(v))}
          options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? `${n} each` : "No missions" }))} />
        <Button variant="primary" iconBefore={IconDice5} onClick={() => { drawChance(); drawMissions(); setPeek(null); }}>
          {chance.length || missions.length ? "Deal new hands" : "Deal hands"}
        </Button>
      </div>
      <RadioGroup name="hand-visibility" orientation="horizontal" value={secret ? "secret" : "open"} onChange={(v) => { setSecret(v === "secret"); setPeek(null); }}>
        <Radio value="open" label="Everyone sees every hand" />
        <Radio value="secret" label="Secret hands (tap to peek)" />
      </RadioGroup>
      {secret && <p className="party-muted">Keep your cards to yourself until they matter, then read one out to play it.</p>}

      {(chance.length > 0 || missions.length > 0) && (
        <>
          <div className="party-row party-draw">
            <Select floatingLabel="Draw for" value={drawFor} onChange={(v) => setDrawFor(String(v))}
              options={[{ value: "any", label: "Anyone (random)" }, ...Array.from({ length: people }, (_, i) => ({ value: String(i), label: seatName(i) }))]} />
            <Button variant="secondary" onClick={() => drawOne("help", drawFor === "any" ? null : Number(drawFor))}>Draw a help</Button>
            <Button variant="secondary" onClick={() => drawOne("crutch", drawFor === "any" ? null : Number(drawFor))}>Draw a crutch</Button>
          </div>
          <div className="party-hands">
            {Array.from({ length: people }, (_, seat) => {
              const mine = chance.map((d, i) => ({ d, i })).filter(({ d }) => d.seat === seat);
              // Cards that bind this person as the rival (a Truce): they need to know too.
              const involved = chance.map((d, i) => ({ d, i })).filter(({ d }) => d.seat !== seat && d.rival === seat && byId(d.id)?.rivalObeys);
              const hand = missions[seat] ?? [];
              const hidden = secret && peek !== seat;
              return (
                <div key={seat} className="party-hand">
                  <p className="party-missions__who"><strong>{seatName(seat)}</strong> <span className="party-muted">{missionPoints(seat)} pts</span></p>
                  {hidden ? (
                    <>
                      <p className="party-muted">{mine.length + involved.length} {mine.length + involved.length === 1 ? "card" : "cards"}, {hand.length} {hand.length === 1 ? "mission" : "missions"}. Everyone else look away.</p>
                      <Button variant="secondary" size="small" onClick={() => setPeek(seat)}>Show {seatName(seat)}&apos;s hand</Button>
                    </>
                  ) : (
                    <>
                      {[...mine, ...involved].map(({ d, i }) => {
                        const card = byId(d.id)!;
                        const forMe = d.seat === seat;
                        return (
                          <div key={`${d.id}-${i}`} className={`party-card party-card--${card.effect}`}>
                            <span className="party-card__head">
                              <Badge variant={card.effect === "help" ? "success" : "warning"} size="small">{card.effect === "help" ? "Help" : "Crutch"}</Badge>
                              {!forMe && <span className="party-card__who">Involves you</span>}
                              {forMe && (
                                <span className="party-card__tools">
                                  {people > 1 && !secret && (
                                    <IconButton variant="tertiary" size="small" aria-label={`Give ${card.title} to someone else`} title="Give it to someone else" onClick={() => passCard(i)}>
                                      <IconRefresh size={16} />
                                    </IconButton>
                                  )}
                                  <IconButton variant="tertiary" size="small" aria-label={`Done with ${card.title}`} title="Done with this card" onClick={() => discardCard(i)}>
                                    <IconCheck size={16} />
                                  </IconButton>
                                </span>
                              )}
                            </span>
                            <strong className="party-card__title">{card.title}</strong>
                            <span>{renderParts(d)}</span>
                          </div>
                        );
                      })}
                      {hand.map((d) => {
                        const c = byId(d.id)!;
                        const key = `${seat}:${d.id}`;
                        return (
                          <Checkbox key={d.id} checked={done.has(key)} label={`${c.title} (${c.worth} pt${c.worth === 1 ? "" : "s"})`} helperText={cardText(c, d, nameOf)}
                            onChange={(e) => setDone((cur) => { const n = new Set(cur); if (e.target.checked) n.add(key); else n.delete(key); return n; })} />
                        );
                      })}
                      {!mine.length && !involved.length && !hand.length && <p className="party-muted">Nothing in this hand yet.</p>}
                      {secret && <Button variant="ghost" size="small" onClick={() => setPeek(null)}>Hide {seatName(seat)}&apos;s hand</Button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="tool-panel party">
      {game.editions && (
        <div className="party-edition">
          <RadioGroup name="edition" orientation="horizontal" label="Which version do you have?" value={edition}
            onChange={(v) => { setEdition(v as PartyEdition); setRulesetIds([]); }}>
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
