import "server-only";
import mk8dx from "@/data/mk8dx-data.json";
import mkworld from "@/data/mkworld-data.json";
import { draftPoolInfo } from "@/lib/drafts/catalog";
import type { DraftOption, DraftPool, DraftSlot } from "@/lib/drafts/types";

/**
 * Mario Kart drafts: chat builds the streamer's combo part by part, or picks
 * the track list race by race. Same engine as the Pokémon team draft.
 */

type Part = { name: string; weight?: string; type?: string; drift?: string };
type Cup = { name: string; courses: { name: string }[] };
interface KartData { characters: Part[]; vehicles: Part[]; wheels?: Part[]; gliders?: Part[]; cups?: Cup[] }

const opt = (p: Part, detail?: string): DraftOption => ({ id: p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: p.name, ...(detail ? { detail } : {}) });

function comboPool(id: string, data: KartData): DraftPool {
  const info = draftPoolInfo(id)!;
  const parts: { slot: DraftSlot; list: Part[]; detail: (p: Part) => string | undefined }[] = [
    { slot: { key: "character", label: "Character" }, list: data.characters, detail: (p) => p.weight ? `${p.weight} weight` : undefined },
    { slot: { key: "vehicle", label: "Vehicle" }, list: data.vehicles, detail: (p) => p.type },
    ...(data.wheels?.length ? [{ slot: { key: "wheels", label: "Wheels" }, list: data.wheels, detail: () => undefined }] : []),
    ...(data.gliders?.length ? [{ slot: { key: "glider", label: "Glider" }, list: data.gliders, detail: () => undefined }] : []),
  ];
  const part = (slot: DraftSlot) => parts.find((p) => p.slot.key === slot.key)!;
  return {
    id, label: info.label, game: info.game, rules: info.rules,
    slots: () => parts.map((p) => p.slot),
    candidates: (slot) => { const p = part(slot); return p.list.map((x) => opt(x, p.detail(x))); },
    lookup: (slot, label) => { const p = part(slot); const x = p.list.find((y) => y.name === label); return x ? opt(x, p.detail(x)) : null; },
    question: (slot, i, total) => `Part ${i + 1} of ${total}: which ${slot.label.toLowerCase()}?`,
  };
}

function tracksPool(id: string, data: KartData): DraftPool {
  const info = draftPoolInfo(id)!;
  const courses = (data.cups ?? []).flatMap((c) => c.courses.map((t) => ({ name: t.name, cup: c.name })));
  const find = (label: string) => courses.find((t) => t.name === label);
  return {
    id, label: info.label, game: info.game, rules: info.rules,
    slots: (rules) => Array.from({ length: rules.eightRaces ? 8 : 4 }, (_, i) => ({ key: `race-${i + 1}`, label: `Race ${i + 1}` })),
    candidates: (_slot, _rules, picks) => {
      const taken = new Set(picks.map((p) => p.label));
      return courses.filter((t) => !taken.has(t.name)).map((t) => opt({ name: t.name }, t.cup));
    },
    lookup: (_slot, label) => { const t = find(label); return t ? opt({ name: t.name }, t.cup) : null; },
    question: (_slot, i, total) => `Race ${i + 1} of ${total}: which track?`,
  };
}

export const MARIO_KART_POOLS: DraftPool[] = [
  comboPool("mk8dx:combo", mk8dx as KartData),
  comboPool("mkworld:combo", mkworld as KartData),
  tracksPool("mk8dx:tracks", mk8dx as KartData),
  tracksPool("mkworld:tracks", mkworld as KartData),
];
