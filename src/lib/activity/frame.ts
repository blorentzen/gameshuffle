/**
 * Which Discord app's Activity this page is running in. Both apps' URL mappings point at activity.gameshuffle.co, but
 * Discord serves each Activity from its own <application id>.discordsays.com, so the frame's own address tells them
 * apart: GameShuffle (the dailies, Together, trivia) or GameShuffle Competitive (the War room). In development
 * `?app=comp` previews the War room. Client only (null on the server).
 */

import { COMP_APP_ID } from "@/lib/discord/appIds";

export type FrameApp = "main" | "comp";

export function activityFrameApp(): FrameApp | null {
  if (typeof window === "undefined") return null;
  if (COMP_APP_ID && window.location.hostname.startsWith(`${COMP_APP_ID}.`)) return "comp";
  if (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("app") === "comp") return "comp";
  return "main";
}
