"use client";

/**
 * For visitors, where a member's own chips sit at the top of a game space's Now tab (journeys picks 2026-11-06, 3A):
 * what a free account keeps here, as dashed empty slots, and Join free (the sign-up sheet).
 */

import { KEEPS } from "@/lib/games/keeps";
import { JoinFreeButton } from "@/components/games/JoinSheet";

export function VisitorKeeps({ space, name }: { space: string; name: string }) {
  const keeps = KEEPS[space] ?? [];
  if (!keeps.length) return null;
  return (
    <section className="space-keeps" aria-label={`What a free account keeps in ${name}`}>
      <ul className="space-keeps__slots">
        {keeps.map((k) => (
          <li key={k.label}><k.icon size={20} stroke={1.8} aria-hidden="true" /><span>{k.label}<small>{k.sub}</small></span></li>
        ))}
      </ul>
      <div className="space-keeps__go">
        <p>Yours, in this space, with a free account.</p>
        <JoinFreeButton space={space} name={name} className="room-btn" />
      </div>
    </section>
  );
}
