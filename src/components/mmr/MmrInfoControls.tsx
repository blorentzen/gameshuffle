"use client";

/**
 * The studio's "What's on the card" and "Moments" tabs ("What's on the card" picks, 2026-10-21).
 *   What's on the card: four presets, the big number (MMR or world rank), a switch per piece in
 *     its group (Who, Numbers, Tonight, Season), recent events 3 or 5, and for GS Pro a line of
 *     your own and your own order (the shared SortableList: drag the handle, or use the arrows).
 *   Moments: a switch per moment, and how the number moves.
 *   Rolling (in the Look tab when that layout is picked): shape, name and emblem, motion, each slide's
 *     time, the progress mark, and for GS Pro a time per slide.
 * GS Pro choices can be tried in the preview; a free save keeps their free versions (look.ts).
 * Feedback round (2026-10-29): the MMR switch works on every layout (locked on while MMR is the big
 * number), the country as a code, flag or both, Under the number (Strip, Sticker, Rolling), and the
 * panel's chat line switch.
 */

import { useId } from "react";
import { Accordion, Button, Card, Chip, IconButton, Input, Switch } from "@empac/cascadeds";
import { IconArrowDown, IconArrowUp } from "@tabler/icons-react";
import { SortableList, moveWithin } from "@/components/ui/SortableList";
import { Select } from "@/components/ui/Select";
import { NUMBER_CHOICES, type MmrCountry, type MmrLook } from "@/lib/mmr/look";
import {
  LAYOUT_SPOTS, LINE_MAX, MOMENTS, PIECES, PIECE_GROUPS, PIECE_IDS, PRESETS, UNDER_CHOICES, UNDER_LAYOUTS, applyPreset, pieceDef, pieceOrder, presetOf,
  type MmrInfo, type MmrPiece, type MmrUnder, type PieceDef,
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

export function MmrWhatsOn({ look, onInfo, onLook, pro, chat = false, lineWarn }: {
  look: MmrLook;
  onInfo: (info: MmrInfo) => void;
  /** Look fields shown here (the country's flag or code). */
  onLook: (patch: Partial<MmrLook>) => void;
  pro: boolean;
  /** GameShuffle's bot answers !mmr in this streamer's chat. */
  chat?: boolean;
  /** The last save left the line off (blocked words). */
  lineWarn: boolean;
}) {
  const info = look.info;
  const set = (patch: Partial<MmrInfo>) => onInfo({ ...info, ...patch });
  const preset = presetOf(info);
  const spots = LAYOUT_SPOTS[look.layout];
  const lineId = useId();
  const worldBig = info.big === "world";
  const rolling = look.layout === "rolling";

  // Your own order (GS Pro): the pieces that are on, in order. Moving them keeps the others where they were.
  const full = pieceOrder(info);
  const onList = full.filter((p) => info.on[p]);
  const reorder = (next: MmrPiece[]) => {
    let k = 0;
    const merged = full.map((p) => (info.on[p] ? next[k++] : p));
    set({ order: merged.join() === PIECE_IDS.join() ? null : merged });
  };

  return (
    <div className="mmr-info">
      <p className="mmr-studio__note">
        {rolling
          ? "On Rolling, each piece that's on is a slide, in this order. Your name, flag and division stay on the card or roll as the first slide (Look tab)."
          : `${spots.name} has room for ${spots.slots} ${spots.slots === 1 ? "detail" : "details"} beside the pieces it has a spot for. When more are on, the extras take turns in the last spot, changing every 8 seconds.`}
      </p>

      <fieldset className="mmr-studio__set">
        <legend>Start from</legend>
        <div className="mmr-presets" role="group" aria-label="Presets">
          {PRESETS.map((p) => (
            <Card key={p.id} variant="outlined" padding="small" interactive selected={preset === p.id} onClick={() => onInfo(applyPreset(info, p.id))} className="mmr-preset">
              <span className="mmr-preset__name">{p.label}</span>
              <span className="mmr-preset__note">{p.note}</span>
            </Card>
          ))}
        </div>
        {!preset && <p className="mmr-studio__note">Your own mix. Pick a preset to start again.</p>}
      </fieldset>

      {!rolling && <fieldset className="mmr-studio__set">
        <legend>The big number</legend>
        <div className="mmr-studio__chips">
          <Chip label="MMR" clickable selected={!worldBig} onClick={() => set({ big: "mmr" })} />
          <Chip label="World rank" clickable selected={worldBig} onClick={() => set({ big: "world" })} />
        </div>
        <p className="mmr-studio__note">{worldBig ? "Your MMR moves to the details. Before you have a world rank, MMR stays the big number." : "World rank sits with the details."}</p>
      </fieldset>}

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
        <fieldset className="mmr-studio__set">
          <legend>Chat line</legend>
          <Switch
            label={'"Type !mmr in chat" at the bottom'}
            helperText={chat ? "GameShuffle's bot answers !mmr in your Twitch chat." : "Shows only while GameShuffle's bot is in your Twitch chat, which comes with GS Pro's Twitch setup."}
            checked={info.chat}
            onChange={(e) => set({ chat: e.target.checked })}
          />
        </fieldset>
      )}

      {PIECE_GROUPS.map((g) => (
        <fieldset key={g.id} className="mmr-studio__set">
          <legend>{g.label}</legend>
          <div className="mmr-info__list">
            {PIECES.filter((p) => p.group === g.id).map((p) => {
              const lockedWorld = p.id === "world" && worldBig && !rolling;
              // MMR as the big number can't be switched off (on Rolling the switch is the MMR slide).
              const lockedMmr = p.id === "mmr" && !worldBig && !rolling;
              const lockedGoal = p.id === "goal" && !pro;
              const locked = lockedWorld || lockedMmr;
              const note = locked ? "It's the big number." : lockedGoal ? "Part of GS Pro, with a goal set under Tonight's goal." : p.id === "mmr" && rolling ? "The MMR slide. A change still plays on its own slide when this is off." : p.note;
              return (
                <div key={p.id} className="mmr-info__piece">
                  <Switch
                    label={<PieceLabel p={p} />}
                    helperText={note}
                    checked={locked ? true : lockedGoal ? false : info.on[p.id]}
                    disabled={locked || lockedGoal}
                    onChange={(e) => set({ on: { ...info.on, [p.id]: e.target.checked } })}
                  />
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
        </fieldset>
      ))}

      <fieldset className="mmr-studio__set">
        <legend><span className="mmr-info__label">Your own order<Tag kind="pro" /></span></legend>
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
      </fieldset>
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
            const locked = !!mo.pro && !pro;
            return (
              <div key={mo.id} className="mmr-info__piece">
                <Switch
                  label={<span className="mmr-info__label">{mo.label}{mo.pro && <Tag kind="pro" />}</span>}
                  helperText={locked ? "Part of GS Pro, with a goal set under Tonight's goal." : mo.note}
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
      <p className="mmr-studio__note">When your number changes, the card jumps to the MMR slide, plays the change, then carries on from where it was.</p>
    </div>
  );
}
