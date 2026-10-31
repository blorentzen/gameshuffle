/**
 * Each Discord app's keys (server only), and which app the current request is for.
 *
 * Environment variables, per app (Vercel production = the real apps, preview = their dev copies):
 *   main  DISCORD_APPLICATION_ID, DISCORD_PUBLIC_KEY, DISCORD_BOT_TOKEN, DISCORD_CLIENT_SECRET (unchanged)
 *   comp  NEXT_PUBLIC_DISCORD_COMP_APPLICATION_ID, DISCORD_COMP_PUBLIC_KEY, DISCORD_COMP_BOT_TOKEN,
 *         DISCORD_COMP_CLIENT_SECRET
 *
 * The competitive app's interactions arrive at /api/discord/comp/interactions, which runs the handler inside
 * `withDiscordApp("comp", …)`, so the adapter's REST calls (posting, editing, roles) use that app's bot token.
 * Next's `after()` keeps the request's async context, so follow-up work stays on the same app.
 */

import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { COMP_APP_ID, appOfApplicationId, type DiscordAppId } from "./appIds";

export interface DiscordAppKeys {
  applicationId: string;
  publicKey: string | null;
  botToken: string | null;
  clientSecret: string | null;
}

/** An app's keys in this environment, or null when the app doesn't exist here. */
export function appKeys(app: DiscordAppId): DiscordAppKeys | null {
  if (app === "main") {
    const applicationId = process.env.DISCORD_APPLICATION_ID;
    if (!applicationId) return null;
    return { applicationId, publicKey: process.env.DISCORD_PUBLIC_KEY ?? null, botToken: process.env.DISCORD_BOT_TOKEN ?? null, clientSecret: process.env.DISCORD_CLIENT_SECRET ?? null };
  }
  if (!COMP_APP_ID) return null;
  return { applicationId: COMP_APP_ID, publicKey: process.env.DISCORD_COMP_PUBLIC_KEY ?? null, botToken: process.env.DISCORD_COMP_BOT_TOKEN ?? null, clientSecret: process.env.DISCORD_COMP_CLIENT_SECRET ?? null };
}

const current = new AsyncLocalStorage<DiscordAppId>();

/** Runs `fn` as the given app: REST calls inside use its bot token. */
export function withDiscordApp<T>(app: DiscordAppId, fn: () => T): T {
  return current.run(app, fn);
}

/** The app the current request or job is for (the main app outside `withDiscordApp`). */
export const currentDiscordApp = (): DiscordAppId => current.getStore() ?? "main";

/** The bot token for an app (the current one by default). */
export const botTokenFor = (app: DiscordAppId = currentDiscordApp()): string | null => appKeys(app)?.botToken ?? null;

/** Which app an interaction came from. */
export const appOfInteraction = (interaction: Record<string, unknown>): DiscordAppId => appOfApplicationId(interaction.application_id);
