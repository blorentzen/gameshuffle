import "server-only";

import * as Sentry from "@sentry/nextjs";
import { SCRYDEX_BASE_URL } from "./config";
import { recordScrydexUsage } from "./usage";
import type {
  TcgCard,
  TcgCardImages,
  TcgCardVariant,
  TcgExpansion,
} from "./types";

/**
 * Scrydex API client wrapper — the ONLY module in the app permitted to call
 * Scrydex. Server-only. Spec: scrydex-tcg-catalog-spec Phase 2.
 *
 * Guarantees enforced here (compliance-critical):
 *   - Every request carries an explicit `select` allowlist (never all fields).
 *   - `include=prices` / `include=pop_reports` are hard-blocked (throw).
 *   - Response casing is `snake`, normalized once at this boundary.
 *   - Credentials come from env and are never client-exposed.
 *   - Every call records credit spend + emits a Sentry breadcrumb.
 */

// Explicit field allowlists — matches the Phase 1 schema. Never request more.
const CARD_SELECT = [
  "id",
  "name",
  "supertype",
  "subtypes",
  "types",
  "hp",
  "abilities",
  "attacks",
  "weaknesses",
  "resistances",
  "retreat_cost",
  "converted_retreat_cost",
  "number",
  "printed_number",
  "rarity",
  "regulation_mark",
  "expansion_sort_order",
  "language",
  "images",
  "variants",
  // Embedded parent expansion (avoids a second call for it).
  "expansion",
].join(",");

