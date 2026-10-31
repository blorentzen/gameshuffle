"use client";

/**
 * The attack picker: the Active Pokémon's own attacks (from the card it was
 * placed from), the target, and the damage worked out the way the rulebook
 * orders it (printed damage, card effects, Weakness, Resistance). Rule slips
 * show as a reminder and the attack still goes ahead ("Attack anyway"). A
 * piece placed by hand has no attacks on file, so the damage is entered.
 *
 * Mount-fresh: the parent keys it per opening so choices start over.
 */

import { useState } from "react";
import { Alert, Button, Checkbox, IconButton, Modal, Radio, RadioGroup, Select } from "@empac/cascadeds";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { ALL_POSITIONS, type PlayerId, type SlotPosition } from "@/lib/companion/types";
import { attackDamage, energyCheck, nextPlayer, reminderAttack, type CardAttack } from "@/lib/companion/pokemonRules";
import { pieceFacts, selfDamage } from "@/lib/companion/reminders";
import { EnergyDot } from "./glyphs";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const STEP = 10;

/** "2 Lightning, 1 of any type" */
function costWords(cost: string[]): string {
  if (cost.length === 0) return "Free";
  const counts = new Map<string, number>();
  for (const c of cost) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([type, n]) => (type.toLowerCase() === "colorless" ? `${n} of any type` : `${n} ${type}`)).join(", ");
}

