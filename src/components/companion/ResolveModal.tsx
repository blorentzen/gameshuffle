"use client";

/**
 * Resolve modal — purely informational + action surface.
 *
 * v1 used to walk the player through their conditions step-by-step
 * (the "checkup state machine"). v2 replaces that with a flat list:
 * every slot with at least one active condition gets a card; every
 * condition under it gets a row with its educational description
 * and an action button. The player taps actions in any order — no
 * forced sequence. The reducer enforces correctness mathematically
 * (damage is commutative; auto-KO triggers when HP threshold is
 * crossed) but doesn't try to enforce TCG canonical order.
 *
 * Coin-flip actions animate inline via an embedded Coin3D — same
 * component the standalone CoinFlipModal uses, just at a smaller
 * size and with no actions of its own. After the flip settles, the
 * appropriate reducer action dispatches (clear-on-heads logic
 * lives in the reducer).
 */

import { Modal } from "@empac/cascadeds";
import { Icon } from "@empac/cascadeds";
import { useState, type CSSProperties } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { flipCoin } from "@/lib/companion/rng";
import { Coin3D } from "./Coin3D";
import type {
  CoinFlipEntry,
  ExtraConditionDef,
  PlayerId,
  SlotState,
} from "@/lib/companion/types";
import { ALL_POSITIONS } from "@/lib/companion/types";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  onClose: () => void;
}

