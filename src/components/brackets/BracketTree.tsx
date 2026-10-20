"use client";

/**
 * The bracket as a tree with connecting lines, for the free bracket generator
 * and the Swiss tool's top cut (the tournament pages keep their laddered
 * BracketView). Each round is a column; every match in a round gets the same
 * share of the column's height, so a match sits halfway between the two that
 * feed it and the lines can be drawn with CSS. Losers bracket rounds that keep
 * the same count join straight across.
 *
 * Tap a player to send them through; tap them again to take it back. A match
 * against a bye decides itself and is drawn faded. Bracket drawings have no
 * CascadeDS counterpart (like BracketView), so this one is ours; the pick rows
 * are real buttons with aria-pressed.
 */

import { IconCheck, IconTrophy } from "@tabler/icons-react";
import { lbRoundLabel, roundLabel, type Bracket, type BracketGroup, type BracketMatch } from "@/lib/tournaments/bracket";
import { isBye } from "@/lib/brackets/elim";

export interface TreeProps {
  bracket: Bracket;
  /** A player's name from their id. */
  nameOf: (id: string) => string;
  /** The seed number shown before a name, if any. */
  seedOf?: (id: string) => number | null;
  /** Called with the winner's id, or null to take a result back. Leave out for a read-only tree. */
  onPick?: (matchId: string, winner: string | null) => void;
  /** Section headings' level (the page decides). */
  headingLevel?: 2 | 3;
}

const isEmpty = (id: string | null) => !id;
const hasBye = (m: BracketMatch) => isBye(m.a) || isBye(m.b) || (m.group === "wb" && m.round === 0 && (!m.a || !m.b));

/** Match numbers for the matches people play (byes skipped), winners bracket first. */
function numbering(b: Bracket): Map<string, number> {
  const order: BracketGroup[] = ["wb", "lb", "gf"];
  const list = [...b.matches]
    .filter((m) => !hasBye(m))
    .sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group) || x.round - y.round || x.slot - y.slot);
  return new Map(list.map((m, i) => [m.id, i + 1]));
}

export function BracketTree({ bracket, nameOf, seedOf, onPick, headingLevel = 3 }: TreeProps) {
  const numbers = numbering(bracket);
  const H = headingLevel === 2 ? "h2" : "h3";
  const columns = (group: BracketGroup, rounds: number) =>
    Array.from({ length: rounds }, (_, r) => bracket.matches.filter((m) => m.group === group && m.round === r).sort((a, b) => a.slot - b.slot)).filter((c) => c.length);

  const tree = (group: "wb" | "lb", label: (r: number) => string, champion?: string | null) => {
    const cols = columns(group, group === "wb" ? bracket.rounds : bracket.lbRounds ?? 0);
    const joinOut = (i: number) => {
      const next = cols[i + 1]?.length;
      if (next == null) return champion !== undefined ? "straight" : "none";
      return next * 2 === cols[i].length ? "pair" : next === cols[i].length ? "straight" : "none";
    };
    return (
      <div className="bt-tree">
        {cols.map((col, i) => (
          <div key={i} className="bt-col" data-out={joinOut(i)} data-in={i > 0 && joinOut(i - 1) === "pair" ? "pair" : undefined}>
            <p className="bt-col__label">{label(i)}</p>
            <div className="bt-col__slots">
              {col.map((m) => (
                <div key={m.id} className="bt-slot">
                  <Match m={m} num={numbers.get(m.id)} nameOf={nameOf} seedOf={seedOf} onPick={onPick} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {champion !== undefined && (
          <div className="bt-col bt-col--champ">
            <p className="bt-col__label">Champion</p>
            <div className="bt-col__slots">
              <div className="bt-slot">
                <div className={`bt-champ${champion ? " is-set" : ""}`}>
                  <IconTrophy size={18} stroke={1.75} aria-hidden />
                  <span>{champion ? nameOf(champion) : "?"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (bracket.kind !== "double_elim") {
    const final = bracket.matches.find((m) => m.group === "wb" && m.round === bracket.rounds - 1);
    return tree("wb", (r) => roundLabel(r, bracket.rounds), final?.winner ?? null);
  }

  const gf = bracket.matches.filter((m) => m.group === "gf").sort((a, b) => a.round - b.round);
  return (
    <div className="bt-sections">
      <section className="bt-section">
        <H className="bt-section__title">Winners bracket</H>
        {tree("wb", (r) => roundLabel(r, bracket.rounds))}
      </section>
      <section className="bt-section">
        <H className="bt-section__title">Losers bracket</H>
        <p className="bt-section__note">Lose once and you drop down here. Lose again and you&apos;re out.</p>
        {tree("lb", (r) => lbRoundLabel(r, bracket.lbRounds ?? 0))}
      </section>
      <section className="bt-section">
        <H className="bt-section__title">Grand final</H>
        <p className="bt-section__note">The winners bracket champion against the losers bracket champion. If the losers bracket champion wins, one more match decides it.</p>
        <div className="bt-gf">
          {gf.map((m) => (
            <div key={m.id} className="bt-gf__match">
              <p className="bt-col__label">{m.round === 0 ? "Grand final" : "Reset"}</p>
              <Match m={m} num={numbers.get(m.id)} nameOf={nameOf} seedOf={seedOf} onPick={onPick} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Match({ m, num, nameOf, seedOf, onPick }: { m: BracketMatch; num?: number; nameOf: TreeProps["nameOf"]; seedOf?: TreeProps["seedOf"]; onPick?: TreeProps["onPick"] }) {
  const bye = hasBye(m);
  const ready = !!m.a && !!m.b && !bye;
  const row = (side: "a" | "b") => {
    const id = m[side];
    const won = !!m.winner && m.winner === id;
    const lost = !!m.winner && !!id && m.winner !== id;
    if (!id || isBye(id)) {
      const word = isBye(id) || (bye && isEmpty(id)) ? "Bye" : "TBD";
      return <div className="bt-row is-static is-empty"><span className="bt-row__name">{word}</span></div>;
    }
    const seed = seedOf?.(id);
    const inner = (
      <>
        {seed != null && <span className="bt-row__seed" aria-hidden>{seed}</span>}
        <span className="bt-row__name">{nameOf(id)}</span>
        {won && <IconCheck className="bt-row__check" size={16} stroke={2.5} aria-hidden />}
      </>
    );
    const cls = `bt-row${won ? " is-won" : ""}${lost ? " is-lost" : ""}`;
    if (!onPick || !ready) return <div className={`${cls} is-static`}>{inner}</div>;
    return (
      <button
        type="button"
        className={cls}
        aria-pressed={won}
        aria-label={won ? `${nameOf(id)} won${num ? ` match ${num}` : ""}. Press to take it back.` : `${nameOf(id)} wins${num ? ` match ${num}` : ""}`}
        onClick={() => onPick(m.id, won ? null : id)}
      >
        {inner}
      </button>
    );
  };
  return (
    <div className={`bt-match${bye ? " is-bye" : ""}${m.winner ? " is-done" : ""}`}>
      {row("a")}
      {row("b")}
    </div>
  );
}
