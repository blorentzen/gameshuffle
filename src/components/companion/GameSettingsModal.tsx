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

import { Card, Modal, Select, Switch } from "@empac/cascadeds";
import { useState } from "react";
import { useSession } from "@/lib/companion/SessionContext";
import { JoinByCode } from "./JoinByCode";
import { DeckChoice } from "./DeckChoice";
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
  /** Closing without starting (back to the resume list). Without it, closing starts the game with the picked format, since there's nothing behind this window. */
  onClose?: () => void;
}

export function GameSettingsModal({ isOpen, onApplied, onClose }: Props) {
  const { dispatch, live } = useSession();
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
      onClose={onClose ?? handleConfirm}
      title="New Game"
      size="large"
      primaryAction={{ label: "Start game", onClick: handleConfirm }}
    >
      <div className="companion-settings">
        <p className="companion-settings__lede">
          Pick a format to start with. You can change rules anytime by
          tapping Reset Game.
        </p>

        {/* One CDS Card per format, laid out like the site's other icon tiles: icon on top, then title and text. */}
        <div className="companion-settings__formats" role="group" aria-label="Format">
          {GAME_FORMATS.map((def) => (
            <Card
              key={def.key}
              variant="outlined"
              padding="small"
              interactive
              selected={def.key === format}
              onClick={() => setFormat(def.key)}
              className="companion-settings__format"
            >
              <span className="companion-settings__format-icon" aria-hidden>
                <TablerIcon name={def.icon} size="20" />
              </span>
              <span className="companion-settings__format-body">
                <span className="companion-settings__format-label">{def.label}</span>
                <span className="companion-settings__format-desc">{def.description}</span>
              </span>
            </Card>
          ))}
        </div>

        <DeckChoice />

        {format === "custom" && (
          <div className="companion-settings__custom">
            <div className="companion-settings__custom-title">Custom rules</div>

            <div className="companion-settings__fields">
              <Select
                floatingLabel="Prize cards per player"
                value={String(custom.prizeCount)}
                onChange={(v) => setCustom((c) => ({ ...c, prizeCount: clamp(Number(v) || 1, 1, 12) }))}
                options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              />
              <Select
                floatingLabel="Bench slots per player"
                value={String(custom.benchSize)}
                onChange={(v) => setCustom((c) => ({ ...c, benchSize: clamp(Number(v) || 1, 1, 5) }))}
                options={Array.from({ length: 5 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
              />
            </div>
            <Switch
              checked={custom.allowMega}
              onChange={(e) => setCustom((c) => ({ ...c, allowMega: e.target.checked }))}
              label="Allow Mega ex / VMAX (3-prize cards)"
            />
            <Switch
              checked={custom.evolutionClearsConditions}
              onChange={(e) => setCustom((c) => ({ ...c, evolutionClearsConditions: e.target.checked }))}
              label="Evolving clears conditions"
              helperText="Accurate to the card game. Off lets Poison and Burn carry across evolution."
            />
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
        {/* Play together: the opponent at the same table joins the host's game instead. */}
        {!live && <JoinByCode compact />}
      </div>
    </Modal>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
