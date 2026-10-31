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

import { Button, Modal } from "@empac/cascadeds";
import { TablerIcon } from "./TablerIcon";
import { useState, type CSSProperties } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
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
  /** One player's Resolve, or "both" for the Checkup between turns. */
  player: PlayerId | "both";
  onClose: () => void;
  /** Between turns: the main button finishes the Checkup (ends the turn) and
   *  a Back button closes without ending it. */
  onDone?: () => void;
  doneLabel?: string;
  /** A line above the list (whose turn comes next). */
  intro?: string;
}

export function ResolveModal({ isOpen, player, onClose, onDone, doneLabel, intro }: Props) {
  const { state, mode } = useSession();
  const players: PlayerId[] = player === "both" ? ["p1", "p2"] : [player];

  // Slots with at least one condition, sorted player then active → bench
  // 1..5 so the list reads top-down.
  const slots = state.slots
    .filter((s) => {
      if (!players.includes(s.player) || !s.occupied) return false;
      if (s.conditionA || s.conditionB) return true;
      return Object.values(s.extraConditions).some(Boolean);
    })
    .sort(
      (a, b) =>
        players.indexOf(a.player) - players.indexOf(b.player) ||
        ALL_POSITIONS.indexOf(a.position) - ALL_POSITIONS.indexOf(b.position),
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={player === "both" ? `${mode.displayName} Checkup` : `${state.playerNames[player]}: Resolve`}
      size="large"
      primaryAction={{ label: doneLabel ?? "Done", onClick: onDone ?? onClose }}
      secondaryAction={onDone ? { label: "Back", onClick: onClose } : undefined}
    >
      <div className="companion-resolve">
        {intro && <p className="companion-resolve__intro">{intro}</p>}
        {slots.length === 0 ? (
          <p className="companion-resolve__empty">
            No conditions to resolve right now.
          </p>
        ) : (
          <div className="companion-resolve__slots">
            {slots.map((slot) => (
              <ResolveSlotCard key={`${slot.player}-${slot.position}`} slot={slot} player={slot.player} owner={player === "both" ? state.playerNames[slot.player] : null} />
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
  owner,
}: {
  slot: SlotState;
  player: PlayerId;
  /** The owner's name, shown when both players' Pokémon are listed. */
  owner: string | null;
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
          {owner ? `${owner}'s ` : ""}{positionLabel} · {slot.damage}
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
          <Button
            size="small"
            className="companion-resolve__action-btn"
            style={
              {
                "--condition-color": mode.conditionAColor,
              } as CSSProperties
            }
            onClick={handleApply}
          >
            Apply +{mode.conditionADamage}
          </Button>
        )
      }
    />
  );
}

function BurnRow({ slot, player }: { slot: SlotState; player: PlayerId }) {
  const { dispatch, random } = useSession();
  const mode = useMode();
  // Three-stage local state for this row:
  //   "ready"    — show the action button
  //   "flipping" — damage applied, coin animating
  //   "settled"  — coin animation done, result shown
  const [stage, setStage] = useState<"ready" | "flipping" | "settled">(
    "ready",
  );
  const [side, setSide] = useState<CoinFlipEntry["side"] | null>(null);

  const handleResolve = async () => {
    setStage("flipping");
    // 1. Apply damage immediately so the slot updates.
    dispatch({
      type: "APPLY_DAMAGE_WITH_KO_CHECK",
      player,
      position: slot.position,
      delta: mode.conditionBDamage,
    });
    // 2. Flip (the server's flip in a shared game) and start the animation.
    const { side: result, rollId } = await random.coin("resolve");
    setSide(result);
    // 3. After the spin settles, dispatch the coin result so the
    //    reducer clears Burn (if heads) and logs the flip.
    window.setTimeout(() => {
      dispatch({
        type: "RESOLVE_BURN_COIN",
        player,
        position: slot.position,
        side: result,
        rollId,
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
          <Button
            size="small"
            className="companion-resolve__action-btn"
            style={
              {
                "--condition-color": mode.conditionBColor,
              } as CSSProperties
            }
            onClick={handleResolve}
          >
            Resolve {mode.conditionBLabel}
          </Button>
        ) : stage === "flipping" ? (
          side ? (
            <div className="companion-resolve__inline-coin">
              <Coin3D resultSide={side} phase="flipping" />
            </div>
          ) : (
            <span className="companion-resolve__action-info">Flipping…</span>
          )
        ) : (
          <span className="companion-resolve__action-applied">
            {side === "a"
              ? `Heads: ${mode.conditionBLabel} cleared`
              : `Tails: ${mode.conditionBLabel} persists`}
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
  const { dispatch, random } = useSession();
  const [stage, setStage] = useState<"ready" | "flipping" | "settled">(
    "ready",
  );
  const [side, setSide] = useState<CoinFlipEntry["side"] | null>(null);

  // Only conditions with checkupCoinClear get an action button —
  // others (Paralyzed, Confused) are informational only.
  const hasAction = !!def.checkupCoinClear;

  const handleFlip = async () => {
    setStage("flipping");
    // The server's flip in a shared game.
    const { side: result, rollId } = await random.coin("resolve");
    setSide(result);
    window.setTimeout(() => {
      dispatch({
        type: "RESOLVE_EXTRA_COIN",
        player,
        position: slot.position,
        key: def.key,
        side: result,
        rollId,
      });
      setStage("settled");
    }, 1200);
  };

  let actionContent: React.ReactNode = null;
  if (hasAction) {
    if (stage === "ready") {
      actionContent = (
        <Button
          size="small"
          className="companion-resolve__action-btn"
          style={{ "--condition-color": def.color } as CSSProperties}
          onClick={handleFlip}
        >
          Flip for {def.label}
        </Button>
      );
    } else if (stage === "flipping") {
      actionContent = side ? (
        <div className="companion-resolve__inline-coin">
          <Coin3D resultSide={side} phase="flipping" />
        </div>
      ) : (
        <span className="companion-resolve__action-info">Flipping…</span>
      );
    } else {
      actionContent = (
        <span className="companion-resolve__action-applied">
          {side === "a"
            ? `Heads: ${def.label} cleared`
            : `Tails: ${def.label} persists`}
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
      ink={def.ink}
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
  ink,
  description,
  action,
}: {
  label: string;
  icon: string;
  color: string;
  ink?: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div
      className="companion-resolve__row"
      style={{ "--condition-color": color, ...(ink ? { "--condition-ink": ink } : {}) } as CSSProperties}
    >
      <div className="companion-resolve__row-head">
        <span className="companion-resolve__row-badge">
          <TablerIcon name={icon} size="18" />
        </span>
        <span className="companion-resolve__row-label">{label}</span>
      </div>
      <p className="companion-resolve__row-desc">{description}</p>
      <div className="companion-resolve__row-action">{action}</div>
    </div>
  );
}