const FORBIDDEN_INCLUDES = ["prices", "pop_reports", "price_history"];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[scrydex] missing env var ${name}`);
  return v;
}

interface ScrydexFetchOpts {
  /** Query params (excluding select/casing, which are always set here). */
  params?: Record<string, string>;
  /** Credit cost of this endpoint, for the usage ledger. */
  creditCost: number;
  /** Human label for logs/usage rows, e.g. "cards/get" or "cards/search". */
  endpointLabel: string;
  /** Why we're spending a credit (cache-miss reason) — breadcrumb only. */
  cacheMissReason: string;
}

async function scrydexFetch(
  path: string,
  opts: ScrydexFetchOpts,
): Promise<unknown> {
  const params = opts.params ?? {};

  // Hard block: never request prices / pop reports / price history, whether
  // via `include` or any param value. This is a terms boundary, not a perf
  // choice — assert it loudly.
  for (const [k, v] of Object.entries(params)) {
    const hay = `${k}=${v}`.toLowerCase();
    if (FORBIDDEN_INCLUDES.some((f) => hay.includes(f))) {
      throw new Error(
        `[scrydex] blocked forbidden field/include in request: ${hay}`,
      );
    }
  }

  const url = new URL(`${SCRYDEX_BASE_URL}${path}`);
  url.searchParams.set("select", CARD_SELECT);
  url.searchParams.set("casing", "snake");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  Sentry.addBreadcrumb({
    category: "scrydex",
    level: "info",
    message: `scrydex ${opts.endpointLabel}`,
    data: {
      endpoint: opts.endpointLabel,
      creditCost: opts.creditCost,
      cacheMissReason: opts.cacheMissReason,
    },
  });
  console.info(
    `[scrydex] call endpoint=${opts.endpointLabel} credits=${opts.creditCost} reason=${opts.cacheMissReason}`,
  );

  const res = await fetch(url, {
    headers: {
      "X-Api-Key": requireEnv("SCRYDEX_API_KEY"),
      "X-Team-ID": requireEnv("SCRYDEX_TEAM_ID"),
    },
    // Never let Next cache the raw upstream response — our own tcg_cards
    // table is the cache layer, governed by stale_after.
    cache: "no-store",
  });

  // Record the credit spend regardless of parse outcome (we did spend it).
  await recordScrydexUsage(opts.endpointLabel, opts.creditCost);

  if (!res.ok) {
    throw new Error(`[scrydex] ${opts.endpointLabel} HTTP ${res.status}`);
  }
  return res.json();
}

// ── Normalization (snake → our TcgCard shape) ───────────────────────────────

function asImages(v: unknown): TcgCardImages | null {
  if (!v) return null;
  // Scrydex returns `images` as an ARRAY of { type, small, medium, large }.
  // Prefer the "front" face; fall back to the first entry. (Also tolerate a
  // bare object in case the shape ever changes.)
  let obj: Record<string, unknown> | null = null;
  if (Array.isArray(v)) {
    const arr = v.filter(
      (e): e is Record<string, unknown> => !!e && typeof e === "object",
    );
    obj = arr.find((e) => e.type === "front") ?? arr[0] ?? null;
  } else if (typeof v === "object") {
    obj = v as Record<string, unknown>;
  }
  if (!obj) return null;
  const out: TcgCardImages = {};
  if (typeof obj.small === "string") out.small = obj.small;
  if (typeof obj.medium === "string") out.medium = obj.medium;
  // `large` intentionally dropped — thumbnail-scale only.
  return Object.keys(out).length ? out : null;
}

function asVariants(v: unknown): TcgCardVariant[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((raw): TcgCardVariant | null => {
      if (!raw || typeof raw !== "object") return null;
      const o = raw as Record<string, unknown>;
      if (typeof o.name !== "string") return null;
      // names + images ONLY — strip prices / pop_reports even if returned.
      const images = asImages(o.images);
      return images ? { name: o.name, images } : { name: o.name };
    })
    .filter((x): x is TcgCardVariant => x !== null);
  return out.length ? out : null;
}

function strArr(v: unknown): string[] | null {
  return Array.isArray(v) ? v.map(String) : null;
}

function normalizeExpansion(v: unknown): TcgExpansion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    name: typeof o.name === "string" ? o.name : "",
    series: typeof o.series === "string" ? o.series : null,
    total: typeof o.total === "number" ? o.total : null,
    printed_total:
      typeof o.printed_total === "number" ? o.printed_total : null,
    language_code:
      typeof o.language === "string"
        ? o.language
        : typeof o.language_code === "string"
          ? o.language_code
          : "EN",
    release_date:
      typeof o.release_date === "string" ? o.release_date : null,
    is_online_only: o.is_online_only === true,
  };
}

/** A normalized card plus its embedded expansion (from the same response). */
export interface NormalizedCard {
  card: TcgCard;
  expansion: TcgExpansion | null;
}

function normalizeCard(v: unknown): NormalizedCard | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.name !== "string") return null;
  const expansion = normalizeExpansion(o.expansion);
  const card: TcgCard = {
    id: o.id,
    name: o.name,
    supertype: typeof o.supertype === "string" ? o.supertype : null,
    subtypes: strArr(o.subtypes),
    types: strArr(o.types),
    hp: typeof o.hp === "string" ? o.hp : o.hp != null ? String(o.hp) : null,
    abilities: o.abilities ?? null,
    attacks: o.attacks ?? null,
    weaknesses: o.weaknesses ?? null,
    resistances: o.resistances ?? null,
    retreat_cost: strArr(o.retreat_cost),
    converted_retreat_cost:
      o.converted_retreat_cost != null
        ? String(o.converted_retreat_cost)
        : null,
    number: typeof o.number === "string" ? o.number : o.number != null ? String(o.number) : null,
    printed_number:
      typeof o.printed_number === "string" ? o.printed_number : null,
    rarity: typeof o.rarity === "string" ? o.rarity : null,
    regulation_mark:
      typeof o.regulation_mark === "string" ? o.regulation_mark : null,
    expansion_id: expansion?.id ?? null,
    expansion_sort_order:
      typeof o.expansion_sort_order === "number"
        ? o.expansion_sort_order
        : null,
    language_code:
      typeof o.language === "string"
        ? o.language
        : typeof o.language_code === "string"
          ? o.language_code
          : "EN",
    images: asImages(o.images),
    variants: asVariants(o.variants),
    image_small_path: null,
    image_medium_path: null,
  };
  return { card, expansion };
}

// ── Public API (the only Scrydex-touching functions) ────────────────────────

/** GET /cards/{id}. 1 credit. Caller must have already checked our cache. */
export async function fetchCardById(
  id: string,
  cacheMissReason: string,
): Promise<NormalizedCard | null> {
  const json = await scrydexFetch(`/cards/${encodeURIComponent(id)}`, {
    creditCost: 1,
    endpointLabel: "cards/get",
    cacheMissReason,
  });
  const data = (json as { data?: unknown }).data ?? json;
  return normalizeCard(data);
}

/** GET /cards?q=name:{term}*. 1 credit. Caller must have checked cache + local
 *  trigram first. Returns up to 25 normalized cards. */
export async function searchCardsByName(
  term: string,
  cacheMissReason: string,
): Promise<NormalizedCard[]> {
  const json = await scrydexFetch(`/cards`, {
    params: { q: `name:${term}*`, page_size: "25" },
    creditCost: 1,
    endpointLabel: "cards/search",
    cacheMissReason,
  });
  const data = (json as { data?: unknown }).data ?? json;
  if (!Array.isArray(data)) return [];
  return data
    .map(normalizeCard)
    .filter((x): x is NormalizedCard => x !== null);
}
