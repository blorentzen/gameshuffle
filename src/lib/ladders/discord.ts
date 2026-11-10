import "server-only";

/**
 * A ladder table's card in Discord (lounge plan step 1): posted in the ladder's results channel for updaters to verify,
 * then changed in place when they do (MMR changes and division moves), send it back, or undo it.
 *   llad:v:<tableId>  Verify          llad:b:<tableId>  Send back (opens a form for why)
 *   llad:f:<tableId>  Fix the text    llad:u:<tableId>  Undo (asks first: llad:uu:<tableId>)
 */

import { compRest, compRestFile } from "@/lib/discord/compRest";
import { COMP_COLOR } from "@/lib/discord/ttPanel";
import { SITE_URL } from "@/lib/seo";
import { renderTable } from "@/lib/wars/tableCard";
import { flagsFor } from "@/lib/wars/flags";
import type { TableModel } from "@/lib/wars/table";
import { blocking, divisionFor, listNames, roomIssues, signed, tableTitle, type Change, type Room, type RoomIssue } from "./rules";
import { tableRoom, type LadderTable, type Verified } from "./store";
import { formatLabel, ladderPath, ladderStaffPath, ladderTablePath, type Ladder } from "./types";

export const LADDER_PREFIX = "llad:";
export const LADDER_MODAL_PREFIX = "lladm:";
const V2 = 1 << 15;

const btn = (label: string, id: string, style: 1 | 2 | 3 | 4 = 2) => ({ type: 2, style, label, custom_id: id });
const link = (label: string, url: string) => ({ type: 2, style: 5, label, url });
const text = (content: string) => ({ type: 10, content: content.slice(0, 3900) });
const row = (...components: unknown[]) => ({ type: 1, components });
const num = (n: number) => n.toLocaleString("en-US");

/** A race room as a war table model, so the war tools' table picture can draw it. */
function roomModel(ladder: Ladder, room: Room, t: LadderTable): TableModel {
  const teams = room.format === 1
    ? [{ tag: "FFA", name: "Free-for-all", color: null, penalty: 0, players: [...room.teams].sort((a, b) => a.rank - b.rank).map((x) => ({ name: x.players[0].name, flag: x.players[0].flag, score: x.players[0].score ?? 0 })) }]
    : room.teams.map((x, i) => ({ tag: String.fromCharCode(65 + i), name: x.label, color: null, penalty: x.penalty, players: x.players.map((p) => ({ name: p.name, flag: p.flag, score: p.score ?? 0 })) }));
  // The picture's header shows the date (the war tables' "War table" when there's none).
  const date = new Date(t.createdAt).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  return { title: `${ladder.name} · ${tableTitle(t, ladder.kind)}`, date, settings: [], skipped: [], teams };
}

/** A knockout room in text: six groups of four, 1st first. */
function knockoutLines(room: Room): string {
  const names = room.teams.map((t) => `${t.rank} ${t.players[0].name}`);
  const groups: string[] = [];
  // 24 racers, four out at each of five checkpoints: places 21 to 24 go out at checkpoint 1, 5 to 8 at checkpoint 5.
  for (let i = 0, g = 0; i < names.length; i += 4, g++) {
    const label = g === 0 ? "Final four" : `Out at checkpoint ${Math.max(1, 6 - g)}`;
    groups.push(`**${label}:** ${names.slice(i, i + 4).join(" · ")}`);
  }
  return groups.join("\n");
}

