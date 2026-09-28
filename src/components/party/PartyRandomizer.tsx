"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Accordion, Badge, Button, Chip, Container, IconButton, Input, Modal, Radio, RadioGroup, Select, Switch, Tabs,
} from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy, IconDice5, IconLock, IconLockOpen } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { VideoHero } from "@/components/layout/VideoHero";
import { IconField } from "@/components/events/EventHeaderArt";
import { OnboardingPrompt } from "@/components/randomizer/OnboardingPrompt";
import { useGameCollection } from "@/hooks/useGameCollection";
import { CollectionBar } from "@/components/collection/CollectionBar";
import { createClient } from "@/lib/supabase/client";
import { saveConfig } from "@/lib/configs";
import { inEdition, type PartyEdition, type PartyGame, type PartyMinigame } from "@/lib/party/types";
import {
  drawCharacters, drawMinigames, drawTeams, minigamePool, pick, rollSetup,
  type PartySetup, type SetupField,
} from "@/lib/party/roll";
import type { PartySetupConfig } from "@/data/config-types";

/**
 * The party randomizer: one client for every Mario Party game, driven entirely
 * by the game's data (src/data/party/*). Like the Mario Kart randomizers it
 * only rolls: the board and rules, characters, and minigames. The meta game
 * (Chance cards, missions, points, live nights) lives in game nights and
 * tournaments.
 */

type Tab = "setup" | "players" | "minigames";
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

/** The page header, matching the Mario Kart randomizers. */
export interface PartyHero { title: string; lead: string; image: string; imagePosition?: string }