export function AttackModal({ isOpen, onClose }: Props) {
  const { state, dispatch } = useSession();
  const mode = useMode();
  const turn = state.turn;
  const me: PlayerId = turn?.player ?? "p1";
  const them = nextPlayer(me);
  const attacker = findSlot(state, me, "active");
  const attacks = attacker?.rules?.attacks ?? [];

  const targets = ALL_POSITIONS
    .map((position) => findSlot(state, them, position))
    .filter((s): s is NonNullable<typeof s> => !!s?.occupied);

  const [pick, setPick] = useState<string>(() => {
    // Default to the strongest attack the Energy already pays for.
    const ready = attacks.map((a, i) => ({ a, i })).filter(({ a }) => energyCheck(a.cost, attacker?.energies ?? {}).met);
    const best = (ready.length ? ready : attacks.map((a, i) => ({ a, i }))).sort((x, y) => (y.a.damage?.base ?? 0) - (x.a.damage?.base ?? 0))[0];
    return best ? String(best.i) : "manual";
  });
  const [target, setTarget] = useState<SlotPosition | null>(() => targets[0]?.position ?? null);
  const [extra, setExtra] = useState(0);
  const [manual, setManual] = useState(0);
  const [withSelf, setWithSelf] = useState(true);

  if (!attacker?.occupied || !turn) return null;

  const attack: CardAttack | null = pick === "manual" ? null : attacks[Number(pick)] ?? null;
  const defender = target ? findSlot(state, them, target) : null;
  const who = state.playerNames[me];
  const result = attack
    ? attackDamage({ attack, attackerTypes: attacker.rules?.types ?? [], defender: defender?.rules ?? null, defenderIsActive: target === "active", extra })
    : { base: manual, steps: extra ? [{ label: `${extra > 0 ? "+" : ""}${extra} from card effects`, value: Math.max(0, manual + extra) }] : [], total: Math.max(0, manual + extra), varies: false };
  const self = attack ? selfDamage(attack.text) : null;
  const reminder = reminderAttack(turn, who, pieceFacts(attacker, mode), attack);
  const knocksOut = defender?.maxHp != null && defender.damage + result.total >= defender.maxHp;
  const hpLeft = defender?.maxHp != null ? Math.max(0, defender.maxHp - defender.damage - result.total) : null;

  // Weakness and Resistance only apply to the Active: say why nothing changed.
  const typeNote = (() => {
    if (!attack || !defender?.rules || target !== "active" || result.steps.some((s) => /Weakness|Resistance/.test(s.label))) return null;
    const weak = defender.rules.weaknesses.map((w) => w.type).join(" or ");
    return weak ? `No Weakness: ${defender.name ?? "it"} is weak to ${weak}.` : null;
  })();

  const confirm = () => {
    if (!target) return;
    dispatch({
      type: "ATTACK",
      target: { player: them, position: target },
      damage: result.total,
      ...(attack ? { name: attack.name } : {}),
      ...(self && withSelf ? { self: { player: me, position: "active" as const, damage: self } } : {}),
    });
    onClose();
  };

  const label = attack ? attack.name : "Attack";
  const confirmLabel = !target
    ? "Nothing to attack"
    : reminder
      ? "Attack anyway"
      : `${label}: ${result.total} to ${defender?.name ?? "the target"}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${attacker.name ?? "Your Pokémon"} attacks`}
      size="medium"
      footer={
        <div className="companion-attack__footer">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={!target}>{confirmLabel}</Button>
        </div>
      }
    >
      <div className="companion-attack">
        {reminder && <Alert variant="warning" title="Rule check">{reminder}</Alert>}

        {targets.length > 1 && (
          <Select
            floatingLabel="Target"
            fullWidth
            value={target ?? undefined}
            onChange={(v) => setTarget(v as SlotPosition)}
            options={targets.map((t) => ({
              value: t.position,
              label: `${t.name ?? "Unnamed"} (${state.playerNames[them]}'s ${t.position === "active" ? mode.positionLabels.active : mode.positionLabels.bench})`,
            }))}
          />
        )}
        {targets.length === 1 && defender && (
          <p className="companion-attack__target">
            Target: <strong>{defender.name ?? "Unnamed"}</strong>, {state.playerNames[them]}&apos;s {target === "active" ? mode.positionLabels.active : mode.positionLabels.bench}
            {defender.maxHp != null && <> ({defender.maxHp - defender.damage} HP left)</>}
          </p>
        )}
        {targets.length === 0 && <p className="companion-attack__target">{state.playerNames[them]} has no Pokémon in play.</p>}

        {attacks.length > 0 ? (
          <RadioGroup name="attack" label="Attack" value={pick} onChange={setPick}>
            {attacks.map((a, i) => {
              const energy = energyCheck(a.cost, attacker.energies);
              // Wrapped for the cost circles, so the group doesn't wire this
              // Radio up itself (it only clones direct children): we do.
              return (
                <div key={`${a.name}-${i}`} className="companion-attack__option">
                  <Radio
                    name="attack"
                    value={String(i)}
                    checked={pick === String(i)}
                    onChange={(e) => setPick(e.target.value)}
                    label={`${a.name}${a.damage ? ` · ${a.damage.raw}` : ""}`}
                    helperText={[energy.met ? "Energy ready" : `Needs ${energy.missing} more Energy`, a.text].filter(Boolean).join(" · ")}
                  />
                  <span className={`companion-attack__cost${energy.met ? " companion-attack__cost--met" : ""}`} role="img" aria-label={`Costs ${costWords(a.cost)}`}>
                    {a.cost.length === 0
                      ? <span className="companion-attack__free">Free</span>
                      : a.cost.map((c, j) => <EnergyDot key={j} type={c.toLowerCase()} size={18} decorative />)}
                  </span>
                </div>
              );
            })}
          </RadioGroup>
        ) : (
          <div className="companion-attack__stepper">
            <span>
              Damage
              <span className="companion-attack__hint">No card picked for this Pokémon, so enter the attack&apos;s damage.</span>
            </span>
            <span className="companion-attack__stepper-controls">
              <IconButton variant="secondary" size="small" aria-label="10 less damage" onClick={() => setManual((n) => Math.max(0, n - STEP))}><IconMinus size={16} aria-hidden /></IconButton>
              <span className="companion-attack__value">{manual}</span>
              <IconButton variant="secondary" size="small" aria-label="10 more damage" onClick={() => setManual((n) => n + STEP)}><IconPlus size={16} aria-hidden /></IconButton>
            </span>
          </div>
        )}

        <div className="companion-attack__stepper">
          <span>
            Card effects
            <span className="companion-attack__hint">
              {result.varies ? "This attack's text changes its damage: add or take it off here." : "Anything else in play that changes the damage."}
            </span>
          </span>
          <span className="companion-attack__stepper-controls">
            <IconButton variant="secondary" size="small" aria-label="10 less damage from card effects" onClick={() => setExtra((n) => n - STEP)}><IconMinus size={16} aria-hidden /></IconButton>
            <span className="companion-attack__value">{extra > 0 ? `+${extra}` : extra}</span>
            <IconButton variant="secondary" size="small" aria-label="10 more damage from card effects" onClick={() => setExtra((n) => n + STEP)}><IconPlus size={16} aria-hidden /></IconButton>
          </span>
        </div>

        <div className="companion-attack__math" aria-live="polite">
          <span className="companion-attack__total">{result.total}</span>
          <span className="companion-attack__steps">
            {[`${result.base}${attack ? ` ${attack.name}` : ""}`, ...result.steps.map((s) => `${s.label} = ${s.value}`)].join(" · ")}
            {typeNote && <> · {typeNote}</>}
          </span>
        </div>

        {self != null && (
          <Checkbox
            checked={withSelf}
            onChange={(e) => setWithSelf(e.target.checked)}
            label={`Also put ${self} damage on ${attacker.name ?? "this Pokémon"} (the card says so)`}
          />
        )}

        {defender && result.total > 0 && (
          <p className={`companion-attack__outcome${knocksOut ? " companion-attack__outcome--ko" : ""}`}>
            {knocksOut
              ? `Knocks Out ${defender.name ?? "it"}: ${who} takes ${defender.koValue} prize${defender.koValue === 1 ? "" : "s"}.`
              : hpLeft != null
                ? `${defender.name ?? "It"} will have ${hpLeft} HP left.`
                : `${result.total} damage on ${defender.name ?? "it"}.`}
          </p>
        )}
      </div>
    </Modal>
  );
}
