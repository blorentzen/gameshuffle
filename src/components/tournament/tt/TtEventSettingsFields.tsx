"use client";

/**
 * A time trial event's settings (create form, and Format & rules on the manage page before it starts; picks
 * 2026-11-05, all A): the board everyone races (speed, items, vehicle), the tracks (one, a cup, your own list, or
 * rolled and kept hidden until it starts), the shape (one leaderboard window, or rounds of groups with a cut), the
 * scoring and who adds a clip. Choice rows are the Swiss form's CDS Button rows; picked tracks are removable Chips.
 */

import { useId, useMemo, useState, type ComponentProps } from "react";
import { Button, Chip, FormField, Switch } from "@empac/cascadeds";
import { IconDice5 } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { ChoiceRow } from "@/components/tournament/ChoiceRow";
import { TT_GAMES, ttCups, ttTrack, ttTracks, type TtGame } from "@/lib/timeTrials/tracks";
import { ITEMS, vehicleOptions, type TtItems, type TtVehicle } from "@/lib/timeTrials/categories";
import { GROUP_MAX, GROUP_PRESETS, suggestPlan } from "@/lib/tournaments/tt/rules";
import { MATCH_CLIP_CHOICES, matchClipRuleOf } from "@/lib/tournaments/tt/matchProof";
import {
  CLIP_CHOICES, MAX_TRACKS, STATION_CHOICES, ROUND_PRESETS, WINDOW_PRESETS, planRounds, type TtEventSettings, type TtShape, type TtTrackMode,
} from "@/lib/tournaments/tt/event";
import "@/styles/tt-event.css";

const TRACK_MODES: { value: TtTrackMode; label: string }[] = [
  { value: "one", label: "One track" },
  { value: "cup", label: "A cup" },
  { value: "list", label: "My list" },
  { value: "rolled", label: "Roll them" },
];

const hoursText = (h: number) => (h < 1 ? `${Math.round(h * 60)} minutes` : h < 24 ? `${h} hour${h === 1 ? "" : "s"}` : h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);

/** A CDS Select with its label (CDS Select takes none of its own). */
function LabeledSelect({ label, ...rest }: { label: string } & ComponentProps<typeof Select>) {
  const id = useId();
  return <FormField label={label} htmlFor={id}><Select id={id} fullWidth {...rest} /></FormField>;
}

function rollTracks(game: TtGame, count: number): string[] {
  const all = ttTracks(game).map((t) => t.id);
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, count);
}

