"use client";

/**
 * A time trial event on the public tournament page (shapes pick 8A: one template that picks its layout from the
 * event). Your spot first (your times or your group, what's left to run, Add my time), then where the event is, then
 * the field: the standings, or each round's groups with their cut line. Past about eight groups a round, a search
 * finds a player's group.
 */

import { useMemo, useState } from "react";
import { Alert, Button, FormField, Input, Tabs } from "@empac/cascadeds";
import { IconPlus, IconTrophy, IconVideo } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { formatTime, ordinal } from "@/lib/timeTrials/rules";
import { groupLabel, type TtEventView, type TtViewRound, type TtViewTime } from "@/lib/tournaments/tt/event";
import { useNow, useTtEvent } from "./useTtEvent";
import { TtChecks } from "./TtRunPanel";
import { AddTimeWindow, ClipWindow, GroupTable, TrackStrip, boardLine, leftText, proofWord, trackName, whenText } from "./TtParts";

const SEARCH_FROM = 9;

/** Where the event is, with the window's close (your own group's, when it was extended). */
function statusLine(view: TtEventView, now: number, myClose: string | null): string {
  const cur = view.rounds.at(-1);
  if (view.phase === "setup") return "It starts when the organizer opens it.";
  if (view.phase === "finished") return "Finished. The results are final.";
  if (!cur) return "";
  const what = cur.n === 0 ? "The leaderboard" : cur.label;
  if (view.phase === "open" && view.venue) return `${what} is running at the venue. Runners type the times in at each station.`;
  if (view.phase === "open") {
    const close = myClose ?? cur.closesAt;
    const left = leftText(close, now);
    return `${what} is open until ${whenText(close)}${left ? ` (${left} left)` : ""}.`;
  }
  if (view.phase === "closed") return cur.runoffs.some((r) => !r.settled) ? `${what} is closed. Ties at the cut go to a run-off.` : cur.n === 0 || cur.final ? `${what} is closed. The results are being checked.` : `${what} is closed. The cut comes next.`;
  return `${cur.through?.length ?? 0} players move on. The next round opens soon.`;
}

function PlanLine({ view }: { view: TtEventView }) {
  if (view.settings.shape !== "groups" || !view.planned.length) return null;
  return (
    <ol className="tt-ev-plan" aria-label="Rounds">
      {view.planned.map((p) => (
        <li key={p.round}>
          <b>{p.final ? "Final" : `Round ${p.round}`}</b>{" "}
          {p.final ? `${p.players} players in one group` : `${p.groups} groups of ${p.size}, ${p.through} move on`}
        </li>
      ))}
    </ol>
  );
}

