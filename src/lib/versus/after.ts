import "server-only";

/**
 * What follows a race room's step, after the webhook has answered: the Competitive bot's posts (races pick 9A) and
 * chat's "Who wins?" bets (pick 8A, ./bets.ts).
 */

import { postRaceResults, postRaceStart } from "./discord";
import { onRoomEventForBets } from "./bets";
import type { RoomRow } from "./store";
import type { RoomHookBody } from "./types";

export async function afterRoomEvent(room: RoomRow, body: RoomHookBody): Promise<void> {
  const jobs: Promise<unknown>[] = [onRoomEventForBets(room, body)];
  // Trainer battles and tag duels post to Discord later, on the main bot (battle pick 15).
  const posts = room.kind !== "battle" && room.kind !== "tag";
  if (body.event === "started" && posts) jobs.push(postRaceStart(room, body.room));
  if (body.event === "finished" && posts) jobs.push(postRaceResults(room, body.room));
  for (const r of await Promise.allSettled(jobs)) if (r.status === "rejected") console.error("[versus] after step:", r.reason);
}