export function TtEventSettingsFields({ value, onChange, players, disabled, part = "all", inPerson = false }: {
  value: TtEventSettings;
  onChange: (next: TtEventSettings) => void;
  /** Confirmed players so far (the groups plan uses 32 as an example until enough have joined). */
  players: number;
  disabled?: boolean;
  /** "board": the board, the tracks and the match clip rule (Swiss and brackets decided by time trial run their own rounds). */
  part?: "all" | "board";
  /** The tournament is in person: stations and runners instead of windows (shapes pick 7A). */
  inPerson?: boolean;
}) {
  const game = value.game;
  const set = (patch: Partial<TtEventSettings>) => onChange({ ...value, ...patch });
  const cups = useMemo(() => ttCups(game), [game]);
  const trackGroups = useMemo(() => cups.map((c) => ({ label: `${c.cup}${/Cup$|Mario Kart$/.test(c.cup) ? "" : " Cup"}`, options: c.tracks.map((t) => ({ value: t.id, label: t.name })) })), [cups]);
  const cupOf = (ids: string[]) => cups.find((c) => c.tracks.length === ids.length && c.tracks.every((t) => ids.includes(t.id)))?.cup ?? "";
  const [rollCount, setRollCount] = useState(4);
  const [customHours, setCustomHours] = useState(!WINDOW_PRESETS.some((p) => p.hours === value.hours));

  const pickMode = (trackMode: TtTrackMode) => {
    if (trackMode === value.trackMode) return;
    const tracks = trackMode === "cup" ? cups[0].tracks.map((t) => t.id) : trackMode === "one" ? value.tracks.slice(0, 1) : trackMode === "rolled" ? rollTracks(game, rollCount) : value.tracks;
    set({ trackMode, tracks, hideTracks: trackMode === "rolled" ? value.hideTracks : false });
  };

  const example = players < 4;
  const field = example ? 32 : players;
  const shape = value.shape === "groups" ? planRounds(field, value.plan) : [];
  const setPlanRound = (i: number, patch: { size?: number; advance?: number }) => {
    const plan = value.plan.map((p, k) => (k === i ? { ...p, ...patch } : p));
    if (patch.size !== undefined) plan[i].advance = Math.min(plan[i].advance, Math.max(1, plan[i].size - 1));
    set({ plan });
  };
  const usePreset = (size: number) => set({ plan: suggestPlan(field, size, Math.max(1, Math.floor(size / 2)), 8) });
  const vehicles = vehicleOptions(game);

  return (
    <div className="swiss-fields tt-fields">
      <div className="tt-fields__group">
        <h3 className="tt-fields__heading">The board</h3>
        <p className="tt-fields__help">{TT_GAMES[game].label}. Everyone races the same thing, and a time that beats a player&apos;s best goes on the time trial boards too.</p>
        <div className="tt-fields__pair">
          {TT_GAMES[game].classes.length > 1 && (
            <ChoiceRow<number> label="Speed" value={value.cc} disabled={disabled} onPick={(cc) => set({ cc: cc === 200 ? 200 : 150 })} choices={TT_GAMES[game].classes.map((c) => ({ value: c, label: `${c}cc` }))} />
          )}
          <ChoiceRow<TtItems> label="Items" value={value.items} disabled={disabled} onPick={(items) => set({ items })} choices={ITEMS.map((i) => ({ value: i.id, label: i.label }))} />
        </div>
        {vehicles.length > 1 && (
          <div className="tt-fields__select">
            <LabeledSelect label="Vehicle" value={value.vehicle} disabled={disabled} onChange={(v) => set({ vehicle: String(v) as TtVehicle })} options={vehicles.map((v) => ({ value: v.id, label: v.label }))} />
          </div>
        )}
      </div>

      <div className="tt-fields__group">
        <h3 className="tt-fields__heading">Tracks</h3>
        <ChoiceRow<TtTrackMode> label="How they're picked" value={value.trackMode} disabled={disabled} onPick={pickMode} choices={TRACK_MODES} />
        {value.trackMode === "one" && (
          <div className="tt-fields__select">
            <LabeledSelect label="Track" value={value.tracks[0] ?? ""} disabled={disabled} onChange={(v) => set({ tracks: v ? [String(v)] : [] })} groups={trackGroups} placeholder="Pick a track" searchable />
          </div>
        )}
        {value.trackMode === "cup" && (
          <div className="tt-fields__select">
            <LabeledSelect label="Cup" value={cupOf(value.tracks)} disabled={disabled}
              onChange={(v) => set({ tracks: cups.find((c) => c.cup === String(v))?.tracks.map((t) => t.id) ?? [] })}
              options={cups.map((c) => ({ value: c.cup, label: `${c.cup}${/Cup$|Mario Kart$/.test(c.cup) ? "" : " Cup"}` }))} />
          </div>
        )}
        {value.trackMode === "list" && value.tracks.length < MAX_TRACKS && (
          <div className="tt-fields__select">
            <LabeledSelect label="Add a track" value="" disabled={disabled}
              onChange={(v) => { const id = String(v); if (id && !value.tracks.includes(id)) set({ tracks: [...value.tracks, id] }); }}
              placeholder="Pick a track to add" searchable
              groups={trackGroups.map((g) => ({ ...g, options: g.options.filter((o) => !value.tracks.includes(o.value)) })).filter((g) => g.options.length)} />
          </div>
        )}
        {value.trackMode === "rolled" && (
          <div className="tt-fields__roll">
            <ChoiceRow<number> label="How many" value={rollCount} disabled={disabled} onPick={(n) => { setRollCount(n); set({ tracks: rollTracks(game, n) }); }} choices={[1, 3, 4, 6, 8].map((n) => ({ value: n, label: String(n) }))} />
            <Button variant="secondary" size="small" iconBefore={IconDice5} disabled={disabled} onClick={() => set({ tracks: rollTracks(game, rollCount) })}>Roll again</Button>
          </div>
        )}
        {value.tracks.length > 0 && (
          <ul className="tt-fields__tracks" aria-label="Tracks in this event">
            {value.tracks.map((id, i) => (
              <li key={id}>
                <Chip size="small" label={`${i + 1}. ${ttTrack(game, id)?.name ?? id}`} removable={value.trackMode === "list" && !disabled}
                  onRemove={() => set({ tracks: value.tracks.filter((t) => t !== id) })} />
              </li>
            ))}
          </ul>
        )}
        {value.trackMode === "rolled" && (
          <Switch checked={value.hideTracks} disabled={disabled} onChange={(e) => set({ hideTracks: e.target.checked })}
            label="Keep the tracks hidden until it starts" />
        )}
      </div>

      {part === "all" && <div className="tt-fields__group">
        <h3 className="tt-fields__heading">Shape</h3>
        <ChoiceRow<TtShape> label="How it runs" value={value.shape} disabled={disabled}
          onPick={(s) => set({ shape: s, hours: s === "groups" ? (ROUND_PRESETS.some((p) => p.hours === value.hours) ? value.hours : 24) : (WINDOW_PRESETS.some((p) => p.hours === value.hours) ? value.hours : 168) })}
          choices={[{ value: "leaderboard", label: "One leaderboard" }, { value: "groups", label: "Groups and a final" }]} />
        {value.shape === "leaderboard" ? (
          <>
            <p className="tt-fields__help">{inPerson ? "Everyone runs every track at the stations. The best time on each track counts, and the standings are the result." : "Everyone runs every track during one window. The best time on each track counts, and the standings are the result."}</p>
            {!inPerson && <ChoiceRow<number> label="Window" value={customHours ? -1 : value.hours} disabled={disabled}
              onPick={(h) => { if (h === -1) setCustomHours(true); else { setCustomHours(false); set({ hours: h }); } }}
              choices={[...WINDOW_PRESETS.map((p) => ({ value: p.hours, label: p.label })), { value: -1, label: "Custom" }]} />}
            {customHours && !inPerson && (
              <div className="tt-fields__select">
                <LabeledSelect label="Length" value={String(value.hours)} disabled={disabled} onChange={(v) => set({ hours: Number(v) })}
                  options={[0.5, 1, 2, 3, 6, 12, 24, 48, 72, 120, 168, 336, 504, 672].map((h) => ({ value: String(h), label: hoursText(h) }))} />
              </div>
            )}
          </>
        ) : (
          <>
            <p className="tt-fields__help">Each round runs in groups. Groups are spread by seed so they&apos;re even, the top of each group moves on, and the last round is a final. Two players with one moving on is a 1v1.</p>
            <ChoiceRow<number> label="Start from" value={-1} disabled={disabled} onPick={usePreset}
              choices={GROUP_PRESETS.map((n) => ({ value: n, label: n === 2 ? "1v1" : `Groups of ${n}` }))} />
            <ol className="tt-fields__plan">
              {value.plan.map((p, i) => {
                const s = shape[i];
                const last = i === value.plan.length - 1;
                return (
                  <li key={i} className="tt-fields__round">
                    <span className="tt-fields__round-name">{last || s?.final ? "Final" : `Round ${i + 1}`}</span>
                    {!last && (
                      <>
                        <LabeledSelect label="Group size" value={String(p.size)} disabled={disabled} onChange={(v) => setPlanRound(i, { size: Number(v) })}
                          options={Array.from({ length: GROUP_MAX - 1 }, (_, k) => k + 2).map((n) => ({ value: String(n), label: n === 2 ? "1v1" : String(n) }))} />
                        <LabeledSelect label="Move on" value={String(p.advance)} disabled={disabled} onChange={(v) => setPlanRound(i, { advance: Number(v) })}
                          options={Array.from({ length: Math.max(1, p.size - 1) }, (_, k) => k + 1).map((n) => ({ value: String(n), label: `Top ${n}` }))} />
                      </>
                    )}
                    <span className="tt-fields__round-shape">
                      {s ? (s.final ? `${s.players} players in one group` : `${s.players} players, ${s.groups} groups, ${s.through} move on`) : "Not needed: the field is down to one group before this"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="tt-fields__plan-actions">
              <Button variant="ghost" size="small" disabled={disabled || value.plan.length >= 8} onClick={() => set({ plan: [...value.plan.slice(0, -1), { size: 4, advance: 2 }, value.plan[value.plan.length - 1]] })}>Add a round</Button>
              {value.plan.length > 1 && <Button variant="ghost" size="small" disabled={disabled} onClick={() => set({ plan: [...value.plan.slice(0, -2), value.plan[value.plan.length - 1]] })}>Remove a round</Button>}
            </div>
            {example && <p className="tt-fields__help">With 32 players, as an example until people join.</p>}
            {!inPerson && <ChoiceRow<number> label="Each round's window" value={value.hours} disabled={disabled} onPick={(hours) => set({ hours })} choices={ROUND_PRESETS.map((p) => ({ value: p.hours, label: p.label }))} />}
          </>
        )}
      </div>}

      {part === "all" && inPerson && <div className="tt-fields__group">
        <h3 className="tt-fields__heading">At the venue</h3>
        <ChoiceRow<number> label="Stations (consoles)" value={value.stations} disabled={disabled} onPick={(stations) => set({ stations })}
          choices={STATION_CHOICES.map((n) => ({ value: n, label: String(n) }))} />
        <p className="tt-fields__help">
          {value.shape === "groups"
            ? "Groups are called to a free station on the TV board and by notification, and a runner there types the times in. No screenshots needed. Only players checked in at the venue go in the groups."
            : "A runner at each station types in the times of whoever is racing there. No screenshots needed. Only players checked in at the venue are in."}
        </p>
      </div>}

      {part === "board" && <div className="tt-fields__group">
        <h3 className="tt-fields__heading">Proof</h3>
        <div className="tt-fields__select">
          <LabeledSelect label="Who adds a clip before a match counts" value={String(value.matchClips)} disabled={disabled} onChange={(v) => set({ matchClips: matchClipRuleOf(v) })}
            options={MATCH_CLIP_CHOICES.map((c) => ({ value: String(c.value), label: c.label }))} />
        </div>
        <p className="tt-fields__help">
          {value.matchClips === 0
            ? "Every time needs a screenshot of the result screen, and a match counts as soon as the times decide it."
            : "Every time needs a screenshot. A clip is the run's last 30 seconds: a decided match waits until you, a co-organizer or a verifier checks its clips."}
        </p>
      </div>}

      {part === "all" && <div className="tt-fields__group">
        <h3 className="tt-fields__heading">Scoring and proof</h3>
        <ChoiceRow<"total" | "points"> label="Scoring" value={value.scoring} disabled={disabled} onPick={(scoring) => set({ scoring })}
          choices={[{ value: "total", label: "Total time" }, { value: "points", label: "Points by place" }]} />
        <p className="tt-fields__help">
          {value.scoring === "total"
            ? "Each track's best added together. A player without a time on every track ranks after everyone who has one."
            : "Each track scores by place: 15 for 1st, 12, 10, then down by one. A missing track scores nothing."}
        </p>
        <div className="tt-fields__select">
          <LabeledSelect label="Who adds a clip before results are final" value={String(value.clips)} disabled={disabled} onChange={(v) => set({ clips: Number(v) })}
            options={CLIP_CHOICES.map((c) => ({ value: String(c.value), label: c.label }))} />
        </div>
        <p className="tt-fields__help">{inPerson ? "Times a runner types in count as checked. A time a player adds on their phone (a run-off) needs a screenshot." : "Every time needs a screenshot of the result screen. You, your co-organizers and anyone you add as a verifier check them."}</p>
      </div>}
    </div>
  );
}
