"use client";

/**
 * The studio's "What's on the card" and "Moments" tabs ("What's on the card" picks, 2026-10-21).
 *   What's on the card: how many details the layout holds and how many are on, the big number (MMR,
 *     world rank or the division), Keep MMR off the card, a switch per piece in folded groups (Who,
 *     Numbers, Tonight, Season, each saying how many are on), tonight's goal under its switch (GS Pro),
 *     recent events 3 or 5, and for GS Pro a line of your own and your own order (the shared
 *     SortableList: drag the handle, or use the arrows). Studio rounds 1 and 2 (2026-10-30): the
 *     presets became the ready-made cards above the studio (starts.ts), and a full layout stops
 *     further details ("No room") instead of letting them take turns.
 *   Moments: a switch per moment, and how the number moves.
 *   Rolling (in the Look tab when that layout is picked): shape, name and emblem, motion, each slide's
 *     time, the progress mark, and for GS Pro a time per slide.
 * GS Pro choices can be tried in the preview; a free save keeps their free versions (look.ts).
 * Feedback round (2026-10-29): the MMR switch works on every layout (locked on while MMR is the big
 * number), the country as a code, flag or both, Under the number (Strip, Sticker, Rolling), and the
 * panel's chat line switch.
 */

import { useId, type ReactNode } from "react";
import { Accordion, Button, Chip, IconButton, Input, Switch } from "@empac/cascadeds";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { SortableList, moveWithin } from "@/components/ui/SortableList";
import { Select } from "@/components/ui/Select";
import { NUMBER_CHOICES, type MmrCountry, type MmrLook } from "@/lib/mmr/look";
import {
  LAYOUT_SPOTS, LINE_MAX, MMR_PIECES, MOMENTS, PIECES, PIECE_GROUPS, PIECE_IDS, UNDER_CHOICES, UNDER_LAYOUTS, bigWanted, detailSwitches, isDetail, pieceDef, pieceOrder, roomLeft,
  type MmrBig, type MmrInfo, type MmrPiece, type MmrUnder, type PieceDef,
} from "@/lib/mmr/pieces";

const COUNTRY_CHOICES: { v: MmrCountry; label: string }[] = [{ v: "flag", label: "Flag" }, { v: "code", label: "Code" }, { v: "both", label: "Both" }];
const UNDER_ON: Record<MmrUnder, MmrPiece[]> = { none: [], tonight: ["tonight"], last10: ["last10"], both: ["tonight", "last10"] };
import {
  ROLL_MOTIONS, ROLL_PROGRESS, ROLL_SECS, ROLL_SHAPES, rollSlides, type MmrRolling, type RollSecs, type RollSlide,
} from "@/lib/mmr/rolling";

const Tag = ({ kind }: { kind: "new" | "pro" }) => (
  <span className={`mmr-studio__tag mmr-studio__tag--${kind}`}>{kind === "new" ? "New" : "GS Pro"}</span>
);

function PieceLabel({ p }: { p: PieceDef }) {
  return <span className="mmr-info__label">{p.label}{p.isNew && <Tag kind="new" />}{p.pro && <Tag kind="pro" />}</span>;
}