const changeLine = (c: Change & { multiplier?: number | null }, mark: boolean) => `**${c.name}** ${num(c.before)} → ${num(c.after)} (${signed(c.delta)})${mark && c.placement ? " · placement" : ""}${c.settling ? " · settling" : ""}${c.multiplier != null ? ` · reduced loss ${c.multiplier === 0 ? "(none)" : `×${c.multiplier}`}` : ""}`;
const stamp = (iso: string) => `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;

/** What the waiting card says about checks: when a clean table verifies itself, else what an updater should look at. */
function waitingLine(t: LadderTable, issues: RoomIssue[]): string {
  if (t.autoAt) return `**Verifies on its own ${stamp(t.autoAt)}.** The text and the screenshot agree. Ask for a change before then, or verify it now.`;
  const reasons = t.checkReasons.length ? t.checkReasons : issues.map((i) => i.text.replace(/\.$/, ""));
  return `**Waiting on an updater.**${reasons.length ? `\n${reasons.slice(0, 8).map((r) => `• ${r}`).join("\n")}${reasons.length > 8 ? `\n• and ${reasons.length - 8} more` : ""}` : ""}`;
}

export type CardState =
  | { kind: "pending"; issues: RoomIssue[] }
  | { kind: "verified"; result: Verified }
  | { kind: "denied"; note: string | null }
  | { kind: "undone" };

export function cardBody(ladder: Ladder, t: LadderTable, state: CardState, hasPicture: boolean): Record<string, unknown> {
  const room = tableRoom(ladder, t);
  const players = room.teams.reduce((a, x) => a + x.players.length, 0);
  const head = `## ${ladder.name} · Table ${t.number}`;
  const meta = [ladder.kind === "knockout" ? "Knockout Tour" : formatLabel(t.format), t.tier ? `Tier ${t.tier}` : null, `${players} players`, `submitted by ${t.submittedByName ?? "a reporter"}`].filter(Boolean).join(" · ");
  const parts: unknown[] = [text(`${head}\n${meta}`)];
  if (hasPicture) parts.push({ type: 12, items: [{ media: { url: "attachment://table.png" }, description: `${ladder.name} table ${t.number}` }] });
  else if (ladder.kind === "knockout") parts.push(text(knockoutLines(room)));
  const page = link("Table page", `${SITE_URL}${ladderTablePath(ladder.slug, t.number)}`);
  switch (state.kind) {
    case "pending": {
      parts.push(text(waitingLine(t, state.issues)));
      parts.push(row(btn("Verify", `${LADDER_PREFIX}v:${t.id}`, 3), btn("Send back", `${LADDER_PREFIX}b:${t.id}`, 4), btn("Fix the text", `${LADDER_PREFIX}f:${t.id}`), link("Staff page", `${SITE_URL}${ladderStaffPath(ladder.slug)}`)));
      break;
    }
    case "verified": {
      const { changes, moves } = state.result;
      const moved = moves.map((m) => `${m.up ? "▲" : "▼"} **${m.name}** moved ${m.up ? "up" : "down"} to ${m.to}`);
      let lines: string[];
      let note: string;
      if (ladder.settings.rules === "lounge200") {
        // 200 Lounge rules: a new player is placed by this table's score, then moves like everyone else.
        note = changes.filter((c) => c.placement).map((c) => `\n**${c.name}** is new: placed ${divisionFor(c.before, 1, ladder.settings).division} at ${num(c.before)} from a score of ${c.score ?? 0}.`).join("");
        lines = [...changes].sort((a, b) => a.place - b.place).map((c) => changeLine(c, false));
      } else {
        // Placement players' changes count double: said once when everyone is placing, else marked on their lines.
        const placing = changes.filter((c) => c.placement).length;
        const all = placing === changes.length;
        lines = [...changes].sort((a, b) => a.place - b.place).map((c) => changeLine(c, !all));
        note = all ? "\nEveryone here is in placement, so these changes count double." : placing ? "\nPlacement changes count double." : "";
      }
      if (changes.some((c) => c.settling)) note += "\nA settling start (carried over or matched from MKCentral) moves double for its first 2 tables.";
      const reduced = changes.some((c) => c.multiplier != null) ? "\nPlayers who missed races left their teammates losing less." : "";
      parts.push(text(`**${t.autoVerified ? "Verified on its own: the text and the screenshot agreed" : `Verified by ${t.verifiedByName ?? "an updater"}`}.**${note}${reduced}\n${lines.join("\n")}${moved.length ? `\n\n${moved.join("\n")}` : ""}`));
      parts.push(row(page, btn("Undo", `${LADDER_PREFIX}u:${t.id}`)));
      break;
    }
    case "denied":
      parts.push(text(`**Sent back by ${t.verifiedByName ?? "an updater"}.**${state.note ? ` ${state.note}` : ""}\n<@${t.submittedBy}>, fix it and submit it again with \`/ranked submit\`.`));
      break;
    case "undone":
      parts.push(text(`**${t.note ?? "Undone"}.** Everyone's MMR moved back.`));
      parts.push(row(page));
      break;
  }
  return {
    flags: V2,
    allowed_mentions: state.kind === "denied" ? { users: [t.submittedBy] } : { parse: [] },
    components: [{ type: 17, accent_color: COMP_COLOR, components: parts }],
  };
}

