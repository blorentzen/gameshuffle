"use client";

/**
 * The reactions under a post or comment (GIFs step 2, picks https://claude.ai/artifact/3JFd2GLvPRQtypZBHrHAhg):
 * emoji and GameShuffle stickers in one row of CascadeDS reaction pills, one React button whose picker opens on the
 * stickers (the six emoji below them), and never more than a few pills: the rest fold into "+N", which opens them
 * all. A sticker you add plays its glyph once; every other pill stays still.
 *
 * Built from CascadeDS's reaction pill styles because its Reactions component only takes its six emoji and its own
 * add button (raise with CascadeDS: Reactions with custom items).
 */

import { useState } from "react";
import { Button, Modal, Popover, Tooltip } from "@empac/cascadeds";
import { IconMoodSmile } from "@tabler/icons-react";
import { GsSticker } from "@/components/gifs/GsSticker";
import { STICKERS, STICKER_GROUPS, STICKER_BY_ID, stickerText } from "@/data/stickers";
import { MAX_PILLS, QUICK_STICKERS, REACTION_EMOJI, reactionLabel, stickerKey, stickerOfKey, visibleReactions, type ReactionCount } from "@/lib/social/reactions";
import "@/styles/gifs.css";
import "@/styles/reactions.css";

type Size = keyof typeof MAX_PILLS;

function Pill({ r, size, play, onToggle }: { r: ReactionCount; size: Size; play: number; onToggle: (key: string) => void }) {
  const sticker = stickerOfKey(r.emoji);
  const label = reactionLabel(r.emoji);
  const who = r.users?.length ? `: ${r.users.join(", ")}` : "";
  return (
    <Tooltip content={sticker ? `${label}, ${STICKER_BY_ID[sticker].meaning.toLowerCase()}${who}` : `${label}${who}`}>
      <button
        type="button"
        className={`empac-reaction-pill empac-reaction-pill--small rx-pill${r.reacted ? " empac-reaction-pill--active" : ""}`}
        aria-pressed={r.reacted}
        aria-label={`${label}, ${r.count}${r.reacted ? ", you reacted" : ""}`}
        onClick={() => onToggle(r.emoji)}
      >
        {sticker ? (
          <>
            <GsSticker id={sticker} size="xs" still={!play} play={play} className="rx-pill__tile" />
            {size === "post" && <span className="rx-pill__word" aria-hidden="true">{label}</span>}
          </>
        ) : (
          <span className="empac-reaction-pill__emoji" aria-hidden="true">{r.emoji}</span>
        )}
        <span className="empac-reaction-pill__count" aria-hidden="true">{r.count}</span>
      </button>
    </Tooltip>
  );
}

function Picker({ mine, onPick }: { mine: Set<string>; onPick: (key: string) => void }) {
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState<{ id: string; n: number } | null>(null);
  const play = (id: string) => setHover((h) => ({ id, n: (h?.n ?? 0) + 1 }));
  const tile = (id: string) => {
    const s = STICKER_BY_ID[id];
    const on = mine.has(stickerKey(id));
    return (
      <button
        key={id}
        type="button"
        className="rx-picker__sticker"
        aria-pressed={on}
        aria-label={`${stickerText(s)}: ${s.meaning}${on ? " (yours, press to take it back)" : ""}`}
        title={s.meaning}
        onMouseEnter={() => play(id)}
        onFocus={() => play(id)}
        onClick={() => onPick(stickerKey(id))}
      >
        <GsSticker id={id} size="sm" still={hover?.id !== id} play={hover?.id === id ? hover.n : 0} />
      </button>
    );
  };
  return (
    <div className="rx-picker">
      <p className="rx-picker__h">Stickers</p>
      {all ? (
        <div className="rx-picker__all">
          {STICKER_GROUPS.map((g) => (
            <section key={g} aria-label={g}>
              <h3 className="rx-picker__group">{g}</h3>
              <div className="rx-picker__grid">{STICKERS.filter((s) => s.group === g).map((s) => tile(s.id))}</div>
            </section>
          ))}
        </div>
      ) : (
        <>
          <div className="rx-picker__grid">{QUICK_STICKERS.map(tile)}</div>
          <Button variant="ghost" size="small" onClick={() => setAll(true)}>All {STICKERS.length} stickers</Button>
        </>
      )}
      <div className="rx-picker__emoji" role="group" aria-label="Emoji">
        {REACTION_EMOJI.map((e) => (
          <button key={e} type="button" className="rx-picker__e" aria-pressed={mine.has(e)} aria-label={reactionLabel(e)} onClick={() => onPick(e)}>{e}</button>
        ))}
      </div>
    </div>
  );
}

export function ReactionRow({ reactions, onReact, onRemove, size = "post", disabled = false, className, addText, addClassName }: {
  reactions: ReactionCount[];
  onReact: (key: string) => void;
  onRemove: (key: string) => void;
  size?: Size;
  disabled?: boolean;
  className?: string;
  /** The React button as a word (a comment's actions line) instead of the smiley. */
  addText?: string;
  addClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [played, setPlayed] = useState<{ key: string; n: number } | null>(null);
  const mine = new Set(reactions.filter((r) => r.reacted).map((r) => r.emoji));

  const toggle = (key: string) => {
    if (mine.has(key)) { onRemove(key); return; }
    onReact(key);
    if (stickerOfKey(key)) setPlayed((p) => ({ key, n: (p?.n ?? 0) + 1 }));
  };
  const { shown, hidden } = visibleReactions(reactions, MAX_PILLS[size]);
  const pill = (r: ReactionCount) => <Pill key={r.emoji} r={r} size={size} play={played?.key === r.emoji ? played.n : 0} onToggle={toggle} />;

  return (
    <div className={`rx-row rx-row--${size}${addText ? " rx-row--word" : ""}${className ? ` ${className}` : ""}`}>
      {shown.map(pill)}
      {hidden.length > 0 && (
        <button type="button" className="empac-reaction-pill empac-reaction-pill--small rx-more" onClick={() => setAllOpen(true)} aria-label={`${hidden.length} more reactions`}>
          +{hidden.length}
        </button>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        position="bottom"
        className="rx-pop"
        disabled={disabled}
        // CDS Popover's wrapper is the button (focus, keys, aria-expanded, disabled), so the trigger is plain content:
        // a <button> here nested one button in another, two tab stops for one control (axe nested-interactive).
        trigger={addText ? (
          <span className={addClassName}>{addText}</span>
        ) : (
          <span className={`rx-add${size === "comment" ? " rx-add--sm" : ""}`}>
            <IconMoodSmile size={size === "comment" ? 15 : 16} stroke={1.8} aria-hidden="true" />
            <span className="sr-only">React</span>
          </span>
        )}
        content={<Picker mine={mine} onPick={(key) => { setOpen(false); toggle(key); }} />}
      />
      {allOpen && (
        <Modal isOpen onClose={() => setAllOpen(false)} title="Reactions" size="small">
          <div className="rx-row rx-row--all">{[...shown, ...hidden].map((r) => <Pill key={r.emoji} r={r} size="post" play={0} onToggle={toggle} />)}</div>
        </Modal>
      )}
    </div>
  );
}
