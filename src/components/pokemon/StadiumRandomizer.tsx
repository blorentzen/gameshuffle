"use client";

/**
 * Pokémon Stadium 1 & 2 rental team randomizer: pick a game and cup, and every
 * player (1 to 4) gets a team of 6 different rentals, no repeats across players
 * by default, with an optional randomized pick of 3. Cards show each rental's
 * level and moves so players can find it in the game's rental menu. Only rolls;
 * the rest lives in game nights. Type cards, with a showcase TCG card on top
 * where one has been populated (see TypeCard and src/lib/pokemon/showcase.ts).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select, Switch } from "@empac/cascadeds";
import { LabeledCombobox } from "@/components/ui/LabeledCombobox";
import { IconCopy, IconDeviceFloppy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { StadiumSetupConfig } from "@/data/config-types";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { PokemonDisclaimer, type ShowcaseArt } from "@/components/pokemon/TypeCard";
import { PokemonCard } from "@/components/pokemon/PokemonCard";
import { PokemonDetails } from "@/components/pokemon/PokemonDetails";
import { speciesName } from "@/lib/pokemon/names";
import { TcgAttribution } from "@/components/tcg/TcgAttribution";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { CardActions } from "@/components/randomizer/CardActions";
import { seatLabel, withSeat } from "@/lib/randomizers/seats";
import { PokeBall } from "@/components/pokemon/PokeBall";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { saveConfig, updateConfig } from "@/lib/configs";
import { EVENTS, track } from "@/lib/analytics/events";
import { AiSetupBar } from "@/components/ai/AiSetupBar";
import {
  MAX_PLAYERS, STADIUM_GAMES, cupHasRound2, rentalPool, rerollTeamKeeping, rollTeams, stadiumCup, stadiumGame, suggestPick, type Rental, TEAM_SIZE,
} from "@/lib/pokemon/stadium";

const SLUG = "pokemon-stadium";
/** How a rental reads in the chooser (and the value it hands back). */
const rentalLabel = (r: Rental) => `${r.name} (Lv ${r.level})`;

