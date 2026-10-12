"use client";

/**
 * A free damage counter tray for the rules page: pick the Pokémon's HP, tap
 * 10, 50 or 100 counters on (or take them off), and see the damage as
 * counters, the HP left and when it's Knocked Out. The same tray the
 * companion opens from a Pokémon's damage. Nothing is saved.
 */

import { useState } from "react";
import { Button, Select } from "@empac/cascadeds";
import { CounterToken } from "@/components/companion/glyphs";
import { countersFor } from "@/lib/companion/looks";
import { TablerIcon } from "@/components/companion/TablerIcon";

const HP_CHOICES = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 300, 310, 320, 330, 340];
const TOKENS = [10, 50, 100] as const;

export function CounterTool() {
  const [hp, setHp] = useState(190);
  const [damage, setDamage] = useState(0);
  const [taking, setTaking] = useState(false);
  const left = Math.max(0, hp - damage);
  const out = damage >= hp;
  const share = Math.round((left / hp) * 100);
  const tokens = countersFor(damage);

  return (
    <div className="rules-tool" role="group" aria-label="Damage counter tray">
      <div className="rules-tool__head">
        <Select
          floatingLabel="Pokémon's HP"
          value={String(hp)}
          onChange={(v) => setHp(Number(v))}
          options={HP_CHOICES.map((n) => ({ value: String(n), label: `${n} HP` }))}
        />
        <div className="rules-tool__hp" aria-live="polite">
          <span className="rules-tool__hp-line"><TablerIcon name="heart" size="18" color="#e8577a" /><strong>{left}</strong> HP left</span>
          <span className="rules-tool__sub">{out ? "Knocked Out: the other player takes their Prize cards." : `${Math.ceil(left / 10)} more counter${Math.ceil(left / 10) === 1 ? "" : "s"} to Knock Out`}</span>
        </div>
      </div>
      <span className={`rules-tool__bar${share <= 25 ? " is-danger" : share <= 50 ? " is-low" : ""}`} aria-hidden="true"><span style={{ width: `${share}%` }} /></span>

      <div className="rules-tool__total">
        <span className="rules-tool__number">{damage}</span>
        <span className="rules-tool__stack" role="img" aria-label={tokens.length ? `Damage as counters: ${tokens.join(", ")}` : "No counters"}>
          {tokens.length ? tokens.map((v, i) => <CounterToken key={i} value={v} size={v === 100 ? 22 : v === 50 ? 19 : 16} label={null} />) : <span className="rules-tool__sub">No counters yet</span>}
        </span>
      </div>

      <div className="rules-tool__mode" role="group" aria-label="Add or take off counters">
        <Button variant={taking ? "ghost" : "secondary"} size="small" aria-pressed={!taking} onClick={() => setTaking(false)}>Add counters</Button>
        <Button variant={taking ? "secondary" : "ghost"} size="small" aria-pressed={taking} onClick={() => setTaking(true)}>Take off</Button>
      </div>
      <div className="rules-tool__tokens">
        {TOKENS.map((v) => (
          <Button
            key={v}
            variant="ghost"
            className="rules-tool__token"
            aria-label={`${taking ? "Take off" : "Add"} ${v} damage`}
            disabled={taking ? damage === 0 : out}
            onClick={() => setDamage((d) => Math.max(0, taking ? d - v : d + v))}
          >
            <CounterToken value={v} size={v === 100 ? 60 : v === 50 ? 52 : 44} label={`${taking ? "−" : "+"}${v}`} />
            <span className="rules-tool__sub">{v === 100 ? "Large" : v === 50 ? "Medium" : "Small"}</span>
          </Button>
        ))}
      </div>
      <div className="rules-tool__foot">
        <Button variant="ghost" size="small" onClick={() => { setDamage(0); setTaking(false); }} disabled={damage === 0}>Start over</Button>
      </div>
    </div>
  );
}
