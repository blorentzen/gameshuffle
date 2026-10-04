"use client";

/**
 * Pokémon Stadium 1 & 2 rental team randomizer: pick a game and cup, and every
 * player (1 to 4) gets a team of 6 different rentals, no repeats across players
 * by default, with an optional randomized pick of 3. Cards show each rental's
 * level and moves so players can find it in the game's rental menu. Only rolls;
 * the rest lives in game nights. Type cards only, no art (see TypeCard).
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Input, Modal, Select } from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy } from "@tabler/icons-react";
import { createClient } from "@/lib/supabase/client";
import type { StadiumSetupConfig } from "@/data/config-types";
import { FilterGroup } from "@/components/randomizer/FilterGroup";
import { PokemonDisclaimer, TypeCard } from "@/components/pokemon/TypeCard";
import { RandomizerOptions } from "@/components/randomizer/RandomizerOptions";
import { CoinFace } from "@/components/companion/CoinFace";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import { saveConfig } from "@/lib/configs";
import {
  MAX_PLAYERS, STADIUM_GAMES, cupHasRound2, rentalPool, rerollTeam, rollTeams, stadiumCup, stadiumGame, suggestPick, type Rental,
} from "@/lib/pokemon/stadium";

const SLUG = "pokemon-stadium";

export function StadiumRandomizer() {
  const { user } = useAuth();
  const toast = useToast();
  const { trackEvent } = useAnalytics();

  const [gameSlug, setGameSlug] = useState(STADIUM_GAMES[0].slug);
  const game = stadiumGame(gameSlug);
  const [cupId, setCupId] = useState("poke");
  const cup = stadiumCup(game, cupId);
  const [players, setPlayers] = useState(2);
  const [names, setNames] = useState<string[]>(Array(MAX_PLAYERS).fill(""));
  const seatName = useCallback((i: number) => names[i]?.trim() || `Player ${i + 1}`, [names]);
  const [noRepeat, setNoRepeat] = useState(true);
  const [pickThree, setPickThree] = useState(false);
  const [round2, setRound2] = useState(false);
  const [teams, setTeams] = useState<Rental[][]>([]);
  const [picks, setPicks] = useState<number[][]>([]);
  const pool = rentalPool(cup, round2);

  const switchGame = (slug: string) => {
    const g = stadiumGame(slug);
    setGameSlug(slug);
    if (!g.cups.some((c) => c.id === cupId)) setCupId(g.cups.find((c) => c.id === "poke")?.id ?? g.cups[0].id);
    setTeams([]); setPicks([]);
  };
  const switchCup = (id: string) => { setCupId(id); setTeams([]); setPicks([]); };

  const roll = () => {
    const t = rollTeams(cup, { players, noRepeat, round2 });
    setTeams(t);
    setPicks(t.map((team) => suggestPick(team)));
    trackEvent("Stadium Teams Rolled", { game: game.slug, cup: cup.id, players: String(players) });
  };
  const rerollSeat = (seat: number) => {
    if (!teams.length) { roll(); return; }
    const team = rerollTeam(cup, teams, seat, { noRepeat, round2 });
    setTeams((cur) => cur.map((t, i) => (i === seat ? team : t)));
    setPicks((cur) => cur.map((p, i) => (i === seat ? suggestPick(team) : p)));
  };
  const addPlayer = () => setPlayers((n) => Math.min(MAX_PLAYERS, n + 1));
  const removePlayer = (seat: number) => {
    setPlayers((n) => Math.max(1, n - 1));
    setNames((n) => [...n.filter((_, j) => j !== seat), ""]);
    setTeams((cur) => cur.filter((_, j) => j !== seat));
    setPicks((cur) => cur.filter((_, j) => j !== seat));
  };

  const copyTeams = () => {
    const lines = [`${game.label}, ${cup.name}`, ...teams.slice(0, players).map((t, i) => {
      const chosen = new Set(pickThree ? picks[i] ?? [] : []);
      return `${seatName(i)}: ${t.map((r, j) => (chosen.has(j) ? `${r.name} (pick)` : r.name)).join(", ")}`;
    })];
    navigator.clipboard.writeText(lines.join("\n")).then(() => toast.success("Teams copied"), () => toast.error("Couldn't copy the teams"));
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
    const res = await saveConfig(user.id, SLUG, saveName.trim(), cfg);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Teams saved"); setSaveOpen(false);
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
            <div className="kart-intro__actions">
              <Button variant="primary" disabled={players >= MAX_PLAYERS} onClick={addPlayer}>Add Player</Button>
              <Button variant="primary" onClick={roll}>{teams.length ? "Randomize again" : "Randomize Teams"}</Button>
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
                  <div className="player-card__actions">
                    <Button variant="primary" size="small" onClick={() => rerollSeat(i)}>Refresh Team</Button>
                    {players > 1 && <Button variant="danger" size="small" onClick={() => removePlayer(i)}>Remove Player</Button>}
                  </div>
                </div>
                {team.length ? (
                  <div className="stadium-team__cards">
                    {team.map((r, j) => <TypeCard key={`${r.dex}-${r.name}`} dex={r.dex} name={r.name} types={r.types} level={r.level} moves={r.moves} picked={chosen.has(j)} />)}
                  </div>
                ) : (
                  <ul className="stadium-team__cards stadium-team__cards--empty" aria-label="Not rolled yet">
                    {Array.from({ length: 6 }, (_, j) => (
                      <li key={j} className="pokeball-slot"><span className="pokeball-slot__tile"><span className="pokeball-slot__ball"><CoinFace side="a" /></span></span><span className="pokeball-slot__name">???</span></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <PokemonDisclaimer />
      </section>

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title={loadedId ? "Update teams" : "Save these teams"} size="small"
        primaryAction={{ label: loadedId ? "Update teams" : "Save teams", onClick: save }} secondaryAction={{ label: "Cancel", onClick: () => setSaveOpen(false) }}>
        <Input floatingLabel="Name these teams" placeholder="Poké Cup night" value={saveName} maxLength={60} onChange={(e) => setSaveName(e.target.value)} />
      </Modal>
    </div>
  );
}
