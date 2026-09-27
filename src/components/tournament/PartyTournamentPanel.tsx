"use client";

import { useMemo, useState } from "react";
import { Accordion, Alert, Badge, Button, Input, Select, Switch } from "@empac/cascadeds";
import { IconDice5, IconTarget } from "@tabler/icons-react";
import { partyGame } from "@/data/party";
import { cardById, cardsFor, cardText } from "@/data/party/cards";
import { bonusTotals, newBonusId, rollPartyRound, type MissionBonus, type PartyRound } from "@/lib/party/tournament";

/**
 * Mario Party layer for a tournament on the standard formats. Organizers roll
 * each round's shared setup (every table plays it) and award mission bonus
 * points; the public page shows the same panel read-only.
 */

interface Participant { id: string; display_name: string; status?: string }

export function PartyTournamentPanel({
  gameSlug, settings, participants, onSettings, readOnly = false,
}: {
  gameSlug: string;
  settings: Record<string, unknown> | null | undefined;
  participants: Participant[];
  onSettings?: (patch: Record<string, unknown>) => Promise<void> | void;
  readOnly?: boolean;
}) {
  const game = partyGame(gameSlug);
  const rounds = useMemo(() => ((settings?.partyRounds as PartyRound[] | undefined) ?? []), [settings]);
  const bonuses = useMemo(() => ((settings?.missionBonus as MissionBonus[] | undefined) ?? []), [settings]);
  const [maxTurns, setMaxTurns] = useState("12");
  const [ruleset, setRuleset] = useState("any");
  const [withCards, setWithCards] = useState(false);
  const [who, setWho] = useState("");
  const [mission, setMission] = useState("");
  const [note, setNote] = useState("");
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!game) return null;
  const seat = (i: number) => `Seat ${i + 1}`;
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.display_name ?? "Player";
  const missions = cardsFor(game.slug, null, "mission");
  const totals = bonusTotals(bonuses);
  const active = participants.filter((p) => p.status !== "dropped");

  const save = async (patch: Record<string, unknown>) => {
    if (!onSettings) return;
    setBusy(true); setErr(null);
    try { await onSettings({ ...(settings ?? {}), ...patch }); } finally { setBusy(false); }
  };
  const roll = async () => {
    const next = rollPartyRound(game.slug, rounds, { maxTurns: Number(maxTurns), cards: withCards, rulesetIds: ruleset === "any" ? [] : [ruleset] });
    if (!next) { setErr("No ruleset fits that turn limit. Allow more turns."); return; }
    await save({ partyRounds: [...rounds, next] });
  };
  const award = async () => {
    if (!who) { setErr("Pick who finished the mission."); return; }
    const card = mission && mission !== "other" ? cardById(mission) : null;
    if (!card && !note.trim()) { setErr("Pick a mission or describe it."); return; }
    const b: MissionBonus = {
      id: newBonusId(), participantId: who, cardId: card?.id ?? null, note: card ? card.title : note.trim().slice(0, 80),
      points: Math.max(1, Math.min(3, Number(points))), round: rounds.length || null, at: new Date().toISOString(),
    };
    await save({ missionBonus: [...bonuses, b] });
    setMission(""); setNote("");
  };

  const latest = rounds[rounds.length - 1];
  const describeRound = (r: PartyRound) => {
    const board = game.boards.find((b) => b.id === r.setup.boardId);
    const rs = game.rulesets.find((x) => x.id === r.setup.rulesetId);
    const bonus = game.bonusModes.find((m) => m.id === r.setup.bonusModeId);
    return { board: board?.name ?? r.setup.boardId, rules: `${rs?.label ?? r.setup.rulesetId}, ${r.setup.turns} turns`, bonus: bonus?.label ?? "" };
  };

  return (
    <div className="comp-card party-tourney" style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "var(--font-size-18)" }}><IconDice5 size={18} stroke={1.9} aria-hidden /> {game.shortLabel} rounds</h2>
      <p className="party-muted">Every table plays the same roll each round, so the luck is shared. Scoring is 10, 6, 3 and 1 per table, plus mission bonus points.</p>

      {latest ? (
        <div className="party-tourney__round">
          <span className="party-options__label">Round {latest.round}</span>
          <strong className="party-tourney__board">{describeRound(latest).board}</strong>
          <span className="party-muted">{describeRound(latest).rules} · {describeRound(latest).bonus}</span>
          {latest.cards.length > 0 && (
            <ul className="party-list">
              {latest.cards.map((c) => {
                const card = cardById(c.cardId);
                return card ? <li key={c.seatPos}><strong>{seat(c.seatPos)}, {card.effect === "help" ? "help" : "crutch"}:</strong> {cardText(card, { id: c.cardId, seat: c.seatPos, rival: c.rival, n: c.n }, seat)}</li> : null;
              })}
            </ul>
          )}
        </div>
      ) : <p className="party-muted">{readOnly ? "The organizer hasn't rolled a round yet." : "No rounds rolled yet."}</p>}

      {!readOnly && (
        <>
          <div className="party-row">
            <Select floatingLabel="Longest game" value={maxTurns} onChange={(v) => setMaxTurns(String(v))} options={["10", "12", "15", "20"].map((t) => ({ value: t, label: `${t} turns` }))} />
            <Select floatingLabel="Rules" value={ruleset} onChange={(v) => setRuleset(String(v))}
              options={[{ value: "any", label: "Any that fit" }, ...game.rulesets.filter((r) => !r.edition).map((r) => ({ value: r.id, label: `${r.label} only` }))]} />
            <Switch label="Same Chance card for each seat" checked={withCards} onChange={(e) => setWithCards(e.target.checked)} />
          </div>
          <div className="party-row">
            <Button variant="primary" iconBefore={IconDice5} onClick={roll} disabled={busy}>Roll round {rounds.length + 1}</Button>
            {rounds.length > 0 && <Button variant="ghost" onClick={() => save({ partyRounds: rounds.slice(0, -1) })} disabled={busy}>Undo last roll</Button>}
          </div>
        </>
      )}

      {rounds.length > 1 && (
        <Accordion variant="flush" items={[{
          id: "earlier",
          title: "Earlier rounds",
          content: (
            <ul className="party-list">
              {rounds.slice(0, -1).reverse().map((r) => { const d = describeRound(r); return <li key={r.round}><strong>Round {r.round}:</strong> {d.board}, {d.rules}</li>; })}
            </ul>
          ),
        }]} />
      )}

      <h3 className="party-h3"><IconTarget size={16} stroke={1.9} aria-hidden /> Mission bonus points</h3>
      {!readOnly && (
        <div className="party-row">
          <Select floatingLabel="Player" placeholder="Who finished it?" value={who} onChange={(v) => setWho(String(v))} options={active.map((p) => ({ value: p.id, label: p.display_name }))} />
          <Select floatingLabel="Mission" placeholder="Which mission?" value={mission} onChange={(v) => {
            const id = String(v); setMission(id);
            const c = cardById(id); if (c?.worth) setPoints(String(c.worth));
          }} options={[...missions.map((m) => ({ value: m.id, label: `${m.title} (${m.worth} pt${m.worth === 1 ? "" : "s"})` })), { value: "other", label: "Something else" }]} />
          {mission === "other" && <Input floatingLabel="What they did" value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />}
          <Select floatingLabel="Points" value={points} onChange={(v) => setPoints(String(v))} options={["1", "2", "3"].map((n) => ({ value: n, label: `${n} point${n === "1" ? "" : "s"}` }))} />
          <Button variant="secondary" onClick={award} disabled={busy}>Award</Button>
        </div>
      )}
      {bonuses.length ? (
        <ul className="party-tourney__bonus">
          {[...bonuses].reverse().map((b) => (
            <li key={b.id}>
              <span><strong>{nameOf(b.participantId)}</strong> · {b.note}{b.round ? <span className="party-muted"> · round {b.round}</span> : null}</span>
              <span className="party-row">
                <Badge variant="info" size="small">+{b.points}</Badge>
                {!readOnly && <Button variant="ghost" size="small" onClick={() => save({ missionBonus: bonuses.filter((x) => x.id !== b.id) })} disabled={busy}>Remove</Button>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="party-muted">No mission points yet.</p>}
      {Object.keys(totals).length > 0 && (
        <p className="party-tally"><strong>Mission totals:</strong> {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nameOf(id)} ${n}`).join(" · ")}</p>
      )}
      {err && <Alert variant="warning">{err}</Alert>}
    </div>
  );
}
