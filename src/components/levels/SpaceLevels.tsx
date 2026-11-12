"use client";

/**
 * A game space's Levels (or Seeds) tab (levels picks 2026-11-11, picks 13A and 18A; curation picks, all as
 * recommended): levels players share by code. With the curation tables (supabase/levels-m2.sql): GameShuffle picks
 * first, the level of the week, then the sorts Top this week, Streamers' picks, Newest, Hardest and Lists; players
 * like levels and say how they went; GS Pro streamers add levels (or whole lists) to their queue; staff pin picks and
 * the level of the week in place. Before the tables, the first board's Newest, Played on stream and Hard.
 *
 * Sharing needs a free account (signed out, Share opens the sign-up sheet and comes back to the form), as do likes,
 * marks and lists. `?share=<code>` (from a "your level was cleared on stream" notification) opens the form with the
 * code filled in.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button, Chip } from "@empac/cascadeds";
import { JoinSheet, useThen } from "@/components/games/JoinSheet";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { GhostRows } from "@/components/ui/Ghost";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { boardNoun, itemWord, LEVEL_GAMES, type LevelGame } from "@/lib/levels/games";
import { boardSorts, type BoardSort, type MarkOutcome } from "@/lib/levels/rules";
import type { BoardExtras, LevelCardView } from "@/lib/levels/types";
import { LevelRow, type RowActions } from "./LevelRow";
import { ShareLevelForm } from "./ShareLevelForm";
import { AddToListDialog, levelPost, PinDialog, ReportDialog } from "./LevelDialogs";
import { LevelLists, queuedLine } from "./LevelLists";
import { ProWallModal } from "@/components/billing/ProWallModal";
import "@/styles/levels.css";

const noop = () => () => {};
/** `?share=<code>` on the address, read after hydration. */
function useShareParam(): string | null {
  return useSyncExternalStore(noop, () => new URLSearchParams(window.location.search).get("share"), () => null);
}

