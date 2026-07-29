"use client";

/**
 * "Place a piece" form — opens on tap of an empty slot.
 *
 * Minimal Wave 1 surface: optional name + optional max HP + ko value
 * picker (default 1, mode-config-driven options). Wave 4 will polish
 * the ko picker UI (e.g. the Mega ex callout from v1 Scope §10's
 * open UX questions). Until then, the picker is a row of buttons.
 */

import { Modal } from "@empac/cascadeds";
import { useState } from "react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import type { PlayerId, SlotPosition } from "@/lib/companion/types";
import { DEFAULT_SLOT_THEME } from "@/lib/companion/styling";
import type { TcgCard } from "@/lib/scrydex/types";
import { CardPicker } from "./CardPicker";
import { ThemePicker } from "./ThemePicker";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  position: SlotPosition;
  onClose: () => void;
}

/**
 * Form state is mount-fresh — parent keys this component on an
 * open-counter so each open produces a new mount and the inputs
 * reset to defaults without an effect-based reset.
 */
export function PlacePieceModal({ isOpen, player, position, onClose }: Props) {
  const { dispatch, state } = useSession();
  const mode = useMode();
  // Honor the game's `allowMega` rule: hide the 3-prize option when
  // the format forbids Mega ex / VMAX cards.
  const koOptions = state.gameSettings.allowMega
    ? mode.koValueOptions
    : mode.koValueOptions.filter((v) => v < 3);
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState("");
  const [koValue, setKoValue] = useState<number>(mode.koValueDefault);
  const [slotTheme, setSlotTheme] = useState<string>(DEFAULT_SLOT_THEME);

  // Card picked from the collection / catalog (via the shared CardPicker) —
  // prefills the fields + stamps the card's id + art onto the piece. Null once
  // the player clears it or types manually.
  const [pickedCardId, setPickedCardId] = useState<string | null>(null);
  const [pickedCardImage, setPickedCardImage] = useState<string | null>(null);

  const handlePicked = (card: TcgCard) => {
    setName(card.name);
    const hpNum = card.hp ? Number.parseInt(card.hp, 10) : NaN;
    setMaxHp(Number.isNaN(hpNum) ? "" : String(hpNum));
    // Map the card's primary type to a matching slot theme key (lowercase
    // type name); fall back to unstyled if the mode has no such theme.
    const type = card.types?.[0]?.toLowerCase();
    setSlotTheme(
      type && mode.slotThemes.some((t) => t.key === type)
        ? type
        : DEFAULT_SLOT_THEME,
    );
    setPickedCardId(card.id);
    setPickedCardImage(card.images?.small ?? card.images?.medium ?? null);
  };

  const clearPick = () => {
    setPickedCardId(null);
    setPickedCardImage(null);
  };

  const positionLabel =
    position === "active" ? mode.positionLabels.active : mode.positionLabels.bench;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedHp = maxHp.trim() === "" ? null : Number.parseInt(maxHp, 10);
    dispatch({
      type: "PLACE_PIECE",
      player,
      position,
      name: name.trim() || null,
      maxHp: parsedHp != null && !Number.isNaN(parsedHp) ? parsedHp : null,
      koValue,
      slotTheme,
      cardId: pickedCardId,
      cardImage: pickedCardImage,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Place — ${positionLabel}`}>
      <form className="companion-place" onSubmit={handleSubmit}>
        {pickedCardId ? (
          <div className="companion-place__mycards">
            <span className="companion-place__mycards-title">Add a card</span>
            <div className="companion-place__picked">
              {pickedCardImage && (
                /* Stored cross-origin Scrydex URL — render verbatim (as CardImage). */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pickedCardImage}
                  alt=""
                  className="companion-place__picked-art"
                  draggable={false}
                />
              )}
              <div className="companion-place__picked-info">
                <span className="companion-place__picked-label">
                  Selected card
                </span>
                <strong>{name || "Card"}</strong>
                <button
                  type="button"
                  className="companion-place__mycards-clear"
                  onClick={clearPick}
                >
                  Clear card / enter manually
                </button>
              </div>
            </div>
          </div>
        ) : (
          <CardPicker onPick={handlePicked} />
        )}

        <label className="companion-place__field">
          <span>Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Charizard"
            autoFocus
          />
        </label>

        <label className="companion-place__field">
          <span>Max HP (optional)</span>
          <input
            type="number"
            inputMode="numeric"
            value={maxHp}
            onChange={(e) => setMaxHp(e.target.value)}
            placeholder="e.g. 120"
            min={0}
          />
        </label>

        {koOptions.length > 1 && (
          <div className="companion-place__field">
            <span>Card type</span>
            <div className="companion-place__ko">
              {koOptions.map((opt) => {
                const label = mode.koValueLabels[opt] ?? String(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    className={`companion-place__ko-btn${
                      koValue === opt ? " companion-place__ko-btn--selected" : ""
                    }`}
                    onClick={() => setKoValue(opt)}
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

        <details className="companion-place__style">
          <summary className="companion-place__style-summary">
            Pokémon Type (optional)
          </summary>
          <ThemePicker selected={slotTheme} onChange={setSlotTheme} />
        </details>

        <div className="companion-place__actions">
          <button
            type="button"
            className="companion-place__btn companion-place__btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="companion-place__btn companion-place__btn--primary"
          >
            Place
          </button>
        </div>
      </form>
    </Modal>
  );
}
