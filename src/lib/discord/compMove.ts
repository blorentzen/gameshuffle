/**
 * The competitive commands leaving the main app (picks 2026-10-31, 3A): once GameShuffle Competitive is open,
 * /gs-tt, /gs-mmr and /gs-room were to keep working on the main app for 30 days (Britton cut over at once on 2026-11-04, with /gs-result and Save to GameShuffle too), each answer followed by a private
 * line pointing to the new app; from COMP_MOVE_ENDS they only point there, and the next registration of the
 * main app's commands leaves them out (scripts/register-discord-commands.ts).
 */

import { after } from "next/server";
import { COMP_MOVE_ENDS, compAppLive, type CompCommand } from "./appIds";
import { SITE_URL } from "@/lib/seo";
import { gsDayStart } from "@/lib/time/gsClock";

export type CompMoveState = "none" | "moving" | "moved";

/** The end of the move as an instant: midnight Pacific at the start of COMP_MOVE_ENDS. */
export function compMoveEnd(): Date | null {
  return COMP_MOVE_ENDS ? gsDayStart(COMP_MOVE_ENDS) : null;
}

export function compMoveState(now = Date.now()): CompMoveState {
  const end = compMoveEnd();
  if (!compAppLive() || !end) return "none";
  return now < end.getTime() ? "moving" : "moved";
}

const ADD_URL = `${SITE_URL}/discord/add?app=comp`;
const addRow = { type: 1, components: [{ type: 2, style: 5, label: "Add GameShuffle Competitive", url: ADD_URL }] };

/** "December 5", the last day the old command answers (the day before the end). */
export function moveLastDay(): string {
  return lastDay();
}

function lastDay(): string {
  const end = compMoveEnd();
  if (!end) return "";
  return new Date(end.getTime() - 12 * 3600_000).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" });
}

/** A moved command, or "save": the Save to GameShuffle message command (same name on both apps). */
export type MovedThing = CompCommand | "save";

export function movingLine(base: MovedThing): string {
  if (base === "save") return `Save to GameShuffle is moving to GameShuffle Competitive, our bot for competitive servers. Add it to keep going: it works here until ${lastDay()}.`;
  return `/gs-${base} is moving to GameShuffle Competitive, our bot for competitive servers, as /${base}. Add it to keep going: /gs-${base} answers until ${lastDay()}.`;
}

export function movedLine(base: MovedThing): string {
  if (base === "save") return "Save to GameShuffle moved to GameShuffle Competitive, our bot for competitive servers. Add it to this server or to your own account, then pick Save to GameShuffle under Apps on Quaxly's reply again.";
  return `/gs-${base} moved to GameShuffle Competitive, our bot for competitive servers, as /${base}. Add it to this server, or to your own account, to keep using it.`;
}

/** Runs a moved command on the main app: as usual with a private note while moving, only the note once moved. */
export async function withMoveNote(interaction: Record<string, unknown>, base: MovedThing, run: () => Response | Promise<Response>): Promise<Response> {
  const state = compMoveState();
  if (state === "moved") {
    return Response.json({ type: 4, data: { content: movedLine(base), components: [addRow], flags: 64 } });
  }
  const res = await run();
  if (state === "moving") {
    // A form (type 9) can't take a follow-up message; anything else gets the note after Discord has the answer.
    const kind = await res.clone().json().then((j: { type?: number }) => j.type).catch(() => null);
    if (kind !== 9) {
      const appId = String(interaction.application_id ?? "");
      const token = String(interaction.token ?? "");
      after(async () => {
        const sent = await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: movingLine(base), components: [addRow], flags: 64, allowed_mentions: { parse: [] } }),
        }).catch(() => null);
        if (!sent?.ok) console.error("[discord] move note failed:", sent?.status);
      });
    }
  }
  return res;
}
