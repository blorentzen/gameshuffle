/**
 * The MMR card kept in this browser (try before paying, picks 2026-10-29, https://claude.ai/artifact/FntRHwbNVFZ1DtC1i1Qff4,
 * all as recommended). A visitor builds the whole card before making an account; a free account keeps
 * paid looks it tried here while it signs up and pays (the server only saves their free versions).
 *   localStorage `gs-mmr-draft`: the looks, the active look, the lounge name, whose draft it is (a
 *     visitor's goes to whoever signs in next), and whether a picture waits. A week at most.
 *   IndexedDB `gs-mmr` / `picture`: the background picture tried from the device, never uploaded
 *     until looks are on (then the studio uploads it and clears it).
 * `cleanDraft` is pure (tested); the rest guards every storage call, since a private window can refuse them.
 */

import { cleanLook, type MmrLook } from "./look";

export const DRAFT_KEY = "gs-mmr-draft";
const DRAFT_MS = 7 * 24 * 60 * 60_000;

/** Where a visitor's one button goes after making their account. */
export type DraftPlan = "pro" | "supporter" | "backer" | "free";
export const isDraftPlan = (v: unknown): v is DraftPlan => v === "pro" || v === "supporter" || v === "backer" || v === "free";

export interface MmrDraft {
  v: 1;
  /** The account it belongs to; null = a visitor's, claimed by whoever signs in next in this browser. */
  owner: string | null;
  savedAt: number;
  loungeName: string;
  looks: MmrLook[];
  activeLook: string;
  /** A picture tried from the device waits in IndexedDB. */
  picture: boolean;
}

/** A draft from storage, every look cleaned; null when missing, broken or older than a week. */
export function cleanDraft(raw: unknown, now = Date.now()): MmrDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.savedAt !== "number" || now - r.savedAt > DRAFT_MS || r.savedAt > now + 60_000) return null;
  if (!Array.isArray(r.looks) || !r.looks.length) return null;
  const looks = r.looks.slice(0, 10).map((l, i) => cleanLook(l, `look-${i + 1}`));
  const activeLook = typeof r.activeLook === "string" && looks.some((l) => l.id === r.activeLook) ? r.activeLook : looks[0].id;
  return {
    v: 1,
    owner: typeof r.owner === "string" && r.owner ? r.owner : null,
    savedAt: r.savedAt,
    loungeName: typeof r.loungeName === "string" ? r.loungeName.trim().slice(0, 40) : "",
    looks,
    activeLook,
    picture: r.picture === true,
  };
}

/** The draft this browser holds for `userId` (a visitor's draft counts for anyone). */
export function draftFor(draft: MmrDraft | null, userId: string | null): MmrDraft | null {
  return draft && (draft.owner == null || draft.owner === userId) ? draft : null;
}

export function readDraft(): MmrDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? cleanDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeDraft(d: Omit<MmrDraft, "v" | "savedAt">): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, savedAt: Date.now(), ...d }));
  } catch {
    // Not kept in this browser: the card still works, only the paid looks can't wait through sign-up.
  }
}

export function clearDraft(): void {
  try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ }
}

// ── The picture tried from the device (IndexedDB) ─────────────────────────

const DB = "gs-mmr";
const STORE = "picture";
const PIC = "draft";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => new Promise<T | null>((resolve) => {
    if (!db) return resolve(null);
    try {
      const req = act(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => { resolve(req.result); db.close(); };
      req.onerror = () => { resolve(null); db.close(); };
    } catch {
      resolve(null);
      db.close();
    }
  }));
}

/** Keeps the tried picture on this device. False when the browser refuses (it still shows for this visit). */
export async function putPicture(file: Blob): Promise<boolean> {
  return (await run("readwrite", (s) => s.put(file, PIC))) !== null;
}

export async function getPicture(): Promise<Blob | null> {
  const v = await run<unknown>("readonly", (s) => s.get(PIC));
  return v instanceof Blob ? v : null;
}

export async function clearPicture(): Promise<void> {
  await run("readwrite", (s) => s.delete(PIC));
}
