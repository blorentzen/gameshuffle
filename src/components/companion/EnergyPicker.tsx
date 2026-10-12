"use client";

/**
 * Add Energy: pick where it goes, then the type. Opens from a slot's Energy
 * (that Pokémon picked) or a Pokémon's window. The types this Pokémon uses
 * come first (its own type and what its attacks cost), then every other type.
 * One tap attaches one Energy and closes; the board flashes that Pokémon and
 * says what went where, with Undo. A second attach in one turn still happens
 * (cards allow it); the rule check says so instead.
 *
 * The "Goes to" tiles and the type tiles are picture buttons: CDS has no
 * picture radio cards yet (raise with CascadeDS).
 */

import { useState } from "react";
import type { CSSProperties } from "react";
import { Alert, Modal } from "@empac/cascadeds";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { ALL_POSITIONS, type PlayerId, type SlotPosition } from "@/lib/companion/types";
import { remindFor } from "@/lib/companion/reminders";
import { useToast } from "@/components/toast/ToastProvider";
import { CardArt, EnergyDot } from "./glyphs";

export function EnergyPicker({ isOpen, player, position, onClose }: { isOpen: boolean; player: PlayerId; position: SlotPosition; onClose: () => void }) {
  const { state, dispatch, undo, flashSlot } = useSession();
  const mode = useMode();
  const toast = useToast();
  const [target, setTarget] = useState<SlotPosition>(position);

  const mine = ALL_POSITIONS.map((p) => findSlot(state, player, p)).filter((s): s is NonNullable<typeof s> => !!s?.occupied);
  const slot = findSlot(state, player, target);
  if (!slot?.occupied) return null;

  const keys = new Set(mode.energyTypes.map((e) => e.key));
  // Why each suggested type: its own type, or the attacks that cost it.
  const reasons = new Map<string, string[]>();
  for (const t of slot.rules?.types ?? []) {
    const k = t.toLowerCase();
    if (keys.has(k)) reasons.set(k, [...(reasons.get(k) ?? []), "Its type"]);
  }
  for (const a of slot.rules?.attacks ?? []) {
    for (const c of new Set(a.cost.map((x) => x.toLowerCase()))) {
      if (c === "colorless" || !keys.has(c)) continue;
      reasons.set(c, [...(reasons.get(c) ?? []), `${a.name} needs it`]);
    }
  }
  const suggested = [...reasons.keys()];
  const others = mode.energyTypes.filter((e) => !reasons.has(e.key));
  const name = slot.name ?? "this Pokémon";

  const attach = (energyKey: string) => {
    const action = { type: "ADJUST_ENERGY" as const, player, position: target, energyKey, delta: 1 };
    const reminder = remindFor(state, action, mode);
    dispatch(action);
    flashSlot(player, target);
    onClose();
    const label = mode.energyTypes.find((e) => e.key === energyKey)?.label ?? "Energy";
    // A rule check toast (with its own Undo) already says what happened.
    if (!reminder) toast.toast({ variant: "success", message: `${label} Energy attached to ${name}.`, action: { label: "Undo", onClick: undo } });
  };

  const where = (p: SlotPosition) => (p === "active" ? mode.positionLabels.active : mode.positionLabels.bench);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Energy" size="medium">
      <div className="companion-energy-pick">
        {/* Said before the tap, not only after: the attach still goes ahead. */}
        {state.turn?.player === player && state.turn.used.energy && (
          <Alert variant="warning" title="Energy already attached this turn">
            Usually one a turn. Add another only if a card lets you.
          </Alert>
        )}
        {mine.length > 1 && (
          <div className="companion-energy-pick__section">
            <span className="companion-energy-pick__label" id={`goes-to-${player}`}>Goes to</span>
            <div className="companion-energy-pick__targets" role="radiogroup" aria-labelledby={`goes-to-${player}`}>
              {mine.map((s) => (
                <button
                  key={s.position}
                  type="button"
                  role="radio"
                  aria-checked={s.position === target}
                  className={`companion-energy-pick__target${s.position === target ? " is-on" : ""}`}
                  onClick={() => setTarget(s.position)}
                >
                  {s.cardImage ? <CardArt src={s.cardImage} className="companion-energy-pick__target-art" /> : <span className="companion-energy-pick__target-art companion-energy-pick__target-art--none" aria-hidden="true" />}
                  <span className="companion-energy-pick__target-name">{s.name ?? "Unnamed"}</span>
                  <span className="companion-energy-pick__target-where">{where(s.position)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {mine.length <= 1 && <p className="companion-energy-pick__to">To <strong>{name}</strong>, {state.playerNames[player]}&apos;s {where(target)}</p>}

        {suggested.length > 0 && (
          <div className="companion-energy-pick__section">
            <span className="companion-energy-pick__label">What {name} uses</span>
            {suggested.map((k) => {
              const def = mode.energyTypes.find((e) => e.key === k)!;
              return (
                <button key={k} type="button" className="companion-energy-pick__suggest" style={{ "--dot-color": def.color } as CSSProperties} onClick={() => attach(k)}>
                  <EnergyDot type={k} size={40} decorative />
                  <span className="companion-energy-pick__suggest-text">
                    <strong>{def.label}</strong>
                    <span>{[...new Set(reasons.get(k))].join(" · ")}</span>
                  </span>
                  <span className="companion-energy-pick__suggest-add" aria-hidden="true">Add</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="companion-energy-pick__section">
          <span className="companion-energy-pick__label">{suggested.length ? "Any other type" : "Pick a type"}</span>
          <div className="companion-energy-pick__grid">
            {others.map((def) => (
              <button key={def.key} type="button" className="companion-energy-pick__type" onClick={() => attach(def.key)}>
                <EnergyDot type={def.key} size={32} decorative />
                <span>{def.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="companion-energy-pick__note">One tap attaches one and closes. Take Energy off in the Pokémon&apos;s window.</p>
      </div>
    </Modal>
  );
}