export function PartyRandomizer({ game, hero }: { game: PartyGame; hero: PartyHero }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();
  const searchParams = useSearchParams();

  const starterBoards = useMemo(() => game.boards.filter((b) => !b.unlockable).map((b) => b.id), [game]);

  // Prefs that follow the player between visits.
  const [edition, setEdition] = useState<PartyEdition>("switch1");
  const [boardIds, setBoardIds] = useState<string[]>(starterBoards);
  const [unlockables, setUnlockables] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [tab, setTab] = useState<Tab>("setup");

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

  // Unlocked party modes: part of the saved collection, kept as-is.
  const [unlockedModes, setUnlockedModes] = useState<string[]>([]);

  const [animateReel, setAnimateReel] = useState(true);

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
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

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



  const tally = useMemo(() => {
    const t = Array.from({ length: seats }, () => 0);
    winners.forEach((w) => { if (w !== null && w < seats) t[w]++; });
    return t;
  }, [winners, seats]);

  const summary = () => {
    const lines = [`${game.label} night`];
    if (board && ruleset) lines.push(`${board.name} · ${ruleset.label} · ${setup!.turns} turns · ${bonusMode?.label ?? ""}`);
    if (chars.length) lines.push(chars.map((c, i) => `${seatName(i)}: ${c}`).join(", "));
    if (teams && ruleset?.teams) lines.push(`Teams: ${teams.map((t) => t.map(seatName).join(" + ")).join(" vs ")}`);
    if (gauntlet.length) lines.push(`Minigames: ${gauntlet.map((m) => m.name).join(", ")}`);
    return lines.join("\n");
  };
  const copySummary = async () => {
    try { await navigator.clipboard.writeText(summary()); toast.success("Copied, ready to paste"); }
    catch { toast.error("Couldn't copy. Your browser blocked the clipboard."); }
  };


  const save = async () => {
    if (!user) { window.location.href = `/signup?redirect=${encodeURIComponent(`/randomizers/${game.slug}`)}`; return; }
    if (!saveName.trim()) return;
    setSaving(true);
    const data: PartySetupConfig = {
      type: "party-setup", gameSlug: game.slug, edition, setup,
      players: Array.from({ length: seats }, (_, i) => ({ name: seatName(i), character: chars[i] ?? "", cpu: i >= humans })),
      teams: ruleset?.teams ? teams : null, boardIds, unlockables,
      gauntlet: gauntlet.map((m) => m.name), rules: [], chance: [], missions: [],
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

  const setupTab = (
    <div className="party-section">
      <div className={`party-board${board ? "" : " party-board--mystery"}`} style={{ "--party-board": board?.color ?? "var(--bg-secondary)" } as React.CSSProperties}>
        {/* Nothing rolled yet: the same generated glyph art as event headers, all question marks and dice. */}
        {!board && <IconField category="mystery" seed={game.slug} opacity={0.2} />}
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

  // The reel spins through the characters a roll can land on, on their own colours.
  const reelPool = useMemo(() => game.characters.map((c) => ({ name: c.name, img: game.artReady ? `${game.assetBase}${c.img}` : "", color: c.color ?? null })), [game]);
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

      <div className="randomizer-grid">
        {Array.from({ length: seats }, (_, i) => {
          const c = game.characters.find((x) => x.name === chars[i]);
          return (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  {i < humans ? (
                    <Input type="text" placeholder={`Player ${i + 1}`} value={names[i] ?? ""} maxLength={24}
                      onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  ) : <span className="party-seat__cpu">{seatName(i)}</span>}
                </div>
                <div className="player-card__actions">
                  <Button variant="primary" size="small" onClick={() => (chars.length ? rollCharacters(i) : rollCharacters())}>Refresh Character</Button>
                </div>
              </div>
              <ul className="player-card__slots">
                <KartSlot label="Character" portrait name={c?.name ?? null} imageSrc={c ? art(c.img) ?? null : null} color={c?.color ?? null} pool={reelPool} animate={animateReel} />
              </ul>
              {c?.buddy && <p className="party-muted">As a Jamboree Buddy: {c.buddy}</p>}
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
        <Button variant="primary" onClick={() => rollCharacters()} iconBefore={IconDice5}>{chars.length ? "Reroll everyone" : "Randomize Characters"}</Button>
        <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
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


  const toolRef = useRef<HTMLElement>(null);

  // First visit: the same guided setup as the Mario Kart randomizers. Answers set
  // the version and player count, then the chosen rolls run once the page has
  // re-rendered with them (the roll functions read the latest state via this ref).
  const rollers = useRef<Record<string, () => void>>({});
  useEffect(() => {
    rollers.current = {
      setup: rollSetupNow,
      players: () => rollCharacters(),
      minigames: spin,
    };
  });
  type Onboarding = { playerCount: number; selectedTabs: string[]; choice?: string; auto?: boolean };
  const handleOnboarding = (r: Onboarding) => {
    setHumans(Math.max(1, Math.min(game.seats, r.playerCount)));
    if (r.choice === "switch1" || r.choice === "switch2") { setEdition(r.choice); persist({ edition: r.choice }); }
    if (r.auto) return; // a saved profile answered: set it up, but don't roll anything unasked
    const order: Tab[] = ["setup", "players", "minigames"];
    const chosen = order.filter((t) => r.selectedTabs.includes(t));
    window.setTimeout(() => {
      for (const t of chosen) rollers.current[t]?.();
      if (chosen[0]) setTab(chosen.includes("setup") ? "setup" : chosen[0]);
      toolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };
  // The prompt re-checks when its callback changes, so hand it a stable one that calls the latest handler.
  const onboardingRef = useRef(handleOnboarding);
  useEffect(() => { onboardingRef.current = handleOnboarding; });
  const onboarded = useCallback((r: Onboarding) => onboardingRef.current(r), []);
  const tabs: { id: Tab; label: string; content: React.ReactNode }[] = [
    { id: "setup", label: "Board Randomizer", content: setupTab },
    { id: "players", label: "Character Randomizer", content: playersTab },
    { id: "minigames", label: "Minigame Randomizer", content: minigamesTab },
  ];

  return (
    <>
      <VideoHero backgroundImage={hero.image} backgroundPosition={hero.imagePosition ?? "center"} overlayOpacity={0.65} height="medium" blend className="randomizer-hero">
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <p className="marketing-eyebrow">Free randomizer</p>
            <h1 style={{ fontSize: "clamp(2.4rem, 4vw, 4.8rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "var(--spacing-16)" }}>{hero.title}</h1>
            <p>{hero.lead}</p>
            {/* Lead with the action: roll the board, rules and characters, then show them. */}
            <div style={{ margin: "var(--spacing-24) 0 0" }}>
              <Button variant="primary" size="large" onClick={() => {
                rollSetupNow();
                rollCharacters();
                setTab("setup");
                toolRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}>Randomize now →</Button>
            </div>
          </div>
        </Container>
      </VideoHero>

      <OnboardingPrompt
        gameSlug={game.slug}
        maxPlayers={game.seats}
        defaultPlayers={4}
        title="Let's set up your party night"
        tabsLabel="What should we roll?"
        availableTabs={[
          { id: "setup", label: "Board & rules" },
          { id: "players", label: "Characters" },
          { id: "minigames", label: "A minigame" },
        ]}
        defaultTabs={["setup", "players"]}
        playersFor={["players"]}
        playersHint="People only. CPUs fill any empty seats."
        countStep={null}
        choice={game.editions ? { label: "Which version do you have?", options: game.editions.map((e) => ({ value: e.id, label: e.label })), value: edition } : undefined}
        onComplete={onboarded}
      />

      <main ref={toolRef} style={{ paddingTop: "var(--spacing-48)", scrollMarginTop: "6rem" }}>
      <Container>
    <div className="party">
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

      <div className="randomizer-controls">
        <Tabs variant="pills" size="medium" activeTab={tab} onChange={(id) => setTab(id as Tab)} tabs={tabs.map((t) => ({ id: t.id, label: t.label, content: <></> }))} />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="small" onClick={copySummary} iconBefore={IconCopy}>Copy setup</Button>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : save())} iconBefore={IconDeviceFloppy}>{loadedId ? `Update: ${saveName}` : "Save Complete Setup"}</Button>
        </div>
      </div>
      {tabs.find((t) => t.id === tab)?.content}



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
      </Container>
      </main>
    </>
  );
}
