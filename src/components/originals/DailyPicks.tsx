"use client";

/**
 * Your dailies (choose your dailies, 2026-11-09, all as recommended): the dailies a member plays, saved on the
 * account (`users.daily_picks`, /api/dailies/picks) so they follow them to every device and the Discord Activity.
 * Rules in src/lib/originals/dailies.ts; the server side in src/lib/originals/dailyPicks.ts.
 *
 * One store per page, so the bar above a daily, the Choose sheet, /dailies and Home agree the moment a switch moves:
 *   - `useDailyPicks(initial?)` for Home and /dailies: `{ picks, ready, signedIn, save }` (plus `canChoose`, `chosen`).
 *     It asks /api/dailies/picks once per page unless a page passes what the server already knows (`initial`).
 *   - `DailyPicksSheet({ open, onClose })`: the Choose sheet (a CDS Modal, a sheet from the bottom on phones).
 *   - The today bar reads the store without asking (`useDailyPicksSnapshot`); /api/dailies brings the picks along
 *     and `primeDailyPicks` stores them.
 * The last list this browser saw is kept in localStorage (`gs-daily-picks`), so the bar draws your dailies before the
 * server answers. Signed out: the default four, and the sheet says to make a free account.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { Button, Modal, Switch } from "@empac/cascadeds";
import { IconTile } from "@/components/ui/IconTile";
import { DAILIES_GLYPHS } from "@/components/originals/DailiesCards";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { DAILIES, availableDailies, cleanDailyPicks, picksOrDefault, type DailiesId, type DailyGameId } from "@/lib/originals/dailies";
import "@/styles/dailies.css";

/** What the server knows: `picks` is the list to show, `chosen` whether it's their own (else the default four). */
export interface DailyPicksSeed {
  signedIn: boolean;
  picks?: readonly string[] | null;
  chosen?: boolean;
  canChoose?: boolean;
}

export interface DailyPicksHook {
  /** Your dailies, in order (the default four signed out or until you choose). Never the Weekly. */
  picks: DailiesId[];
  /** The server has answered (or the page passed what it knows). */
  ready: boolean;
  signedIn: boolean;
  /** Choosing works here: signed in, and the account can store a list. */
  canChoose: boolean;
  /** They chose (a list is stored); false = the default four. */
  chosen: boolean;
  /** Saves a new list (at least one daily). Rejects with Error("signin" | "not_ready" | "at_least_one" | "failed"). */
  save: (picks: DailiesId[]) => Promise<void>;
}

interface Snap {
  /** Their own list, or null for the default four. */
  own: DailyGameId[] | null;
  signedIn: boolean | null;
  canChoose: boolean;
  ready: boolean;
}

const CACHE_KEY = "gs-daily-picks";
const BLANK: Snap = { own: null, signedIn: null, canChoose: false, ready: false };
let snap: Snap | null = null;
const listeners = new Set<() => void>();

function fromCache(): Snap {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { picks?: unknown } | null;
    const own = cleanDailyPicks(c?.picks);
    return own ? { ...BLANK, own } : BLANK;
  } catch {
    return BLANK;
  }
}

function current(): Snap {
  if (!snap) snap = typeof window === "undefined" ? BLANK : fromCache();
  return snap;
}

function set(next: Snap) {
  snap = next;
  try {
    // Only a chosen list is worth remembering: no list means the default four anyway.
    if (next.signedIn === false || (next.ready && !next.own)) localStorage.removeItem(CACHE_KEY);
    else if (next.own) localStorage.setItem(CACHE_KEY, JSON.stringify({ picks: next.own }));
  } catch { /* the bar just waits for the server */ }
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
const serverSnap = () => BLANK;

function seedSnap(seed: DailyPicksSeed): Snap {
  return { own: seed.chosen ? cleanDailyPicks(seed.picks) : null, signedIn: seed.signedIn, canChoose: !!seed.canChoose && seed.signedIn, ready: true };
}

let inflight: Promise<void> | null = null;
let queued: DailyGameId[] | null = null;

/** Stores what a server answer says (from /api/dailies or a page's own read). Skipped while a save is on its way. */
export function primeDailyPicks(seed: DailyPicksSeed) {
  if (inflight) return;
  set(seedSnap(seed));
}

let loading: Promise<void> | null = null;
function loadPicks(api: (path: string, init?: RequestInit) => Promise<Response>): Promise<void> {
  if (loading) return loading;
  loading = api("/api/dailies/picks", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: DailyPicksSeed | null) => {
      if (d) primeDailyPicks(d);
      else if (!inflight) set({ ...current(), ready: true });
    })
    .catch(() => { if (!inflight) set({ ...current(), ready: true }); });
  return loading;
}

