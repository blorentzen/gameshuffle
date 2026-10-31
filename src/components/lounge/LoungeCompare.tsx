"use client";

/**
 * The compare form (lookup picks, 2026-10-21): two labeled name fields and the game, sent to
 * /lounge/find?vs=, which opens the head-to-head. Opened from the lounge search ("Compare two
 * players") and from a player's header ("Compare", with that player filled in). A plain GET form,
 * so it works the same with or without scripts once open.
 */

import { useId, useState, type ReactNode } from "react";
import { Button, FormField, Input, Modal } from "@empac/cascadeds";
import { IconArrowsLeftRight } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { MMR_GAMES, MMR_GAME_IDS, type MmrGame } from "@/lib/mmr/rules";
import { EVENTS, track } from "@/lib/analytics/events";

export function LoungeCompare({ first = "", game: startGame = "mkworld12p", from, trigger }: {
  /** The first player, filled in (a player's own page). */
  first?: string;
  game?: MmrGame;
  /** Where it was opened, for analytics. */
  from: "lounge" | "player";
  /** How the opener looks: a text button under the search, or a header button. */
  trigger: "link" | "button";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [a, setA] = useState(first);
  const [b, setB] = useState("");
  const [game, setGame] = useState<MmrGame>(startGame);
  const formId = `${id}-form`;

  const opener: ReactNode = trigger === "button"
    ? <Button variant="secondary" iconBefore={IconArrowsLeftRight} onClick={() => setOpen(true)}>Compare</Button>
    : (
      <button type="button" className="lounge-textbtn" onClick={() => setOpen(true)}>
        <IconArrowsLeftRight size={18} stroke={2} aria-hidden="true" />
        Compare two players
      </button>
    );

  return (
    <>
      {opener}
      {open && (
        <Modal
          isOpen
          onClose={() => setOpen(false)}
          title="Compare two players"
          size="small"
          footer={(
            <div className="lounge-compare-modal__foot">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" type="submit" form={formId} disabled={!a.trim() || !b.trim()}>Compare</Button>
            </div>
          )}
        >
          <form id={formId} action="/lounge/find" method="get" className="lounge-compare-modal" onSubmit={() => track(EVENTS.loungeCompareUsed, { from })}>
            <p className="lounge-compare-modal__note">Every event the two shared this season, as opponents and as teammates.</p>
            <FormField label="First player" htmlFor={`${id}-a`} helperText="A lounge name">
              <Input name="name" value={a} onChange={(e) => setA(e.target.value)} maxLength={40} required autoComplete="off" fullWidth autoFocus={!first} />
            </FormField>
            <FormField label="Second player" htmlFor={`${id}-b`} helperText="A lounge name">
              <Input name="vs" value={b} onChange={(e) => setB(e.target.value)} maxLength={40} required autoComplete="off" fullWidth autoFocus={!!first} />
            </FormField>
            <FormField label="Game" htmlFor={`${id}-g`}>
              <Select value={game} onChange={(v) => setGame(String(v) as MmrGame)} options={MMR_GAME_IDS.map((g) => ({ value: g, label: MMR_GAMES[g].label }))} fullWidth />
            </FormField>
            <input type="hidden" name="game" value={game} />
          </form>
        </Modal>
      )}
    </>
  );
}