function YourTimes({ view, round, times, onAdd, onClip }: {
  view: TtEventView; round: TtViewRound; times: TtViewTime[]; onAdd: (track: string) => void; onClip: (t: TtViewTime) => void;
}) {
  const best = new Map<string, TtViewTime>();
  for (const t of times) if (!t.runoff && t.proof !== "rejected" && (!best.has(t.track) || t.ms < best.get(t.track)!.ms)) best.set(t.track, t);
  const can = !!view.you?.canAdd;
  return (
    <ul className="tt-ev-mine">
      {round.tracks.map((id) => {
        const t = best.get(id);
        const word = t ? proofWord(t.proof, t.needsClip) : null;
        return (
          <li key={id} className="tt-ev-mine__row">
            <span className="tt-ev-mine__track">{trackName(view.settings.game, id)}</span>
            <span className="tt-ev-mine__time">{t ? formatTime(t.ms) : <span className="tt-ev-muted">No time yet</span>}</span>
            <span className="tt-ev-mine__place">{t?.place ? ordinal(t.place) : ""}</span>
            <span className={`tt-ev-mine__proof${t?.needsClip ? " tt-ev-mine__proof--ask" : ""}`}>{word ?? ""}</span>
            <span className="tt-ev-mine__act">
              {t?.needsClip ? (
                <Button size="small" variant="secondary" iconBefore={IconVideo} onClick={() => onClip(t)}>Add clip</Button>
              ) : can ? (
                <Button size="small" variant="ghost" onClick={() => onAdd(id)}>{t ? "Beat it" : "Add"}</Button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function TtEventPanel({ tournamentId }: { tournamentId: string }) {
  const { view, missing, act, reload, busy } = useTtEvent(tournamentId);
  const toast = useToast();
  const now = useNow();
  const [adding, setAdding] = useState<{ track: string | null; runoff: boolean } | null>(null);
  const [clipFor, setClipFor] = useState<TtViewTime | null>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [find, setFind] = useState("");

  const cur = view?.rounds.at(-1) ?? null;
  const myRunoff = useMemo(() => (view?.you && cur ? cur.runoffs.find((r) => !r.settled && r.players.includes(view.you!.participantId)) ?? null : null), [view, cur]);

  if (missing) return null;
  if (!view) return <div className="comp-card"><LoadingLines label="Loading the time trial" /></div>;

  const s = view.settings;
  const you = view.you;
  const showTracks = (view.tracks?.length ?? 0) <= 4;
  const myGroup = you && cur && you.group != null ? cur.groups[cur.n === 0 ? 0 : you.group] ?? null : null;
  const winner = view.final?.[0] ?? null;
  const roundTab = tab ?? (cur ? String(cur.n) : "");

  // In person, the current round's groups say where they are: at a station, done, or waiting.
  const venueStatus = (r: TtViewRound, label: string): string | null => {
    if (!view.venue || !cur || r.n !== cur.n || !r.open) return null;
    const at = view.venue.stations.find((x) => x.label === label);
    if (at) return `at Station ${at.n}`;
    if (view.venue.done.includes(label)) return "done";
    return "waiting";
  };
  const renderRound = (r: TtViewRound) => {
    const many = r.groups.length >= SEARCH_FROM;
    const q = find.trim().toLowerCase();
    const groups = many && q ? r.groups.filter((g) => g.rows.some((x) => x.name.toLowerCase().includes(q))) : r.groups;
    return (
      <div className="tt-ev-round">
        {r.n !== 0 && <p className="tt-ev__hint">{r.final ? "One group, everyone on the same tracks." : `Groups of ${r.size}, ${r.advance === 1 ? "the fastest moves on" : `top ${r.advance} move on`}.`} {r.open ? (view.venue ? "Groups are called to the stations in turn." : `Open until ${whenText(r.closesAt)}.`) : r.closedAt ? `Closed ${whenText(r.closedAt)}.` : ""}</p>}
        {many && (
          <FormField label="Find a player" htmlFor={`tt-find-${r.n}`}>
            <Input id={`tt-find-${r.n}`} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name" />
          </FormField>
        )}
        <div className={r.n === 0 ? "tt-ev-standings" : "tt-ev-groups"}>
          {groups.map((g) => (g.yours && r.n !== 0 && you && !you.out && cur && r.n === cur.n ? (
            <p key={g.index} className="tt-ev__hint">{r.final ? "The final is yours: it's at the top of the page." : `Group ${g.label} is yours: it's at the top of the page.`}</p>
          ) : (
            <div key={g.index} className="tt-ev-group">
              {r.n !== 0 && <h3 className="tt-ev-group__name">{r.final ? "Final" : `Group ${g.label}`}{g.yours && <span className="tt-ev-muted"> (yours)</span>} <span className="tt-ev-muted">{venueStatus(r, g.label) ?? `${g.inCount} of ${g.rows.length} in`}</span></h3>}
              <GroupTable group={g} settings={s} tracks={r.tracks} label={r.n === 0 ? "Standings" : `Group ${g.label}`} showTracks={r.n === 0 ? showTracks : false} />
            </div>
          )))}
          {many && q && !groups.length && <p className="tt-ev__hint">Nobody by that name in this round.</p>}
        </div>
        {r.runoffs.length > 0 && (
          <div className="tt-ev-runoffs">
            <h3 className="tt-ev-group__name">Run-offs</h3>
            {r.runoffs.map((ro) => (
              <p key={ro.group} className="tt-ev__hint">
                Group {groupLabel(ro.group)}: {ro.names.join(", ")} for {ro.spots === 1 ? "one spot" : `${ro.spots} spots`} on {trackName(s.game, ro.track)}.{" "}
                {ro.settled ? `${ro.settled.map((p) => ro.names[ro.players.indexOf(p)]).join(", ")} moved on.` : `Until ${whenText(ro.closesAt)}.`}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <section className="comp-card tt-ev" aria-labelledby="tt-ev-title">
        <h2 id="tt-ev-title" className="tt-ev__title">Time trial</h2>
        <p className="tt-ev__board">{boardLine(s)} · {s.scoring === "total" ? "Total time" : "Points by place"}</p>
        <p className="tt-ev__status" aria-live="polite">{statusLine(view, now, you && cur && you.group != null ? cur.groups[cur.n === 0 ? 0 : you.group]?.closesAt ?? null : null)}</p>
        {winner && <p className="tt-ev__winner"><IconTrophy size={20} stroke={1.9} aria-hidden="true" /> {winner.name} won</p>}
        {view.tracks ? <TrackStrip settings={s} tracks={cur?.tracks ?? view.tracks} /> : <p className="tt-ev__hint">The tracks stay hidden until it starts.</p>}
        {view.phase === "setup" && <PlanLine view={view} />}
      </section>

      {you && cur && (
        <section className="comp-card tt-ev-you" aria-labelledby="tt-ev-you-title">
          <div className="tt-ev-you__head">
            <h2 id="tt-ev-you-title" className="tt-ev__title">
              {myRunoff ? "Your run-off" : you.out ? "You're out" : cur.n === 0 ? "Your times" : cur.final ? "Your final" : `Your group · Group ${groupLabel(you.group ?? 0)}`}
            </h2>
            {you.canAdd && (
              <Button variant="primary" iconBefore={IconPlus} onClick={() => setAdding({ track: myRunoff ? myRunoff.track : null, runoff: !!myRunoff })}>Add my time</Button>
            )}
          </div>
          {myRunoff && (
            <Alert variant="info">
              You&apos;re tied at the cut. One run on {trackName(s.game, myRunoff.track)} decides {myRunoff.spots === 1 ? "the last spot" : `${myRunoff.spots} spots`}, until {whenText(myRunoff.closesAt)}.
            </Alert>
          )}
          {you.station && !you.out && (
            <Alert variant={you.station.n ? "success" : "info"}>
              {you.station.n
                ? `Go to Station ${you.station.n}. Your group is up.`
                : you.station.done
                  ? "Your group has run. The cut comes once every group is done."
                  : you.station.ahead === 0
                    ? "Your group is next. You'll get a notification when it's called to a station."
                    : `Your group is waiting, with ${you.station.ahead} group${you.station.ahead === 1 ? "" : "s"} ahead of it. You'll get a notification when it's called to a station.`}
            </Alert>
          )}
          {you.out ? (
            <p className="tt-ev__hint">Your event ended in an earlier round. The standings below keep going.</p>
          ) : (
            <>
              {cur.n !== 0 && cur.groups[you.group ?? 0] && (
                <GroupTable group={cur.groups[you.group ?? 0]} settings={s} tracks={cur.tracks} label="Your group" showTracks={false} />
              )}
              <YourTimes view={view} round={cur} times={you.times} onAdd={(track) => setAdding({ track, runoff: false })} onClip={setClipFor} />
              {!you.canAdd && you.why && <p className="tt-ev__hint">{you.why}</p>}
              {myGroup && cur.n !== 0 && !cur.final && <p className="tt-ev__hint">{cur.advance === 1 ? "The fastest in each group moves on." : `The top ${cur.advance} of each group move on.`}</p>}
            </>
          )}
        </section>
      )}

      {view.canCheck && !view.canManage && view.checks && (
        <section className="comp-card" aria-label="Times to check">
          <TtChecks checks={view.checks} waiting={view.waitingChecks} game={view.settings.game} canManage={view.canManage} busy={busy} run={async (body, done) => { const err = await act(body); if (err) { toast.error(err); return false; } if (done) toast.success(done); return true; }} />
        </section>
      )}

      {view.final && (
        <section className="comp-card" aria-labelledby="tt-ev-results">
          <h2 id="tt-ev-results" className="tt-ev__title">Results</h2>
          <ol className="tt-ev-results">
            {view.final.map((f) => <li key={f.participantId} className={f.participantId === you?.participantId ? "tt-ev-results--you" : undefined}><b>{ordinal(f.place)}</b> {f.name}</li>)}
          </ol>
        </section>
      )}

      {view.rounds.length > 0 && (
        <section className="comp-card" aria-labelledby="tt-ev-field">
          <h2 id="tt-ev-field" className="tt-ev__title">{s.shape === "leaderboard" ? "Standings" : "Groups"}</h2>
          {view.rounds.length > 1 ? (
            <Tabs className="tt-ev-tabs" variant="underline" activeTab={roundTab} onChange={setTab} tabs={view.rounds.map((r) => ({ id: String(r.n), label: r.label, content: renderRound(r) }))} />
          ) : renderRound(view.rounds[0])}
        </section>
      )}

      {cur && view.you && (
        <AddTimeWindow
          open={!!adding} onClose={() => setAdding(null)} tournamentId={tournamentId} settings={s}
          tracks={adding?.runoff && myRunoff ? [myRunoff.track] : cur.tracks} runoff={!!adding?.runoff} start={adding?.track}
          onAdded={() => void reload()}
        />
      )}
      <ClipWindow tournamentId={tournamentId} item={clipFor} game={s.game} onClose={() => setClipFor(null)} onDone={() => void reload()} />
    </>
  );
}
