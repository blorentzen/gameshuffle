import "server-only";
import { ULTIMATE } from "@/data/smash/ultimate";
import { draftPoolInfo } from "@/lib/drafts/catalog";
import type { DraftOption, DraftPool } from "@/lib/drafts/types";
import type { SmashFighter, SmashStage } from "@/lib/smash/types";

/**
 * Smash drafts: chat votes the stage (one, or three for a best of 3) and the
 * streamer's fighter (one, or a squad of three for Squad Strike). Same engine
 * as the Pokémon team draft; options come from the randomizer's data.
 */

const series = (code: string) => ULTIMATE.series[code] ?? undefined;

/** The competitive list most events use: starters and counterpicks. */
const legal = (s: SmashStage) => s.status === "starter" || s.status === "counterpick";

const stageOption = (s: SmashStage): DraftOption => ({ id: s.id, label: s.name, detail: series(s.series) });
const fighterOption = (f: SmashFighter): DraftOption => ({ id: f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: f.name, detail: series(f.series) });

function stagesPool(): DraftPool {
  const info = draftPoolInfo("smash:stages")!;
  return {
    id: info.id, label: info.label, game: info.game, rules: info.rules,
    slots: (rules) => rules.bestOf3
      ? Array.from({ length: 3 }, (_, i) => ({ key: `game-${i + 1}`, label: `Game ${i + 1}` }))
      : [{ key: "stage", label: "Stage" }],
    candidates: (_slot, rules, picks) => {
      const taken = new Set(picks.map((p) => p.label));
      return ULTIMATE.stages.filter((s) => !taken.has(s.name) && (rules.allStages || legal(s))).map(stageOption);
    },
    lookup: (_slot, label) => { const s = ULTIMATE.stages.find((x) => x.name === label); return s ? stageOption(s) : null; },
    question: (_slot, i, total) => total === 1 ? "Which stage do we play?" : `Game ${i + 1} of ${total}: which stage?`,
  };
}

function fighterPool(): DraftPool {
  const info = draftPoolInfo("smash:fighter")!;
  return {
    id: info.id, label: info.label, game: info.game, rules: info.rules,
    slots: (rules) => rules.squad
      ? Array.from({ length: 3 }, (_, i) => ({ key: `fighter-${i + 1}`, label: `Fighter ${i + 1}` }))
      : [{ key: "fighter", label: "Fighter" }],
    candidates: (_slot, rules, picks) => {
      const taken = new Set(picks.map((p) => p.label));
      return ULTIMATE.fighters.filter((f) => !taken.has(f.name) && (!rules.noMiis || !f.mii)).map(fighterOption);
    },
    lookup: (_slot, label) => { const f = ULTIMATE.fighters.find((x) => x.name === label); return f ? fighterOption(f) : null; },
    question: (_slot, i, total) => total === 1 ? "Which fighter should the streamer play?" : `Squad pick ${i + 1} of ${total}: which fighter?`,
  };
}

export const SMASH_POOLS: DraftPool[] = [stagesPool(), fighterPool()];
