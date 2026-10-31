"use client";

/**
 * Help, on the battle line next to the coin and dice: what every icon means
 * (the key) and how a turn goes (the mode's turn reference). Replaces the old
 * "Turn info" button. Each condition links to its rules page.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, Modal, Tabs } from "@empac/cascadeds";
import { IconHelp } from "@tabler/icons-react";
import { useMode } from "@/lib/companion/SessionContext";
import { AnyEnergy, ConditionTag, CounterToken, EnergyDot, conditionLooks } from "./glyphs";
import { TablerIcon } from "./TablerIcon";

export function HelpButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" size="small" iconBefore={IconHelp} onClick={() => setOpen(true)}>
        Help
      </Button>
      {open && <HelpModal onClose={() => setOpen(false)} />}
    </>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  const mode = useMode();
  return (
    <Modal isOpen onClose={onClose} title="Help" size="large" primaryAction={{ label: "Got it", onClick: onClose }}>
      <Tabs
        variant="pills"
        size="small"
        tabs={[
          { id: "icons", label: "What the icons mean", content: <IconKey /> },
          { id: "turn", label: "How a turn goes", content: <TurnGuide /> },
        ]}
      />
      <p className="companion-help__more">
        All the rules in plain words: <Link href="/pokemon-tcg/rules">{mode.displayName} TCG rules</Link>.
      </p>
    </Modal>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="companion-key__group">
      <h3 className="companion-key__title">{title}</h3>
      {note && <p className="companion-key__note">{note}</p>}
      {children}
    </section>
  );
}

function Row({ symbol, name, meaning }: { symbol: React.ReactNode; name: React.ReactNode; meaning: React.ReactNode }) {
  return (
    <li className="companion-key__row">
      <span className="companion-key__symbol">{symbol}</span>
      <span className="companion-key__text"><strong>{name}</strong> · {meaning}</span>
    </li>
  );
}

export function IconKey() {
  const mode = useMode();
  const types = [...mode.energyTypes.filter((e) => e.key !== "special"), ...mode.slotThemes.filter((t) => !mode.energyTypes.some((e) => e.key === t.key)), ...mode.energyTypes.filter((e) => e.key === "special")];
  return (
    <div className="companion-key">
      <Group title="Energy" note="Circles are always Energy (and a Pokémon's type).">
        <ul className="companion-key__energy">
          {types.map((t) => (
            <li key={t.key}><EnergyDot type={t.key} size={22} label={`${t.label} Energy`} /><span>{t.label}</span></li>
          ))}
        </ul>
      </Group>
      <Group title="Special Conditions" note="Squares are conditions. Only the Active Pokémon has them.">
        <ul className="companion-key__rows">
          {conditionLooks(mode).map((c) => (
            <Row
              key={c.key}
              symbol={<ConditionTag look={c} size={24} decorative />}
              name={c.label}
              meaning={<>{c.effect}{c.learnMore && <> · <Link href={c.learnMore}>More</Link></>}</>}
            />
          ))}
        </ul>
      </Group>
      <Group title={`On a ${mode.displayName}`}>
        <ul className="companion-key__rows">
          <Row symbol={<><TablerIcon name="heart" size="16" color="#ff8fa3" /><b>120</b></>} name="HP left" meaning="what it can still take" />
          <Row symbol={<span className="companion-key__pill"><CounterToken value={10} size={14} label={null} />70</span>} name="Damage" meaning="the counters on it, in 10s" />
          <Row symbol={<><TablerIcon name="cards" size="16" color="#f5c518" /><b>2</b></>} name={mode.winCounterLabel} meaning="what a Knock Out gives the other player" />
          <Row symbol={<><TablerIcon name="arrows-exchange" size="16" /><EnergyDot type="colorless" size={16} label="1 Energy" /></>} name="Retreat" meaning="Energy to pay to retreat" />
          <Row symbol={<><EnergyDot type="fighting" size={16} label="Fighting" /><b>×2</b></>} name="Weakness" meaning="that type does double" />
          <Row symbol={<><EnergyDot type="lightning" size={16} label="Lightning" /><b>−30</b></>} name="Resistance" meaning="that type does 30 less" />
          <Row symbol={<TablerIcon name="tool" size="16" />} name="Tool" meaning="a Tool is attached" />
          <Row symbol={<TablerIcon name="hourglass" size="16" />} name="New" meaning="came into play this turn: it can't evolve yet" />
        </ul>
      </Group>
      <Group title="This turn" note="Green means done this turn. Tap one on the turn bar to change it.">
        <ul className="companion-key__chips">
          <li><AnyEnergy size={14} />Energy</li>
          <li><TablerIcon name="user" size="14" />Supporter</li>
          <li><TablerIcon name="building-stadium" size="14" />Stadium</li>
          <li><TablerIcon name="arrows-exchange" size="14" />Retreat</li>
          <li><TablerIcon name="swords" size="14" />Attack</li>
        </ul>
      </Group>
    </div>
  );
}

function TurnGuide() {
  const mode = useMode();
  return (
    <ol className="companion-turn-info__phases">
      {mode.turnReference.map((phase, i) => (
        <li key={i} className="companion-turn-info__phase">
          <div className="companion-turn-info__phase-head">
            <span className="companion-turn-info__phase-step">{i + 1}</span>
            {phase.icon && (
              <span className="companion-turn-info__phase-icon" aria-hidden="true"><TablerIcon name={phase.icon} size="18" /></span>
            )}
            <span className="companion-turn-info__phase-title">{phase.title}</span>
          </div>
          <p className="companion-turn-info__phase-summary">{phase.summary}</p>
          <ul className="companion-turn-info__phase-actions">
            {phase.actions.map((a, j) => <li key={j}>{a}</li>)}
          </ul>
        </li>
      ))}
    </ol>
  );
}
