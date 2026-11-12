"use client";

/**
 * One level (or seed) on a board (levels picks 2026-11-11; curation picks, all as recommended). The code with Copy
 * code, who shared it (and their Mario Maker 2 maker ID), where it was played on stream and how it went, its
 * difficulty once 5 players said how it went ("Cleared by 4 of 18"; the tags until then), badges for a GameShuffle
 * pick, the level of the week and "May not work". With the curation tables, a like and "How it went" (cleared, gave
 * up, the code didn't load) for players, and a menu for the rest: add to a list or a level queue, report, and the
 * staff's pick and level of the week. A seed shows its edition, version, note and places worth seeing.
 */

import Link from "next/link";
import { Badge, Button, Dropdown, IconButton, type DropdownMenuItem } from "@empac/cascadeds";
import { IconChevronDown, IconCopy, IconDots, IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { LEVEL_GAMES, itemWord } from "@/lib/levels/games";
import { EDITION_WORD, MARK_DONE, MARK_WORD, spotLine, type MarkOutcome } from "@/lib/levels/rules";
import type { BoardExtras, LevelCardView } from "@/lib/levels/types";

export async function copyLevelCode(l: Pick<LevelCardView, "code" | "game">, from: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(l.code);
    toast.success(`Copied ${l.code}`);
    track(EVENTS.levelCodeCopied, { game: l.game, from });
  } catch {
    toast.error("Couldn't copy. Select the code and copy it by hand.");
  }
}

export interface RowActions {
  /** Signed out: like and mark open the sign-up sheet instead. */
  needAccount: () => void;
  mark: (l: LevelCardView, outcome: MarkOutcome | null) => void;
  like: (l: LevelCardView) => void;
  addToList: (l: LevelCardView) => void;
  queue: (l: LevelCardView) => void;
  report: (l: LevelCardView) => void;
  pin: (l: LevelCardView) => void;
  week: (l: LevelCardView) => void;
  remove: (l: LevelCardView) => void;
}

