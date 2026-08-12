"use client";

/**
 * Shared Heat → Mains + championship view components — used by the DB-free
 * sandbox, the real tournament manage/public pages, and championship season
 * pages. All operate on driver ids and a `nameOf` resolver, so the same UI
 * drives ephemeral demos and persisted tournaments alike.
 *
 * `HeatMainsView` renders the series-grouped heats + the A/B/… consi ladder.
 * Pass `onReportHeat`/`onReportMain` (organizer / run mode) to enable tap-to-place
 * entry + edit (arrows + DQ); omit them for a read-only view.
 */

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { heatMainsStage, nextMainTier, type HeatMains, type HRace } from "@/lib/tournaments/heatMains";
import type { DriverPoints, SeasonRow } from "@/lib/tournaments/championship";

export function HeatMainsView({ hm, nameOf, onReportHeat, onReportMain }: {
  hm: HeatMains;
  nameOf: (id: string | null) => string;
  onReportHeat?: (heatId: string, order: string[], dq: string[]) => void;
  onReportMain?: (tier: number, order: string[], dq: string[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const tile: React.CSSProperties = { background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", border: "1px solid var(--border-default)", borderRadius: "0.5rem", overflow: "hidden" };
  const editable = !!onReportHeat; // handlers present ⇒ Run stage (Results passes none)
  const stage = heatMainsStage(hm);
  const upTier = nextMainTier(hm);

  const chip = (label: string) => (
    <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--bg-primary, var(--primary-500))", background: "color-mix(in srgb, var(--primary-500) 16%, var(--surface-default))", padding: "var(--spacing-2) var(--spacing-6)", borderRadius: 999, whiteSpace: "nowrap" }}>{label}</span>
  );

  const report = (race: HRace, order: string[], dq: string[]) => {
    if (race.kind === "heat") onReportHeat?.(race.id, order, dq);
    else onReportMain?.(race.tier ?? 0, order, dq);
    setEditingId(null);
  };

  // transferTag: what a top finisher of this race earns; champ: A-Main podium.
  const Race = ({ race, isUp, transferTo, champ }: { race: HRace; isUp: boolean; transferTo?: string; champ?: boolean }) => {
    const run = !!race.results;
    const list = race.results ?? race.drivers;
    const entering = editable && !run && isUp;
    const isEditing = editable && run && editingId === race.id;
    const header = (
      <div style={{ padding: "var(--spacing-6) var(--spacing-10)", fontWeight: 700, fontSize: "var(--font-size-14)", borderBottom: "1px solid var(--border-default)", background: "var(--surface-default)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--spacing-8)" }}>
        <span>{race.label} <span style={{ fontWeight: 500, color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>· {race.raceCount} races</span></span>
        {entering && <span style={{ fontSize: "var(--font-size-12)", fontWeight: 600, color: "var(--bg-primary, var(--primary-500))" }}>Tap to place</span>}
        {run && editable && !isEditing && <button type="button" onClick={() => setEditingId(race.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--bg-primary, var(--primary-500))", fontWeight: 700, fontSize: "var(--font-size-12)" }}>Edit</button>}
      </div>
    );

    if (entering) return <div style={tile}>{header}<TapEntry drivers={race.drivers} nameOf={nameOf} onConfirm={(o) => report(race, o, [])} /></div>;
    if (isEditing) return <div style={tile}>{header}<EditEntry race={race} nameOf={nameOf} onSave={(o, dq) => report(race, o, dq)} onCancel={() => setEditingId(null)} /></div>;

    return (
      <div style={{ ...tile, opacity: !run && !isUp ? 0.7 : 1 }}>
        {header}
        <div>
          {list.map((id, i) => {
            const isDq = run && race.dq.includes(id);
            const movesUp = run && !isDq && transferTo != null && i < hm.transfer && (race.kind === "heat" ? i === 0 : true);
            const isChamp = champ && run && i === 0 && !isDq;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-6) var(--spacing-10)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
                <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{run ? (isDq ? "-" : i + 1) : "·"}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)", textDecoration: isDq ? "line-through" : "none", color: isDq ? "var(--text-tertiary)" : "var(--text-primary)" }}>{isChamp ? "🏆 " : ""}{nameOf(id)}{isDq ? " · DQ" : ""}</span>
                {movesUp && chip(`→ ${transferTo}`)}
                {race.kind === "heat" && run && !isDq && i === 0 && chip("heat win")}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const seriesGroups = Array.from({ length: hm.series }, (_, s) => hm.heats.filter((h) => h.series === s));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      {/* Heats, grouped by series */}
      <div>
        <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "var(--spacing-8)" }}>
          Heats: {hm.heatCount} per series{(() => { const s = seriesGroups[0]?.map((h) => h.drivers.length) ?? []; const lo = Math.min(...s), hi = Math.max(...s); return s.length ? `, ${lo === hi ? lo : `${lo}-${hi}`} racers each` : ""; })()}; {hm.series > 1 ? `each driver races ${hm.series} heats. ` : ""}win any heat to lock the A Main
        </div>
        {seriesGroups.map((group, s) => (
          <div key={s} style={{ marginBottom: s < hm.series - 1 ? "var(--spacing-14)" : 0 }}>
            {hm.series > 1 && <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "var(--spacing-6)" }}>Series {s + 1}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--spacing-12)" }}>
              {group.map((h) => <Race key={h.id} race={h} isUp={stage === "heats"} transferTo="A Main" />)}
            </div>
          </div>
        ))}
      </div>

      {/* Mains — A (the feature) first, then the consi ladder below */}
      {hm.mains.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--font-size-12)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: "var(--spacing-8)" }}>
            Mains: seats {hm.mainSeedSize} each; top {hm.transfer} of every main transfer up
          </div>
          <div style={{ display: "grid", gridTemplateColumns: hm.mains.length > 1 ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr", gap: "var(--spacing-12)", alignItems: "start" }}>
            {hm.mains.map((m) => (
              <Race key={m.id} race={m} isUp={upTier === (m.tier ?? 0)} champ={(m.tier ?? 0) === 0}
                transferTo={(m.tier ?? 0) > 0 ? hm.mains[(m.tier ?? 0) - 1]?.label : undefined} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Edit a confirmed race after the fact: nudge drivers up/down into the corrected
 * order, or DQ someone (drops to the back on save). Saving re-reports the race,
 * which recomputes every downstream main.
 */
function EditEntry({ race, nameOf, onSave, onCancel }: { race: HRace; nameOf: (id: string | null) => string; onSave: (order: string[], dq: string[]) => void; onCancel: () => void }) {
  const [order, setOrder] = useState<string[]>(race.results ?? race.drivers);
  const [dq, setDq] = useState<string[]>(race.dq ?? []);
  const move = (i: number, dir: -1 | 1) =>
    setOrder((o) => {
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const c = [...o];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
  const toggleDq = (id: string) => setDq((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  const save = () => {
    const nonDq = order.filter((id) => !dq.includes(id));
    const dqd = order.filter((id) => dq.includes(id));
    onSave([...nonDq, ...dqd], dq);
  };
  const arrow: React.CSSProperties = { border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", borderRadius: 4, width: 24, height: 24, cursor: "pointer", fontSize: "var(--font-size-12)", lineHeight: 1 };
  return (
    <div>
      {order.map((id, i) => {
        const isDq = dq.includes(id);
        return (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-6)", padding: "var(--spacing-4) var(--spacing-8)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))" }}>
            <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{isDq ? "-" : i + 1}</span>
            <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)", textDecoration: isDq ? "line-through" : "none", color: isDq ? "var(--text-tertiary)" : "var(--text-primary)" }}>{nameOf(id)}</span>
            <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0 || isDq} style={{ ...arrow, opacity: i === 0 || isDq ? 0.4 : 1 }}>▲</button>
            <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === order.length - 1 || isDq} style={{ ...arrow, opacity: i === order.length - 1 || isDq ? 0.4 : 1 }}>▼</button>
            <button type="button" onClick={() => toggleDq(id)} style={{ ...arrow, width: "auto", padding: "0 6px", fontWeight: 700, color: isDq ? "var(--bg-primary, var(--primary-500))" : "var(--text-secondary)" }}>{isDq ? "Undo" : "DQ"}</button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: "var(--spacing-8)", padding: "var(--spacing-8) var(--spacing-10)", borderTop: "1px solid var(--border-default)" }}>
        <Button variant="ghost" size="small" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" size="small" onClick={save}>Save results</Button>
      </div>
    </div>
  );
}

/**
 * Tap-in-finish-order entry for one race. Tap drivers in the order they cross
 * the line; the running 1st/2nd/3rd… builds as you go. Undo pops the last, and
 * the final driver auto-fills so you only tap N-1. Confirm reports the order.
 */
function TapEntry({ drivers, nameOf, onConfirm }: { drivers: string[]; nameOf: (id: string | null) => string; onConfirm: (order: string[]) => void }) {
  const [order, setOrder] = useState<string[]>([]);
  const remaining = drivers.filter((d) => !order.includes(d));
  const canConfirm = remaining.length <= 1;
  const confirm = () => onConfirm(remaining.length === 1 ? [...order, remaining[0]] : order);
  return (
    <div>
      {order.map((id, i) => (
        <div key={id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-6) var(--spacing-10)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 8%, var(--surface-default))" }}>
          <span style={{ width: 18, textAlign: "center", fontWeight: 800, fontSize: "var(--font-size-12)", color: "var(--bg-primary, var(--primary-500))" }}>{i + 1}</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: "var(--font-size-14)" }}>{nameOf(id)}</span>
          <span aria-hidden style={{ color: "var(--bg-primary, var(--primary-500))" }}>✓</span>
        </div>
      ))}
      {remaining.map((id) => (
        <button key={id} type="button" onClick={() => setOrder((o) => [...o, id])}
          style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", width: "100%", textAlign: "left", cursor: "pointer", padding: "var(--spacing-6) var(--spacing-10)", border: "none", borderTop: "1px solid var(--border-subtle, var(--border-default))", background: "transparent", color: "var(--text-primary)" }}>
          <span style={{ width: 18, textAlign: "center", fontWeight: 700, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>·</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{nameOf(id)}</span>
          <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--text-tertiary)" }}>{order.length + 1}{ordinalSuffix(order.length + 1)} →</span>
        </button>
      ))}
      <div style={{ display: "flex", gap: "var(--spacing-8)", padding: "var(--spacing-8) var(--spacing-10)", borderTop: "1px solid var(--border-default)" }}>
        <Button variant="ghost" size="small" onClick={() => setOrder((o) => o.slice(0, -1))} disabled={order.length === 0}>Undo</Button>
        <Button variant="primary" size="small" onClick={confirm} disabled={!canConfirm}>Confirm results</Button>
      </div>
    </div>
  );
}

export function ordinalSuffix(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export function StandingsList({ rows }: { rows: { id: string; rank: number; name: string; meta: string; points?: number }[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
      {rows.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", padding: "var(--spacing-8) var(--spacing-10)", borderRadius: "0.4rem", background: r.rank <= 3 ? "var(--surface-raised, var(--surface-default))" : "transparent", border: "1px solid var(--border-subtle, var(--border-default))" }}>
          <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}>{r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : r.rank}</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{r.name}</span>
          {r.meta && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{r.meta}</span>}
          {r.points != null && <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{r.points} pts</span>}
        </div>
      ))}
    </div>
  );
}

/** Per-event championship breakdown: final main + placement, heat bonus, main
 *  points, and the event total (sorted high → low). */
export function ChampionshipTable({ rows, nameOf }: { rows: DriverPoints[]; nameOf: (id: string | null) => string }) {
  const cell: React.CSSProperties = { fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", minWidth: 52, textAlign: "right" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", padding: "0 var(--spacing-10)" }}>
        <span style={{ width: 28 }} />
        <span style={{ flex: 1 }} />
        <span style={{ ...cell, minWidth: 96 }}>Final</span>
        <span style={{ ...cell }}>Heat</span>
        <span style={{ ...cell }}>Main</span>
        <span style={{ ...cell, fontWeight: 700, color: "var(--text-secondary)" }}>Total</span>
      </div>
      {rows.map((r, i) => (
        <div key={r.participantId} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", padding: "var(--spacing-8) var(--spacing-10)", borderRadius: "0.4rem", background: i < 3 ? "var(--surface-raised, var(--surface-default))" : "transparent", border: "1px solid var(--border-subtle, var(--border-default))" }}>
          <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{nameOf(r.participantId)}</span>
          <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", minWidth: 96, textAlign: "right" }}>
            {r.dq ? "DQ" : r.finalMainTier == null ? "-" : `${r.finalMainLabel} P${r.finalPlacement}`}
          </span>
          <span style={{ ...cell }}>+{r.heatPoints}</span>
          <span style={{ ...cell }}>{r.mainPoints}</span>
          <span style={{ fontWeight: 700, fontSize: "var(--font-size-14)", minWidth: 52, textAlign: "right" }}>{r.total}</span>
        </div>
      ))}
    </div>
  );
}

/** Season standings across logged events — total, events run, and each event's
 *  points as a compact trail. */
export function SeasonTable({ rows, events, nameOf }: { rows: SeasonRow[]; events: number; nameOf: (id: string | null) => string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
      {rows.map((r, i) => (
        <div key={r.participantId} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", padding: "var(--spacing-8) var(--spacing-10)", borderRadius: "0.4rem", background: i < 3 ? "var(--surface-raised, var(--surface-default))" : "transparent", border: "1px solid var(--border-subtle, var(--border-default))" }}>
          <span style={{ width: 28, textAlign: "center", fontWeight: 800 }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
          <span style={{ flex: 1, fontWeight: 600, fontSize: "var(--font-size-14)" }}>{nameOf(r.participantId)}</span>
          {events > 1 && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{r.perEvent.join(" · ")}</span>}
          <span style={{ fontWeight: 800, fontSize: "var(--font-size-16)", minWidth: 56, textAlign: "right" }}>{r.total}</span>
        </div>
      ))}
    </div>
  );
}
