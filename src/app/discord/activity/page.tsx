import type { Metadata } from "next";
import { ActivityApp } from "@/components/activity/ActivityApp";
import { activityApp } from "@/lib/activity/discord";

/**
 * The Discord Activity. Discord loads activity.gameshuffle.co/ (proxied through
 * <app id>.discordsays.com), and the middleware rewrites that to this route.
 * The root layout renders it without the site chrome, analytics or sign-in
 * (see `isActivityPath` in src/lib/activity/hosts.ts). Only the app id goes to the page; the secret stays
 * on the server.
 */

export const metadata: Metadata = {
  title: "GameShuffle for Discord",
  robots: { index: false, follow: false },
};

export default function DiscordActivityPage() {
  return <ActivityApp clientId={activityApp()?.clientId ?? null} />;
}
