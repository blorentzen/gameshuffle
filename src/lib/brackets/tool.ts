/**
 * The free bracket tools (search pages round, picks 2026-10-20): the bracket
 * generator (single and double elimination), the round robin generator and the
 * Swiss pairing generator. Pure and client-safe: the player list, the formats,
 * and the share link that rebuilds a bracket with every result in it.
 *
 * Nothing is saved on our side. A bracket lives in the visitor's browser and in
 * its link; "Run it as a live tournament" hands the names to the create form.
 */

export const MAX_PLAYERS = 64;
export const NAME_MAX = 40;

export type ToolFormat = "single" | "double" | "roundrobin" | "swiss";

export const MIN_PLAYERS: Record<ToolFormat, number> = { single: 2, double: 4, roundrobin: 3, swiss: 4 };

export const FORMAT_WORDS: Record<ToolFormat, string> = {
  single: "single elimination",
  double: "double elimination",
  roundrobin: "round robin",
  swiss: "Swiss",
};

export interface ParsedNames {
  names: string[];
  /** Names typed twice (the second copy gets a number). */
  repeats: string[];
  /** How many names past the limit were left out. */
  over: number;
}

/** Cleans one name: single spaces, no control characters, short enough for a match card. */
export function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
}

/**
 * Names from what was typed or pasted: one per line, or a single line split on
 * commas. Blank lines and list markers ("1.", "-") drop out; a repeated name
 * gets " (2)" so every seat stays its own player.
 */
export function parseNames(text: string): ParsedNames {
  const lines = text.split(/\r?\n/);
  const raw = lines.filter((l) => l.trim()).length === 1 && text.includes(",") ? text.split(",") : lines;
  const names: string[] = [];
  const repeats: string[] = [];
  const seen = new Map<string, number>();
  let over = 0;
  for (const line of raw) {
    const name = cleanName(line.replace(/^\s*(?:\d+[.)]|[-*•])\s+/, ""));
    if (!name) continue;
    if (names.length >= MAX_PLAYERS) { over++; continue; }
    const key = name.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) { repeats.push(name); names.push(`${name} (${n})`.slice(0, NAME_MAX + 4)); }
    else names.push(name);
  }
  return { names, repeats, over };
}

/** A fair shuffle (Fisher-Yates). */
export function shuffled<T>(xs: T[], rand: () => number = Math.random): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ── Compact codes ────────────────────────────────────────────────────────────
// A player index (0-63) is one character, so a bracket's results fit in a short
// string. "." means no result yet.

export const CODE = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";

export const toCode = (i: number | null | undefined) => (i == null || i < 0 || i >= CODE.length ? "." : CODE[i]);
export const fromCode = (c: string | undefined): number | null => {
  if (!c || c === ".") return null;
  const i = CODE.indexOf(c);
  return i < 0 ? null : i;
};

// ── Share links ──────────────────────────────────────────────────────────────
// ?b=<base64url JSON>. The payload is { v, f, n (names), t (title), o (format
// options), r (results, format-specific) }. Decoding never trusts it: every
// field is checked and anything odd is dropped.

export interface LinkPayload {
  f: ToolFormat;
  names: string[];
  title: string;
  options: Record<string, unknown>;
  results: unknown;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string | null {
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeLink(p: LinkPayload): string {
  return toBase64Url(JSON.stringify({ v: 1, f: p.f, n: p.names, t: p.title || undefined, o: p.options, r: p.results }));
}

const FORMATS: ToolFormat[] = ["single", "double", "roundrobin", "swiss"];

export function decodeLink(code: string | null | undefined): LinkPayload | null {
  if (!code || code.length > 20_000) return null;
  const text = fromBase64Url(code);
  if (!text) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { v?: unknown; f?: unknown; n?: unknown; t?: unknown; o?: unknown; r?: unknown };
  if (o.v !== 1 || !FORMATS.includes(o.f as ToolFormat) || !Array.isArray(o.n)) return null;
  const names = o.n.filter((x): x is string => typeof x === "string").map(cleanName).filter(Boolean).slice(0, MAX_PLAYERS);
  if (names.length < MIN_PLAYERS[o.f as ToolFormat]) return null;
  return {
    f: o.f as ToolFormat,
    names,
    title: typeof o.t === "string" ? cleanName(o.t) : "",
    options: o.o && typeof o.o === "object" && !Array.isArray(o.o) ? (o.o as Record<string, unknown>) : {},
    results: o.r ?? null,
  };
}

// ── Run it as a live tournament ──────────────────────────────────────────────
// The tool keeps the names in this browser and opens the create form, which
// fills in the format and adds the players as guests once the event exists.

export const HANDOFF_KEY = "gs-bracket-handoff";
const HANDOFF_HOURS = 24;

export type LiveFormat = "single_elim" | "double_elim" | "swiss";

export interface Handoff {
  format: LiveFormat;
  names: string[];
  title: string;
  /** Swiss rounds to start with (a round robin becomes Swiss with everyone meeting once). */
  swissRounds?: number;
  from: ToolFormat;
  at: number;
}

export function liveFormatFor(f: ToolFormat): LiveFormat {
  return f === "single" ? "single_elim" : f === "double" ? "double_elim" : "swiss";
}

/** Swiss rounds that make a round robin: everyone meets everyone once, as far as Swiss allows (12 rounds). */
export function roundRobinAsSwiss(players: number): number {
  return Math.max(1, Math.min(12, players % 2 ? players : players - 1));
}

export function readHandoff(json: string | null, now = Date.now()): Handoff | null {
  if (!json) return null;
  try {
    const h = JSON.parse(json) as Partial<Handoff>;
    if (!h || !Array.isArray(h.names) || typeof h.at !== "number" || now - h.at > HANDOFF_HOURS * 3600_000) return null;
    if (h.format !== "single_elim" && h.format !== "double_elim" && h.format !== "swiss") return null;
    const names = h.names.filter((x): x is string => typeof x === "string").map(cleanName).filter(Boolean).slice(0, MAX_PLAYERS);
    if (names.length < 2) return null;
    return {
      format: h.format,
      names,
      title: typeof h.title === "string" ? cleanName(h.title) : "",
      swissRounds: typeof h.swissRounds === "number" && h.swissRounds >= 1 && h.swissRounds <= 12 ? Math.round(h.swissRounds) : undefined,
      from: FORMATS.includes(h.from as ToolFormat) ? (h.from as ToolFormat) : "single",
      at: h.at,
    };
  } catch {
    return null;
  }
}