export function ResolveModal({ isOpen, player, onClose }: Props) {
  const { state, mode } = useSession();
  const playerName = state.playerNames[player];

  // Active slots for this player with at least one condition,
  // sorted active → bench 1..5 so the list reads top-down.
  const slots = state.slots
    .filter((s) => {
      if (s.player !== player || !s.occupied) return false;
      if (s.conditionA || s.conditionB) return true;
      return Object.values(s.extraConditions).some(Boolean);
    })
    .sort(
      (a, b) =>
        ALL_POSITIONS.indexOf(a.position) - ALL_POSITIONS.indexOf(b.position),
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${playerName} — Resolve`}
      size="large"
      primaryAction={{ label: "Done", onClick: onClose }}
    >
      <div className="companion-resolve">
        {slots.length === 0 ? (
          <p className="companion-resolve__empty">
            No conditions to resolve right now.
          </p>
        ) : (
          <div className="companion-resolve__slots">
            {slots.map((slot) => (
              <ResolveSlotCard key={slot.position} slot={slot} player={player} />
            ))}
          </div>
        )}

        {mode.checkupFooterReminder && (
          <p className="companion-resolve__footer">
            {mode.checkupFooterReminder}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Per-slot card
// ---------------------------------------------------------------------------

function ResolveSlotCard({
  slot,
  player,
}: {
  slot: SlotState;
  player: PlayerId;
}) {
  const mode = useMode();
  const positionLabel =
    slot.position === "active"
      ? mode.positionLabels.active
      : mode.positionLabels.bench;

  return (
    <div className="companion-resolve__slot-card">
      <div className="companion-resolve__slot-head">
        <span className="companion-resolve__slot-name">
          {slot.name ?? "Unnamed"}
        </span>
        <span className="companion-resolve__slot-meta">
          {positionLabel} · {slot.damage}
          {slot.maxHp != null && `/${slot.maxHp}`}
        </span>
      </div>

      <div className="companion-resolve__conditions">
        {slot.conditionA && (
          <PoisonRow slot={slot} player={player} />
        )}
        {slot.conditionB && (
          <BurnRow slot={slot} player={player} />
        )}
        {mode.extraConditions.map((def) =>
          slot.extraConditions[def.key] ? (
            <ExtraConditionRow
              key={def.key}
              slot={slot}
              player={player}
              def={def}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-condition rows
// ---------------------------------------------------------------------------

function PoisonRow({ slot, player }: { slot: SlotState; player: PlayerId }) {
  const { dispatch } = useSession();
  const mode = useMode();
  const [applied, setApplied] = useState(false);
  const handleApply = () => {
    setApplied(true);
    dispatch({
      type: "APPLY_DAMAGE_WITH_KO_CHECK",
      player,
      position: slot.position,
      delta: mode.conditionADamage,
    });
  };
  return (
    <ConditionRow
      label={mode.conditionALabel}
      icon={mode.conditionAIcon}
      color={mode.conditionAColor}
      description={mode.conditionADescription}
      action={
        applied ? (
          <span className="companion-resolve__action-applied">
            +{mode.conditionADamage} applied
          </span>
        ) : (
          <button
            type="button"
            className="companion-resolve__action-btn"
            style={
              {
                "--condition-color": mode.conditionAColor,
              } as CSSProperties
            }
            onClick={handleApply}
          >
            Apply +{mode.conditionADamage}
          </button>
        )
      }
    />
  );
}

function BurnRow({ slot, player }: { slot: SlotState; player: PlayerId }) {
  const { dispatch } = useSession();
  const mode = useMode();
  // Three-stage local state for this row:
  //   "ready"    — show the action button
  //   "flipping" — damage applied, coin animating
  //   "settled"  — coin animation done, result shown
  const [stage, setStage] = useState<"ready" | "flipping" | "settled">(
    "ready",
  );
  const [side, setSide] = useState<CoinFlipEntry["side"] | null>(null);

  const handleResolve = () => {
    // 1. Apply damage immediately so the slot updates.
    dispatch({
      type: "APPLY_DAMAGE_WITH_KO_CHECK",
      player,
      position: slot.position,
      delta: mode.conditionBDamage,
    });
    // 2. Pre-compute the flip and start the animation.
    const outcome = flipCoin();
    const result: CoinFlipEntry["side"] = outcome === 0 ? "a" : "b";
    setSide(result);
    setStage("flipping");
    // 3. After the spin settles, dispatch the coin result so the
    //    reducer clears Burn (if heads) and logs the flip.
    window.setTimeout(() => {
      dispatch({
        type: "RESOLVE_BURN_COIN",
        player,
        position: slot.position,
        side: result,
      });
      setStage("settled");
    }, 1200);
  };

  return (
    <ConditionRow
      label={mode.conditionBLabel}
      icon={mode.conditionBIcon}
      color={mode.conditionBColor}
      description={mode.conditionBDescription}
      action={
        stage === "ready" ? (
          <button
            type="button"
            className="companion-resolve__action-btn"
            style={
              {
                "--condition-color": mode.conditionBColor,
              } as CSSProperties
            }
            onClick={handleResolve}
          >
            Resolve {mode.conditionBLabel}
          </button>
        ) : stage === "flipping" && side ? (
          <div className="companion-resolve__inline-coin">
            <Coin3D resultSide={side} phase="flipping" />
          </div>
        ) : (
          <span className="companion-resolve__action-applied">
            {side === "a"
              ? `Heads — ${mode.conditionBLabel} cleared`
              : `Tails — ${mode.conditionBLabel} persists`}
          </span>
        )
      }
    />
  );
}

function ExtraConditionRow({
  slot,
  player,
  def,
}: {
  slot: SlotState;
  player: PlayerId;
  def: ExtraConditionDef;
}) {
  const { dispatch } = useSession();
  const [stage, setStage] = useState<"ready" | "flipping" | "settled">(
    "ready",
  );
  const [side, setSide] = useState<CoinFlipEntry["side"] | null>(null);

  // Only conditions with checkupCoinClear get an action button —
  // others (Paralyzed, Confused) are informational only.
  const hasAction = !!def.checkupCoinClear;

  const handleFlip = () => {
    const outcome = flipCoin();
    const result: CoinFlipEntry["side"] = outcome === 0 ? "a" : "b";
    setSide(result);
    setStage("flipping");
    window.setTimeout(() => {
      dispatch({
        type: "RESOLVE_EXTRA_COIN",
        player,
        position: slot.position,
        key: def.key,
        side: result,
      });
      setStage("settled");
    }, 1200);
  };

  let actionContent: React.ReactNode = null;
  if (hasAction) {
    if (stage === "ready") {
      actionContent = (
        <button
          type="button"
          className="companion-resolve__action-btn"
          style={{ "--condition-color": def.color } as CSSProperties}
          onClick={handleFlip}
        >
          Flip for {def.label}
        </button>
      );
    } else if (stage === "flipping" && side) {
      actionContent = (
        <div className="companion-resolve__inline-coin">
          <Coin3D resultSide={side} phase="flipping" />
        </div>
      );
    } else {
      actionContent = (
        <span className="companion-resolve__action-applied">
          {side === "a"
            ? `Heads — ${def.label} cleared`
            : `Tails — ${def.label} persists`}
        </span>
      );
    }
  } else {
    actionContent = (
      <span className="companion-resolve__action-info">No action needed</span>
    );
  }

  return (
    <ConditionRow
      label={def.label}
      icon={def.icon}
      color={def.color}
      description={def.description}
      action={actionContent}
    />
  );
}

// ---------------------------------------------------------------------------
// Shared layout for each condition row (icon + label + desc + action)
// ---------------------------------------------------------------------------

function ConditionRow({
  label,
  icon,
  color,
  description,
  action,
}: {
  label: string;
  icon: string;
  color: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className="companion-resolve__row"
      style={{ "--condition-color": color } as CSSProperties}
    >
      <div className="companion-resolve__row-head">
        <span className="companion-resolve__row-badge">
          <Icon
            name={icon as Parameters<typeof Icon>[0]["name"]}
            size="18"
          />
        </span>
        <span className="companion-resolve__row-label">{label}</span>
      </div>
      <p className="companion-resolve__row-desc">{description}</p>
      <div className="companion-resolve__row-action">{action}</div>
    </div>
  );
}
