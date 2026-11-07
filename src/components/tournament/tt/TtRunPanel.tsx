"use client";

/**
 * A time trial event's run screen (manage page ▸ Run; shapes pick 9A): where it is and the one next step, the
 * window's controls (extend, close now, reopen), the cut and its run-offs, the times to check (verifiers see this
 * too), typing a time in for a player, and the verifiers. The field itself is the public page's.
 */

import { useState } from "react";
import { Alert, Button, Checkbox, FormField, IconButton, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCheck, IconCopy, IconDeviceTv, IconExternalLink, IconX } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminTable } from "@/components/account/admin/AdminKit";
import { Select } from "@/components/ui/Select";
import { formatTime, ordinal, parseTime } from "@/lib/timeTrials/rules";
import { groupLabel, type TtCheckItem, type TtEventView, type TtStaffRow } from "@/lib/tournaments/tt/event";
import type { TtGame } from "@/lib/timeTrials/tracks";
import { useNow, useTtEvent } from "./useTtEvent";
import { TrackStrip, boardLine, leftText, trackName, whenText } from "./TtParts";

const EXTEND = [{ value: "30", label: "30 minutes" }, { value: "60", label: "1 hour" }, { value: "180", label: "3 hours" }, { value: "1440", label: "1 day" }];

function nextStep(view: TtEventView, inPerson: boolean): { line: string; action: string | null; label: string | null } {
  const cur = view.rounds.at(-1);
  if (inPerson && view.phase === "setup") {
    return {
      line: view.settings.tracks.length ? `Only players checked in at the venue go in${view.settings.shape === "groups" ? " the groups. Opening it spreads round 1's groups by seed and calls the first ones to the stations" : ". Opening it lets the runners type times in"}.` : "Pick the tracks on Format & rules first.",
      action: view.settings.tracks.length ? "start" : null, label: view.settings.shape === "groups" ? "Open round 1" : "Open the time trial",
    };
  }
  if (view.venue && view.phase === "open") {
    const waiting = view.venue.queue.length, running = view.venue.stations.filter((s) => s.group != null).length;
    return { line: cur?.n === 0 ? "Runners type the times in at each station. Close it once everyone has run." : waiting || running ? `${running} group${running === 1 ? "" : "s"} racing, ${waiting} waiting. Close the round once every group has run.` : "Every group has run. Close the round to make the cut.", action: null, label: null };
  }
  switch (view.phase) {
    case "setup": return { line: view.settings.tracks.length ? `${view.players} players are in. Opening it starts the window${view.settings.shape === "groups" ? " and spreads round 1's groups by seed" : ""}.` : "Pick the tracks on Format & rules first.", action: view.settings.tracks.length ? "start" : null, label: view.settings.shape === "groups" ? "Open round 1" : "Open the time trial" };
    case "open": return { line: `${cur?.label ?? "The round"} is open until ${whenText(cur!.closesAt)}. It closes on its own; close it early if everyone's done.`, action: null, label: null };
    case "closed":
      if (cur && cur.runoffs.some((r) => !r.settled)) return { line: "Settle the run-offs below to finish the cut.", action: null, label: null };
      if (cur && (cur.n === 0 || cur.final)) return { line: view.waitingChecks ? `${view.waitingChecks} top time${view.waitingChecks === 1 ? "" : "s"} still need a check before the results are final.` : "Every top time is checked. Finish to post the results.", action: "finish", label: "Finish and post the results" };
      return { line: `Make the cut: ${cur?.advance === 1 ? "the fastest in each group moves on" : `the top ${cur?.advance} of each group move on`}.`, action: "cut", label: "Make the cut" };
    case "cut": return { line: `${cur?.through?.length ?? 0} players move on. Opening the next round spreads them into new groups by this round's results.`, action: "next", label: "Open the next round" };
    case "finished": return { line: "Finished. The results are posted.", action: null, label: null };
  }
}

