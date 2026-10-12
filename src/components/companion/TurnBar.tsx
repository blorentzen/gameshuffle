"use client";

/**
 * The turn bar: who goes first, then whose turn it is, the once-a-turn
 * things (ticked by the board as they happen, or by hand), Attack, and End
 * turn (with the Checkup between turns when anything needs it). Turn tracking
 * is optional: "Not now" leaves the board as a plain counter for this game.
 */

import { useState } from "react";
import { Button, Chip } from "@empac/cascadeds";
import { IconCheck, IconPlayerPlay, IconSwords } from "@tabler/icons-react";
import { useMode, useSession } from "@/lib/companion/SessionContext";
import { findSlot } from "@/lib/companion/state";
import { BENCH_POSITIONS } from "@/lib/companion/types";
import { nextPlayer, type TurnUsed } from "@/lib/companion/pokemonRules";
import { useToast } from "@/components/toast/ToastProvider";
import type { PlayerId } from "@/lib/companion/types";
import { AttackModal } from "./AttackModal";
import { ResolveModal } from "./ResolveModal";
import { AnyEnergy } from "./glyphs";
import { TablerIcon } from "./TablerIcon";

const ONCE_A_TURN: { key: keyof TurnUsed; label: string; icon: React.ReactNode }[] = [
  { key: "energy", label: "Energy", icon: <AnyEnergy size={14} /> },
  { key: "supporter", label: "Supporter", icon: <TablerIcon name="user" size="14" /> },
  { key: "stadium", label: "Stadium", icon: <TablerIcon name="building-stadium" size="14" /> },
  { key: "retreat", label: "Retreat", icon: <TablerIcon name="arrows-exchange" size="14" /> },
];

export function TurnBar() {
  const { state, dispatch, startedAt, live } = useSession();
  const mode = useMode();
  const toast = useToast();
  // "Not now" is for this game only: a new game asks again.
  const [skippedFor, setSkippedFor] = useState<number | null>(null);
  const [attackNonce, setAttackNonce] = useState(0);
  const [attackOpen, setAttackOpen] = useState(false);
  const [checkupOpen, setCheckupOpen] = useState(false);
  const turn = state.turn;
  const names = state.playerNames;

  if (!turn) {
    if (skippedFor === startedAt) {
      return (
        <div className="companion-turnbar companion-turnbar--quiet">
          <Button variant="ghost" size="small" iconBefore={IconPlayerPlay} onClick={() => setSkippedFor(null)}>
            Track turns
          </Button>
        </div>
      );
    }
    const start = (first: PlayerId) => dispatch({ type: "START_TURNS", first });
    return (
      <section className="companion-turnbar companion-turnbar--setup" aria-labelledby="companion-turnbar-title">
        <div className="companion-turnbar__text">
          <h2 id="companion-turnbar-title" className="companion-turnbar__title">Who goes first?</h2>
          <p className="companion-turnbar__note">
            Flip the coin, then pick. GameShuffle keeps the turns and reminds you of the once-a-turn rules.
          </p>
        </div>
        <div className="companion-turnbar__actions">
          <Button variant="secondary" size="small" onClick={() => start("p1")}>{names.p1} goes first</Button>
          <Button variant="secondary" size="small" onClick={() => start("p2")}>{names.p2} goes first</Button>
          <Button variant="ghost" size="small" onClick={() => setSkippedFor(startedAt)}>Not now</Button>
        </div>
      </section>
    );
  }

  const who = names[turn.player];
  const next = names[nextPlayer(turn.player)];
  // In a shared game, the turn's buttons are on the phone whose turn it is.
  const myTurn = !live || live.you === turn.player;
  const attacker = findSlot(state, turn.player, "active");
  const needsCheckup = state.slots.some(
    (s) => s.occupied && (s.conditionA || s.conditionB || mode.extraConditions.some((d) => s.extraConditions[d.key])),
  );

  const endTurn = () => {
    setCheckupOpen(false);
    dispatch({ type: "END_TURN" });
    toast.info(`${next}'s turn.`);
  };

  // After a Knock Out the player promotes a Benched Pokémon (before the next turn goes on).
  const needsActive = (["p1", "p2"] as PlayerId[]).filter(
    (p) => !findSlot(state, p, "active")?.occupied && BENCH_POSITIONS.some((pos) => findSlot(state, p, pos)?.occupied),
  );

  const firstTurnNote =
    turn.number === 1
      ? `${who} went first: no Supporter, no attack and no evolving this turn.`
      : turn.number === 2
        ? `${who}'s first turn: no evolving yet.`
        : null;

  return (
    <section className="companion-turnbar" aria-labelledby="companion-turnbar-title">
      <div className="companion-turnbar__head">
        <h2 id="companion-turnbar-title" className="companion-turnbar__title">
          {who}&apos;s turn <span className="companion-turnbar__number">· Turn {turn.number}</span>
        </h2>
        {!myTurn ? (
          <p className="companion-turnbar__waiting">Waiting for {who}</p>
        ) : (
        <div className="companion-turnbar__actions">
          {!turn.used.attacked && (
            <Button
              variant="secondary"
              size="small"
              iconBefore={IconSwords}
              disabled={!attacker?.occupied}
              title={attacker?.occupied ? undefined : `${who} needs an Active Pokémon to attack`}
              onClick={() => {
                setAttackNonce((n) => n + 1);
                setAttackOpen(true);
              }}
            >
              Attack
            </Button>
          )}
          <Button
            variant={turn.used.attacked ? "primary" : "secondary"}
            size="small"
            onClick={() => (needsCheckup ? setCheckupOpen(true) : endTurn())}
          >
            End turn
          </Button>
        </div>
        )}
      </div>
      <div className="companion-turnbar__chips" role="group" aria-label={`${who}'s once-a-turn plays`}>
        {ONCE_A_TURN.map(({ key, label, icon }) => {
          const used = turn.used[key];
          return (
            <Chip
              key={key}
              size="small"
              clickable={myTurn}
              selected={used}
              variant={used ? "success" : "outline"}
              icon={<span className="companion-turnbar__chip-icon" aria-hidden="true">{used ? <IconCheck size={14} /> : icon}</span>}
              label={label}
              onClick={myTurn ? () => dispatch({ type: "MARK_USED", key, value: !used }) : undefined}
            />
          );
        })}
        {turn.used.attacked && (
          <span className="companion-turnbar__done">Attacked: finish the attack&apos;s effects, then end the turn.</span>
        )}
      </div>
      {needsActive.map((p) => (
        <p key={p} className="companion-turnbar__note companion-turnbar__note--alert">
          {names[p]} needs a new {mode.positionLabels.active} Pokémon: drag one up from the {mode.positionLabels.bench}.
        </p>
      ))}
      {firstTurnNote && <p className="companion-turnbar__note">{firstTurnNote}</p>}

      {attackOpen && <AttackModal key={attackNonce} isOpen onClose={() => setAttackOpen(false)} />}
      {checkupOpen && (
        <ResolveModal
          isOpen
          player="both"
          onClose={() => setCheckupOpen(false)}
          onDone={endTurn}
          doneLabel={`End turn: ${next} is up`}
          intro={`Between turns, check both players' Pokémon. Poison and Burn add damage; Asleep flips a coin. Paralysis wears off at the end of its owner's turn.`}
        />
      )}
    </section>
  );
}
