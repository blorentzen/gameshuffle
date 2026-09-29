/**
 * King of the Couch rules (a GameShuffle Original). Pure.
 *
 * One crown per host's group. A finished game decides it:
 *   - no crown yet: the winner claims it;
 *   - the holder played and someone else won: the winner takes it;
 *   - the holder played and won: a defense;
 *   - the holder sat it out: nothing changes.
 * CPUs never hold the crown.
 */

export interface CrownHolder { userId: string | null; name: string }
export interface CrownFinisher { seat: number; place: number; userId: string | null; name: string; isCpu: boolean }

export type CrownOutcome =
  | { kind: "claim"; to: CrownFinisher }
  | { kind: "take"; to: CrownFinisher }
  | { kind: "defend" }
  | { kind: "none" };

/** Whether a finisher is the holder: by account, or by name for a guest holder. */
export function isHolder(h: CrownHolder, f: CrownFinisher): boolean {
  if (h.userId) return f.userId === h.userId;
  return !f.userId && f.name.trim().toLowerCase() === h.name.trim().toLowerCase();
}

export function decideCrown(holder: CrownHolder | null, finishers: CrownFinisher[]): CrownOutcome {
  const people = finishers.filter((f) => !f.isCpu).sort((a, b) => a.place - b.place);
  const winner = people[0];
  if (!winner || people.length < 2) return { kind: "none" };
  if (!holder) return { kind: "claim", to: winner };
  if (!people.some((f) => isHolder(holder, f))) return { kind: "none" };
  return isHolder(holder, winner) ? { kind: "defend" } : { kind: "take", to: winner };
}
