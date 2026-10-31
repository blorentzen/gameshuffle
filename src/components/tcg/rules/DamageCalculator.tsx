"use client";

/**
 * Damage calculator for the Weakness and Resistance page: the attack's
 * damage, any effects on the attacker, then Weakness and Resistance (only
 * against the Active Pokémon), in the order the rules use. The same maths
 * as the companion's attack picker (attackDamage in pokemonRules).
 */

import { useState } from "react";
import { Checkbox, Input, Select } from "@empac/cascadeds";
import { attackDamage, parseDamage } from "@/lib/companion/pokemonRules";

const TYPES = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal", "Dragon", "Colorless"];
const NONE = "none";

export function DamageCalculator() {
  const [base, setBase] = useState("120");
  const [extra, setExtra] = useState("0");
  const [attacker, setAttacker] = useState("Lightning");
  const [weak, setWeak] = useState("Lightning");
  const [weakValue, setWeakValue] = useState("×2");
  const [resist, setResist] = useState(NONE);
  const [active, setActive] = useState(true);

  const damage = parseDamage(String(Math.max(0, Number.parseInt(base, 10) || 0)));
  const result = attackDamage({
    attack: { name: "Attack", cost: [], damage, text: null },
    attackerTypes: [attacker],
    defender: {
      weaknesses: weak === NONE ? [] : [{ type: weak, value: weakValue }],
      resistances: resist === NONE ? [] : [{ type: resist, value: "-30" }],
    },
    defenderIsActive: active,
    extra: Number.parseInt(extra, 10) || 0,
  });
  const typeOptions = TYPES.map((t) => ({ value: t, label: t }));

  return (
    <div className="rules-tool" role="group" aria-label="Damage calculator">
      <div className="rules-tool__grid">
        <Input floatingLabel="Attack damage" type="number" inputMode="numeric" min={0} step={10} value={base} onChange={(e) => setBase(e.target.value)} fullWidth />
        <Input floatingLabel="Effects on the attacker (+ or −)" type="number" inputMode="numeric" step={10} value={extra} onChange={(e) => setExtra(e.target.value)} fullWidth />
        <Select floatingLabel="Attacker's type" value={attacker} onChange={(v) => setAttacker(String(v))} options={typeOptions} fullWidth />
        <Select floatingLabel="Defender's Weakness" value={weak} onChange={(v) => setWeak(String(v))} options={[{ value: NONE, label: "No Weakness" }, ...typeOptions]} fullWidth />
        <Select floatingLabel="Weakness amount" value={weakValue} onChange={(v) => setWeakValue(String(v))} options={[{ value: "×2", label: "×2 (current cards)" }, { value: "+20", label: "+20 (TCG Pocket)" }]} fullWidth />
        <Select floatingLabel="Defender's Resistance" value={resist} onChange={(v) => setResist(String(v))} options={[{ value: NONE, label: "No Resistance" }, ...typeOptions]} fullWidth />
      </div>
      <Checkbox checked={active} onChange={(e) => setActive(e.target.checked)} label="The defender is the Active Pokémon (Weakness and Resistance only count against the Active)" />
      <div className="rules-tool__total" aria-live="polite">
        <span className="rules-tool__number">{result.total}</span>
        <ol className="rules-tool__steps">
          <li>{result.base} attack damage</li>
          {result.steps.map((s) => <li key={s.label}>{s.label} = {s.value}</li>)}
          {active && result.steps.every((s) => !/Weakness|Resistance/.test(s.label)) && <li>No Weakness or Resistance applies</li>}
          {!active && <li>Benched: no Weakness or Resistance</li>}
        </ol>
      </div>
    </div>
  );
}