async function picture(ladder: Ladder, t: LadderTable): Promise<{ name: string; data: Buffer } | null> {
  if (ladder.kind === "knockout") return null;
  const room = tableRoom(ladder, t);
  if (room.teams.length < 2) return null;
  try {
    const model = roomModel(ladder, room, t);
    // Flags as pictures: the server's own (from /flag), else the country flag; anything else stays text.
    const flags = await flagsFor(ladder.guildId, model.teams.flatMap((x) => x.players.map((p) => p.flag).filter((f): f is string => !!f))).catch(() => ({}));
    const pic = await renderTable(model, { logos: {}, flags, background: null, races: null });
    return { name: "table.png", data: pic.png };
  } catch (err) {
    console.error("[ladders] picture failed:", err);
    return null;
  }
}

export type PostResult = "ok" | "no_access" | "failed";

/** Posts the table's card in its channel, or changes the posted one. */
export async function postCard(ladder: Ladder, t: LadderTable, state: CardState): Promise<{ result: PostResult; messageId: string | null; channelId: string | null }> {
  const channelId = t.channelId;
  if (!channelId) return { result: "failed", messageId: null, channelId: null };
  const file = await picture(ladder, t);
  const body = cardBody(ladder, t, state, !!file);
  if (t.messageId) {
    const { flags: _f, ...edit } = body;
    void _f;
    const res = file ? await compRestFile("PATCH", `/channels/${channelId}/messages/${t.messageId}`, edit, file) : await compRest("PATCH", `/channels/${channelId}/messages/${t.messageId}`, edit);
    if (res.ok) return { result: "ok", messageId: t.messageId, channelId };
    if (res.status !== 404) return { result: res.status === 403 ? "no_access" : "failed", messageId: t.messageId, channelId };
  }
  const sent = file
    ? await compRestFile<{ id: string }>("POST", `/channels/${channelId}/messages`, body, file)
    : await compRest<{ id: string }>("POST", `/channels/${channelId}/messages`, body);
  if (!sent.ok) { console.error("[ladders] card post failed:", sent.status, sent.error); return { result: sent.status === 403 ? "no_access" : "failed", messageId: null, channelId }; }
  return { result: "ok", messageId: sent.data.id, channelId };
}

/** What the reporter sees privately before a table goes to the updaters. */
export function checkMessage(ladder: Ladder, t: LadderTable, issues: RoomIssue[], notes: string[]): Record<string, unknown> {
  const room = tableRoom(ladder, t);
  const all = [...notes, ...issues.map((i) => i.text)];
  const summary = ladder.kind === "knockout"
    ? room.teams.map((x) => `${x.rank}. ${x.players[0].name}`).join("\n")
    : room.teams.map((x) => `${room.format === 1 ? "" : `${x.label} ${x.total ?? 0}: `}${x.players.map((p) => `${p.name} ${p.score ?? 0}`).join(", ")}`).join("\n");
  const stop = blocking(issues);
  return {
    content: `${stop ? "This table can't be sent yet:" : "Check this before it goes to the updaters:"}\n${all.map((l) => `• ${l}`).join("\n")}`,
    embeds: summary ? [{ color: COMP_COLOR, title: `Table ${t.number}`, description: summary.slice(0, 3900) }] : [],
    components: [row(
      ...(stop ? [] : [btn("Send it", `${LADDER_PREFIX}s:${t.id}`, 3)]),
      btn("Fix the text", `${LADDER_PREFIX}f:${t.id}`, stop ? 1 : 2),
      btn("Cancel", `${LADDER_PREFIX}c:${t.id}`),
    )],
  };
}

