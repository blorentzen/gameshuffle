"use client";

/**
 * Turn information modal — reference for what happens in a turn.
 *
 * Mode-driven: the phases come from `mode.turnReference`. Pokémon
 * Mode ships the standard S&V-era six-phase turn (Draw → Play →
 * Trainers → Retreat → Attack → End). Future modes (Magic, Lorcana)
 * will define their own ordered list.
 *
 * Built as a static reference — no actions trigger anything in the
 * board state. Just a way for new players to learn the rhythm of
 * a turn without leaving the play surface.
 */

import { Icon, Modal } from "@empac/cascadeds";
import { useMode } from "@/lib/companion/SessionContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TurnInfoModal({ isOpen, onClose }: Props) {
  const mode = useMode();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${mode.displayName} — How a turn flows`}
      size="large"
      primaryAction={{ label: "Got it", onClick: onClose }}
    >
      <div className="companion-turn-info">
        <p className="companion-turn-info__lede">
          A turn unfolds in order — read top to bottom. You don&apos;t have
          to do everything every turn, but the order matters.
        </p>
        <ol className="companion-turn-info__phases">
          {mode.turnReference.map((phase, i) => (
            <li key={i} className="companion-turn-info__phase">
              <div className="companion-turn-info__phase-head">
                <span className="companion-turn-info__phase-step">
                  {i + 1}
                </span>
                {phase.icon && (
                  <span
                    className="companion-turn-info__phase-icon"
                    aria-hidden="true"
                  >
                    <Icon
                      name={
                        phase.icon as Parameters<typeof Icon>[0]["name"]
                      }
                      size="18"
                    />
                  </span>
                )}
                <span className="companion-turn-info__phase-title">
                  {phase.title}
                </span>
              </div>
              <p className="companion-turn-info__phase-summary">
                {phase.summary}
              </p>
              <ul className="companion-turn-info__phase-actions">
                {phase.actions.map((a, j) => (
                  <li key={j}>{a}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}
