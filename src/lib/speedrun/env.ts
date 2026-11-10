import "server-only";

/**
 * Speedrunning's three settings, read in one place (phase 1 contract, "Local development"):
 *   SPEEDRUN_RELAY_SECRET       the secret shared with the relay (signs addresses and its webhook)
 *   SPEEDRUN_RELAY_URL          the relay's https address, for /admin and /state (http://localhost:8787 locally)
 *   NEXT_PUBLIC_SPEEDRUN_RELAY  its wss address, for LiveSplit One and overlays (ws://localhost:8787 locally)
 * Production gets real values once the Worker exists. Missing ones are named in the error.
 */

export interface SpeedrunEnv {
  secret: string;
  /** https://… with no trailing slash. */
  httpUrl: string;
  /** wss://… with no trailing slash. */
  wsUrl: string;
}

export class SpeedrunConfigError extends Error {
  constructor(public missing: string[]) {
    super(`Speedrunning isn't set up here: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} missing from the environment.`);
    this.name = "SpeedrunConfigError";
  }
}

const trim = (s: string | undefined) => (s ?? "").trim().replace(/\/+$/, "");

/** The settings, or a SpeedrunConfigError naming what's missing. */
export function speedrunEnv(): SpeedrunEnv {
  const secret = (process.env.SPEEDRUN_RELAY_SECRET ?? "").trim();
  const httpUrl = trim(process.env.SPEEDRUN_RELAY_URL);
  const wsUrl = trim(process.env.NEXT_PUBLIC_SPEEDRUN_RELAY);
  const missing: string[] = [];
  if (secret.length < 16) missing.push("SPEEDRUN_RELAY_SECRET");
  if (!/^https?:\/\//.test(httpUrl)) missing.push("SPEEDRUN_RELAY_URL");
  if (!/^wss?:\/\//.test(wsUrl)) missing.push("NEXT_PUBLIC_SPEEDRUN_RELAY");
  if (missing.length) throw new SpeedrunConfigError(missing);
  return { secret, httpUrl, wsUrl };
}

let warned = false;
/** The settings, or null when they're missing (logged once). */
export function speedrunEnvOrNull(): SpeedrunEnv | null {
  try {
    return speedrunEnv();
  } catch (e) {
    if (!warned) { warned = true; console.warn(`[speedrun] ${(e as Error).message}`); }
    return null;
  }
}
