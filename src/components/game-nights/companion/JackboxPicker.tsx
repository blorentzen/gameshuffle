"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, Chip, Select, Switch } from "@empac/cascadeds";
import { useLocalState } from "@/lib/game-nights/companion/useLocalState";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { JACKBOX_GAMES, JACKBOX_PACKS, type JackboxGame } from "@/data/jackbox";

/**
 * Jackbox picker: roll a game from the packs you own, filtered for tonight's
 * player count. "Roll 3 and vote" draws three finalists: the room votes on one
 * device, or a streamer puts them to a chat poll (GS Pro, the polls engine).
 * Owned packs and filters are saved on the device.
 */

const PLAYER_OPTIONS = [{ value: "any", label: "Any number" }, ...Array.from({ length: 15 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i ? "players" : "player"}` }))];

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function GameCard({ g, owned, votes, onVote }: { g: JackboxGame; owned: string[]; votes?: number; onVote?: () => void }) {
  // Name the pack they own it in, when it's in more than one.
  const pack = g.packs.find((p) => owned.includes(p)) ?? g.packs[0];
  return (
    <div className="jbx-card">
      <span className="jbx-card__pack">{pack}</span>
      <strong className="jbx-card__name">{g.name}</strong>
      <span className="jbx-card__meta">
        <Badge variant="default" size="small">{g.minPlayers === g.maxPlayers ? `${g.minPlayers} players` : `${g.minPlayers} to ${g.maxPlayers} players`}</Badge>
        {g.types.map((t) => <Badge key={t} variant="info" size="small">{t}</Badge>)}
        {g.audience && <Badge variant="default" size="small">Audience can join</Badge>}
        {g.kids === "filter" && <Badge variant="success" size="small">Family filter</Badge>}
        {g.kids === "clean" && <Badge variant="success" size="small">Clean by design</Badge>}
        {g.adultsOnly && <Badge variant="warning" size="small">18+</Badge>}
      </span>
      <span className="jbx-card__desc">{g.description}</span>
      {onVote && (
        <span className="party-row">
          <Button variant="secondary" size="small" onClick={onVote}>Vote</Button>
          <span className="party-muted">{votes ?? 0} {votes === 1 ? "vote" : "votes"}</span>
        </span>
      )}
    </div>
  );
}

export function JackboxPicker() {
  const { user } = useAuth();
  const toast = useToast();
  const [owned, setOwned] = useLocalState<string[]>("gs-jackbox-packs", []);
  const [players, setPlayers] = useLocalState<string>("gs-jackbox-players", "any");
  const [family, setFamily] = useLocalState<boolean>("gs-jackbox-family", false);
  const [picked, setPicked] = useState<JackboxGame | null>(null);
  const [rolling, setRolling] = useState(false);
  const [finalists, setFinalists] = useState<{ games: JackboxGame[]; votes: number[] } | null>(null);
  const [polling, setPolling] = useState(false);
  const timer = useRef<number | null>(null);

  const pool = useMemo(() => {
    const n = players === "any" ? null : Number(players);
    return JACKBOX_GAMES.filter((g) =>
      (owned.length === 0 || g.packs.some((p) => owned.includes(p))) &&
      (n === null || (n >= g.minPlayers && n <= g.maxPlayers)) &&
      // Kids: a family filter setting, or clean by design (Jackbox's own chart).
      (!family || (g.kids !== "no" && !g.adultsOnly)) &&
      // The adults-only pack only comes up if you've ticked it.
      (!g.adultsOnly || g.packs.some((p) => owned.includes(p))));
  }, [owned, players, family]);

  const togglePack = (p: string) => setOwned((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const roll = () => {
    if (!pool.length || rolling) return;
    setFinalists(null);
    setRolling(true);
    let ticks = 0;
    const spin = () => {
      setPicked(pool[Math.floor(Math.random() * pool.length)]);
      ticks += 1;
      if (ticks < 12) timer.current = window.setTimeout(spin, 60 + ticks * 12);
      else setRolling(false);
    };
    spin();
  };

  const rollThree = () => {
    if (pool.length < 2) return;
    setPicked(null);
    const games = shuffle(pool).slice(0, 3);
    setFinalists({ games, votes: games.map(() => 0) });
  };

  const vote = (i: number) => setFinalists((f) => (f ? { ...f, votes: f.votes.map((v, j) => (j === i ? v + 1 : v)) } : f));
  const leader = finalists && Math.max(...finalists.votes) > 0
    ? finalists.games.filter((_, i) => finalists.votes[i] === Math.max(...finalists.votes))
    : [];

  const toChat = async () => {
    if (!finalists) return;
    setPolling(true);
    const res = await fetch("/api/polls", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: "Which Jackbox game next?", options: finalists.games.map((g) => g.name), open: true }),
    });
    const d = await res.json().catch(() => null);
    setPolling(false);
    if (d?.ok) toast.success("Poll opened in your chat");
    else toast.error(d?.error === "pro_required" ? "Chat polls are a GS Pro feature." : d?.error === "no_community" ? "Connect Twitch first to poll your chat." : "Couldn't open the poll.");
  };

  return (
    <div className="account-card">
      <p className="bgn-tools__hint">Which packs do you own? Leave them all off to pick from every pack except the 18+ one.</p>
      <div className="bgn-tools__roster" role="group" aria-label="Packs you own">
        {JACKBOX_PACKS.map((p) => (
          <Chip key={p.name} clickable selected={owned.includes(p.name)} variant={owned.includes(p.name) ? "primary" : "default"}
            label={p.adultsOnly ? `${p.name} (18+)` : p.name} onClick={() => togglePack(p.name)} aria-label={p.note ? `${p.name}: ${p.note}` : undefined} />
        ))}
      </div>

      <div className="jbx-filters">
        <Select floatingLabel="Players tonight" value={players} onChange={(v) => setPlayers(String(v))} options={PLAYER_OPTIONS} />
        <Switch checked={family} onChange={(e) => setFamily(e.target.checked)} label="Kid-friendly only (a family filter, or clean by design)" />
      </div>
      <p className="bgn-tools__hint">{pool.length} {pool.length === 1 ? "game fits" : "games fit"}.</p>

      <div className="bgn-picker__stage">
        {picked && !finalists && (
          <div className={rolling ? "bgn-picker__result--rolling" : undefined}><GameCard g={picked} owned={owned} /></div>
        )}
        {!picked && !finalists && <div className="bgn-picker__result">Ready when you are</div>}
        <span className="party-row">
          <Button variant="primary" size="large" onClick={roll} disabled={rolling || pool.length === 0}>
            {rolling ? "Picking…" : picked ? "Pick again" : "Pick a game"}
          </Button>
          <Button variant="secondary" size="large" onClick={rollThree} disabled={rolling || pool.length < 2}>Roll 3 and vote</Button>
        </span>
      </div>

      {finalists && (
        <div className="jbx-vote">
          <p className="bgn-tools__hint">Pass the phone and tap to vote, or put it to your chat.</p>
          <div className="jbx-vote__grid">
            {finalists.games.map((g, i) => <GameCard key={g.name} g={g} owned={owned} votes={finalists.votes[i]} onVote={() => vote(i)} />)}
          </div>
          {leader.length === 1 && <p className="oddone__verdict">Tonight: <strong>{leader[0].name}</strong></p>}
          {leader.length > 1 && <p className="party-muted">Tied between {leader.map((g) => g.name).join(" and ")}. One more vote settles it.</p>}
          {user ? (
            <Button variant="ghost" size="small" onClick={() => void toChat()} disabled={polling}>Put it to my chat (GS Pro poll)</Button>
          ) : (
            <p className="bgn-picker__upsell">Streaming? <Link href="/gs-pro?from=jackbox">GS Pro</Link> sends these three to a poll your chat votes on.</p>
          )}
        </div>
      )}
    </div>
  );
}