/** The issues a pending table shows, from the ladder's players right now. */
export function issuesFor(ladder: Ladder, t: LadderTable, known: ReadonlySet<string>, knownNames: string[]): RoomIssue[] {
  return roomIssues(tableRoom(ladder, t), known, knownNames);
}

export { listNames };

/** The season's end in the results channel (lounge system pick 11A): the champion, the next places and how the next season starts. */
export async function postSeasonEnd(ladder: Ladder, info: { season: number; players: number; tables: number; top: { name: string; mmr: number }[]; reset: "full" | "soft"; keep: number | null; middle: number | null; championStart: number | null }): Promise<boolean> {
  if (!ladder.resultsChannelId) return false;
  const [champ, ...rest] = info.top;
  const share = info.keep == null ? "part" : info.keep === 0.5 ? "half" : info.keep === 0.25 ? "a quarter" : info.keep === 0.75 ? "three quarters" : `${Math.round(info.keep * 100)}%`;
  const lines = [
    `## Season ${info.season} is over`,
    `${ladder.name} · ${num(info.players)} players · ${num(info.tables)} tables`,
    champ ? `Champion: **${champ.name}**, ${num(champ.mmr)}.${rest.length ? ` Then ${rest.map((r) => r.name).join(", ").replace(/, ([^,]*)$/, " and $1")}.` : ""}` : null,
    info.reset === "soft" && info.middle != null
      ? `**Season ${info.season + 1} starts now.** Everyone keeps ${share} of their distance from ${num(info.middle)}${champ && info.championStart != null ? ` (${champ.name} starts at ${num(info.championStart)})` : ""}, and their first 2 tables move double.`
      : `**Season ${info.season + 1} starts now.** Everyone starts over and places again.`,
  ].filter(Boolean).join("\n");
  const res = await compRest("POST", `/channels/${ladder.resultsChannelId}/messages`, {
    flags: V2, allowed_mentions: { parse: [] },
    components: [{ type: 17, accent_color: COMP_COLOR, components: [text(lines), row(link("Final standings", `${SITE_URL}${ladderPath(ladder.slug)}?season=${info.season}`), link(`Season ${info.season + 1}`, `${SITE_URL}${ladderPath(ladder.slug)}`))] }],
  });
  return res.ok;
}

/** A penalty in the player's direct messages (lounge system pick 8A): what for, the numbers, and where to appeal. */
export async function dmPenalty(ladder: Ladder, discordId: string, info: { label: string; reason: string | null; before: number; after: number; strikes: number; breakUntil: string | null }): Promise<boolean> {
  // Only from the production site: the dev database holds real players' Discord ids (the 200cc history import), and a
  // test penalty there must never reach them.
  const devDatabase = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("rbtdomefinsrclgubpuf");
  const live = !devDatabase && (process.env.VERCEL_ENV ? process.env.VERCEL_ENV === "production" : process.env.NODE_ENV === "production");
  if (!live) return false;
  const dm = await compRest<{ id: string }>("POST", "/users/@me/channels", { recipient_id: discordId });
  if (!dm.ok) return false;
  const parts = [info.after !== info.before ? `${num(info.before)} → ${num(info.after)}` : null, info.strikes ? `${info.strikes} ${info.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ");
  const lines = [
    `**Penalty on ${ladder.name}:** ${info.label}${parts ? ` (${parts})` : ""}.${info.reason && info.reason !== info.label ? ` ${info.reason}` : ""}`,
    info.breakUntil ? `That starts a break from the queue until <t:${Math.floor(Date.parse(info.breakUntil) / 1000)}:D>.` : null,
    `If it's wrong, appeal it on the lounge's page: ${SITE_URL}${ladderPath(ladder.slug)}`,
  ].filter(Boolean).join("\n");
  const sent = await compRest("POST", `/channels/${dm.data.id}/messages`, { content: lines, allowed_mentions: { parse: [] } });
  return sent.ok;
}
