import "server-only";
import { MARIO_KART_POOLS } from "@/lib/drafts/pools/mariokart";
import { POKEMON_POOLS } from "@/lib/drafts/pools/pokemon";
import { SMASH_POOLS } from "@/lib/drafts/pools/smash";
import type { DraftPool } from "@/lib/drafts/types";

/** Every draftable pool. Add a pool here (and its info in catalog.ts) to offer a new kind of draft. */
const POOLS: DraftPool[] = [...POKEMON_POOLS, ...MARIO_KART_POOLS, ...SMASH_POOLS];

export function draftPool(id: string): DraftPool | null {
  return POOLS.find((p) => p.id === id) ?? null;
}