export function MmrWhatsOn({ look, onInfo, onLook, pro, chat = false, lineWarn, goalSlot }: {
  look: MmrLook;
  onInfo: (info: MmrInfo) => void;
  /** Look fields shown here (the country's flag or code). */
  onLook: (patch: Partial<MmrLook>) => void;
  pro: boolean;
  /** GameShuffle's bot answers !mmr in this streamer's chat. */
  chat?: boolean;
  /** The last save left the line off (blocked words). */
  lineWarn: boolean;
  /** Tonight's goal: the number field under the goal's switch while it's on (GS Pro), or a line about GS Pro. */
  goalSlot?: ReactNode;
}) {
  const info = look.info;
  const set = (patch: Partial<MmrInfo>) => onInfo({ ...info, ...patch });
  const layout = look.layout;
  const spots = LAYOUT_SPOTS[layout];
  const lineId = useId();
  const rolling = layout === "rolling";
  const big = bigWanted(info);
  const used = detailSwitches(layout, info).length;
  const room = roomLeft(layout, info);
  const where = spots.name.replace(/^The /, "the ");

  // Your own order (GS Pro): the pieces that are on, in order. Moving them keeps the others where they were.
  const full = pieceOrder(info);
  const onList = full.filter((p) => info.on[p]);
  const reorder = (next: MmrPiece[]) => {
    let k = 0;
    const merged = full.map((p) => (info.on[p] ? next[k++] : p));
    set({ order: merged.join() === PIECE_IDS.join() ? null : merged });
  };

  /** How a piece's switch stands: on, and why it can't be changed (or null). */
  const stateOf = (p: PieceDef): { on: boolean; why: string | null } => {
    if (!rolling && ((p.id === "mmr" && big === "mmr") || (p.id === "world" && big === "world") || (p.id === "division" && big === "division"))) return { on: true, why: "It's the big number." };
    if (info.hideMmr && MMR_PIECES.includes(p.id)) return { on: false, why: "Kept off the card with MMR." };
    if (p.id === "goal" && !pro) return { on: false, why: "Part of GS Pro." };
    if (!info.on[p.id] && room === 0 && isDetail(layout, info, p.id)) return { on: false, why: `No room on ${where}: it holds ${spots.slots} ${spots.slots === 1 ? "detail" : "details"}.` };
    return { on: info.on[p.id], why: null };
  };

  const pick = (b: MmrBig) => set({ big: b, hideMmr: b === "mmr" ? false : info.hideMmr });
  const groups = PIECE_GROUPS.map((g) => {
    const list = PIECES.filter((p) => p.group === g.id);
    const onCount = list.filter((p) => stateOf(p).on).length;
    return {
      id: g.id,
      title: <span className="mmr-fold__title">{g.label}<span className="mmr-fold__count">{onCount} of {list.length} on</span></span>,
      content: (
        <div className="mmr-info__list">
          {list.map((p) => {
            const st = stateOf(p);
            const note = st.why ?? (p.id === "mmr" && rolling ? "The MMR slide. A change still plays on its own slide when this is off." : p.id === "goal" ? "A number for tonight, with a moment when you reach it." : p.note);
            return (
              <div key={p.id} className="mmr-info__piece">
                <Switch
                  label={<PieceLabel p={p} />}
                  helperText={note}
                  checked={st.on}
                  disabled={st.why != null}
                  onChange={(e) => set({ on: { ...info.on, [p.id]: e.target.checked } })}
                />
                {p.id === "goal" && goalSlot && (!pro || info.on.goal) && !info.hideMmr && <div className="mmr-info__sub">{goalSlot}</div>}
                {p.id === "cc" && info.on.cc && (
                  <div className="mmr-studio__chips mmr-info__sub" role="group" aria-label="Show the country as">
                    {COUNTRY_CHOICES.map((c) => <Chip key={c.v} label={c.label} clickable selected={look.country === c.v} onClick={() => onLook({ country: c.v })} />)}
                  </div>
                )}
                {p.id === "recent" && info.on.recent && (
                  <div className="mmr-studio__chips mmr-info__sub" role="group" aria-label="How many recent events">
                    {([3, 5] as const).map((n) => <Chip key={n} label={`Latest ${n}`} clickable selected={info.recent === n} onClick={() => set({ recent: n })} />)}
                  </div>
                )}
                {p.id === "line" && info.on.line && (
                  <div className="mmr-studio__field mmr-info__sub">
                    <label htmlFor={lineId}>Your line</label>
                    <Input id={lineId} value={info.line} maxLength={LINE_MAX} placeholder="Road to Master" autoComplete="off" fullWidth error={lineWarn}
                      onChange={(e) => set({ line: e.target.value.slice(0, LINE_MAX) })} aria-describedby={`${lineId}-count`} />
                    <span id={`${lineId}-count`} className={`mmr-studio__note${lineWarn ? " mmr-studio__note--warn" : ""}`}>
                      {lineWarn ? "That line can't go on your card. Try different words." : `${info.line.length} of ${LINE_MAX} characters`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ),
    };
  });

  return (
    <div className="mmr-info">
      {rolling ? (
        <p className="mmr-studio__note">On Rolling, each piece that&apos;s on is a slide, in this order, so there&apos;s no limit. Your name, flag and division stay on the card or roll as the first slide (Look tab).</p>
      ) : (
        <div className="mmr-meter-wrap">
          <div className="mmr-meter" role="status">
            <span><b>{used} of {spots.slots} {spots.slots === 1 ? "detail" : "details"}</b> on {where}</span>
            <span className="mmr-meter__marks" aria-hidden="true">{Array.from({ length: spots.slots }, (_, i) => <i key={i} className={i < used ? "on" : undefined} />)}</span>
          </div>
          <p className="mmr-studio__note">{room === 0 ? "It's full. Turn one off to make room, or pick Rolling in the Look tab to show them all." : "Pieces with a spot of their own, like your name and the number, don't count."}</p>
        </div>
      )}

      {!rolling && <fieldset className="mmr-studio__set">
        <legend>The big number</legend>
        <div className="mmr-studio__chips">
          <Chip label="MMR" clickable selected={big === "mmr"} onClick={() => pick("mmr")} />
          <Chip label="World rank" clickable selected={big === "world"} onClick={() => pick("world")} />
          <Chip label="Division" clickable selected={big === "division"} onClick={() => pick("division")} />
        </div>
        <p className="mmr-studio__note">{big === "world" ? "Your MMR moves to the details. Before you have a world rank, the number stands in." : big === "division" ? "Your division's name is the headline, and your MMR becomes a detail." : "World rank sits with the details."}</p>
      </fieldset>}

      {(rolling || big !== "mmr") && (
        <Switch
          label="Keep MMR off the card"
          helperText="No MMR, season peak or goal. The change shows only your place, tonight is your record, and progress names your next division."
          checked={info.hideMmr}
          onChange={(e) => set({ hideMmr: e.target.checked })}
        />
      )}

      {UNDER_LAYOUTS.includes(look.layout) && (
        <fieldset className="mmr-studio__set">
          <legend>Under the number</legend>
          <div className="mmr-studio__chips">
            {UNDER_CHOICES.map((u) => (
              <Chip key={u.v} label={u.label} clickable selected={info.under === u.v}
                onClick={() => set({ under: u.v, on: { ...info.on, ...Object.fromEntries(UNDER_ON[u.v].map((p) => [p, true])) } })} />
            ))}
          </div>
          <p className="mmr-studio__note">
            {rolling ? "Sits under the MMR on its slide, instead of on slides of their own." : look.layout === "strip" ? "Sits under the number, instead of in the details or its own column." : "Sits under the number, instead of in the details."}
          </p>
        </fieldset>
      )}

      {look.layout === "panel" && (
        <Switch
          label={'"Type !mmr in chat" at the bottom'}
          helperText={chat ? "GameShuffle's bot answers !mmr in your Twitch chat." : "Shows only while GameShuffle's bot is in your Twitch chat, which comes with GS Pro's Twitch setup."}
          checked={info.chat}
          onChange={(e) => set({ chat: e.target.checked })}
        />
      )}

      <Accordion
        variant="flush"
        allowMultiple
        className="mmr-fold"
        items={[
          ...groups,
          {
            id: "order",
            title: <span className="mmr-fold__title"><span className="mmr-info__label">Your own order<Tag kind="pro" /></span>{info.order && <span className="mmr-fold__count">On</span>}</span>,
            content: (
              <div className="mmr-info__list">
                <p className="mmr-studio__note">Drag the pieces that are on into your order, or use the arrows. Details fill a layout&apos;s spots from the top; pieces marked with a spot of their own stay where the layout puts them.</p>
                {onList.length > 1 ? (
                  <SortableList items={onList} getId={(p) => p} onReorder={reorder} handleLabel={(p) => `Reorder ${pieceDef(p).label}`} className="mmr-order">
                    {(p, handle, i) => (
                      <div className="mmr-order__row">
                        {handle}
                        <span className="mmr-order__name">{pieceDef(p).label}</span>
                        {spots.fixed.includes(p) && <span className="mmr-order__own">Own spot</span>}
                        <IconButton variant="tertiary" size="small" aria-label={`Move ${pieceDef(p).label} up`} disabled={i === 0} onClick={() => reorder(moveWithin(onList, i, -1))}><IconArrowUp size={16} aria-hidden /></IconButton>
                        <IconButton variant="tertiary" size="small" aria-label={`Move ${pieceDef(p).label} down`} disabled={i === onList.length - 1} onClick={() => reorder(moveWithin(onList, i, 1))}><IconArrowDown size={16} aria-hidden /></IconButton>
                      </div>
                    )}
                  </SortableList>
                ) : <p className="mmr-studio__note">Turn on two or more pieces to put them in order.</p>}
                {info.order && <div><Button variant="ghost" size="small" onClick={() => set({ order: null })}>Use the usual order</Button></div>}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export function MmrMoments({ look, onLook, pro }: { look: MmrLook; onLook: (patch: Partial<MmrLook>) => void; pro: boolean }) {
  const info = look.info;
  return (
    <div className="mmr-info">
      <p className="mmr-studio__note">What plays when a new event is verified. Try them with the buttons under the preview.</p>
      <fieldset className="mmr-studio__set">
        <legend>Moments</legend>
        <div className="mmr-info__list">
          {MOMENTS.map((mo) => {
            // With MMR kept off the card, the moments that show MMR can't play.
            const hidden = info.hideMmr && (mo.id === "pop" || mo.id === "roll" || mo.id === "goal");
            const locked = (!!mo.pro && !pro) || hidden;
            return (
              <div key={mo.id} className="mmr-info__piece">
                <Switch
                  label={<span className="mmr-info__label">{mo.label}{mo.pro && <Tag kind="pro" />}</span>}
                  helperText={hidden ? "Off while MMR is kept off the card." : locked ? "Part of GS Pro, with a goal set on What's on the card." : mo.note}
                  checked={locked ? false : info.moments[mo.id]}
                  disabled={locked}
                  onChange={(e) => onLook({ info: { ...info, moments: { ...info.moments, [mo.id]: e.target.checked } } })}
                />
                {mo.id === "roll" && (
                  <div className="mmr-studio__chips mmr-info__sub" role="group" aria-label="How the number moves">
                    {NUMBER_CHOICES.map((c) => <Chip key={c.v} label={c.label} clickable disabled={!info.moments.roll} selected={look.number === c.v} onClick={() => onLook({ number: c.v })} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

/** The Rolling layout's own choices, in the Look tab under Layout (plain labels, as in the picks' mock). */
export function MmrRollingControls({ look, onRolling }: { look: MmrLook; onRolling: (r: MmrRolling) => void }) {
  const r = look.rolling;
  const set = (patch: Partial<MmrRolling>) => onRolling({ ...r, ...patch });
  const ticker = r.motion === "ticker";
  // Every slide this look can show (the card leaves out any with nothing to show at the moment).
  const slides = rollSlides(look.info, r, () => true);
  const slideName = (s: RollSlide) => (s === "id" ? "Name and emblem" : pieceDef(s).label);
  const setTime = (s: RollSlide, v: string) => {
    const per = { ...(r.perSlide ?? {}) };
    if (!v || Number(v) === r.secs) delete per[s];
    else per[s] = Number(v) as RollSecs;
    set({ perSlide: Object.keys(per).length ? per : null });
  };
  const chips = <T extends string | number | boolean>(label: string, opts: { v: T; label: string }[], cur: T, pick: (v: T) => void, disabled = false) => (
    <fieldset className="mmr-studio__set">
      <legend>{label}</legend>
      <div className="mmr-studio__chips">
        {opts.map((o) => <Chip key={String(o.v)} label={o.label} clickable disabled={disabled} selected={cur === o.v} onClick={() => pick(o.v)} />)}
      </div>
    </fieldset>
  );
  return (
    <div className="mmr-rolling-ctl">
      {chips("Shape", ROLL_SHAPES, r.shape, (shape) => set({ shape }))}
      {chips("Name and emblem", [{ v: true, label: "Stay on the card" }, { v: false, label: "Roll with the rest" }], r.pin, (pin) => set({ pin }))}
      {chips("Motion", ROLL_MOTIONS, r.motion, (motion) => set({ motion }))}
      {chips("Each slide", ROLL_SECS.map((n) => ({ v: n, label: `${n} seconds` })), r.secs, (secs) => set({ secs }), ticker)}
      {chips("Progress", ROLL_PROGRESS, r.progress, (progress) => set({ progress }), ticker)}
      {ticker && <p className="mmr-studio__note">The ticker moves every piece in one line, so it has no time per slide or progress mark.</p>}
      {!ticker && (
        <Accordion
          variant="flush"
          className="mmr-rolling-ctl__fold"
          defaultOpenIds={r.perSlide ? ["times"] : []}
          items={[{
            id: "times",
            title: <span className="mmr-info__label">A time per slide<Tag kind="pro" /></span>,
            content: (
              <div className="mmr-rolling-ctl__times">
                {slides.map((s) => (
                  <Select key={s} floatingLabel={slideName(s)} size="small" fullWidth value={r.perSlide?.[s] ? String(r.perSlide[s]) : ""}
                    onChange={(v) => setTime(s, String(v))}
                    options={[{ value: "", label: `Same as the rest (${r.secs} seconds)` }, ...ROLL_SECS.filter((n) => n !== r.secs).map((n) => ({ value: String(n), label: `${n} seconds` }))]} />
                ))}
              </div>
            ),
          }]}
        />
      )}
      <p className="mmr-studio__note">{look.info.hideMmr ? "With MMR kept off the card, a new division plays over the slide that's up." : "When your number changes, the card jumps to the MMR slide, plays the change, then carries on from where it was."}</p>
    </div>
  );
}
