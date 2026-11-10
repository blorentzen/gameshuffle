/**
 * `!pb`, `!pace` and `!splits` (speedrunning phase 1 step 2, free, approved mockup screen 6): the runner's PB and sum
 * of best, ahead or behind and where the run is heading, and every split so far, from their speedrun overlay's relay
 * (src/lib/speedrun). Each answers only when the streamer has a speedrun setup with that command switched on, and
 * stays quiet otherwise. The line is worked out when the command arrives and posted after the streamer's reply delay,
 * so chat never gets a split before the stream shows it. Loaded on use from registrations (the store is server-only).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { setupFor, gameName } from "@/lib/speedrun/store";
import { relayState } from "@/lib/speedrun/relay";
import { idleState, pbTime, sumOfBest } from "@/lib/speedrun/rules";
import { paceLine, pbLine, splitsLine } from "@/lib/speedrun/chat";
import type { RelayState } from "@/lib/speedrun/types";

export type SpeedrunCommand = "pb" | "pace" | "splits";

export interface SpeedrunChatContext {
  userId: string;
  reply: (message: string) => Promise<void>;
  /** Waits (the reply delay); tests pass their own. */
  wait?: (ms: number) => Promise<void>;
  /** The relay's state; tests pass their own. */
  readState?: (relayId: string) => Promise<RelayState | null>;
}

const realWait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SAME_MS = 50;

/** "Nov 2", the day the current PB was set, when an attempt GameShuffle saw set it. */
async function pbSetOn(userId: string, pbMs: number | null): Promise<string | null> {
  if (pbMs == null) return null;
  const admin = createServiceClient();
  const [{ data: row }, { data: user }] = await Promise.all([
    admin.from("speedrun_attempts").select("final_ms, ended_at").eq("user_id", userId).eq("pb", true)
      .order("ended_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("users").select("timezone").eq("id", userId).maybeSingle(),
  ]);
  const r = row as { final_ms: number | null; ended_at: string | null } | null;
  if (!r?.ended_at || r.final_ms == null || Math.abs(r.final_ms - pbMs) > SAME_MS) return null;
  const tz = (user as { timezone: string | null } | null)?.timezone || "America/Los_Angeles";
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(new Date(r.ended_at));
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(r.ended_at));
  }
}

async function runnerName(userId: string): Promise<string> {
  const { data } = await createServiceClient().from("users").select("display_name, username, twitch_username").eq("id", userId).maybeSingle();
  const u = data as { display_name: string | null; username: string | null; twitch_username: string | null } | null;
  return u?.display_name || u?.twitch_username || u?.username || "The runner";
}

/** The line for one command, as the run stands now (null = stay quiet). */
export async function speedrunLine(userId: string, which: SpeedrunCommand, readState?: SpeedrunChatContext["readState"]): Promise<{ line: string; delayMs: number } | null> {
  const setup = await setupFor(userId);
  if (!setup || !setup.settings.commands[which]) return null;
  const live = readState
    ? await readState(setup.relayId)
    : await relayState(setup.relayId).then((r) => (r.ok ? r.state : null));
  const st: RelayState = live && live.segments.length
    ? live
    : idleState(setup.run, { game: setup.game, category: setup.category, attempt: setup.attempts });
  const delayMs = setup.settings.replyDelay * 1000;
  if (which === "pace") return { line: paceLine(st), delayMs };
  if (which === "splits") return { line: splitsLine(st), delayMs };
  const [name, setOn] = await Promise.all([runnerName(userId), pbSetOn(userId, pbTime(st.segments))]);
  return {
    line: pbLine({ name, game: gameName(st.game ?? setup.game), category: st.category ?? setup.category ?? "", segments: st.segments, sobMs: sumOfBest(st), setOn }),
    delayMs,
  };
}

export async function handleSpeedrunCommand(ctx: SpeedrunChatContext, which: SpeedrunCommand): Promise<void> {
  const out = await speedrunLine(ctx.userId, which, ctx.readState);
  if (!out) return;
  if (out.delayMs > 0) await (ctx.wait ?? realWait)(out.delayMs);
  await ctx.reply(out.line);
}
