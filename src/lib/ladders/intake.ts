import "server-only";

/**
 * A table coming in, from Discord or the web (GS Ranked; automation picks 1 to 3): keeps the results screenshot (so
 * the staff page can show it beside the table), what we read from it, and who missed races, then runs the checks.
 */

import { editDistance } from "@/lib/lounge/lookup";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { parseMissed } from "./discipline";
import { assessTable } from "./staffStore";
import { getTable, tableRoom, updateTable, type LadderTable } from "./store";
import type { AutoCheck } from "./autoVerify";
import type { Ladder } from "./types";

export async function intakeTable(ladder: Ladder, table: LadderTable, input: { shot?: { bytes: Uint8Array; contentType: string } | null; readBody?: string | null; missedText?: string | null }): Promise<{ table: LadderTable; check: AutoCheck; notes: string[] }> {
  const notes: string[] = [];
  let shotUrl: string | null = null;
  if (input.shot && isR2Configured() && input.shot.bytes.length <= 8 * 1024 * 1024) {
    const ext = input.shot.contentType.includes("png") ? "png" : input.shot.contentType.includes("webp") ? "webp" : "jpg";
    shotUrl = await uploadToR2(`ranked/${ladder.id}/${table.id}.${ext}`, input.shot.bytes, input.shot.contentType).catch((err) => { console.error("[ranked] screenshot upload failed:", err); return null; });
  }
  let missed: { key: string; races: number }[] = [];
  if (input.missedText?.trim() && ladder.kind === "race") {
    const room = tableRoom(ladder, table);
    const res = parseMissed(input.missedText, room.teams.flatMap((t) => t.players.map((p) => ({ key: p.key, name: p.name }))), editDistance);
    missed = res.missed;
    if (res.unread.length) notes.push(`Couldn't match these to players in the room: ${res.unread.slice(0, 4).join(", ")}.`);
  }
  await updateTable(table.id, { shotUrl, readBody: input.readBody ?? null, missed });
  const fresh = (await getTable(table.id))!;
  const check = await assessTable(ladder, fresh);
  return { table: (await getTable(table.id))!, check, notes };
}
