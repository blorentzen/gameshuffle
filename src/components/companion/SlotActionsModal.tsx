"use client";

/**
 * Slot action sheet — opens on tap of an occupied slot.
 *
 * Wave 1: damage controls + discard.
 * Wave 2: condition toggles (Poison / Burn) + Knockout button (the
 * score-crediting removal that decrements the opposing player's
 * win counter).
 */

import { Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { ThemePicker } from "./ThemePicker";
import { TablerIcon } from "./TablerIcon";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  position: SlotPosition;
  onClose: () => void;
}

export function SlotActionsModal({ isOpen, player, position, onClose }: Props) {
  const { state, dispatch } = useSession();
  const mode = useMode();
  const slot = findSlot(state, player, position);

  if (!slot || !slot.occupied) {
    // CDS Modal needs to render even when closed (animation), but
    // there's nothing meaningful to show before the slot has a piece.
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const positionLabel =
    position === "active" ? mode.positionLabels.active : mode.positionLabels.bench;
  const title = `${slot.name ?? "Unnamed"} — ${positionLabel}`;

  const handleAdjust = (delta: number) => {
    dispatch({ type: "ADJUST_DAMAGE", player, position, delta });
  };

  const handleReset = () => {
    dispatch({ type: "RESET_DAMAGE", player, position });
  };

  const handleToggleCondition = (which: "a" | "b", value: boolean) => {
    dispatch({ type: "TOGGLE_CONDITION", player, position, which, value });
  };

  const handleToggleExtraCondition = (key: string, value: boolean) => {
    dispatch({
      type: "TOGGLE_EXTRA_CONDITION",
      player,
      position,
      key,
      value,
    });
  };

  const handleRetheme = (slotTheme: string) => {
    dispatch({
      type: "STYLE_SLOT",
      player,
      position,
      slotTheme,
    });
  };

  const handleUpdateKoValue = (koValue: number) => {
    dispatch({
      type: "UPDATE_PIECE_META",
      player,
      position,
      koValue,
    });
  };

  const handleCommitName = (next: string) => {
    const trimmed = next.trim();
    dispatch({
      type: "UPDATE_PIECE_META",
      player,
      position,
      name: trimmed.length === 0 ? null : trimmed,
    });
  };

  const handleCommitMaxHp = (next: string) => {
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      dispatch({ type: "UPDATE_PIECE_META", player, position, maxHp: null });
      return;
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 0) return;
    dispatch({ type: "UPDATE_PIECE_META", player, position, maxHp: n });
  };

  const handleKnockout = () => {
    dispatch({ type: "KNOCKOUT", player, position });
    onClose();
  };

  const handleDiscard = () => {
    dispatch({ type: "REMOVE_PIECE", player, position });
    onClose();
  };

  const handleAdjustEnergy = (energyKey: string, delta: number) => {
    dispatch({
      type: "ADJUST_ENERGY",
      player,
      position,
      energyKey,
      delta,
    });
  };

  const handleClearEnergies = () => {
    dispatch({ type: "CLEAR_ENERGIES", player, position });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="companion-actions">
        <div className="companion-actions__damage">
          <div className="companion-actions__damage-label">Damage</div>
          <div className="companion-actions__damage-value">
            {slot.damage}
            {slot.maxHp != null && (
              <span className="companion-actions__damage-max"> / {slot.maxHp}</span>
            )}
          </div>
        </div>

        <div className="companion-actions__buttons">
          {mode.damageIncrements.map((inc) => (
            <button
              key={`plus-${inc}`}
              type="button"
              className="companion-actions__btn companion-actions__btn--add"
              onClick={() => handleAdjust(inc)}
            >
              +{inc}
            </button>
          ))}
          {mode.damageIncrements.map((inc) => (
            <button
              key={`minus-${inc}`}
              type="button"
              className="companion-actions__btn companion-actions__btn--sub"
              onClick={() => handleAdjust(-inc)}
            >
              −{inc}
            </button>
          ))}
          <button
            type="button"
            className="companion-actions__btn companion-actions__btn--reset"
            onClick={handleReset}
          >
            Reset
          </button>
        </div>

        <div className="companion-actions__conditions">
          <div className="companion-actions__conditions-label">
            Conditions
          </div>
          <div className="companion-actions__conditions-row">
            <label
              className={`companion-actions__condition${
                slot.conditionA ? " companion-actions__condition--on" : ""
              }`}
              style={
                {
                  "--condition-color": mode.conditionAColor,
                } as React.CSSProperties
              }
            >
              <input
                type="checkbox"
                checked={slot.conditionA}
                onChange={(e) => handleToggleCondition("a", e.target.checked)}
              />
              <span>{mode.conditionALabel}</span>
            </label>
            <label
              className={`companion-actions__condition${
                slot.conditionB ? " companion-actions__condition--on" : ""
              }`}
              style={
                {
                  "--condition-color": mode.conditionBColor,
                } as React.CSSProperties
              }
            >
              <input
                type="checkbox"
                checked={slot.conditionB}
                onChange={(e) => handleToggleCondition("b", e.target.checked)}
              />
              <span>{mode.conditionBLabel}</span>
            </label>
          </div>
        </div>

        {mode.extraConditions.length > 0 && (
          <div className="companion-actions__conditions">
            <div className="companion-actions__conditions-label">
              Status (one at a time)
            </div>
            <div className="companion-actions__conditions-row companion-actions__conditions-row--three">
              {mode.extraConditions.map((def) => {
                const on = !!slot.extraConditions[def.key];
                return (
                  <label
                    key={def.key}
                    className={`companion-actions__condition${
                      on ? " companion-actions__condition--on" : ""
                    }`}
                    style={
                      {
                        "--condition-color": def.color,
                      } as React.CSSProperties
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) =>
                        handleToggleExtraCondition(def.key, e.target.checked)
                      }
                    />
                    <span>{def.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <details className="companion-actions__style">
          <summary className="companion-actions__style-summary">
            Evolve / Edit piece
          </summary>
          <div className="companion-actions__evolve">
            {/* Name + HP commit on blur — typing doesn't dispatch
                every keystroke. Card type buttons commit on click. */}
            <EvolveField
              label="Name"
              initial={slot.name ?? ""}
              type="text"
              placeholder="e.g. Charizard"
              onCommit={handleCommitName}
            />
            <EvolveField
              label="Max HP"
              initial={slot.maxHp != null ? String(slot.maxHp) : ""}
              type="number"
              placeholder="e.g. 150"
              onCommit={handleCommitMaxHp}
            />
            {mode.koValueOptions.length > 1 && (
              <div className="companion-actions__evolve-row">
                <div className="companion-actions__evolve-label">
                  Card type
                </div>
                <div className="companion-actions__evolve-ko">
                  {mode.koValueOptions.map((opt) => {
                    const label = mode.koValueLabels[opt] ?? String(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        className={`companion-place__ko-btn${
                          slot.koValue === opt ? " companion-place__ko-btn--selected" : ""
                        }`}
                        onClick={() => handleUpdateKoValue(opt)}
                      >
                        <span className="companion-place__ko-btn-label">
                          {label}
                        </span>
                        <span className="companion-place__ko-btn-count">
                          {opt} {mode.winCounterLabel.toLowerCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </details>

        <details className="companion-actions__style">
          <summary className="companion-actions__style-summary">
            Pokémon Type
          </summary>
          <ThemePicker selected={slot.slotTheme} onChange={handleRetheme} />
        </details>

        {mode.energyTypes.length > 0 && (
          <details className="companion-actions__style">
            <summary className="companion-actions__style-summary">
              Energy
            </summary>
            <div className="companion-actions__energy-grid">
              {mode.energyTypes.map((def) => {
                const count = slot.energies[def.key] ?? 0;
                return (
                  <div
                    key={def.key}
                    className="companion-actions__energy-row"
                    style={
                      {
                        "--energy-color": def.color,
                      } as React.CSSProperties
                    }
                  >
                    <span
                      className={`companion-actions__energy-chip${
                        def.invertText
                          ? " companion-actions__energy-chip--invert"
                          : ""
                      }`}
                      title={def.label}
                    >
                      <TablerIcon name={def.icon} size="16" />
                    </span>
                    <span className="companion-actions__energy-label">
                      {def.label}
                    </span>
                    <div className="companion-actions__energy-counter">
                      <button
                        type="button"
                        className="companion-actions__energy-btn"
                        onClick={() => handleAdjustEnergy(def.key, -1)}
                        disabled={count === 0}
                        aria-label={`Remove one ${def.label} energy`}
                      >
                        −
                      </button>
                      <span className="companion-actions__energy-count">
                        {count}
                      </span>
                      <button
                        type="button"
                        className="companion-actions__energy-btn"
                        onClick={() => handleAdjustEnergy(def.key, 1)}
                        aria-label={`Attach one ${def.label} energy`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {mode.energyTypes.some(
              (def) => (slot.energies[def.key] ?? 0) > 0,
            ) && (
              <button
                type="button"
                className="companion-actions__energy-clear"
                onClick={handleClearEnergies}
              >
                Discard all energy
              </button>
            )}
          </details>
        )}

        <div className="companion-actions__exit">
          <button
            type="button"
            className="companion-actions__knockout"
            onClick={handleKnockout}
          >
            Knockout (opponent takes {slot.koValue})
          </button>
          <button
            type="button"
            className="companion-actions__remove"
            onClick={handleDiscard}
          >
            Discard (no {mode.winCounterLabel.toLowerCase()})
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Editable field for the Evolve section — commits the value on
 * Enter or blur via the parent's `onCommit` callback. Local draft
 * state stays uncommitted until then so a half-typed value doesn't
 * cause a partial dispatch.
 */
function EvolveField({
  label,
  initial,
  type,
  placeholder,
  onCommit,
}: {
  label: string;
  initial: string;
  type: "text" | "number";
  placeholder?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  return (
    <label className="companion-actions__evolve-row">
      <span className="companion-actions__evolve-label">{label}</span>
      <input
        type={type}
        className="companion-actions__evolve-input"
        value={draft}
        placeholder={placeholder}
        inputMode={type === "number" ? "numeric" : undefined}
        min={type === "number" ? 0 : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== initial) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
