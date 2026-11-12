import { MARIO_KART_DS } from "@/data/mario-kart-ds/mario-kart-ds";
import { KART_LEVELS, missionId, missionTitle } from "@/lib/mario-kart-ds/roll";

export { MARIO_KART_DS };

/** Label/value rows for a saved Mario Kart DS setup (setup cards, profile, share page). */
export function describeMarioKartDsSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== MARIO_KART_DS.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const racers = Array.isArray(cfg.racers) ? (cfg.racers as { name?: string; character?: string; kart?: string }[]) : [];
  const rolled = racers.filter((r) => r.character && r.kart);
  if (rolled.length) rows.push({ label: "Racers", value: rolled.map((r) => `${r.name || "Player"}: ${r.character} (${r.kart})`).join("; ") });
  const level = KART_LEVELS.find((l) => l.id === cfg.level);
  if (level) rows.push({ label: "Karts", value: level.label });
  const races = cfg.races as { title?: string; engine?: string | null; courses?: string[] } | null;
  if (races?.courses?.length) rows.push({ label: races.engine ? `${races.title}, ${races.engine}` : races.title ?? "Races", value: races.courses.join(", ") });
  const battles = Array.isArray(cfg.battles) ? (cfg.battles as { course?: string; mode?: string }[]) : [];
  if (battles.length) rows.push({ label: battles.length === 1 ? "Battle" : "Battles", value: battles.map((b) => `${b.mode} on ${b.course}`).join(", ") });
  const ids = Array.isArray(cfg.missions) ? (cfg.missions as string[]) : [];
  const missions = ids.map((id) => MARIO_KART_DS.missions.find((m) => missionId(m) === id)).filter((m): m is NonNullable<typeof m> => !!m);
  if (missions.length) rows.push({ label: missions.length === 1 ? "Mission" : "Missions", value: missions.map((m) => `${missionTitle(m)}: ${m.text}`).join(" ") });
  return rows;
}
