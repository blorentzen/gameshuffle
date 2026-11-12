import { MARIO_KART_7 } from "@/data/mario-kart-7/mario-kart-7";
import { PARTS_LEVELS } from "@/lib/mario-kart-7/roll";

export { MARIO_KART_7 };

/** Label/value rows for a saved Mario Kart 7 setup (setup cards, profile, share page). */
export function describeMarioKart7Setup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== MARIO_KART_7.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const racers = Array.isArray(cfg.racers) ? (cfg.racers as { name?: string; character?: string; body?: string; tires?: string; glider?: string }[]) : [];
  const rolled = racers.filter((r) => r.character && r.body);
  if (rolled.length) rows.push({ label: "Racers", value: rolled.map((r) => `${r.name || "Player"}: ${r.character} (${r.body}, ${r.tires}, ${r.glider})`).join("; ") });
  const parts = PARTS_LEVELS.find((l) => l.id === cfg.parts);
  if (parts) rows.push({ label: "Parts", value: parts.label });
  const races = cfg.races as { title?: string; engine?: string | null; courses?: string[] } | null;
  if (races?.courses?.length) rows.push({ label: races.engine ? `${races.title}, ${races.engine}` : races.title ?? "Races", value: races.courses.join(", ") });
  const battles = Array.isArray(cfg.battles) ? (cfg.battles as { course?: string; mode?: string }[]) : [];
  if (battles.length) rows.push({ label: battles.length === 1 ? "Battle" : "Battles", value: battles.map((b) => `${b.mode} on ${b.course}`).join(", ") });
  return rows;
}
