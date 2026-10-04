import { AIR_RIDERS } from "@/data/kirby/air-riders";
import type { KirbyGame } from "@/lib/kirby/types";

export const KIRBY_GAMES: Record<string, KirbyGame> = { [AIR_RIDERS.slug]: AIR_RIDERS };
export function kirbyGame(slug: string | null | undefined): KirbyGame | null {
  return (slug && KIRBY_GAMES[slug]) || null;
}

/** Label/value rows for a saved Kirby Air Riders setup (setup cards, profile, share page). */
export function describeKirbySetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (!kirbyGame(cfg.gameSlug as string)) return [];
  const rows: { label: string; value: string }[] = [];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; rider?: string; machine?: string }[]) : [];
  if (players.some((p) => p.rider)) {
    rows.push({ label: "Riders", value: players.map((p) => `${p.name ?? "Player"}${p.rider ? ` (${p.rider} on ${p.machine ?? "a machine"})` : ""}`).join(", ") });
  }
  const course = cfg.course as { kind?: string; name?: string } | null;
  if (course?.name) rows.push({ label: course.kind === "top" ? "Top Ride course" : "Air Ride course", value: course.name });
  if (typeof cfg.stadium === "string" && cfg.stadium) rows.push({ label: "City Trial Stadium", value: cfg.stadium });
  return rows;
}
