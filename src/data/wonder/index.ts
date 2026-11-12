import { WONDER } from "@/data/wonder/wonder";
import { LASTS_LABEL, badgeWorn, ruleDetail, ruleOf, worldLabel, worldOf } from "@/lib/wonder/roll";
import type { WonderWorldId } from "@/lib/wonder/types";

export { WONDER };

/** Label/value rows for a saved Super Mario Bros. Wonder challenge (setup cards, profile, share page). */
export function describeWonderSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== WONDER.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const rules = Array.isArray(cfg.rules) ? (cfg.rules as { id: string; badge?: string }[]).filter((r) => r && typeof r.id === "string") : [];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; character?: string; badge?: string | null }[]) : [];
  if (players.some((p) => p.character)) {
    rows.push({
      label: "Players",
      value: players.map((p) => {
        const worn = badgeWorn(WONDER, p.badge ?? null, rules).badge;
        return `${p.name ?? "Player"}${p.character ? ` (${p.character}${worn ? `, ${worn}` : ", no badge"})` : ""}`;
      }).join(", "),
    });
  }
  if (typeof cfg.world === "string" && WONDER.worlds.some((w) => w.id === cfg.world)) {
    rows.push({ label: "World", value: worldLabel(worldOf(WONDER, cfg.world as WonderWorldId)) });
  }
  if (typeof cfg.level === "string" && cfg.level) rows.push({ label: "Level", value: cfg.level });
  const levels = Array.isArray(cfg.levels) ? (cfg.levels as string[]).filter((x) => typeof x === "string") : [];
  if (levels.length) rows.push({ label: "Levels", value: levels.join(", ") });
  for (const r of rules) {
    const rule = ruleOf(WONDER, r);
    if (rule) rows.push({ label: `Rule (${LASTS_LABEL[rule.lasts].toLowerCase()})`, value: `${rule.title}. ${ruleDetail(rule, r)}` });
  }
  return rows;
}
