"use client";

/**
 * A Pokémon's window (tap a Pokémon on the board). Few choices up front:
 * the whole card beside its HP and a damage stepper, facts from the card as
 * icons, condition tags you tap on or off (Active only), the Energy that's
 * attached with Add Energy, and six actions: Attack, Evolve, Tool, To Bench /
 * Make Active, Knock Out, More. Evolve, Tool and More swap the window's
 * content (with Back) instead of stacking sections.
 * Knock Out and Discard are one tap, so each says what happened with Undo.
 */

import { useState } from "react";
import { Button, Chip, IconButton, Input, Modal, Radio, RadioGroup } from "@empac/cascadeds";
import { IconArrowDown, IconArrowLeft, IconArrowUp, IconDots, IconMinus, IconPlus, IconSwords, IconTool, IconX } from "@tabler/icons-react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { DEFAULT_SLOT_THEME } from "@/lib/companion/styling";
import { prizeValue, rulesFromCard } from "@/lib/companion/pokemonRules";
import { BENCH_POSITIONS, type PlayerId, type SlotPosition } from "@/lib/companion/types";
import type { TcgCard } from "@/lib/scrydex/types";
import { AttackModal } from "./AttackModal";
import { CardPicker } from "./CardPicker";
import { EnergyPicker } from "./EnergyPicker";
import { ConditionTag, EnergyDot, conditionLooks } from "./glyphs";
import { ThemePicker } from "./ThemePicker";
import { TablerIcon } from "./TablerIcon";
import { useCompanionToasts } from "./ToastProvider";

interface Props {
  isOpen: boolean;
  player: PlayerId;
  position: SlotPosition;
  onClose: () => void;
}

type View = "main" | "evolve" | "tool" | "more";

