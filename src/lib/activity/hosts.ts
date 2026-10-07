/**
 * Where the Discord Activity is served. Discord's URL mapping points "/" at
 * activity.gameshuffle.co; the middleware rewrites that host's "/" to
 * ACTIVITY_PATH and the root layout drops the site chrome for it. In
 * development a cloudflared tunnel (*.trycloudflare.com) pointed at the dev
 * server counts too, so the dev Discord app can load a local build.
 * Edge-safe (no server-only imports): the middleware uses it.
 */

export const ACTIVITY_HOST = "activity.gameshuffle.co";
export const ACTIVITY_PATH = "/discord/activity";

export function isActivityHost(host: string | null | undefined): boolean {
  const h = (host ?? "").split(":")[0].toLowerCase();
  if (h === ACTIVITY_HOST) return true;
  return process.env.NODE_ENV === "development" && h.endsWith(".trycloudflare.com");
}

export function isActivityPath(path: string): boolean {
  return path === ACTIVITY_PATH || path.startsWith(`${ACTIVITY_PATH}/`);
}