export function TtRunPanel({ tournamentId, status, onStatus, inPerson = false }: { tournamentId: string; status: string; onStatus?: (s: string) => void; inPerson?: boolean }) {
  const { view, missing, busy, act } = useTtEvent(tournamentId);
  const toast = useToast();
  const confirm = useConfirm();
  const now = useNow();
  const [extend, setExtend] = useState("60");
  const [extendGroup, setExtendGroup] = useState("all");
  const [picks, setPicks] = useState<Record<number, string[]>>({});
  const [typeFor, setTypeFor] = useState({ pid: "", track: "", time: "" });

  if (missing) return <Alert variant="warning">Time trial events need a database update first (tt-events-m1).</Alert>;
  if (!view) return <LoadingLines label="Loading the time trial" />;
  const cur = view.rounds.at(-1) ?? null;
  const step = nextStep(view, inPerson);
  const run = async (body: Record<string, unknown>, done?: string) => {
    const err = await act(body);
    if (err) { toast.error(err); return false; }
    if (done) toast.success(done);
    if (body.action === "start") onStatus?.("in_progress");
    if (body.action === "finish") onStatus?.("complete");
    return true;
  };
  const doStep = async () => {
    if (!step.action) return;
    if (step.action === "finish" && view.waitingChecks) {
      const ok = await confirm({ title: "Finish anyway?", body: `${view.waitingChecks} top time${view.waitingChecks === 1 ? " hasn't" : "s haven't"} been checked. The results post as they stand.`, confirmLabel: "Finish anyway" });
      if (ok) void run({ action: "finish", force: true }, "Results posted");
      return;
    }
    void run({ action: step.action }, step.action === "start" ? "It's open" : step.action === "cut" ? "Cut made" : step.action === "next" ? "Next round open" : "Results posted");
  };
  const people = cur ? (cur.n === 0 ? cur.groups[0]?.rows ?? [] : cur.groups.flatMap((g) => g.rows)) : [];
  const typeTime = parseTime(typeFor.time);

  return (
    <div className="tt-run">
      <div className="tt-run__status">
        <p className="tt-run__board">{boardLine(view.settings)} · {view.settings.scoring === "total" ? "Total time" : "Points by place"} · {view.players} players</p>
        <p className="tt-run__line" aria-live="polite">{step.line}</p>
        {view.phase === "open" && cur && !view.venue && <p className="tt-run__left">{leftText(cur.closesAt, now) ?? "Closing"} left</p>}
        {step.action && step.label && (
          <Button variant="primary" loading={busy === step.action} disabled={status === "draft" && step.action === "start"} onClick={() => void doStep()}>{step.label}</Button>
        )}
        {status === "draft" && step.action === "start" && <p className="tt-run__hint">Publish the tournament first.</p>}
      </div>

      {view.tracks && <TrackStrip settings={view.settings} tracks={cur?.tracks ?? view.tracks} />}

      {view.venue && cur && !view.final && <TtStations tournamentId={tournamentId} view={view} busy={busy} run={run} />}

      {cur && (view.phase === "open" || view.phase === "closed") && !cur.runoffs.length && (
        <section className="tt-run__section" aria-labelledby="tt-run-window">
          <h3 id="tt-run-window" className="tt-run__heading">{view.venue ? "The round" : "The window"}</h3>
          {view.venue ? (
            <div className="tt-run__row">
              {view.phase === "open"
                ? <Button variant="secondary" loading={busy === "close"} onClick={async () => { if (await confirm({ title: "Close the round?", body: "Runners can't add times after this. You can reopen it before the cut.", confirmLabel: "Close it" })) void run({ action: "close" }, "Closed"); }}>Close the round</Button>
                : <Button variant="secondary" loading={busy === "reopen"} onClick={() => void run({ action: "reopen", minutes: 24 * 60 }, "Reopened")}>Reopen</Button>}
            </div>
          ) : (
          <div className="tt-run__row">
            <FormField label={view.phase === "open" ? "Add time" : "Reopen for"} htmlFor="tt-run-extend">
              <Select id="tt-run-extend" value={extend} onChange={(v) => setExtend(String(v))} options={EXTEND} />
            </FormField>
            {view.phase === "open" && cur.n !== 0 && cur.groups.length > 1 && (
              <FormField label="For" htmlFor="tt-run-extend-group">
                <Select id="tt-run-extend-group" value={extendGroup} onChange={(v) => setExtendGroup(String(v))}
                  options={[{ value: "all", label: "Every group" }, ...cur.groups.map((g) => ({ value: String(g.index), label: `Group ${g.label}` }))]} />
              </FormField>
            )}
            {view.phase === "open" ? (
              <>
                <Button variant="secondary" loading={busy === "extend"}
                  onClick={() => void run({ action: "extend", minutes: Number(extend), group: extendGroup === "all" ? null : Number(extendGroup) }, extendGroup === "all" ? "Window extended" : `Group ${groupLabel(Number(extendGroup))} extended`)}>Extend</Button>
                <Button variant="secondary" loading={busy === "close"} onClick={async () => { if (await confirm({ title: "Close it now?", body: "Nobody can add a time after this. You can reopen it before the cut.", confirmLabel: "Close now" })) void run({ action: "close" }, "Closed"); }}>Close now</Button>
              </>
            ) : (
              <Button variant="secondary" loading={busy === "reopen"} onClick={() => void run({ action: "reopen", minutes: Number(extend) }, "Reopened")}>Reopen</Button>
            )}
          </div>
          )}
        </section>
      )}

      {cur && cur.runoffs.some((r) => !r.settled) && (
        <section className="tt-run__section" aria-labelledby="tt-run-runoffs">
          <h3 id="tt-run-runoffs" className="tt-run__heading">Run-offs</h3>
          <p className="tt-run__hint">Players level at the cut run one track. Pick who moves on once their times are in, or decide it yourself.</p>
          {cur.runoffs.filter((r) => !r.settled).map((ro) => {
            const chosen = picks[ro.group] ?? [];
            const sorted = [...ro.players].sort((a, b) => (ro.times[a] ?? Infinity) - (ro.times[b] ?? Infinity));
            return (
              <div key={ro.group} className="tt-run__runoff">
                <p className="tt-run__line"><b>Group {groupLabel(ro.group)}</b>: {ro.spots === 1 ? "one spot" : `${ro.spots} spots`} on {trackName(view.settings.game, ro.track)}, until {whenText(ro.closesAt)}.</p>
                <div className="tt-run__picks" role="group" aria-label={`Who moves on from group ${groupLabel(ro.group)}`}>
                  {sorted.map((pid) => (
                    <Checkbox key={pid} checked={chosen.includes(pid)}
                      onChange={(e) => setPicks({ ...picks, [ro.group]: e.target.checked ? [...chosen, pid] : chosen.filter((x) => x !== pid) })}
                      label={`${ro.names[ro.players.indexOf(pid)]}${ro.times[pid] != null ? `, ${formatTime(ro.times[pid] as number)}` : ", no time yet"}`} />
                  ))}
                </div>
                <div className="tt-run__row">
                  <Button variant="primary" size="small" disabled={chosen.length !== ro.spots} loading={busy === "settle"} onClick={() => void run({ action: "settle", group: ro.group, players: chosen }, "Run-off settled")}>
                    Move {chosen.length === ro.spots ? "them" : `${ro.spots}`} on
                  </Button>
                  <Button variant="ghost" size="small" loading={busy === "runoff"} onClick={() => void run({ action: "runoff", group: ro.group, minutes: 30 }, "Run-off restarted")}>Restart it, 30 minutes</Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {view.checks && <TtChecks checks={view.checks} waiting={view.waitingChecks} game={view.settings.game} canManage={view.canManage} busy={busy} run={run} />}

      {view.canManage && cur && !view.final && people.length > 0 && (
        <section className="tt-run__section" aria-labelledby="tt-run-type">
          <h3 id="tt-run-type" className="tt-run__heading">Type a time in</h3>
          <p className="tt-run__hint">For a player without an account, or a time you saw yourself. It counts as checked, and works after the window closes.</p>
          <div className="tt-run__row tt-run__row--wrap">
            <FormField label="Player" htmlFor="tt-run-pid">
              <Select id="tt-run-pid" value={typeFor.pid} onChange={(v) => setTypeFor({ ...typeFor, pid: String(v) })} placeholder="Pick a player" searchable options={people.map((p) => ({ value: p.participantId, label: p.name }))} />
            </FormField>
            <FormField label="Track" htmlFor="tt-run-track">
              <Select id="tt-run-track" value={typeFor.track} onChange={(v) => setTypeFor({ ...typeFor, track: String(v) })} placeholder="Pick a track" options={cur.tracks.map((t) => ({ value: t, label: trackName(view.settings.game, t) }))} />
            </FormField>
            <FormField label="Time" htmlFor="tt-run-time">
              <Input id="tt-run-time" value={typeFor.time} onChange={(e) => setTypeFor({ ...typeFor, time: e.target.value })} inputMode="decimal" placeholder="1:52.384" />
            </FormField>
            <Button variant="secondary" disabled={!typeFor.pid || !typeFor.track || !typeTime} loading={busy === "add_for"}
              onClick={async () => { if (await run({ action: "add_for", participantId: typeFor.pid, track: typeFor.track, time: typeTime }, "Time added")) setTypeFor({ ...typeFor, time: "" }); }}>Add the time</Button>
          </div>
        </section>
      )}

      {view.staff && <TtVerifiers staff={view.staff} busy={busy} run={run} />}
    </div>
  );
}

/** In person: each station, the group racing there, calling the next group, and the runner links. */
function TtStations({ tournamentId, view, busy, run }: { tournamentId: string; view: TtEventView; busy: string | null; run: (body: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const v = view.venue!;
  const groups = view.rounds.at(-1)?.n !== 0;
  const copy = async (link: string, n: number) => {
    const url = `${window.location.origin}${link}`;
    try { await navigator.clipboard.writeText(url); toast.success(`Station ${n}'s runner link copied`); }
    catch { toast.info(url, { title: `Station ${n}'s runner link` }); }
  };
  return (
    <section className="tt-run__section" aria-labelledby="tt-run-stations">
      <div className="tt-run__head">
        <h3 id="tt-run-stations" className="tt-run__heading">Stations</h3>
        <a className="tt-run__tv" href={`/tournament/${tournamentId}/display`} target="_blank" rel="noopener noreferrer">
          <IconDeviceTv size={18} stroke={1.9} aria-hidden="true" /> Open the TV board
        </a>
      </div>
      <p className="tt-run__hint">Give each runner their station&apos;s link. It opens a page where they type the times in, no account needed. Anyone with a link can add times there, so share it only with your runner.</p>
      <ul className="tt-br-rows" aria-label="Stations">
        {v.stations.map((st) => (
          <li key={st.n} className="tt-br-row">
            <span className="tt-br-row__words">
              <span className="tt-br-row__label">Station {st.n}</span>
              {groups ? (st.group != null ? <span>Group {st.label}: {st.players.join(", ")}</span> : <span className="tt-ev-muted">Free</span>) : null}
            </span>
            <span className="tt-run__station-actions">
              {groups && st.group != null && <Button size="small" variant="secondary" disabled={!!busy} loading={busy === "station_done"} onClick={() => void run({ action: "station_done", station: st.n }, `Station ${st.n} is done`)}>Done</Button>}
              {groups && st.group == null && v.queue.length > 0 && <Button size="small" variant="secondary" disabled={!!busy} loading={busy === "call"} onClick={() => void run({ action: "call", station: st.n, group: v.queue[0].index }, `Group ${v.queue[0].label} called`)}>Call Group {v.queue[0].label}</Button>}
              {st.link && (
                <IconButton size="small" variant="tertiary" aria-label={`Copy Station ${st.n}'s runner link`} title="Copy the runner link" onClick={() => void copy(st.link!, st.n)}>
                  <IconCopy size={18} stroke={1.9} aria-hidden="true" />
                </IconButton>
              )}
            </span>
          </li>
        ))}
      </ul>
      {groups && <p className="tt-run__hint">{v.queue.length ? `Waiting: ${v.queue.map((q) => `Group ${q.label}`).join(", ")}.` : "Every group has been called."}</p>}
      <div className="tt-run__row">
        <Button size="small" variant="ghost" loading={busy === "links_reset"} onClick={async () => {
          if (await confirm({ title: "Make new runner links?", body: "The links you gave out stop working. Send each runner their new one.", confirmLabel: "Make new links" })) void run({ action: "links_reset" }, "New runner links made");
        }}>Make new runner links</Button>
      </div>
    </section>
  );
}

/** The times to check: on the run screen for organizers, on the event page for verifiers. */
export function TtChecks({ checks, waiting, game, canManage, busy, run, matches = false }: {
  checks: TtCheckItem[]; waiting: number; game: TtGame; canManage: boolean;
  busy: string | null; run: (body: Record<string, unknown>, done?: string) => Promise<boolean>;
  /** Swiss or a bracket: the times holding a decided match come first. */
  matches?: boolean;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
        <section className="tt-run__section" aria-labelledby="tt-run-checks">
          <h3 id="tt-run-checks" className="tt-run__heading">Times to check {waiting > 0 && <span className="tt-run__count">{waiting}</span>}</h3>
          <p className="tt-run__hint">{matches
            ? "Each player's best on each track of the matches still open. Times holding a decided match come first: it counts once they're checked."
            : "Each player's best on each track. Clips waiting come first, then top times still without one. Times you typed in count as checked."}</p>
          {checks.length === 0 ? <p className="tt-run__hint">Nothing to check right now.</p> : matches ? (
            <ul className="tt-br-rows" aria-label="Times to check">
              {checks.slice(0, 60).map((c) => (
                <li key={c.id} className="tt-ck-row">
                  <span className="tt-br-row__words">
                    <span className="tt-br-row__label">{c.name} · {formatTime(c.ms)}</span>
                    <span>{trackName(game, c.track)}, the {c.place === 1 ? "faster" : "slower"} time</span>
                    {c.label && <span className="tt-ev-muted">{c.label}{c.held ? ". Decided, waiting on this check." : ""}</span>}
                    <span className="tt-run__proof">
                      {c.screenshot && <a href={c.screenshot} target="_blank" rel="noreferrer">Screenshot <IconExternalLink size={14} aria-hidden="true" /></a>}
                      {c.video ? <a href={c.video} target="_blank" rel="noreferrer">Clip <IconExternalLink size={14} aria-hidden="true" /></a> : c.needsClip ? <span className="tt-ev-muted">No clip yet</span> : null}
                    </span>
                  </span>
                  <span className="tt-ck-row__acts">
                    <Input aria-label={`Note for ${c.name}`} size="small" value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="Note for the player (optional)" fullWidth />
                    <span className="tt-run__acts">
                      <Button size="small" variant="secondary" iconBefore={IconCheck} disabled={busy === "check"} onClick={() => void run({ action: "check", timeId: c.id, ok: true, note: notes[c.id] ?? null }, "Counts")}>Counts</Button>
                      <Button size="small" variant="ghost" iconBefore={IconX} disabled={busy === "check"} onClick={() => void run({ action: "check", timeId: c.id, ok: false, note: notes[c.id] ?? null }, "Marked as not counting")}>Doesn&apos;t count</Button>
                      {c.needsClip && canManage && <Button size="small" variant="ghost" onClick={() => void run({ action: "remind", timeId: c.id }, "Reminder sent")}>Remind</Button>}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <AdminTable label="Times to check">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Player</TableHead>
                    <TableHead>Track</TableHead>
                    <TableHead className="tt-ev-num">Time</TableHead>
                    <TableHead className="tt-ev-num">Place</TableHead>
                    <TableHead>Proof</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead><span className="sr-only">Check</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.slice(0, 60).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{trackName(game, c.track)}{c.round > 0 && <span className="tt-ev-muted"> (round {c.round})</span>}</TableCell>
                      <TableCell className="tt-ev-num">{formatTime(c.ms)}</TableCell>
                      <TableCell className="tt-ev-num">{c.place ? ordinal(c.place) : ""}</TableCell>
                      <TableCell>
                        <span className="tt-run__proof">
                          {c.screenshot && <a href={c.screenshot} target="_blank" rel="noreferrer">Screenshot <IconExternalLink size={14} aria-hidden="true" /></a>}
                          {c.video ? <a href={c.video} target="_blank" rel="noreferrer">Clip <IconExternalLink size={14} aria-hidden="true" /></a> : c.needsClip ? <span className="tt-ev-muted">Clip needed</span> : null}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input aria-label={`Note for ${c.name}`} size="small" value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="Optional" />
                      </TableCell>
                      <TableCell>
                        <span className="tt-run__acts">
                          <Button size="small" variant="secondary" iconBefore={IconCheck} disabled={busy === "check"} onClick={() => void run({ action: "check", timeId: c.id, ok: true, note: notes[c.id] ?? null }, "Counts")}>Counts</Button>
                          <Button size="small" variant="ghost" iconBefore={IconX} disabled={busy === "check"} onClick={() => void run({ action: "check", timeId: c.id, ok: false, note: notes[c.id] ?? null }, "Marked as not counting")}>Doesn&apos;t count</Button>
                          {c.needsClip && canManage && <Button size="small" variant="ghost" onClick={() => void run({ action: "remind", timeId: c.id }, "Reminder sent")}>Remind</Button>}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          )}
        </section>
  );
}

/** Who checks times as they come in: on the run screen for organizers (events, Swiss and brackets). */
export function TtVerifiers({ staff, busy, run }: { staff: TtStaffRow[]; busy: string | null; run: (body: Record<string, unknown>, done?: string) => Promise<boolean> }) {
  const [verifier, setVerifier] = useState("");
  return (
        <section className="tt-run__section" aria-labelledby="tt-run-staff">
          <h3 id="tt-run-staff" className="tt-run__heading">Verifiers</h3>
          <p className="tt-run__hint">People who check times as they come in. They see the times to check, nothing else on this page.</p>
          {staff.length > 0 && (
            <ul className="tt-run__staff">
              {staff.map((p) => (
                <li key={`${p.userId}-${p.role}`}>
                  <span>{p.name}{p.username && <span className="tt-ev-muted"> @{p.username}</span>}</span>
                  <Button size="small" variant="ghost" onClick={() => void run({ action: "staff_remove", userId: p.userId, role: p.role }, "Removed")}>Remove</Button>
                </li>
              ))}
            </ul>
          )}
          <div className="tt-run__row">
            <FormField label="Add by username" htmlFor="tt-run-verifier">
              <Input id="tt-run-verifier" value={verifier} onChange={(e) => setVerifier(e.target.value)} placeholder="username" autoComplete="off" />
            </FormField>
            <Button variant="secondary" disabled={!verifier.trim()} loading={busy === "staff_add"} onClick={async () => { if (await run({ action: "staff_add", username: verifier }, "Verifier added")) setVerifier(""); }}>Add verifier</Button>
          </div>
        </section>
  );
}
