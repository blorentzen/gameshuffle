import "server-only";

/**
 * Table actions from the staff page (name, web and docs picks 2026-11-01, picks 4A and 6A): verify (as typed, or with
 * the screenshot's numbers), send back and undo, each logged and shown on the table's Discord card too, so whatever
 * staff press on the web shows in Discord and the other way round.
 *
 * Cards: a verified card always posts (the results channel is where players see their numbers), a send back always
 * posts (it has to reach the reporter), and an undo changes the card when there is one.
 */

import { withReadNumbers } from "./autoVerify";
import { postCard } from "./discord";
import { parseRoom } from "./rules";
import { logAction, type Actor } from "./staffStore";
import { denyTable, getTable, tableChanges, tableRoom, undoTable, updateTable, verifyTable, type LadderTable, type Verified } from "./store";
import type { Ladder } from "./types";

const who = (a: Actor) => ({ id: a.id, name: a.name });

export async function staffVerify(ladder: Ladder, table: LadderTable, actor: Actor, opts: { useRead?: boolean } = {}): Promise<{ ok: true; result: Verified } | { ok: false; error: "not_pending" | "no_read" | "failed" }> {
  if (table.status !== "pending") return { ok: false, error: "not_pending" };
  let t = table;
  if (opts.useRead) {
    if (!t.readBody) return { ok: false, error: "no_read" };
    const body = withReadNumbers(t.body, tableRoom(ladder, t), parseRoom(ladder.kind, t.readBody, t.format));
    if (body !== t.body) { await updateTable(t.id, { body }); t = (await getTable(t.id))!; }
  }
  const res = await verifyTable(ladder, t, who(actor));
  if (!res.ok) return res;
  await logAction(ladder, actor, "verify", { tableId: t.id, detail: { number: t.number, screenshot: !!opts.useRead } });
  const fresh = await getTable(t.id);
  if (fresh?.channelId) await postCard(ladder, fresh, { kind: "verified", result: res.result }).catch(() => null);
  return res;
}

export async function staffSendBack(ladder: Ladder, table: LadderTable, actor: Actor, note: string | null): Promise<boolean> {
  if (!(await denyTable(table, who(actor), note))) return false;
  await logAction(ladder, actor, "send_back", { tableId: table.id, detail: { number: table.number, note } });
  const fresh = await getTable(table.id);
  if (fresh?.channelId) await postCard(ladder, fresh, { kind: "denied", note }).catch(() => null);
  return true;
}

export async function staffUndo(ladder: Ladder, table: LadderTable, actor: Actor): Promise<boolean> {
  if (table.status !== "verified") return false;
  if (!(await undoTable(table, who(actor)))) return false;
  await logAction(ladder, actor, "undo", { tableId: table.id, detail: { number: table.number } });
  if (ladder.settings.roles.on) { const { rolesAfter } = await import("./roles"); await rolesAfter(ladder, (await tableChanges(table)).map((c) => c.playerId)); }
  const fresh = await getTable(table.id);
  if (fresh?.messageId) await postCard(ladder, fresh, { kind: "undone" }).catch(() => null);
  return true;
}
