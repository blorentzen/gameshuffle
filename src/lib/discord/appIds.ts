/**
 * GameShuffle's Discord apps (picks 2026-10-30, https://claude.ai/artifact/HahsGm6TargWVxfTPeLMPo, all as
 * recommended). Client-safe: names, command names, and whether the competitive app exists here.
 *   main  GameShuffle: the dailies, Chat Brain, the Weekly, trivia, polls, community tools, streamer posts.
 *   comp  GameShuffle Competitive: wars, time trials, MMR, room reads, lounge rank-ups.
 * Each is its own Discord app (own bot, commands, Activity, verification); both run on this code. The
 * competitive app exists in an environment once NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID is set there
 * (the id is public: it's in every install link). Server keys live in apps.ts.
 */

export type DiscordAppId = "main" | "comp";

export const DISCORD_APP_IDS: DiscordAppId[] = ["main", "comp"];

export const DISCORD_APP_NAMES: Record<DiscordAppId, string> = { main: "GameShuffle", comp: "GameShuffle Competitive" };

/** The competitive app's Discord application id in this environment, or null before it exists. */
export const COMP_APP_ID: string | null = process.env.NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID || null;

export const compAppLive = (): boolean => !!COMP_APP_ID;

/** The commands that move to the competitive app (its own short names; the main app's start with gs-). */
export type CompCommand = "tt" | "mmr" | "room" | "war";

/** A command's name in an app: the main app's start with gs-, the competitive app's are short. */
export const commandName = (app: DiscordAppId, base: string): string => (app === "main" ? `gs-${base}` : base);

/** The command people should use for a competitive tool, as typed: "/tt" once the competitive app exists, else "/gs-tt". */
export const compCommand = (base: CompCommand): string => `/${compAppLive() ? base : `gs-${base}`}`;

/** Which of our apps an interaction came from (its application_id), else the main app. */
export function appOfApplicationId(applicationId: unknown): DiscordAppId {
  return COMP_APP_ID && String(applicationId ?? "") === COMP_APP_ID ? "comp" : "main";
}

/** The day the moved commands leave the main app (30 days after the competitive app opens in production);
 *  null until it opens. Until then, and in the 30 days, the main app's /gs-tt, /gs-mmr and /gs-room keep working. */
export const COMP_MOVE_ENDS: string | null = null;