async function flush(api: (path: string, init?: RequestInit) => Promise<Response>) {
  while (queued) {
    const picks = queued;
    queued = null;
    const r = await api("/api/dailies/picks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ picks }) }).catch(() => null);
    if (!r?.ok) {
      const j = (await r?.json().catch(() => null)) as { error?: string } | null;
      queued = null;
      // Put back what the server has.
      inflight = null;
      loading = null;
      void loadPicks(api);
      throw new Error(j?.error ?? "failed");
    }
  }
}

function savePicks(api: (path: string, init?: RequestInit) => Promise<Response>, raw: readonly DailiesId[]): Promise<void> {
  const s = current();
  if (!s.signedIn) return Promise.reject(new Error("signin"));
  if (!s.canChoose) return Promise.reject(new Error("not_ready"));
  const own = cleanDailyPicks(raw);
  if (!own) return Promise.reject(new Error("at_least_one"));
  // Shows at once (the bar behind the sheet changes with the switch); saves one at a time, the latest last.
  set({ ...s, own });
  queued = own;
  if (!inflight) inflight = flush(api).finally(() => { inflight = null; });
  return inflight;
}

/** The store as it stands, without asking the server (the today bar: /api/dailies brings the picks along). */
export function useDailyPicksSnapshot(): Snap {
  return useSyncExternalStore(subscribe, current, serverSnap);
}

/**
 * Your dailies, for Home and /dailies. `initial`: what the server already read (dailyPicksState on a server page),
 * so the first render matches the server's and nothing is fetched.
 */
export function useDailyPicks(initial?: DailyPicksSeed): DailyPicksHook {
  const { api } = useOriginalsHost();
  const s = useDailyPicksSnapshot();
  const seed = initial ? JSON.stringify(initial) : null;
  useEffect(() => {
    if (current().ready) return;
    if (seed) primeDailyPicks(JSON.parse(seed) as DailyPicksSeed);
    else void loadPicks(api);
  }, [api, seed]);
  const base = useMemo(() => (s.ready || !seed ? s : seedSnap(JSON.parse(seed) as DailyPicksSeed)), [s, seed]);
  const picks = useMemo(() => picksOrDefault(base.own), [base.own]);
  const save = useCallback((next: DailiesId[]) => savePicks(api, next), [api]);
  return { picks, ready: base.ready, signedIn: !!base.signedIn, canChoose: base.canChoose, chosen: !!base.own, save };
}

const noop = () => () => {};
const SAVE_ERRORS: Record<string, string> = {
  signin: "Sign in to choose your dailies",
  not_ready: "Choosing your dailies isn't open yet",
  at_least_one: "Keep at least one daily on",
};

/** The Choose sheet: a row per daily with its switch, and Done. Changes save as you go. */
export function DailyPicksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The CDS Modal portals to the body: only after hydration.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return null;
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Your dailies"
      size="small"
      className="daily-picks-sheet"
      footer={<Button variant="primary" onClick={onClose} className="daily-picks__done">Done</Button>}
    >
      <PicksBody onClose={onClose} />
    </Modal>
  );
}

function PicksBody({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { picks, ready, signedIn, canChoose, save } = useDailyPicks();
  const available = availableDailies();
  const on = new Set<DailiesId>(picks);
  // Said once when the sheet closes, if anything changed (each switch saves by itself).
  const start = useRef<string | null>(null);
  const latest = useRef<string>("");
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
    latest.current = picks.join(",");
    if (ready && start.current === null) start.current = latest.current;
  }, [picks, ready, toast]);
  useEffect(() => () => {
    if (start.current !== null && latest.current !== start.current) {
      track(EVENTS.dailyPicksSaved, { count: latest.current.split(",").length, picks: latest.current });
      toastRef.current.success("Your dailies are saved");
    }
  }, []);

  const toggle = (id: DailyGameId, wanted: boolean) => {
    const next = available.filter((x) => (x === id ? wanted : on.has(x)));
    if (!next.length) return;
    save(next).catch((e: Error) => toast.error(SAVE_ERRORS[e.message] ?? "Couldn't save your dailies"));
  };

  return (
    <div className="daily-picks">
      <p className="daily-picks__lead">
        Pick the ones you play. They show on Home and above every daily; the rest stay one tap away in{" "}
        <Link href="/dailies" onClick={onClose}>All dailies</Link>.
      </p>
      {ready && !signedIn && (
        <p className="daily-picks__note">
          <Link href="/signup?redirect=/dailies" onClick={onClose}>Make a free account</Link> to choose yours.
        </p>
      )}
      {ready && signedIn && !canChoose && <p className="daily-picks__note">Choosing your dailies opens soon. Until then you have all of them.</p>}
      <ul className="daily-picks__list">
        {available.map((id) => {
          const g = DAILIES[id];
          const last = on.has(id) && on.size === 1;
          return (
            <li key={id} className={`daily-picks__row dailies--${id}`}>
              <IconTile icon={DAILIES_GLYPHS[id]} tone={id} />
              <Switch
                className="daily-picks__switch"
                labelPosition="left"
                label={g.name}
                helperText={g.pitch}
                checked={on.has(id)}
                disabled={!ready || !canChoose || last}
                onChange={(e) => toggle(id, e.target.checked)}
              />
            </li>
          );
        })}
      </ul>
      {canChoose && on.size === 1 && <p className="daily-picks__note">Keep at least one on.</p>}
    </div>
  );
}
