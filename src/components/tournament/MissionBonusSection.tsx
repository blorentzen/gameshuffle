"use client";

import { useMemo, useState } from "react";
import { Alert, Badge, Button, Input, Select } from "@empac/cascadeds";
import { IconTarget, IconX } from "@tabler/icons-react";
import type { PartyCard } from "@/data/party/cards";
import { bonusTotals, newBonusId, type MissionBonus } from "@/lib/party/tournament";
import { IconAction } from "@/components/actions/IconAction";

/**
 * Mission bonus points for a tournament (settings.missionBonus): the organizer
 * awards points for missions finished during play. Shared by every game with
 * a card deck (Mario Party, Smash); Points standings add them automatically.
 */

interface Participant { id: string; display_name: string; status?: string }

export function MissionBonusSection({
  missions, lookup, settings, participants, round, onSettings, readOnly = false,
}: {
  missions: PartyCard[];
  lookup: (id: string) => PartyCard | undefined;
  settings: Record<string, unknown> | null | undefined;
  participants: Participant[];
  /** The round in progress, recorded with each award. */
  round: number | null;
  onSettings?: (patch: Record<string, unknown>) => Promise<void> | void;
  readOnly?: boolean;
}) {
  const bonuses = useMemo(() => ((settings?.missionBonus as MissionBonus[] | undefined) ?? []), [settings]);
  const [who, setWho] = useState("");
  const [mission, setMission] = useState("");
  const [note, setNote] = useState("");
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.display_name ?? "Player";
  const totals = bonusTotals(bonuses);
  const active = participants.filter((p) => p.status !== "dropped");

  const save = async (patch: Record<string, unknown>) => {
    if (!onSettings) return;
    setBusy(true); setErr(null);
    try { await onSettings({ ...(settings ?? {}), ...patch }); } finally { setBusy(false); }
  };
  const award = async () => {
    if (!who) { setErr("Pick who finished the mission."); return; }
    const card = mission && mission !== "other" ? lookup(mission) : null;
    if (!card && !note.trim()) { setErr("Pick a mission or describe it."); return; }
    const b: MissionBonus = {
      id: newBonusId(), participantId: who, cardId: card?.id ?? null, note: card ? card.title : note.trim().slice(0, 80),
      points: Math.max(1, Math.min(3, Number(points))), round, at: new Date().toISOString(),
    };
    await save({ missionBonus: [...bonuses, b] });
    setMission(""); setNote("");
  };

  return (
    <>
      <h3 className="party-h3"><IconTarget size={16} stroke={1.9} aria-hidden /> Mission bonus points</h3>
      {!readOnly && (
        <div className="party-row">
          <Select floatingLabel="Player" placeholder="Who finished it?" value={who} onChange={(v) => setWho(String(v))} options={active.map((p) => ({ value: p.id, label: p.display_name }))} />
          <Select floatingLabel="Mission" placeholder="Which mission?" value={mission} onChange={(v) => {
            const id = String(v); setMission(id);
            const c = lookup(id); if (c?.worth) setPoints(String(c.worth));
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
                {!readOnly && <IconAction label={`Remove ${nameOf(b.participantId)}’s bonus`} icon={IconX} onClick={() => save({ missionBonus: bonuses.filter((x) => x.id !== b.id) })} disabled={busy} />}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="party-muted">No mission points yet.</p>}
      {Object.keys(totals).length > 0 && (
        <p className="party-tally"><strong>Mission totals:</strong> {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${nameOf(id)} ${n}`).join(" · ")}</p>
      )}
      {err && <Alert variant="warning">{err}</Alert>}
    </>
  );
}
