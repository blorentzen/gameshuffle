import { SUPER_MARIO_KART } from "@/data/super-mario-kart/super-mario-kart";

export { SUPER_MARIO_KART };

/** Label/value rows for a saved Super Mario Kart setup (setup cards, profile, share page). */
export function describeSuperMarioKartSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== SUPER_MARIO_KART.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const racers = Array.isArray(cfg.racers) ? (cfg.racers as { name?: string; character?: string }[]) : [];
  const rolled = racers.filter((r) => r.character);
  if (rolled.length) rows.push({ label: "Racers", value: rolled.map((r) => `${r.name || "Player"}: ${r.character}`).join("; ") });
  const races = cfg.races as { title?: string; engine?: string | null; courses?: string[] } | null;
  if (races?.courses?.length) rows.push({ label: races.engine ? `${races.title}, ${races.engine}` : races.title ?? "Races", value: races.courses.join(", ") });
  const battles = Array.isArray(cfg.battles) ? (cfg.battles as { course?: string }[]) : [];
  if (battles.length) rows.push({ label: battles.length === 1 ? "Battle course" : "Battle courses", value: battles.map((b) => b.course).join(", ") });
  return rows;
}