export function SpaceLevels({ space, game, initial, more: moreAtFirst, sort: sortAtFirst = "newest", extras, signedIn }: {
  space: string;
  game: LevelGame;
  initial: LevelCardView[];
  more: boolean;
  sort?: BoardSort;
  /** Null before the curation tables. */
  extras: BoardExtras | null;
  signedIn: boolean;
}) {
  const g = LEVEL_GAMES[game];
  const noun = boardNoun(game);
  const word = itemWord(game);
  const toast = useToast();
  const confirm = useConfirm();
  const curation = !!extras?.curation;
  const viewer = curation ? extras!.viewer : null;
  const sorts = boardSorts(game, curation);
  const [sort, setSort] = useState<BoardSort>(sortAtFirst);
  const [levels, setLevels] = useState<LevelCardView[]>(initial);
  const [picks, setPicks] = useState<LevelCardView[]>(extras?.picks ?? []);
  const [week, setWeek] = useState<LevelCardView | null>(extras?.week ?? null);
  const [mine, setMine] = useState(extras?.myLists ?? []);
  const [more, setMore] = useState(moreAtFirst);
  const [loading, setLoading] = useState(false);
  const shareParam = useShareParam();
  const [sharing, setSharing] = useState(false);
  const [ask, setAsk] = useState<null | "share" | "levels">(null);
  const [reporting, setReporting] = useState<LevelCardView | null>(null);
  const [pinning, setPinning] = useState<LevelCardView | null>(null);
  const [listing, setListing] = useState<LevelCardView | null>(null);
  const [proWall, setProWall] = useState(false);

  useThen("share-level", signedIn, () => setSharing(true));
  // Back from "your level was cleared on stream": the form, with the code filled in.
  const [sharedFromNote, setSharedFromNote] = useState<string | null>(null);
  if (shareParam && signedIn && sharedFromNote !== shareParam && !sharing) {
    setSharedFromNote(shareParam);
    setSharing(true);
  }

  /** A fresh card (after a like, a mark or a pin) replaces the old one everywhere it shows. */
  const swap = (card: LevelCardView) => {
    setLevels((ls) => ls.map((l) => (l.id === card.id ? card : l)));
    setPicks((ps) => {
      const without = ps.filter((p) => p.id !== card.id);
      return card.curation?.pick ? (ps.some((p) => p.id === card.id) ? ps.map((p) => (p.id === card.id ? card : p)) : [card, ...without]) : without;
    });
    setWeek((w) => (w?.id === card.id ? card : w));
  };

  const load = useCallback(async (s: BoardSort, offset: number) => {
    const q = new URLSearchParams({ game, sort: s, offset: String(offset) });
    const r = await fetch(`/api/levels?${q}`, { cache: "no-store" }).catch(() => null);
    return r?.ok ? ((await r.json()) as { levels: LevelCardView[]; more: boolean }) : null;
  }, [game]);

  async function pick(s: BoardSort) {
    if (s === sort) return;
    setSort(s);
    if (s === "lists") return;
    setLoading(true);
    const d = await load(s, 0);
    setLoading(false);
    if (d) { setLevels(d.levels); setMore(d.more); }
  }
  async function showMore() {
    setLoading(true);
    const d = await load(sort, levels.length);
    setLoading(false);
    if (d) { setLevels((ls) => [...ls, ...d.levels.filter((n) => !ls.some((l) => l.id === n.id))]); setMore(d.more); }
  }

  const act = async (l: LevelCardView, body: Record<string, unknown>, done?: string): Promise<LevelCardView | null> => {
    const r = await levelPost(l.id, body);
    if (!r.ok) { toast.error((r.data?.line as string | undefined) ?? "That didn't go through. Try again."); return null; }
    const card = r.data?.level as LevelCardView | undefined;
    if (card) swap(card);
    if (done) toast.success(done);
    return card ?? null;
  };

  const actions: RowActions = {
    needAccount: () => setAsk("levels"),
    mark: (l, outcome: MarkOutcome | null) => {
      void act(l, { action: "mark", outcome }).then((c) => { if (c) track(EVENTS.levelMarked, { game, outcome: outcome ?? "none" }); });
    },
    like: (l) => {
      const liked = !l.curation?.mine.liked;
      void act(l, { action: "like", liked }).then((c) => { if (c && liked) track(EVENTS.levelLiked, { game }); });
    },
    addToList: (l) => setListing(l),
    queue: (l) => {
      void levelPost(l.id, { action: "queue" }).then((r) => {
        const q = r.data?.queued as { added: number; held: number; refused: { why: string }[] } | undefined;
        if (r.data?.error === "pro_required") { setProWall(true); return; }
        if (!r.ok || !q) { toast.error("That didn't go through. Try again."); return; }
        if (q.added) track(EVENTS.levelQueuedFromBoard, { game });
        (q.added ? toast.success : toast.error)(queuedLine(q));
      });
    },
    report: (l) => setReporting(l),
    pin: (l) => setPinning(l),
    week: (l) => {
      void confirm({ title: `Make ${l.title} the level of the week?`, body: `It leads the ${g.name} space's Now tab until Monday, and its maker hears about it.`, confirmLabel: "Make it the level of the week", danger: false })
        .then((yes) => (yes ? act(l, { action: "week" }, "Level of the week set") : null))
        .then((c) => { if (c) setWeek(c); });
    },
    remove: (l) => {
      void confirm({ title: `Take ${l.title} off the board?`, body: "Its plays on stream stay with the code.", confirmLabel: "Take it off" }).then(async (yes) => {
        if (!yes) return;
        const r = await fetch(`/api/levels/${l.id}`, { method: "DELETE" }).catch(() => null);
        if (!r?.ok) { toast.error("That didn't go through. Try again."); return; }
        setLevels((ls) => ls.filter((x) => x.id !== l.id));
        setPicks((ps) => ps.filter((x) => x.id !== l.id));
        setWeek((w) => (w?.id === l.id ? null : w));
        toast.success("Taken off the board");
      });
    },
  };
  const share = () => (signedIn ? setSharing(true) : setAsk("share"));

  const empty = (
    <GhostRows count={3} places={false} notice={<>
      <p>No {g.name} {word}s here yet. <b>Share one you made or love</b> with its {g.codeWord}{g.kind === "level" ? ", and streamers can play it" : ""}.</p>
      <div className="space-actions"><button type="button" className="room-btn" onClick={share}>{`Share a ${word}`}</button></div>
    </>} />
  );
  const emptyFor: Partial<Record<BoardSort, string>> = {
    top: `Nobody has liked a ${word} this week yet. Likes from the last 7 days put a ${word} here.`,
    streamers: `${noun} cleared on two or more streams show here. Streamers play them from their level queue.`,
    hardest: `${noun} show here once five players have said how they went.`,
    played: `None of these ${word}s has been played on stream yet.`,
    hard: `No ${word}s tagged hard yet.`,
  };
  const anyLevels = levels.length > 0 || picks.length > 0 || !!week;

  return (
    <section className="room-tile lvl-board" aria-labelledby="sp-levels">
      <div className="room-tile__head">
        <h2 id="sp-levels">{noun}</h2>
        {/* An empty board's ghost carries the button, so the head doesn't repeat it. */}
        {(anyLevels || sort !== "newest") && <Button variant="primary" size="small" className="lvl-board__share" onClick={share} aria-haspopup="dialog">{`Share a ${word}`}</Button>}
      </div>

      {week && (
        <div className="lvl-board__group">
          <h3 className="room-kicker">Level of the week</h3>
          <ul className="lvl-list"><LevelRow l={week} viewer={viewer} actions={actions} /></ul>
        </div>
      )}
      {picks.length > 0 && (
        <div className="lvl-board__group">
          <h3 className="room-kicker">GameShuffle picks</h3>
          <ul className="lvl-list">{picks.map((l) => <LevelRow key={l.id} l={l} viewer={viewer} actions={actions} />)}</ul>
        </div>
      )}

      <div className="lvl-board__group">
        {(week || picks.length > 0) && <h3 className="room-kicker">{`All ${word}s`}</h3>}
        <div className="lvl-board__sorts" role="group" aria-label="Show">
          {sorts.map((s) => <Chip key={s.id} label={s.label} clickable selected={sort === s.id} onClick={() => void pick(s.id)} />)}
        </div>
        {sort === "lists" && viewer ? (
          <LevelLists game={game} viewer={viewer} onMine={setMine} />
        ) : levels.length === 0 ? (
          sort === "newest" ? empty : <p className="room-tile__note">{emptyFor[sort]}</p>
        ) : (
          <ul className="lvl-list" aria-busy={loading}>
            {levels.map((l) => <LevelRow key={l.id} l={l} viewer={viewer} actions={actions} weekable={sort === "top"} />)}
          </ul>
        )}
        {sort !== "lists" && more && <div><Button variant="secondary" onClick={() => void showMore()} disabled={loading}>{loading ? "Loading" : "Show more"}</Button></div>}
      </div>

      <ShareLevelForm key={sharedFromNote ?? "form"} game={game} open={sharing} initialCode={sharedFromNote}
        onClose={() => setSharing(false)} onShared={(l) => { if (sort === "newest") setLevels((ls) => [l, ...ls]); }} />
      <JoinSheet
        open={!!ask} onClose={() => setAsk(null)} space={space} action={ask === "share" ? "share-level" : "levels"} params={{ tab: game === "minecraft" ? "seeds" : "levels" }}
        heading={ask === "share" ? `Share a ${word}` : "Join to say how it went"}
        body={ask === "share"
          ? `Free. Share your ${g.name} ${word}s where its players${g.kind === "level" ? " and streamers" : ""} look, and see how they went.`
          : `Free. Like ${word}s, say how they went and make lists, and hear when someone you follow shares one.`}
      />
      {reporting && <ReportDialog key={reporting.id} level={reporting} onClose={() => setReporting(null)} />}
      {pinning && <PinDialog key={pinning.id} level={pinning} onClose={() => setPinning(null)} onSaved={swap} />}
      {listing && <AddToListDialog level={listing} lists={mine} onClose={() => setListing(null)} onListsChange={setMine} />}
      <ProWallModal isOpen={proWall} onClose={() => setProWall(false)} heading="Add to your queue" title="The level queue is part of GS Pro" from="level-queue">
        <p>Chat sends {itemWord(game)}s in with a command, you play them in order on stream, and the board keeps what you played.</p>
      </ProWallModal>
    </section>
  );
}