export function StadiumRandomizer({ art = {} }: { art?: Record<number, ShowcaseArt> }) {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();

  const [gameSlug, setGameSlug] = useState(STADIUM_GAMES[0].slug);
  const game = stadiumGame(gameSlug);
  const [cupId, setCupId] = useState("poke");
  const cup = stadiumCup(game, cupId);
  const [players, setPlayers] = useState(1);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);
  const [noRepeat, setNoRepeat] = useState(true);
  const [pickThree, setPickThree] = useState(false);
  const [round2, setRound2] = useState(false);
  const [teams, setTeams] = useState<Rental[][]>([]);
  const [picks, setPicks] = useState<number[][]>([]);
  // Slots a player chose themselves: kept when their team (or everyone's) re-rolls.
  const [chosenSlots, setChosenSlots] = useState<boolean[][]>([]);
  const [details, setDetails] = useState<{ seat: number; index: number } | null>(null);
  // Rolling animation: each seat's roll count re-keys its unchosen cards so they spin.
  const [animate, setAnimate] = useState(true);
  const [rolls, setRolls] = useState<number[]>([]);
  const bump = (seats: number[]) => setRolls((cur) => { const n = [...cur]; seats.forEach((s2) => { n[s2] = (n[s2] ?? 0) + 1; }); return n; });
  const pool = rentalPool(cup, round2);

  const switchGame = (slug: string) => {
    const g = stadiumGame(slug);
    setGameSlug(slug);
    if (!g.cups.some((c) => c.id === cupId)) setCupId(g.cups.find((c) => c.id === "poke")?.id ?? g.cups[0].id);
    setTeams([]); setPicks([]); setChosenSlots([]);
  };
  const switchCup = (id: string) => { setCupId(id); setTeams([]); setPicks([]); setChosenSlots([]); };
  const keepOf = (seat: number) => (chosenSlots[seat] ?? []).flatMap((c, j) => (c ? [j] : []));

  const roll = () => {
    let t: Rental[][];
    if (chosenSlots.some((row) => row?.some(Boolean))) {
      // Keep everyone's own choices: re-roll seat by seat around them.
      t = teams.slice(0, players);
      for (let seat = 0; seat < players; seat++) t[seat] = rerollTeamKeeping(cup, t, seat, keepOf(seat), { noRepeat, round2 });
    } else {
      t = rollTeams(cup, { players, noRepeat, round2 });
    }
    setTeams(t);
    setPicks(t.map((team) => suggestPick(team)));
    bump(t.map((_, s2) => s2));
    trackEvent("Stadium Teams Rolled", { game: game.slug, cup: cup.id, players: String(players) });
  };
  /** This seat's team only (the intro's Randomize button rolls everyone), even before anyone has rolled. */
  const rerollSeat = (seat: number) => {
    const all = withSeat(teams, seat, teams[seat] ?? []).map((t) => t ?? []);
    const team = rerollTeamKeeping(cup, all, seat, keepOf(seat), { noRepeat, round2 });
    setTeams((cur) => withSeat(cur, seat, team).map((t) => t ?? []));
    bump([seat]);
    setPicks((cur) => withSeat(cur, seat, suggestPick(team)).map((p) => p ?? []));
  };
  const addPlayer = () => setPlayers((n) => Math.min(MAX_PLAYERS, n + 1));
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setTeams((cur) => cur.filter((_, j) => j !== seat));
    setPicks((cur) => cur.filter((_, j) => j !== seat));
    setChosenSlots((cur) => cur.filter((_, j) => j !== seat));
  };

  /** Put a specific rental in one slot and keep it there on re-rolls (or hand it back to the randomizer). */
  const chooseSlot = (seat: number, index: number, dexName: string | null) => {
    if (dexName) {
      const r = pool.find((x) => rentalLabel(x) === dexName);
      if (!r) return;
      track(EVENTS.pokemonSlotChosen, { game: "stadium" });
      setTeams((cur) => cur.map((t, i) => (i === seat ? t.map((x, j) => (j === index ? r : x)) : t)));
    }
    setChosenSlots((cur) => {
      const next = Array.from({ length: Math.max(cur.length, seat + 1) }, (_, i) => [...(cur[i] ?? [])]);
      next[seat][index] = !!dexName;
      return next;
    });
  };
  const open = details ? teams[details.seat]?.[details.index] ?? null : null;

  /** Plain-language setup: apply the options, and roll teams around any Pokémon someone asked for. */
  const applySetup = (o: { game?: string | null; cup?: string | null; players?: number | null; noRepeat?: boolean | null; pickThree?: boolean | null; round2?: boolean | null; requests?: { player: number; pokemon: string[] }[] }) => {
    const g = o.game && STADIUM_GAMES.some((x) => x.slug === o.game) ? stadiumGame(o.game) : game;
    const c = o.cup && g.cups.some((x) => x.id === o.cup) ? stadiumCup(g, o.cup) : g.cups.some((x) => x.id === cupId) ? stadiumCup(g, cupId) : g.cups[0];
    const n = o.players ? Math.max(1, Math.min(MAX_PLAYERS, o.players)) : players;
    const nr = o.noRepeat ?? noRepeat;
    const r2 = o.round2 ?? round2;
    setGameSlug(g.slug); setCupId(c.id); setPlayers(n); setNoRepeat(nr); setRound2(r2);
    if (o.pickThree != null) setPickThree(o.pickThree);
    const reqs = (o.requests ?? []).filter((r) => r.player >= 1 && r.player <= n && r.pokemon.length);
    if (!reqs.length) { setTeams([]); setPicks([]); setChosenSlots([]); return; }
    const pool2 = rentalPool(c, r2);
    const species = (r: Rental) => r.name.replace(/^Surfing /, "").toLowerCase();
    const t = rollTeams(c, { players: n, noRepeat: nr, round2: r2 });
    const chosen: boolean[][] = t.map(() => []);
    for (const r of reqs) {
      const seat = r.player - 1;
      const wanted = r.pokemon.map((p) => pool2.find((x) => species(x) === p.toLowerCase())).filter((x): x is Rental => !!x).slice(0, TEAM_SIZE);
      if (!wanted.length) continue;
      const seeded = [...wanted, ...t[seat].filter((x) => !wanted.some((w) => w.dex === x.dex))].slice(0, TEAM_SIZE);
      t[seat] = rerollTeamKeeping(c, t.map((x, i) => (i === seat ? seeded : x)), seat, wanted.map((_, i) => i), { noRepeat: nr, round2: r2 });
      chosen[seat] = wanted.map(() => true);
    }
    setTeams(t);
    setPicks(t.map((team) => suggestPick(team)));
    setChosenSlots(chosen);
    bump(t.map((_, s2) => s2));
  };

  const copyTeams = () => {
    const lines = [`${game.label}, ${cup.name}`, ...teams.slice(0, players).map((t, i) => {
      const chosen = new Set(pickThree ? picks[i] ?? [] : []);
      return `${seatName(i)}: ${t.map((r, j) => (chosen.has(j) ? `${r.name} (pick)` : r.name)).join(", ")}`;
    })];
    navigator.clipboard.writeText(lines.join("\n")).then(() => { toast.success("Teams copied"); track(EVENTS.resultCopied, { tool: "pokemon-stadium" }); }, () => toast.error("Couldn't copy the teams"));
  };

  // Saving + loading (?config=)
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("config");
    if (!id || !user) return;
    void createClient().from("saved_configs").select("id, config_name, config_data").eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        const cfg = data?.config_data as StadiumSetupConfig | undefined;
        if (!data || cfg?.type !== "stadium-setup") return;
        const g = stadiumGame(cfg.gameSlug);
        const c = stadiumCup(g, cfg.cup);
        setGameSlug(g.slug); setCupId(c.id); setRound2(!!cfg.round2);
        setSaveName(data.config_name); setLoadedId(data.id);
        setPlayers(Math.max(1, Math.min(MAX_PLAYERS, cfg.players.length)));
        setNames(Array.from({ length: MAX_PLAYERS }, (_, i) => { const v = cfg.players[i]?.name ?? ""; return /^Player \d+$/.test(v) ? "" : v; }));
        const byName = new Map(c.rentals.map((r) => [r.name, r]));
        setTeams(cfg.players.map((p) => p.team.map((n) => byName.get(n)).filter((r): r is Rental => !!r)));
        setPicks(cfg.players.map((p) => p.pick ?? []));
        if (cfg.players.some((p) => p.pick?.length)) setPickThree(true);
        trackEvent("Config Loaded", { configId: id });
      });
  }, [searchParams, user, trackEvent]);

  const save = async () => {
    if (!user) { window.location.assign(`/signup?redirect=${encodeURIComponent(`/randomizers/${SLUG}`)}`); return; }
    if (!saveName.trim()) return;
    const cfg: StadiumSetupConfig = {
      type: "stadium-setup", gameSlug: game.slug, cup: cup.id, round2,
      players: Array.from({ length: players }, (_, i) => ({ name: seatName(i), team: (teams[i] ?? []).map((r) => r.name), pick: pickThree ? picks[i] ?? [] : [] })),
    };
    // A loaded setup is overwritten (the button says "Update"); otherwise it's a new one.
    const res = loadedId
      ? await updateConfig(user.id, loadedId, saveName.trim(), cfg)
      : await saveConfig(user.id, SLUG, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success(loadedId ? "Teams updated" : "Teams saved"); setSaveOpen(false);
  };

  return (
    <div className="stadium-randomizer">
      <div className="randomizer-controls">
        <span className="party-muted">{game.label} · {cup.name} · {pool.length} rentals</span>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
          <Button variant="secondary" size="small" iconBefore={IconCopy} disabled={!teams.length} onClick={copyTeams}>Copy teams</Button>
          <Button variant="secondary" size="small" onClick={() => (user ? setSaveOpen(true) : void save())} iconBefore={IconDeviceFloppy}>
            {saveName && loadedId ? `Update: ${saveName}` : "Save teams"}
          </Button>
        </div>
      </div>

      <section>
        <div className="kart-intro">
          <div className="kart-intro__content">
            <h2>A rental team for everyone.</h2>
            <p>Each player gets 6 different rentals for the cup. {cup.rule}.</p>
            <AiSetupBar game="pokemon-stadium" placeholder="Two of us, Prime Cup, give me a rain team" onApply={applySetup} />
            <div className="kart-intro__actions">
              <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={addPlayer}>Add Player</Button>
              <Button variant="primary" onClick={roll}>{teams.length ? "Randomize again" : "Randomize Teams"}</Button>
              <span className="kart-intro__switch">
                <Switch label="Rolling animation" checked={animate} onChange={(e) => setAnimate(e.target.checked)} />
              </span>
            </div>
          </div>
          <div className="randomizer-setup">
            <Select floatingLabel="Cup" value={`${game.slug}|${cup.id}`}
              onChange={(v) => { const [g, c] = String(v).split("|"); if (g !== game.slug) switchGame(g); switchCup(c); }}
              groups={STADIUM_GAMES.map((g) => ({ label: g.label, options: g.cups.map((c) => ({ value: `${g.slug}|${c.id}`, label: c.name })) }))} />
            <RandomizerOptions summary={[noRepeat && "No repeats across players", pickThree && "Pick my 3 too", round2 && cupHasRound2(cup) && "Round 2 rentals"].filter((x): x is string => !!x)}>
              <FilterGroup label="Rules" activeValues={[noRepeat ? "norepeat" : "", pickThree ? "pick" : "", round2 ? "round2" : ""].filter(Boolean)}
                onToggle={(v) => { if (v === "norepeat") setNoRepeat((x) => !x); if (v === "pick") setPickThree((x) => !x); if (v === "round2") setRound2((x) => !x); }}
                options={[
                  { value: "norepeat", label: "No repeats across players" },
                  { value: "pick", label: "Pick my 3 too" },
                  ...(cupHasRound2(cup) ? [{ value: "round2", label: "Round 2 rentals" }] : []),
                ]} />
              <p className="party-muted">Bring all 6 to the battle, then pick 3. &quot;Pick my 3 too&quot; makes that choice for you.</p>
              {cupHasRound2(cup) && <p className="party-muted">Round 2 rentals ({cup.rentals.filter((r) => r.round2).map((r) => r.name).join(", ")}) only unlock after you clear Round 1 of this cup.</p>}
            </RandomizerOptions>
          </div>
        </div>

        <div className="stadium-teams">
          {Array.from({ length: players }, (_, i) => {
            const team = teams[i] ?? [];
            const chosen = new Set(pickThree ? picks[i] ?? [] : []);
            return (
              <div key={i} className="player-card stadium-team">
                <div className="player-card__header">
                  <div className="player-card__name">
                    <Input type="text" floatingLabel={`Player ${i + 1} name`} placeholder="Type a name" value={names[i] ?? ""} maxLength={24} onChange={(e) => setNames((n) => n.map((x, j) => (j === i ? e.target.value : x)))} />
                  </div>
                  <CardActions
                    refreshLabel={`New team for ${seatLabel(names, i)}`} onRefresh={() => rerollSeat(i)}
                    removeLabel={`Remove ${seatLabel(names, i)}`} onRemove={players > 1 ? () => removePlayer(i) : undefined} />
                </div>
                {team.length ? (
                  <div className="stadium-team__cards">
                    {team.map((r, j) => (
                      <PokemonCard key={chosenSlots[i]?.[j] ? `kept-${j}-${r.dex}` : `${j}-${r.dex}-${rolls[i] ?? 0}`} dex={r.dex} name={r.name} types={r.types} level={r.level} art={art[r.dex]}
                        picked={chosen.has(j)} chosen={!!chosenSlots[i]?.[j]} onDetails={() => { setDetails({ seat: i, index: j }); track(EVENTS.pokemonDetailsOpened, { game: "stadium" }); }}
                        reel={animate && !chosenSlots[i]?.[j] && rolls[i] ? pool : undefined} />
                    ))}
                  </div>
                ) : (
                  <ul className="stadium-team__cards stadium-team__cards--empty" aria-label="Not rolled yet">
                    {Array.from({ length: 6 }, (_, j) => (
                      <li key={j} className="pokeball-slot"><span className="pokeball-slot__tile"><PokeBall className="pokeball-slot__ball" /></span><span className="pokeball-slot__name">???</span></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        {Object.keys(art).length ? <TcgAttribution className="type-card-disclaimer" /> : <PokemonDisclaimer />}
      </section>

      <PokemonDetails pokemon={open ? { ...open, art: art[open.dex] } : null} onClose={() => setDetails(null)} nameOf={speciesName}>
        {details && open && (
          <section className="poke-details__section" aria-label="Choose this slot">
            <h3 className="poke-details__h">Want a different Pokémon here?</h3>
            <LabeledCombobox label="Choose a rental" placeholder="Search this cup's rentals" value={rentalLabel(open)}
              onChange={(v) => { chooseSlot(details.seat, details.index, v); }}
              options={pool.filter((x) => x.dex === open.dex || !teams[details.seat]?.some((t) => t.dex === x.dex)).map((x) => ({ value: rentalLabel(x), label: rentalLabel(x) }))} />
            <p className="party-muted">{chosenSlots[details.seat]?.[details.index] ? "This slot is yours: it stays when the team re-rolls." : "Pick one and it stays put when the team re-rolls."}</p>
            {chosenSlots[details.seat]?.[details.index] && (
              <Button variant="ghost" size="small" onClick={() => chooseSlot(details.seat, details.index, null)}>Let the randomizer pick this slot</Button>
            )}
          </section>
        )}
      </PokemonDetails>

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update teams" : "Save these teams"} size="small"
        primaryAction={{ label: loadedId ? "Update teams" : "Save teams", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name these teams" placeholder="Poké Cup night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
