"use client";

/**
 * Put a Pokémon in a slot: card first. Your cards (or any card, searched) as
 * art tiles; pick one and its name, HP, type, attacks and prizes come from the
 * card. "Add one by name" is the fallback for a card that isn't handy (and
 * the only way for guests): name, HP, prizes and type by hand.
 *
 * Mount-fresh: the parent mounts it per opening, so choices start clean.
 */

import { useState } from "react";
import { Button, Input, Modal, Radio, RadioGroup } from "@empac/cascadeds";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { BENCH_POSITIONS, type PlayerId, type SlotPosition } from "@/lib/companion/types";
import { DEFAULT_SLOT_THEME } from "@/lib/companion/styling";
import { prizeValue, rulesFromCard } from "@/lib/companion/pokemonRules";
import type { TcgCard } from "@/lib/scrydex/types";
import { CardPicker } from "./CardPicker";
import { ThemePicker } from "./ThemePicker";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  position: SlotPosition;
  onClose: () => void;
}

export function PlacePieceModal({ isOpen, player, position, onClose }: Props) {
  const { dispatch, state, isAuthenticated } = useSession();
  const mode = useMode();
  // The format's allowMega rule hides the 3-prize option when Megas are out.
  const koOptions = state.gameSettings.allowMega ? mode.koValueOptions : mode.koValueOptions.filter((v) => v < 3);
  const [picked, setPicked] = useState<TcgCard | null>(null);
  const [byName, setByName] = useState(!isAuthenticated);
  const [name, setName] = useState("");
  const [maxHp, setMaxHp] = useState("");
  const [koValue, setKoValue] = useState<number>(mode.koValueDefault);
  const [slotTheme, setSlotTheme] = useState<string>(DEFAULT_SLOT_THEME);

  const isActive = position === "active";
  const where = isActive ? mode.positionLabels.active : mode.positionLabels.bench;
  const owner = state.playerNames[player];
  const benchCount = BENCH_POSITIONS.slice(0, state.gameSettings.benchSize).filter((p) => findSlot(state, player, p)?.occupied).length;

  const themeFor = (card: TcgCard) => {
    const type = card.types?.[0]?.toLowerCase();
    return type && mode.slotThemes.some((t) => t.key === type) ? type : DEFAULT_SLOT_THEME;
  };

  const placeCard = (card: TcgCard) => {
    const hp = card.hp ? Number.parseInt(card.hp, 10) : NaN;
    const prizes = prizeValue(card.subtypes ?? []);
    dispatch({
      type: "PLACE_PIECE",
      player,
      position,
      name: card.name,
      maxHp: Number.isNaN(hp) ? null : hp,
      koValue: koOptions.includes(prizes) ? prizes : Math.max(...koOptions),
      slotTheme: themeFor(card),
      cardId: card.id,
      // Medium is the largest our Scrydex terms allow; stored as returned.
      cardImage: card.images?.medium ?? card.images?.small ?? null,
      rules: rulesFromCard(card),
    });
    window.plausible?.("Companion Card Played", { props: { from: "card" } });
    onClose();
  };

  const placeByName = () => {
    const hp = maxHp.trim() === "" ? null : Number.parseInt(maxHp, 10);
    dispatch({
      type: "PLACE_PIECE",
      player,
      position,
      name: name.trim() || null,
      maxHp: hp != null && !Number.isNaN(hp) ? hp : null,
      koValue,
      slotTheme,
    });
    window.plausible?.("Companion Card Played", { props: { from: "manual" } });
    onClose();
  };

  const title = isActive ? "Choose the Active Pokémon" : `Put a Pokémon on the ${where}`;
  const sub = isActive ? `${owner}'s ${where}` : `${owner}'s ${where} · ${benchCount} of ${state.gameSettings.benchSize}`;
  const cta = byName
    ? `Put ${name.trim() || "it"} ${isActive ? "in the Active spot" : `on the ${where}`}`
    : picked
      ? `Put ${picked.name} ${isActive ? "in the Active spot" : `on the ${where}`}`
      : "Pick a card";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="medium"
      footer={
        <div className="companion-place2__footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!byName && !picked} onClick={() => (byName ? placeByName() : picked && placeCard(picked))}>{cta}</Button>
        </div>
      }
    >
      <div className="companion-place2">
        <p className="companion-place2__sub">{sub}</p>
        {!byName ? (
          <>
            <CardPicker onPick={setPicked} selectedId={picked?.id ?? null} />
            <p className="companion-place2__switch">
              No card handy? <Button variant="ghost" size="small" onClick={() => setByName(true)}>Add one by name</Button>
            </p>
            <p className="companion-place2__note">HP, type, attacks and prizes come from the card.</p>
          </>
        ) : (
          <>
            <div className="companion-place2__fields">
              <Input floatingLabel="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Charizard" />
              <Input floatingLabel="HP" fullWidth type="number" inputMode="numeric" min={0} value={maxHp} onChange={(e) => setMaxHp(e.target.value)} placeholder="e.g. 120" />
            </div>
            {koOptions.length > 1 && (
              <RadioGroup name={`place-prizes-${player}-${position}`} label={`${mode.winCounterLabel} if Knocked Out`} orientation="horizontal" value={String(koValue)} onChange={(v) => setKoValue(Number(v))}>
                {koOptions.map((opt) => <Radio key={opt} value={String(opt)} label={`${opt}: ${mode.koValueLabels[opt] ?? opt}`} />)}
              </RadioGroup>
            )}
            <ThemePicker selected={slotTheme} onChange={setSlotTheme} />
            {isAuthenticated && (
              <p className="companion-place2__switch">
                Have the card? <Button variant="ghost" size="small" onClick={() => setByName(false)}>Pick it instead</Button>
              </p>
            )}
            {!isAuthenticated && <p className="companion-place2__note">Sign in to pick from every card, with HP, attacks and prizes filled in.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
