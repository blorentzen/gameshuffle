import "server-only";

/** "#war-room in Kart Club" for a war channel, read from Discord as the competitive bot (blank if it can't see them). */

import { compRest } from "@/lib/discord/compRest";

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

export async function channelLabel(guildId: string, channelId: string): Promise<{ channel: string | null; server: string | null }> {
  const miss = { ok: false as const, status: 0, error: "timeout" };
  const [ch, g] = await Promise.all([
    withTimeout(compRest<{ name?: string }>("GET", `/channels/${channelId}`), 2000, miss),
    withTimeout(compRest<{ name?: string }>("GET", `/guilds/${guildId}`), 2000, miss),
  ]);
  return { channel: ch.ok ? ch.data.name ?? null : null, server: g.ok ? g.data.name ?? null : null };
}
