"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Badge, Button, Card, Chip, Container, IconButton, Input, Modal, Radio, RadioGroup, Select, Switch, Tabs,
} from "@empac/cascadeds";
import { IconDeviceFloppy, IconDice5, IconLock, IconLockOpen, IconStarFilled } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { KartSlot } from "@/components/randomizer/KartSlot";
import { CardActions } from "@/components/randomizer/CardActions";
import { RandomTile } from "@/components/randomizer/RandomTile";
import { withSeat } from "@/lib/randomizers/seats";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { RollingText } from "@/components/randomizer/RollingText";
import { MinigameCard } from "@/components/party/MinigameCard";
import { VideoHero } from "@/components/layout/VideoHero";
import { NewBanner } from "@/components/NewBanner";
import { IMAGE_COMING_SOON } from "@/components/ImageComingSoon";
import { IconField } from "@/components/events/EventHeaderArt";
import { OnboardingPrompt } from "@/components/randomizer/OnboardingPrompt";
import { useGameCollection } from "@/hooks/useGameCollection";
import { CollectionBar } from "@/components/collection/CollectionBar";
import { createClient } from "@/lib/supabase/client";
import { saveConfig } from "@/lib/configs";
import { characterArt, inEdition, type PartyEdition, type PartyGame, type PartyMinigame } from "@/lib/party/types";
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
export interface PartyHero {
  title: string; lead: string;
  /** Hero photo. Games without one get the generated glyph field instead. */
  image?: string; imagePosition?: string;
  /** Just launched: "New" in the eyebrow and the New banner above the tool. */
  isNew?: boolean;
}

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
  /** Roll counters per setup field: a field spins when it rolls, never while locked. */
  const [setupSpins, setSetupSpins] = useState<Record<SetupField, number>>({ boardId: 0, rulesetId: 0, turns: 0, bonusModeId: 0 });

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
  const [stickSpin, setStickSpin] = useState(true);
  const [coinOnly, setCoinOnly] = useState(false);
  const [camera, setCamera] = useState(false);
  const [spun, setSpun] = useState<PartyMinigame | null>(null);
  const [spinReel, setSpinReel] = useState<{ n: number; pool: PartyMinigame[] }>({ n: 0, pool: [] });
  const [gauntletSize, setGauntletSize] = useState(10);
  const [gauntlet, setGauntlet] = useState<PartyMinigame[]>([]);
  // Who won each minigame in a set list. A list, because 2 vs 2 and 1 vs 3 teams win together.
  const [winners, setWinners] = useState<number[][]>([]);

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
  const roller = (field: SetupField, value: string, pool: string[]) =>
    <RollingText key={setupSpins[field]} value={value} pool={pool} spin={animateReel && setupSpins[field] > 0} />;
  const boardNames = game.boards.filter((b) => boardIds.includes(b.id)).map((b) => b.name);
  const rulesetNames = game.rulesets.map((r) => r.label);
  const bonusNames = game.bonusModes.map((m) => m.label);
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
        setGauntlet(g); setWinners(g.map(() => [])); if (g.length) setMgMode("gauntlet");
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, game, trackEvent]);

  /* ── Actions ── */
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const rollSetupNow = () => {
    const next = rollSetup(game, { edition, boardIds, rulesetIds }, setup, locks);
    if (!next) { toast.error("Pick at least one board and one ruleset to roll from."); return; }
    setSetup(next);
    setSetupSpins((sp) => {
      const out = { ...sp };
      (Object.keys(out) as SetupField[]).forEach((k) => { if (!locks[k] || !setup || setup[k] !== next[k]) out[k]++; });
      return out;
    });
    const r = game.rulesets.find((x) => x.id === next.rulesetId);
    if (r?.teams && !teams) setTeams(drawTeams(game.seats));
    trackEvent("Party Setup Rolled", { game: game.slug, ruleset: next.rulesetId });
  };

  /** Everyone (the intro's Randomize button) or one seat (that card's refresh), never more than asked. */
  const rollCharacters = (seat?: number) => {
    if (seat === undefined) { setChars(drawCharacters(game, seats, { unlockables, exclude: excludedChars })); return; }
    // One seat: a character nobody else holds, and not the one it had, so it changes.
    const others = chars.filter((c, i) => i !== seat && !!c);
    const [one] = drawCharacters(game, 1, { unlockables, exclude: [...excludedChars, ...others, ...(chars[seat] ? [chars[seat]] : [])] });
    setChars((cur) => withSeat(cur, seat, one).map((c) => c ?? ""));
  };

  const spin = () => {
    const pool = minigamePool(game, { edition, categories, motion, coinOnly, camera, stickSpin, rulesetId: setup?.rulesetId });
    const next = pick(pool.filter((m) => m.name !== spun?.name)) ?? pick(pool);
    if (!next) { toast.error("No minigames match those filters."); return; }
    setSpun(next);
    setSpinReel((r) => ({ n: r.n + 1, pool }));
  };
  const drawGauntlet = () => {
    const pool = minigamePool(game, { edition, categories, motion, coinOnly, camera, rulesetId: setup?.rulesetId });
    if (!pool.length) { toast.error("No minigames match those filters."); return; }
    const g = drawMinigames(pool, gauntletSize);
    setGauntlet(g); setWinners(g.map(() => []));
    if (g.length < gauntletSize) toast.info(`Only ${g.length} minigames match, so the set list is ${g.length} long.`);
  };



  const tally = useMemo(() => {
    const t = Array.from({ length: seats }, () => 0);
    winners.forEach((ws) => ws.forEach((w) => { if (w < seats) t[w]++; }));
    return t;
  }, [winners, seats]);



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
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your board and rules.</h2>
          <p>Roll a board, rules, turn count and Bonus Stars. Tap a lock to keep that part on your next roll.</p>
          <div className="kart-intro__actions">
            <Button variant="primary" onClick={rollSetupNow} iconBefore={IconDice5}>{setup ? "Roll again" : "Roll the setup"}</Button>
          </div>
        </div>
        <div className="randomizer-setup party-setup">
        <RandomizerOptions title="Boards and rules"
          summary={[
            `${boardIds.length} of ${game.boards.length} boards`,
            ...(rulesetsInEdition.length > 1 ? [rulesetIds.length ? rulesetsInEdition.filter((r) => rulesetIds.includes(r.id)).map((r) => r.label).join(", ") : "Every ruleset"] : []),
          ]}>
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
        </RandomizerOptions>
        </div>
      </div>

      <div className={`party-board${board ? "" : " party-board--mystery"}`} style={{ "--party-board": board?.color ?? "var(--bg-secondary)" } as React.CSSProperties}>
        {/* Nothing rolled yet: the same generated glyph art as event headers, all question marks and dice. */}
        {!board && <IconField category="mystery" seed={game.slug} opacity={0.2} />}
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN art, same as the Mario Kart tiles */}
        {board && art(board.img) && <img key={setupSpins.boardId} className={`party-board__art${animateReel && setupSpins.boardId ? " is-revealing" : ""}`} src={art(board.img)} alt="" />}
        <div className="party-board__body">
          <div className="party-board__head">
            <span className="party-board__label">Board</span>
            {lockButton("boardId", "board")}
          </div>
          <p className="party-board__name">{board ? roller("boardId", board.name, boardNames) : "Roll to pick a board"}</p>
          {board && <p className="party-board__blurb"><Stars n={board.difficulty} /> {board.blurb}</p>}
        </div>
      </div>

      <dl className="party-rules">
        <div className="party-rules__row">
          <dt>Rules</dt>
          <dd>{ruleset ? <><strong>{roller("rulesetId", ruleset.label, rulesetNames)}</strong>{ruleset.edition === "switch2" && <Badge variant="info" size="small">Switch 2</Badge>}<span className="party-muted">{ruleset.blurb}</span></> : <span className="party-muted">Not rolled yet</span>}</dd>
          {lockButton("rulesetId", "ruleset")}
        </div>
        <div className="party-rules__row">
          <dt>Turns</dt>
          <dd>{setup ? <><strong>{roller("turns", String(setup.turns), (ruleset?.turns ?? [setup.turns]).map(String))}</strong>{ruleset?.turnLabels?.[String(setup.turns)] && <span className="party-muted">{ruleset.turnLabels[String(setup.turns)]}</span>}</> : <span className="party-muted">Not rolled yet</span>}{ruleset && ruleset.turns.length === 1 && <span className="party-muted">Fixed by {ruleset.label}</span>}</dd>
          {lockButton("turns", "turn count")}
        </div>
        <div className="party-rules__row">
          <dt>Bonus Stars</dt>
          <dd>{bonusMode ? <><strong>{roller("bonusModeId", bonusMode.label, bonusNames)}</strong><span className="party-muted">{bonusMode.blurb}</span></> : <span className="party-muted">Not rolled yet</span>}</dd>
          {lockButton("bonusModeId", "Bonus Star mode")}
        </div>
      </dl>

      <section className="party-bonus" aria-labelledby="party-bonus-h">
        <h3 id="party-bonus-h" className="party-h3">What each Bonus Star rewards</h3>
        <ul className="party-bonus__grid">
          {game.bonusStars.map((b) => (
            <li key={b.name}>
              <Card variant="outlined" padding="medium" className="party-bonus__card">
                <span className="party-bonus__icon" aria-hidden><IconStarFilled size={18} /></span>
                <strong className="party-bonus__name">{b.name}</strong>
                <span className="party-bonus__rewards">{b.rewards}</span>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  // The reel spins through the characters a roll can land on, on their own colours.
  const reelPool = useMemo(() => game.characters.map((c) => ({ name: c.name, img: characterArt(game, c) ?? "", color: c.color ?? null })), [game]);
  const playersTab = (
    <div className="party-section">
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your characters.</h2>
          <p>Up to {game.seats} players, all different, with CPUs in any empty seats.</p>
          <div className="kart-intro__actions">
            <Select
              floatingLabel="Players"
              value={String(humans)}
              onChange={(v) => { const n = Number(v); setHumans(n); setChars([]); }}
              options={Array.from({ length: game.seats }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i ? "players" : "player"}` }))}
            />
            <Button variant="primary" onClick={() => rollCharacters()} iconBefore={IconDice5}>{chars.some(Boolean) ? "Reroll everyone" : "Randomize Characters"}</Button>
            <Switch label="Rolling animation" checked={animateReel} onChange={(e) => setAnimateReel(e.target.checked)} />
          </div>
        </div>
        <div className="randomizer-setup party-setup">
          <RandomizerOptions title="Any special modifiers?"
            summary={[
              cpuFill && humans < game.seats ? "CPUs fill empty seats" : humans < game.seats ? "No CPUs" : "",
              game.characters.some((c) => c.unlockable) && unlockables ? `${game.characters.filter((c) => c.unlockable).map((c) => c.name).join(" and ")} unlocked` : "",
            ].filter(Boolean)}>
            <div className="party-row">
              <Switch label="Fill empty seats with CPUs" checked={cpuFill} onChange={(e) => { setCpuFill(e.target.checked); setChars([]); }} disabled={humans === game.seats} />
              {game.characters.some((c) => c.unlockable) && (
                <Switch
                  label={`${game.characters.filter((c) => c.unlockable).map((c) => c.name).join(" and ")} unlocked`}
                  checked={unlockables}
                  onChange={(e) => { setUnlockables(e.target.checked); persist({ unlockables: e.target.checked }); }}
                />
              )}
            </div>
          </RandomizerOptions>
        </div>
      </div>

      <div className="randomizer-grid">
        {Array.from({ length: seats }, (_, i) => {
          const c = game.characters.find((x) => x.name === chars[i]);
          return (
            <div key={i} className="player-card">
              <div className="player-card__header">
                <div className="player-card__name">
                  {i < humans ? (
                    <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24}
                      onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  ) : <span className="party-seat__cpu">{seatName(i)}</span>}
                </div>
                <CardActions refreshLabel={`New character for ${seatName(i)}`} onRefresh={() => rollCharacters(i)} />
              </div>
              <ul className="player-card__slots">
                <KartSlot label="Character" portrait name={c?.name ?? null} imageSrc={c ? characterArt(game, c) ?? null : null} fallback={IMAGE_COMING_SOON} color={c?.color ?? null} pool={reelPool} animate={animateReel} empty={<RandomTile look="party" />} />
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

    </div>
  );

  const categoryLabel = (id: string) => game.minigameCategories.find((c) => c.id === id)?.label ?? "Minigame";
  /** What to tap, by how the minigame splits the table. */
  const winnerHint = (category: string) =>
    category === "2v2" ? "Who won? Tap both winners." : category === "1v3" ? "Who won? Tap the solo player, or all three if the team won." : "Who won? Tap the winner, or everyone who tied.";
  const minigamesTab = (
    <div className="party-section">
      <div className="kart-intro">
        <div className="kart-intro__content">
          <h2>Randomize your minigames.</h2>
          <p>Spin one at a time, or draw a set list for a minigame night and tally the wins.</p>
          <RadioGroup name="mg-mode" orientation="horizontal" label="How do you want to play?" value={mgMode} onChange={(v) => setMgMode(v as MgMode)}>
            <Radio value="roulette" label="One at a time" />
            <Radio value="gauntlet" label="Set list for a minigame night" />
          </RadioGroup>
          <div className="kart-intro__actions">
            {mgMode === "roulette" ? (
              <Button variant="primary" onClick={spin} iconBefore={IconDice5}>{spun ? "Spin again" : "Spin"}</Button>
            ) : (
              <>
                <Select floatingLabel="How many minigames" value={String(gauntletSize)} onChange={(v) => setGauntletSize(Number(v))}
                  options={GAUNTLET_SIZES.map((n) => ({ value: String(n), label: `${n} minigames` }))} />
                <Button variant="primary" onClick={drawGauntlet} iconBefore={IconDice5}>{gauntlet.length ? "Draw a new list" : "Draw the list"}</Button>
              </>
            )}
          </div>
        </div>
        <div className="randomizer-setup party-setup">
        <RandomizerOptions title="Minigame options"
          summary={[
            categoriesInEdition.filter((c) => categories.includes(c.id)).map((c) => c.label).join(", ") || "No categories",
            coinOnly && "Coin minigames only",
            game.minigames.some((m) => m.stickSpin) && !stickSpin && "No stick-spinning",
            game.minigames.some((m) => m.motion) && !motion && "No motion controls",
          ].filter((x): x is string => !!x)}>
        <p className="party-options__label" id="mg-categories">Categories</p>
        <div className="party-chips" role="group" aria-labelledby="mg-categories">
          {categoriesInEdition.map((c) => (
            <Chip key={c.id} clickable selected={categories.includes(c.id)} variant={categories.includes(c.id) ? "primary" : "default"} onClick={() => setCategories((l) => toggleIn(l, c.id))}
              label={c.edition === "switch2" ? `${c.label} (Switch 2)` : c.label} />
          ))}
        </div>
        <p className="party-options__label" id="mg-filters">Include</p>
        <div className="party-row" role="group" aria-labelledby="mg-filters">
          {game.minigames.some((m) => m.motion) && <Switch label="Motion-control minigames" checked={motion} onChange={(e) => setMotion(e.target.checked)} />}
          {game.minigames.some((m) => m.stickSpin) && <Switch label="Stick-spinning minigames" checked={stickSpin} onChange={(e) => setStickSpin(e.target.checked)} />}
          <Switch label="Coin minigames only" checked={coinOnly} onChange={(e) => setCoinOnly(e.target.checked)} />
          {edition === "switch2" && <Switch label="Camera minigames (needs a camera)" checked={camera} onChange={(e) => setCamera(e.target.checked)} />}
        </div>
        </RandomizerOptions>
        </div>
      </div>

      {mgMode === "roulette" ? (
        <>
          <div aria-live="polite">
            <MinigameCard key={spinReel.n} reel={animateReel && spinReel.n ? spinReel.pool : undefined} feature minigame={spun} categoryLabel={spun ? categoryLabel(spun.category) : "Minigame"} artSrc={spun?.img ? art(spun.img) : undefined} />
          </div>
        </>
      ) : (
        <>
          {gauntlet.length > 0 && (
            <>
              <ol className="mg-grid">
                {gauntlet.map((m, r) => (
                  <li key={m.name}>
                    <MinigameCard minigame={m} round={r + 1} categoryLabel={categoryLabel(m.category)} artSrc={m.img ? art(m.img) : undefined}>
                      <span className="party-muted" id={`mg-won-${r}`}>{winnerHint(m.category)}</span>
                      <span className="party-chips" role="group" aria-labelledby={`mg-won-${r}`}>
                        {Array.from({ length: seats }, (_, seat) => {
                          const on = (winners[r] ?? []).includes(seat);
                          return <Chip key={seat} size="small" clickable selected={on} variant={on ? "primary" : "default"} label={seatName(seat)}
                            onClick={() => setWinners((w) => w.map((ws, j) => (j === r ? (ws.includes(seat) ? ws.filter((x) => x !== seat) : [...ws, seat]) : ws)))} />;
                        })}
                      </span>
                    </MinigameCard>
                  </li>
                ))}
              </ol>
              <p className="party-tally">
                <strong>Wins:</strong> {tally.map((t, seat) => `${seatName(seat)}: ${t}`).join(" · ")}
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
      <VideoHero backgroundImage={hero.image} backgroundPosition={hero.imagePosition ?? "center"} overlayOpacity={hero.image ? 0.65 : 0} height="medium" blend className={`randomizer-hero${hero.image ? "" : " randomizer-hero--glyph"}`}>
        {!hero.image && <IconField category="video" seed={game.slug} opacity={0.14} />}
        <Container>
          <div style={{ maxWidth: "600px", position: "relative", zIndex: 2 }}>
            <p className="marketing-eyebrow">{hero.isNew ? "Free randomizer · New" : "Free randomizer"}</p>
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
      {hero.isNew && <NewBanner />}
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