export function LevelRow({ l, viewer, actions, weekable = false, compact = false, from = "board" }: {
  l: LevelCardView;
  /** Null: the board before the curation tables (copy and remove only). */
  viewer: BoardExtras["viewer"] | null;
  actions?: Partial<RowActions>;
  /** Top this week: staff can make it the level of the week. */
  weekable?: boolean;
  /** The Now tab's short rows: no like, marks or menu. */
  compact?: boolean;
  from?: string;
}) {
  const toast = useToast();
  const g = LEVEL_GAMES[l.game];
  const c = l.curation;
  const seed = g.kind === "seed";
  const lineBits = [l.played ?? (l.isNew ? "New" : null)].filter(Boolean) as string[];
  const curating = !!viewer && !!c && !compact;

  const markItems: DropdownMenuItem[] = (["cleared", "gave_up", "no_load"] as const).map((o) => ({
    label: MARK_WORD[o], checked: c?.mine.outcome === o, onClick: () => actions?.mark?.(l, c?.mine.outcome === o ? null : o),
  }));
  if (c?.mine.outcome) markItems.push({ type: "divider" }, { label: "Take my mark off", onClick: () => actions?.mark?.(l, null) });

  const more: DropdownMenuItem[] = [];
  if (viewer?.signedIn) more.push({ label: "Add to a list", onClick: () => actions?.addToList?.(l) });
  if (viewer?.signedIn && !seed) more.push({ label: "Add to my queue", onClick: () => actions?.queue?.(l) });
  if (viewer?.signedIn && !l.canRemove) more.push({ label: `Report this ${itemWord(l.game)}`, onClick: () => actions?.report?.(l) });
  if (viewer?.staff) {
    more.push({ type: "divider" }, { type: "label", label: "Staff" });
    more.push({ label: c?.pick ? "Change the pick's note or take it off" : "Pin as a GameShuffle pick", onClick: () => actions?.pin?.(l) });
    if (weekable && !seed && !c?.weeks.length) more.push({ label: "Make it the level of the week", onClick: () => actions?.week?.(l) });
  }
  if (l.canRemove) more.push({ type: "divider" }, { label: "Take it off the board", danger: true, onClick: () => actions?.remove?.(l) });

  return (
    <li className={`lvl-row${compact ? " lvl-row--compact" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the publisher's cover (box art) */}
      <img className="lvl-row__box" src={`/images/box-art/${l.game}.webp`} alt="" width={48} height={64} />
      <div className="lvl-row__body">
        <h3 className="lvl-row__title">{l.title}</h3>
        {c && (c.weeks.length > 0 || c.pick || c.mayNotWork || c.held) && (
          <p className="lvl-row__badges">
            {c.weeks.length > 0 && <Badge variant="warning" size="small">{`Level of the week, ${c.weeks[0]}`}</Badge>}
            {c.pick && <Badge variant="info" size="small">GameShuffle pick</Badge>}
            {c.mayNotWork && <Badge variant="error" size="small">May not work</Badge>}
            {c.held && <Badge variant="default" size="small">Hidden after reports</Badge>}
          </p>
        )}
        <p className="lvl-row__code">
          <span className="lvq-code" aria-label={`${g.codeWord} ${l.code}`}>{l.code}</span>
          {l.seed && (l.seed.edition || l.seed.version) && <span className="lvl-row__seedmeta">{[l.seed.edition ? EDITION_WORD[l.seed.edition] : null, l.seed.version].filter(Boolean).join(" ")}</span>}
        </p>
        <p className="lvl-row__line">
          {l.by.username ? <Link href={`/u/${l.by.username}`}>Shared by {l.by.name}</Link> : `Shared by ${l.by.name}`}
          {c?.makerId && <> · Maker ID <span className="lvl-row__maker">{c.makerId}</span></>}
          {lineBits.length > 0 && ` · ${lineBits.join(" · ")}`}
        </p>
        {c?.clears && <p className="lvl-row__line lvl-row__clears">{c.clears}</p>}
        {c?.pick && <p className="lvl-row__pick"><b>GameShuffle:</b> {c.pick}</p>}
        {l.seed?.note && <p className="lvl-row__note">{l.seed.note}</p>}
        {l.seed && l.seed.spots.length > 0 && !compact && (
          <ul className="lvl-row__spots" aria-label="Places worth seeing">
            {l.seed.spots.map((s, i) => <li key={i}><b>{s.label}</b> <span className="lvq-code lvq-code--small">{spotLine(s)}</span></li>)}
          </ul>
        )}
        {l.tags.length > 0 && !compact && (
          <ul className="lvl-row__tags" aria-label="Tags">{l.tags.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
      </div>
      <div className="lvl-row__acts">
        <Button size="small" variant="secondary" iconBefore={IconCopy} onClick={() => void copyLevelCode(l, from, toast)} aria-label={`Copy ${g.codeWord} ${l.code}`}>{seed ? "Copy seed" : "Copy code"}</Button>
        {curating && (
          <Button
            size="small" variant="ghost" iconBefore={c.mine.liked ? IconHeartFilled : IconHeart}
            className={c.mine.liked ? "lvl-like lvl-like--on" : "lvl-like"}
            aria-pressed={c.mine.liked} aria-label={`${c.mine.liked ? "Liked" : "Like"} ${l.title}, ${c.likes} ${c.likes === 1 ? "like" : "likes"}`}
            onClick={() => (viewer.signedIn ? actions?.like?.(l) : actions?.needAccount?.())}
          >{c.likes.toLocaleString("en-US")}</Button>
        )}
        {curating && !seed && (
          viewer.signedIn ? (
            <Dropdown
              align="end" className="lvl-mark"
              trigger={<Button size="small" variant={c.mine.outcome ? "secondary" : "ghost"} iconAfter={IconChevronDown} aria-haspopup="menu">{c.mine.outcome ? MARK_DONE[c.mine.outcome] : "How it went"}</Button>}
              items={markItems}
            />
          ) : (
            <Button size="small" variant="ghost" onClick={() => actions?.needAccount?.()} aria-haspopup="dialog">How it went</Button>
          )
        )}
        {!compact && more.length > 0 && (
          <Dropdown
            align="end" className="admin-row-menu"
            trigger={<IconButton variant="tertiary" size="small" aria-label={`More for ${l.title}`} aria-haspopup="menu"><IconDots size={18} aria-hidden /></IconButton>}
            items={more}
          />
        )}
      </div>
    </li>
  );
}
