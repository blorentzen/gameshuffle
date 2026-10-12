"use client";

/**
 * Play together: the strip under the turn bar in a shared game. Both players
 * (green when their phone is here), the game code, and the last move from
 * either phone, so nobody wonders what just changed. When the game ends, it
 * offers to keep the board on this phone.
 */

import { useState } from "react";
import { Alert, Button } from "@empac/cascadeds";
import { IconUserPlus } from "@tabler/icons-react";
import { useSession } from "@/lib/companion/SessionContext";
import { spacedCode, type Seat } from "@/lib/companion/liveRules";
import { PlayTogetherModal } from "./PlayTogetherModal";

export function LiveStrip() {
  const { live, leaveLive } = useSession();
  const [inviteOpen, setInviteOpen] = useState(false);
  if (!live) return null;

  const order: Seat[] = live.you === "p1" ? ["p1", "p2"] : ["p2", "p1"];
  const waiting = !live.seats.p2.joined;

  return (
    <section className="companion-live" aria-label="Shared game">
      <div className="companion-live__row">
        <ul className="companion-live__who">
          {order.map((seat) => {
            const s = live.seats[seat];
            const mine = seat === live.you;
            const here = s.joined && (mine || !s.away);
            return (
              <li key={seat} className="companion-live__player">
                <span className={`companion-live__dot${here ? "" : " companion-live__dot--away"}`} aria-hidden="true" />
                {s.joined ? (
                  <span>
                    {s.name}
                    {mine ? " (you)" : s.away ? " · away" : ""}
                  </span>
                ) : (
                  <span className="companion-live__muted">Waiting for your opponent</span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="companion-live__end">
          {waiting && live.host && !live.ended && (
            <Button variant="secondary" size="small" iconBefore={IconUserPlus} onClick={() => setInviteOpen(true)}>
              Invite
            </Button>
          )}
          <span className="companion-live__code" title="Game code">
            <span className="sr-only">Game code </span>
            {spacedCode(live.code)}
          </span>
        </div>
      </div>
      <p className="companion-live__last" aria-live="polite">
        {live.lastMove ? live.lastMove.text : "Moves on either phone show here."}
      </p>
      {live.ended && (
        <Alert variant="info" title={live.ended === "ended" ? "This shared game has ended" : "This phone isn't in the game any more"}>
          <div className="companion-live__ended">
            <span>The board stays as it is. Keep playing on this phone, or start a new game from the menu.</span>
            <Button variant="secondary" size="small" onClick={leaveLive}>Keep playing on this phone</Button>
          </div>
        </Alert>
      )}
      {inviteOpen && <PlayTogetherModal isOpen onClose={() => setInviteOpen(false)} />}
    </section>
  );
}
