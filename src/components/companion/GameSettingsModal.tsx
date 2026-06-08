"use client";

/**
 * Pre-game settings — surfaces before the board renders on first
 * load and after every Reset Game. The user picks a format preset
 * (or Custom for hand-tuned house rules), then dispatches
 * APPLY_GAME_SETTINGS which flips `gameStarted: true` and the board
 * appears.
 *
 * Custom mode unlocks per-field editing (prize count, bench size,
 * Mega ex allowance, evolution-clears-conditions toggle).
 */

import { Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import {
  GAME_FORMATS,
  formatByKey,
  type GameFormatKey,
  type GameSettings,
} from "@/lib/companion/gameSettings";
import { TablerIcon } from "./TablerIcon";

interface Props {
  isOpen: boolean;
  onApplied: () => void;
}

export function GameSettingsModal({ isOpen, onApplied }: Props) {
  const { dispatch } = useSession();
  const [format, setFormat] = useState<GameFormatKey>("standard");
  const [custom, setCustom] = useState({
    prizeCount: 6,
    benchSize: 5,
    allowMega: true,
    evolutionClearsConditions: true,
  });

  // Resolve the effective settings — preset values for non-custom
  // formats, the local `custom` state otherwise.
  const effective: Omit<GameSettings, "format" | "gameStarted"> =
    format === "custom" ? custom : formatByKey(format).settings;

  const handleConfirm = () => {
    dispatch({
      type: "APPLY_GAME_SETTINGS",
      settings: { ...effective, format, gameStarted: true },
    });
    onApplied();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleConfirm}
      title="New Game"
      size="large"
      primaryAction={{ label: "Start game", onClick: handleConfirm }}
    >
      <div className="companion-settings">
        <p className="companion-settings__lede">
          Pick a format to start with. You can change rules anytime by
          tapping Reset Game.
        </p>

        <div className="companion-settings__formats">
          {GAME_FORMATS.map((def) => {
            const selected = def.key === format;
            return (
              <button
                key={def.key}
                type="button"
                className={`companion-settings__format${
                  selected ? " companion-settings__format--selected" : ""
                }`}
                onClick={() => setFormat(def.key)}
              >
                <span className="companion-settings__format-icon">
                  <TablerIcon name={def.icon} size="20" />
                </span>
                <span className="companion-settings__format-body">
                  <span className="companion-settings__format-label">
                    {def.label}
                  </span>
                  <span className="companion-settings__format-desc">
                    {def.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {format === "custom" && (
          <div className="companion-settings__custom">
            <div className="companion-settings__custom-title">Custom rules</div>

            <label className="companion-settings__field">
              <span>Prize cards per player</span>
              <input
                type="number"
                min={1}
                max={12}
                value={custom.prizeCount}
                onChange={(e) =>
                  setCustom((c) => ({
                    ...c,
                    prizeCount: clamp(
                      Number.parseInt(e.target.value, 10) || 1,
                      1,
                      12,
                    ),
                  }))
                }
              />
            </label>

            <label className="companion-settings__field">
              <span>Bench slots per player</span>
              <input
                type="number"
                min={1}
                max={5}
                value={custom.benchSize}
                onChange={(e) =>
                  setCustom((c) => ({
                    ...c,
                    benchSize: clamp(
                      Number.parseInt(e.target.value, 10) || 1,
                      1,
                      5,
                    ),
                  }))
                }
              />
            </label>

            <label className="companion-settings__toggle">
              <input
                type="checkbox"
                checked={custom.allowMega}
                onChange={(e) =>
                  setCustom((c) => ({ ...c, allowMega: e.target.checked }))
                }
              />
              <span>Allow Mega ex / VMAX (3-prize cards)</span>
            </label>

            <label className="companion-settings__toggle">
              <input
                type="checkbox"
                checked={custom.evolutionClearsConditions}
                onChange={(e) =>
                  setCustom((c) => ({
                    ...c,
                    evolutionClearsConditions: e.target.checked,
                  }))
                }
              />
              <span>
                Evolving clears conditions (TCG-accurate; off lets
                Poison / Burn carry across evolution)
              </span>
            </label>
          </div>
        )}

        <div className="companion-settings__summary">
          Starting with{" "}
          <strong>{effective.prizeCount}</strong>{" "}
          {effective.prizeCount === 1 ? "prize" : "prizes"}
          {" · "}
          <strong>{effective.benchSize}</strong> bench
          {" · "}
          <strong>
            {effective.allowMega ? "Mega allowed" : "no Mega"}
          </strong>
        </div>
      </div>
    </Modal>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
