import "server-only";

/**
 * Stream and night recaps (GS Pro): turn what actually happened (our own
 * session events, results and scores, never anything invented) into a post
 * the host can edit and share: a Discord-length recap and a short one for X or
 * Bluesky. Nothing is posted for them; they copy it.
 */

import { z } from "zod";
import { draftStructured, type AiResult } from "@/lib/ai/claude";
import { createServiceClient } from "@/lib/supabase/admin";
import { isBlockedText } from "@/lib/text/filter";

export interface RecapDraft { discord: string; short: string }

const SYSTEM = `You write short, upbeat recaps for GameShuffle, a game night and livestream companion. Use ONLY the facts you're given: never invent scores, moments, quotes, names or numbers, and leave out anything the facts don't cover. Player and viewer names are exactly as given. Sound like a friendly host, not a press release: a little hype, no hashtags unless asked, at most two emoji. Don't use em dashes or en dashes.`;

const schema = z.object({
  discord: z.string().describe("A Discord post: a bold-free first line that names the winner or the headline, then 2 to 5 short lines. Under 900 characters."),
  short: z.string().describe("One post for X or Bluesky, under 260 characters."),
});

async function write(kind: "stream" | "night", facts: string): Promise<AiResult<RecapDraft>> {
  const res = await draftStructured({
    system: SYSTEM,
    prompt: `Write a recap of this ${kind === "night" ? "game night" : "livestream"} from these facts only:\n\n${facts}`,
    schema,
    effort: "low",
    maxTokens: 1500,
  });
  if (!res.ok) return res;
  const fix = (s: string, max: number) => s.replace(/[–—]/g, "-").trim().slice(0, max);
  const draft = { discord: fix(res.data.discord, 1200), short: fix(res.data.short, 280) };
  if (isBlockedText(draft.discord) || isBlockedText(draft.short)) return { ok: false, error: "refused" };
  return { ok: true, data: draft };
}

/** A live night's recap, from the same facts as its plain-text recap. */
export function writeNightRecap(facts: string): Promise<AiResult<RecapDraft>> {
  return write("night", facts);
}

/** A stream session's recap, from its events and participants. Owner only (checked by the caller). */
export async function streamFacts(sessionId: string): Promise<{ ownerUserId: string; facts: string } | null> {
  const svc = createServiceClient();
  const { data: s } = await svc.from("gs_sessions").select("owner_user_id, name, status, activated_at, ended_at, active_game, configured_games").eq("id", sessionId).maybeSingle();
  const session = s as { owner_user_id: string; name: string; status: string; activated_at: string | null; ended_at: string | null; active_game: string | null; configured_games: string[] | null } | null;
  if (!session || (session.status !== "ended" && session.status !== "cancelled")) return null;
  const [{ data: events }, { data: people }] = await Promise.all([
    svc.from("session_events").select("event_type").eq("session_id", sessionId).limit(5000),
    svc.from("session_participants").select("display_name, is_broadcaster").eq("session_id", sessionId).limit(500),
  ]);
  const counts = new Map<string, number>();
  for (const e of (events ?? []) as { event_type: string }[]) counts.set(e.event_type, (counts.get(e.event_type) ?? 0) + 1);
  const viewers = ((people ?? []) as { display_name: string | null; is_broadcaster?: boolean | null }[]).filter((p) => !p.is_broadcaster && p.display_name);
  const minutes = session.activated_at && session.ended_at ? Math.max(0, Math.round((Date.parse(session.ended_at) - Date.parse(session.activated_at)) / 60000)) : null;
  const label: Record<string, string> = {
    shuffle: "combo shuffles", race_randomized: "races rolled", track_randomized: "tracks rolled",
  };
  const lines = [
    `Stream: ${session.name}`,
    (session.configured_games ?? []).length ? `Games: ${(session.configured_games ?? []).map((g) => g.replace(/-/g, " ")).join(", ")}` : session.active_game ? `Game: ${session.active_game.replace(/-/g, " ")}` : "",
    minutes !== null ? `Length: ${minutes} minutes` : "",
    `Viewers who joined in: ${viewers.length}${viewers.length ? ` (${viewers.slice(0, 12).map((v) => v.display_name).join(", ")}${viewers.length > 12 ? ", and more" : ""})` : ""}`,
    ...[...counts].filter(([t]) => label[t]).map(([t, n]) => `${label[t]}: ${n}`),
  ].filter(Boolean);
  return { ownerUserId: session.owner_user_id, facts: lines.join("\n") };
}

export async function writeStreamRecap(facts: string): Promise<AiResult<RecapDraft>> {
  return write("stream", facts);
}
