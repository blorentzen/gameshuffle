/**
 * GIF rules and shapes, shared by the server and the browser (GIF round 2 picks, 2026-10-31, all A:
 * https://claude.ai/artifact/GuxuPrSrg3tbRzWQydj78h). Players upload their own; private until shared; every upload
 * checked; free accounts keep 25, GS Pro 250, 8 MB each; a GIF plays five seconds, then rests on its still frame.
 */

import { STICKER_BY_ID } from "@/data/stickers";

export const GIF_MAX_BYTES = 8 * 1024 * 1024;
/** Longest side after upload: GIFs are shrunk to this and stored as animated WebP. */
export const GIF_MAX_SIDE = 480;
export const GIF_MAX_FRAMES = 600;
export const GIF_LIMITS = { free: 25, pro: 250 } as const;
/** How long a GIF plays before it rests on its still frame (WCAG 2.2.2 asks for under five seconds or a pause). */
export const GIF_PLAY_MS = 5000;
export const GIF_ALT_MAX = 160;
export const GIF_TAGS_MAX = 5;
export const GIF_TAG_MAX_LEN = 24;
export const GIF_TYPES = ["image/gif", "image/webp"] as const;

export type GifStatus = "ok" | "held" | "removed" | "deleted";

/** What any page needs to draw a GIF. */
export interface GifView {
  id: string;
  url: string;
  still: string;
  width: number;
  height: number;
  alt: string;
}

/** One of your own GIFs (My Stuff ▸ GIFs, the picker's Your GIFs). */
export interface MyGif extends GifView {
  tags: string[];
  shared: boolean;
  status: Extract<GifStatus, "ok" | "held">;
  /** Why the check held it. */
  reason: string | null;
  uses: number;
  createdAt: string;
}

/** A GIF someone shared with everyone (the picker's Community). */
export interface CommunityGif extends GifView {
  tags: string[];
  by: string;
  uses: number;
}

/** Stored on a comment or message. */
export type Attachment = { kind: "gif"; id: string } | { kind: "sticker"; id: string };
/** What a comment or message shows. "gone" = the GIF was deleted or taken down since. */
export type AttachmentView = { kind: "gif"; gif: GifView } | { kind: "sticker"; id: string } | { kind: "gone" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A stored or sent attachment, checked for shape (a GIF's id or a sticker in the catalog); null otherwise. */
export function parseAttachment(raw: unknown): Attachment | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { kind?: unknown; id?: unknown };
  if (typeof r.id !== "string") return null;
  if (r.kind === "gif" && UUID.test(r.id)) return { kind: "gif", id: r.id };
  if (r.kind === "sticker" && STICKER_BY_ID[r.id]) return { kind: "sticker", id: r.id };
  return null;
}

/** Tags as typed: lowercase words, at most five, each at most 24 characters, no repeats. */
export function cleanTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const t = raw.toLowerCase().replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, GIF_TAG_MAX_LEN).trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= GIF_TAGS_MAX) break;
  }
  return out;
}

/** A description for screen readers: one line, at most 160 characters. */
export function cleanAlt(input: unknown): string {
  return typeof input === "string" ? input.replace(/\s+/g, " ").trim().slice(0, GIF_ALT_MAX) : "";
}

/** How many GIFs an account keeps. */
export const gifLimit = (pro: boolean) => (pro ? GIF_LIMITS.pro : GIF_LIMITS.free);

/** Hamming distance between two 16-character hex fingerprints (first-frame difference hashes). */
export function dhashDistance(a: string, b: string): number {
  if (a.length !== 16 || b.length !== 16) return 64;
  let d = 0;
  for (let i = 0; i < 16; i += 4) {
    let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16);
    while (x) { d += x & 1; x >>>= 1; }
  }
  return d;
}

/** Two first frames this close count as the same picture (a re-encode or a resize of a removed GIF). */
export const DHASH_SAME = 5;