export function SlotActionsModal({ isOpen, player, position, onClose }: Props) {
  const { state, dispatch, undo } = useSession();
  const toasts = useCompanionToasts();
  const mode = useMode();
  const slot = findSlot(state, player, position);
  const [view, setView] = useState<View>("main");
  const [energyOpen, setEnergyOpen] = useState(false);
  const [attackOpen, setAttackOpen] = useState(false);

  if (!slot || !slot.occupied) {
    // CDS Modal needs to render even when closed (animation).
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const isActive = position === "active";
  const where = isActive ? mode.positionLabels.active : mode.positionLabels.bench;
  const owner = state.playerNames[player];
  const other = state.playerNames[player === "p1" ? "p2" : "p1"];
  const name = slot.name ?? "Unnamed";
  const turn = state.turn;
  const meta = (patch: Omit<Extract<Parameters<typeof dispatch>[0], { type: "UPDATE_PIECE_META" }>, "type" | "player" | "position">) =>
    dispatch({ type: "UPDATE_PIECE_META", player, position, ...patch });
  const close = () => { setView("main"); onClose(); };

  const handleKnockout = () => {
    dispatch({ type: "KNOCKOUT", player, position });
    close();
    toasts.push({ variant: "info", message: `${slot.name || "That Pokémon"} was Knocked Out.`, action: { label: "Undo", onClick: undo } });
  };
  const handleDiscard = () => {
    dispatch({ type: "REMOVE_PIECE", player, position });
    close();
    toasts.push({ variant: "info", message: `${slot.name || "That Pokémon"} was discarded.`, action: { label: "Undo", onClick: undo } });
  };
  const moveTarget: SlotPosition = isActive
    ? BENCH_POSITIONS.slice(0, state.gameSettings.benchSize).find((p) => !findSlot(state, player, p)?.occupied) ?? "bench_1"
    : "active";
  const handleMove = () => {
    dispatch({ type: "MOVE_PIECE", player, from: position, to: moveTarget });
    close();
  };

  // Evolve = swap the card: name, HP, art, type, attacks and prizes change;
  // damage and Energy stay; Special Conditions clear.
  const handleEvolve = (card: TcgCard) => {
    const hpNum = card.hp ? Number.parseInt(card.hp, 10) : NaN;
    const type = card.types?.[0]?.toLowerCase();
    meta({
      name: card.name,
      maxHp: Number.isNaN(hpNum) ? null : hpNum,
      slotTheme: type && mode.slotThemes.some((t) => t.key === type) ? type : DEFAULT_SLOT_THEME,
      cardId: card.id,
      // Scrydex URLs are stored as returned; medium is the largest our terms allow.
      cardImage: card.images?.medium ?? card.images?.small ?? null,
      rules: rulesFromCard(card),
      koValue: prizeValue(card.subtypes ?? []),
      evolved: true,
    });
    setView("main");
    toasts.push({ variant: "success", message: `${name} evolved into ${card.name}.`, action: { label: "Undo", onClick: undo } });
  };

  const commitName = (next: string) => { const t = next.trim(); if ((t || null) !== slot.name) meta({ name: t || null }); };
  const commitMaxHp = (next: string) => {
    const t = next.trim();
    if (!t) { if (slot.maxHp != null) meta({ maxHp: null }); return; }
    const n = Number.parseInt(t, 10);
    if (Number.isFinite(n) && n >= 0 && n !== slot.maxHp) meta({ maxHp: n });
  };
  const commitTool = (next: string) => { const t = next.trim().slice(0, 40); if ((t || null) !== (slot.tool ?? null)) meta({ tool: t || null }); };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); };

  const hpLeft = slot.maxHp != null ? Math.max(0, slot.maxHp - slot.damage) : null;
  const hpShare = hpLeft != null && slot.maxHp ? Math.round((hpLeft / slot.maxHp) * 100) : 0;
  const energies = mode.energyTypes.map((def) => ({ def, count: slot.energies[def.key] ?? 0 })).filter((e) => e.count > 0);
  const rules = slot.rules;
  const canAttack = isActive && !!turn && turn.player === player && !turn.used.attacked;
  const back = (
    <Button variant="ghost" size="small" iconBefore={IconArrowLeft} onClick={() => setView("main")}>Back</Button>
  );

  const body = (() => {
    if (view === "evolve") {
      return (
        <div className="companion-actions__view">
          {back}
          <p className="companion-actions__hint">Pick the card it evolves into. Damage and Energy stay; Special Conditions clear.</p>
          <CardPicker onPick={handleEvolve} label="Your cards" />
        </div>
      );
    }
    if (view === "tool") {
      return (
        <div className="companion-actions__view">
          {back}
          <Input
            key={`tool-${slot.tool ?? ""}`}
            floatingLabel="Tool attached"
            fullWidth
            defaultValue={slot.tool ?? ""}
            maxLength={40}
            placeholder="e.g. Defiance Band"
            onBlur={(e) => commitTool(e.target.value)}
            onKeyDown={blurOnEnter}
          />
          <p className="companion-actions__hint">One Tool a Pokémon. It goes to the discard pile with the Pokémon.</p>
          {slot.tool && <Button variant="ghost" size="small" onClick={() => meta({ tool: null })}>Take the Tool off</Button>}
        </div>
      );
    }
    if (view === "more") {
      return (
        <div className="companion-actions__view">
          {back}
          <div className="companion-actions__fields">
            <Input key={`name-${slot.name ?? ""}`} floatingLabel="Name" fullWidth defaultValue={slot.name ?? ""} placeholder="e.g. Charizard" onBlur={(e) => commitName(e.target.value)} onKeyDown={blurOnEnter} />
            <Input key={`hp-${slot.maxHp ?? ""}`} floatingLabel="HP" fullWidth type="number" inputMode="numeric" min={0} defaultValue={slot.maxHp != null ? String(slot.maxHp) : ""} placeholder="e.g. 150" onBlur={(e) => commitMaxHp(e.target.value)} onKeyDown={blurOnEnter} />
          </div>
          {mode.koValueOptions.length > 1 && (
            <RadioGroup name={`prizes-${player}-${position}`} label={`${mode.winCounterLabel} if Knocked Out`} orientation="horizontal" value={String(slot.koValue)} onChange={(v) => meta({ koValue: Number(v) })}>
              {mode.koValueOptions.map((opt) => <Radio key={opt} value={String(opt)} label={`${opt}: ${mode.koValueLabels[opt] ?? opt}`} />)}
            </RadioGroup>
          )}
          <ThemePicker selected={slot.slotTheme} onChange={(slotTheme) => dispatch({ type: "STYLE_SLOT", player, position, slotTheme })} />
          <Button variant="ghost" size="small" onClick={handleDiscard}>Discard it (no {mode.winCounterLabel.toLowerCase()})</Button>
        </div>
      );
    }
    return (
      <div className="companion-actions">
        <div className={`companion-actions__top${slot.cardImage ? " companion-actions__top--card" : ""}`}>
          {slot.cardImage && (
            /* Stored cross-origin Scrydex URL, rendered as returned. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.cardImage} alt={`${name} card`} className="companion-actions__card" draggable={false} />
          )}
          <div className="companion-actions__vitals">
            {hpLeft != null ? (
              <div className="companion-actions__hp">
                <span className="companion-actions__hp-value"><TablerIcon name="heart" size="20" color="#ff8fa3" />{hpLeft}<span className="companion-actions__hp-max">/{slot.maxHp}</span></span>
                <span className="companion-actions__hp-bar" aria-hidden="true"><span style={{ width: `${hpShare}%` }} /></span>
              </div>
            ) : (
              <p className="companion-actions__hint">No HP set: add it under More and the board will Knock it Out at 0.</p>
            )}
            <ul className="companion-actions__facts" aria-label="From the card">
              <li><TablerIcon name="cards" size="16" color="#e0a800" /><span>Worth {slot.koValue} {(slot.koValue === 1 ? mode.winCounterLabel.replace(/s$/, "") : mode.winCounterLabel).toLowerCase()}</span></li>
              {rules && (
                <li>
                  <TablerIcon name="arrows-exchange" size="16" />
                  <span>Retreat</span>
                  {rules.retreat === 0 ? <span>free</span> : Array.from({ length: rules.retreat }, (_, i) => <EnergyDot key={i} type="colorless" size={16} decorative />)}
                  <span className="sr-only">{rules.retreat} Energy</span>
                </li>
              )}
              {rules?.weaknesses.map((w) => <li key={`w-${w.type}`}><EnergyDot type={w.type} size={16} label={w.type} /><span>Weak {w.value}</span></li>)}
              {rules?.resistances.map((r) => <li key={`r-${r.type}`}><EnergyDot type={r.type} size={16} label={r.type} /><span>Resists {r.value}</span></li>)}
              {slot.tool && <li><TablerIcon name="tool" size="16" /><span>{slot.tool}</span></li>}
            </ul>
          </div>
        </div>

        <div className="companion-actions__group" role="group" aria-label={`Damage on ${name}`}>
          <span className="companion-actions__label">Damage</span>
          <div className="companion-actions__damage-row">
            <IconButton variant="secondary" size="medium" aria-label="Take off 10 damage" disabled={slot.damage === 0} onClick={() => dispatch({ type: "ADJUST_DAMAGE", player, position, delta: -10 })}><IconMinus size={18} aria-hidden /></IconButton>
            <span className="companion-actions__damage-value" aria-live="polite">{slot.damage}</span>
            <IconButton variant="secondary" size="medium" aria-label="Add 10 damage" onClick={() => dispatch({ type: "ADJUST_DAMAGE", player, position, delta: 10 })}><IconPlus size={18} aria-hidden /></IconButton>
            <Button variant="secondary" size="small" aria-label="Add 50 damage" onClick={() => dispatch({ type: "ADJUST_DAMAGE", player, position, delta: 50 })}>+50</Button>
            <Button variant="secondary" size="small" aria-label="Add 100 damage" onClick={() => dispatch({ type: "ADJUST_DAMAGE", player, position, delta: 100 })}>+100</Button>
          </div>
        </div>

        {isActive && (
          <div className="companion-actions__group">
            <span className="companion-actions__label">Conditions</span>
            <div className="companion-actions__conds">
              {conditionLooks(mode).map((c) => {
                const on = c.key === "a" ? slot.conditionA : c.key === "b" ? slot.conditionB : !!slot.extraConditions[c.key];
                return (
                  <Chip
                    key={c.key}
                    size="small"
                    clickable
                    selected={on}
                    variant="outline"
                    className="companion-actions__cond"
                    style={{ "--cond-color": c.color } as React.CSSProperties}
                    icon={<ConditionTag look={c} size={20} off={!on} decorative />}
                    label={c.label}
                    onClick={() =>
                      c.key === "a" || c.key === "b"
                        ? dispatch({ type: "TOGGLE_CONDITION", player, position, which: c.key, value: !on })
                        : dispatch({ type: "TOGGLE_EXTRA_CONDITION", player, position, key: c.key, value: !on })
                    }
                  />
                );
              })}
            </div>
          </div>
        )}

        {mode.energyTypes.length > 0 && (
          <div className="companion-actions__group">
            <span className="companion-actions__label">Energy</span>
            <div className="companion-actions__energy">
              {energies.map(({ def, count }) => (
                <span key={def.key} className="companion-actions__energy-chip2">
                  <EnergyDot type={def.key} size={24} label={def.label} />
                  <span className="companion-actions__energy-n">{count}</span>
                  <IconButton variant="tertiary" size="small" aria-label={`Remove one ${def.label} Energy`} onClick={() => dispatch({ type: "ADJUST_ENERGY", player, position, energyKey: def.key, delta: -1 })}>
                    <IconMinus size={14} aria-hidden />
                  </IconButton>
                </span>
              ))}
              <Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setEnergyOpen(true)}>Add Energy</Button>
            </div>
          </div>
        )}

        <div className="companion-actions__tiles">
          {canAttack && <Button variant="primary" className="companion-actions__tile" iconBefore={IconSwords} onClick={() => setAttackOpen(true)}>Attack</Button>}
          <Button variant="secondary" className="companion-actions__tile" iconBefore={IconArrowUp} onClick={() => setView("evolve")}>Evolve</Button>
          <Button variant="secondary" className="companion-actions__tile" iconBefore={IconTool} onClick={() => setView("tool")}>Tool</Button>
          <Button variant="secondary" className="companion-actions__tile" iconBefore={isActive ? IconArrowDown : IconArrowUp} onClick={handleMove}>{isActive ? `To ${mode.positionLabels.bench}` : `Make ${mode.positionLabels.active}`}</Button>
          <Button variant="secondary" className="companion-actions__tile companion-actions__tile--danger" iconBefore={IconX} onClick={handleKnockout} aria-label={`Knock Out ${name}: ${slot.koValue} ${mode.winCounterLabel.toLowerCase()} to ${other}`}>Knock Out</Button>
          <Button variant="secondary" className="companion-actions__tile" iconBefore={IconDots} onClick={() => setView("more")}>More</Button>
        </div>
      </div>
    );
  })();

  return (
    <>
      <Modal isOpen={isOpen} onClose={close} title={name} size="medium">
        <p className="companion-actions__where">{owner}&apos;s {where}{turn ? ` · Turn ${turn.number}` : ""}</p>
        {body}
      </Modal>
      {energyOpen && <EnergyPicker isOpen player={player} position={position} onClose={() => setEnergyOpen(false)} />}
      {attackOpen && <AttackModal isOpen onClose={() => { setAttackOpen(false); close(); }} />}
    </>
  );
}