/**
 * The space's Now tab: its level of the week, the GameShuffle picks and the newest three, as short rows, with a link
 * to the board. Before the curation tables, the newest three only.
 */
export function LevelsNow({ game, newest, extras }: { game: LevelGame; newest: LevelCardView[]; extras: BoardExtras | null }) {
  const g = LEVEL_GAMES[game];
  const noun = boardNoun(game);
  const word = itemWord(game);
  const tab = game === "minecraft" ? "seeds" : "levels";
  const week = extras?.week ?? null;
  const picks = (extras?.picks ?? []).filter((p) => p.id !== week?.id);
  const newestShown = newest.filter((n) => n.id !== week?.id && !picks.some((p) => p.id === n.id)).slice(0, 3);
  return (
    <section className="room-tile lvl-board" aria-labelledby="sp-levels-now">
      <div className="room-tile__head">
        <h2 id="sp-levels-now">{noun}</h2>
        {(newest.length > 0 || picks.length > 0) && <ArrowLink plain href={`?tab=${tab}`} className="room-tile__more">{`All ${word}s`}</ArrowLink>}
      </div>
      {week && (
        <div className="lvl-board__group">
          <h3 className="room-kicker">Level of the week</h3>
          <ul className="lvl-list"><LevelRow l={week} viewer={null} compact from="now" /></ul>
        </div>
      )}
      {picks.length > 0 && (
        <div className="lvl-board__group">
          <h3 className="room-kicker">GameShuffle picks</h3>
          <ul className="lvl-list">{picks.map((l) => <LevelRow key={l.id} l={l} viewer={null} compact from="now" />)}</ul>
        </div>
      )}
      {newestShown.length > 0 ? (
        <div className="lvl-board__group">
          {(week || picks.length > 0) && <h3 className="room-kicker">Newest</h3>}
          <ul className="lvl-list">{newestShown.map((l) => <LevelRow key={l.id} l={l} viewer={null} compact from="now" />)}</ul>
        </div>
      ) : !week && !picks.length && (
        <GhostRows count={3} places={false} notice={<>
          <p>No {g.name} {word}s here yet. <b>Share one you made or love</b> with its {g.codeWord}.</p>
          <div className="space-actions"><Link href={`?tab=${tab}`} scroll={false} className="room-btn">{`Share a ${word}`}</Link></div>
        </>} />
      )}
    </section>
  );
}
