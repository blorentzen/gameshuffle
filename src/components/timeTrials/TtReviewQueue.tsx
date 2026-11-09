"use client";

/**
 * The reviewers' queue (round 2, 5A/6A): clips to check, oldest first, and open report tickets. A clip
 * that checks out flips the time to Verified; one that doesn't is an ask for an update (picks 2026-11-08): a quick ask
 * or the reviewer's own words, which the player gets as a notification and a thread on the time. Their answer brings
 * the time back to the top, marked Updated.
 * Round 3: clips players vouched for come first (with the count), the site's proof checks show as tickets, updaters
 * see only their game and items. The Team tab (picks 2026-11-05, TtTeamTab) gives reviewer and updater access; staff
 * and admins give anything, reviewers make updaters. Staff also manage the short names players taught the import reader
 * (three players picking the same track for a name makes it read for everyone; staff can block one).
 * Legacy proof (picks 2026-11-04): legacy times whose record carried a clip or a post, records first, verified in one
 * tap or turned down with a reason (they stay Legacy times).
 * Used on /time-trials/review and Platform ▸ Time trials.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Chip, EmptyState, FormField, Input, Tabs } from "@empac/cascadeds";
import { IconCamera, IconCircleCheck, IconExternalLink, IconMessage, IconPencil, IconRefresh, IconSend, IconThumbUp, IconTrophy, IconVideo } from "@tabler/icons-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { QueueLegacy, QueueTicket, QueueVideo } from "@/lib/timeTrials/review";
import type { CommunityAlias } from "@/lib/timeTrials/aliases";
import type { QueueClaim } from "@/lib/timeTrials/claims";
import type { SheetStatus } from "@/lib/timeTrials/sheetSync";
import type { Mode } from "@/lib/timeTrials/updaters";
import { TT_GAMES } from "@/lib/timeTrials/tracks";
import { itemsLabel } from "@/lib/timeTrials/categories";
import { ordinal } from "@/lib/timeTrials/rules";
import { TtTeamTab, type TeamData } from "./TtTeamTab";
import { TtFixTime } from "./TtFixTime";

type Queue = { videos: QueueVideo[]; tickets: QueueTicket[]; team: TeamData | null; aliases: CommunityAlias[] | null; staff: boolean; modes: Mode[] | null;
  /** Top 10 sheet claims (round 4), for staff, reviewers and the MK8DX mushrooms updaters; when each sheet was read (staff). */
  claims: { pending: QueueClaim[]; approved: QueueClaim[] } | null; sheets: SheetStatus[] | null;
  /** Legacy times with a clip or post to check (picks 2026-11-04), for whoever checks Mario Kart 8 Deluxe mushrooms. */
  legacy: { items: QueueLegacy[]; total: number } | null };
const SHEET_LABEL: Record<string, string> = { base: "Base Game", bcp: "Booster Course Pass", inward: "Inward" };
const modeText = (m: Mode) => `${TT_GAMES[m.game].short} · ${itemsLabel(m.items)}`;

/** The asks reviewers make most (tap one to fill the message, then change it if needed). */
const QUICK_ASKS = [
  { label: "Show the timer at the finish", text: "The clip stops before the finish line. Send one that shows the timer as you cross it." },
  { label: "Show the whole last lap", text: "The clip needs to show your whole last lap, through the finish." },
  { label: "Clip shows another track", text: "The clip shows a different track. Send the clip of this run." },
  { label: "Time on screen doesn't match", text: "The time on screen doesn't match this time. Fix the time, or send the clip of this run." },
  { label: "Clip won't play", text: "The clip won't play for us. Send a link that opens for anyone." },
];

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const STATE: Record<QueueTicket["state"], string> = { open: "New", waiting_review: "Owner answered", waiting_owner: "Waiting on the owner", kept: "Kept", removed: "Removed" };

export function TtReviewQueue() {
  const [q, setQ] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  // The clip a reviewer is fixing the numbers of (picks 2026-11-09).
  const [fixing, setFixing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    let live = true;
    void fetch("/api/time-trials/review", { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((j: (Queue & { ok?: boolean }) | null) => {
      if (!live) return;
      if (!j?.ok) { setFailed(true); return; }
      setQ(j);
    });
    return () => { live = false; };
  }, [reloadKey]);
  const reload = () => setReloadKey((k) => k + 1);

  // On a phone the tab it opens on can sit past the edge of the scrolling tab bar: bring it into view once loaded.
  const loaded = !!q;
  useEffect(() => {
    if (!loaded) return;
    document.querySelector(".tt-queue-tabs .empac-tabs__tab--active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [loaded]);

  async function post(body: Record<string, unknown>, done: string): Promise<boolean> {
    const j = (await fetch("/api/time-trials/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) { toast.error(j.error === "reason_needed" ? (body.action === "claim" ? "Say why it isn't approved." : body.action === "legacy_reject" ? "Say why the proof doesn't show it." : "Say what they should update.") : j.error === "taken" ? "That name is already matched to an account." : "That didn't save. Try again."); return false; }
    toast.success(done);
    reload();
    return true;
  }

  if (failed) return <p className="tt-note">You need to be a time trial reviewer to see this.</p>;
  if (!q) return <p className="tt-note" role="status">Loading the queue…</p>;

  const clips = q.videos.length === 0 ? <EmptyState title="No clips to check" description="Clips players add for their times show up here." /> : (
    <ul className="tt-queue">
      {q.videos.map((v) => { const who = v.name === "A player" ? "the player" : v.name; return (
        <li key={v.time.id} className="tt-queue__item">
          <p className="tt-queue__head">{v.ask?.state === "waiting_review" && <><span className="tt-chip tt-chip--updated"><IconRefresh size={14} aria-hidden="true" /> Updated</span>{" "}</>}<b>{v.name}</b> · {v.label}</p>
          {v.ask?.state === "waiting_review" && (
            <p className="tt-queue__asked">{v.ask.fixed ? "A reviewer fixed it" : "You asked"}: &ldquo;{v.ask.note}&rdquo;{v.ask.reply && <> {v.name}: &ldquo;{v.ask.reply}&rdquo;{v.ask.replyLink && <>{" "}<a href={v.ask.replyLink} target="_blank" rel="noopener noreferrer nofollow">Their link</a></>}</>}</p>
          )}
          {v.ask?.state === "waiting_owner" && <p className="tt-note">Asked for an update: &ldquo;{v.ask.note}&rdquo; Waiting on {who}.</p>}
          {v.vouches > 0 && <p className="tt-queue__links"><span className="tt-chip tt-chip--trust"><IconThumbUp size={14} aria-hidden="true" /> {v.vouches} {v.vouches === 1 ? "vouch" : "vouches"}</span><span className="tt-muted">from other players</span></p>}
          <p className="tt-queue__links">
            {v.time.proofUrl && <a href={v.time.proofUrl} target="_blank" rel="noopener noreferrer nofollow"><IconCamera size={16} aria-hidden="true" /> Screenshot</a>}
            {v.time.videoUrl && <a href={v.time.videoUrl} target="_blank" rel="noopener noreferrer nofollow"><IconVideo size={16} aria-hidden="true" /> Clip</a>}
            <span className="tt-muted">Added {when.format(new Date(v.time.createdAt))}</span>
          </p>
          {fixing === v.time.id ? (
            <TtFixTime
              time={{ id: v.time.id, game: v.time.game, timeMs: v.time.timeMs, cc: v.time.cc, items: v.time.items, vehicle: v.time.vehicle, laps: v.laps, classes: v.classes }}
              reviewer={{ name: v.name, canVerify: !!(v.time.videoUrl || v.time.proofUrl) }}
              onCancel={() => setFixing(null)}
              onDone={() => { setFixing(null); reload(); }}
            />
          ) : rejecting === v.time.id ? (
            <form className="tt-queue__ask" onSubmit={(e) => { e.preventDefault(); setBusy(v.time.id); void post({ action: "video", timeId: v.time.id, ok: false, note: reason }, `Asked ${who} for an update`).then((ok) => { setBusy(null); if (ok) { setRejecting(null); setReason(""); } }); }}>
              <p className="tt-queue__ask-label" id={`tt-ask-quick-${v.time.id}`}>What should {who} update?</p>
              <div className="tt-queue__chips" role="group" aria-labelledby={`tt-ask-quick-${v.time.id}`}>
                {QUICK_ASKS.map((a) => <Chip key={a.label} label={a.label} clickable selected={reason === a.text} aria-pressed={reason === a.text} onClick={() => setReason(a.text)} />)}
              </div>
              <FormField label="Your message (they see this)" htmlFor={`tt-rej-${v.time.id}`}>
                <Input id={`tt-rej-${v.time.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} fullWidth />
              </FormField>
              <p className="tt-note">The time stays on the board, unverified, while {who} updates it.</p>
              <div className="tt-add__actions">
                <Button type="submit" variant="primary" iconBefore={IconSend} loading={busy === v.time.id} disabled={!reason.trim()}>Send the ask</Button>
                <Button type="button" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="tt-add__actions">
              <Button variant="primary" iconBefore={IconCircleCheck} loading={busy === v.time.id} onClick={() => { setBusy(v.time.id); void post({ action: "video", timeId: v.time.id, ok: true }, "Verified").then(() => setBusy(null)); }}>{v.time.video === "waiting" ? "Clip checks out" : "It checks out"}</Button>
              <Button variant="secondary" iconBefore={IconPencil} onClick={() => { setFixing(v.time.id); setRejecting(null); }}>Fix the time</Button>
              <Button variant="secondary" iconBefore={IconMessage} onClick={() => { setRejecting(v.time.id); setReason(""); setFixing(null); }}>Ask for an update</Button>
            </div>
          )}
        </li>
      ); })}
    </ul>
  );

  const reports = q.tickets.length === 0 ? <EmptyState title="No open reports" description="Times people report from a board or Discord show up here." /> : (
    <ul className="tt-queue">
      {q.tickets.map((t) => (
        <li key={t.id} className="tt-queue__item">
          <p className="tt-queue__head"><b>{t.ownerName}</b> · {t.label}</p>
          <p className="tt-note">{t.flag ? <><b>Proof check:</b> {t.reason}</> : <>{t.reporterName}: &ldquo;{t.reason ?? "Reported"}&rdquo;</>}</p>
          <p className="tt-queue__links">{t.flag ? <span className="tt-chip tt-chip--review">Flag</span> : <span className="tt-chip tt-chip--wait">{STATE[t.state]}</span>} <Link href={`/time-trials/tickets/${t.id}`}>Open the ticket</Link></p>
        </li>
      ))}
    </ul>
  );

  const claimItem = (c: QueueClaim, pending: boolean) => (
    <li key={c.id} className="tt-queue__item">
      <p className="tt-queue__head"><b>{c.userName}</b>{c.username ? <span className="tt-muted"> @{c.username}</span> : null} says they&apos;re <Link href={c.listedPage}>{c.listedName}</Link> · {c.times} {c.times === 1 ? "time" : "times"}</p>
      {c.note && <p className="tt-note">&ldquo;{c.note}&rdquo;</p>}
      <p className="tt-queue__links">
        {c.link && <a href={c.link} target="_blank" rel="noopener noreferrer nofollow"><IconExternalLink size={16} aria-hidden="true" /> Their link</a>}
        {c.username && <Link href={`/u/${c.username}`}>Their profile</Link>}
        {c.others > 0 && <span className="tt-chip tt-chip--review">{c.others} more {c.others === 1 ? "claim" : "claims"} on this name</span>}
        <span className="tt-muted">{pending ? "Asked" : "Approved"} {when.format(new Date(c.at))}</span>
      </p>
      {!pending ? (
        <div className="tt-add__actions">
          <Button variant="ghost" size="small" onClick={() => { void confirm({ title: `Undo ${c.userName}'s claim on ${c.listedName}?`, body: "The times go back to the listed player. Times they added themselves stay on their account.", confirmLabel: "Undo claim" }).then((ok) => { if (ok) void post({ action: "claim_undo", claimId: c.id }, "Claim undone"); }); }}>Undo</Button>
        </div>
      ) : rejecting === c.id ? (
        <form className="tt-queue__reject" onSubmit={(e) => { e.preventDefault(); setBusy(c.id); void post({ action: "claim", claimId: c.id, approve: false, reason }, "Turned down").then((ok) => { setBusy(null); if (ok) { setRejecting(null); setReason(""); } }); }}>
          <FormField label="Why not? (they see this)" htmlFor={`tt-claim-rej-${c.id}`}>
            <Input id={`tt-claim-rej-${c.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} fullWidth />
          </FormField>
          <div className="tt-add__actions">
            <Button type="submit" variant="danger" loading={busy === c.id} disabled={!reason.trim()}>Turn down</Button>
            <Button type="button" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <div className="tt-add__actions">
          <Button variant="primary" iconBefore={IconCircleCheck} loading={busy === c.id} onClick={() => { setBusy(c.id); void post({ action: "claim", claimId: c.id, approve: true }, `${c.listedName}'s times moved to ${c.userName}`).then(() => setBusy(null)); }}>It&apos;s them</Button>
          <Button variant="secondary" onClick={() => { setRejecting(c.id); setReason(""); }}>Not them</Button>
        </div>
      )}
    </li>
  );
  const claims = q.claims ? (
    <div className="tt-reviewers">
      <p className="tt-note">People saying a listed player is them. Check their link shows that name is theirs (an MKCentral page, a channel or post under it, or a clip of one of the runs). Approving moves the name&apos;s times to their account, and later times for that name go straight there.</p>
      {q.claims.pending.length === 0 ? <EmptyState title="No claims waiting" description="When someone presses This is me on a listed player's page, it shows up here." /> : <ul className="tt-queue">{q.claims.pending.map((c) => claimItem(c, true))}</ul>}
      {q.claims.approved.length > 0 && (
        <>
          <h2 className="tt-queue__sub">Approved lately</h2>
          <ul className="tt-queue">{q.claims.approved.map((c) => claimItem(c, false))}</ul>
        </>
      )}
      {q.sheets && q.sheets.length > 0 && (
        <>
          <h2 className="tt-queue__sub">Imported names</h2>
          <ul className="tt-queue">
            {q.sheets.map((r) => (
              <li key={`${r.sheet}${r.cc}`} className="tt-queue__item tt-queue__item--row">
                <span><b>{SHEET_LABEL[r.sheet] ?? r.sheet} · {r.cc}cc</b><span className="tt-muted"> · {r.rows} times, {r.added} new · read {when.format(new Date(r.readAt))}</span></span>
                {r.error && <span className="tt-chip tt-chip--bad">{r.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  ) : null;

  const legacy = q.legacy ? (
    <div className="tt-reviewers">
      <p className="tt-note">Imported times whose record carried a clip or a post, each board&apos;s record first. Open the proof and check it shows this run: verifying makes it show as Verified. Turning one down takes it off this list; it stays unverified.</p>
      {q.legacy.items.length === 0 ? <EmptyState title="Nothing to check" description="Imported times that came with a clip or a post show up here until someone checks them." /> : (
        <>
          {q.legacy.total > q.legacy.items.length && <p className="tt-muted">Showing the first {q.legacy.items.length} of {q.legacy.total}.</p>}
          <ul className="tt-queue">
            {q.legacy.items.map((l) => (
              <li key={l.id} className="tt-queue__item">
                <p className="tt-queue__head">{l.place === 1 ? <span className="tt-chip tt-chip--ok"><IconTrophy size={14} aria-hidden="true" /> Record</span> : <span className="tt-chip">{ordinal(l.place)}</span>} <b>{l.name}</b> · {l.label}</p>
                <p className="tt-queue__links">
                  <a href={l.link} target="_blank" rel="noopener noreferrer nofollow"><IconExternalLink size={16} aria-hidden="true" /> Open the proof</a>
                  <Link href={l.board}>On the board</Link>
                </p>
                {rejecting === l.id ? (
                  <form className="tt-queue__reject" onSubmit={(e) => { e.preventDefault(); setBusy(l.id); void post({ action: "legacy_reject", timeId: l.id, note: reason }, "Taken off the list").then((ok) => { setBusy(null); if (ok) { setRejecting(null); setReason(""); } }); }}>
                    <FormField label="Why doesn't it show this run? (the player sees this if the time is on their account)" htmlFor={`tt-leg-rej-${l.id}`}>
                      <Input id={`tt-leg-rej-${l.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} fullWidth />
                    </FormField>
                    <div className="tt-add__actions">
                      <Button type="submit" variant="danger" loading={busy === l.id} disabled={!reason.trim()}>Turn down</Button>
                      <Button type="button" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
                    </div>
                  </form>
                ) : (
                  <div className="tt-add__actions">
                    <Button variant="primary" iconBefore={IconCircleCheck} loading={busy === l.id} onClick={() => { setBusy(l.id); void post({ action: "verify", timeId: l.id }, "Verified").then(() => setBusy(null)); }}>It shows this run</Button>
                    <Button variant="secondary" onClick={() => { setRejecting(l.id); setReason(""); }}>It doesn&apos;t</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  ) : null;

  const team = q.team ? <TtTeamTab team={q.team} onChanged={reload} /> : null;

  const shortNames = q.aliases ? (q.aliases.length === 0 ? <EmptyState title="No short names learned yet" description="When three players pick the same track for a name the import reader didn't know, it reads for everyone and shows up here." /> : (
    <div className="tt-reviewers">
      <p className="tt-note">These read for everyone&apos;s pastes. Block one that points at the wrong track; players who picked it still get their own pick.</p>
      <ul className="tt-queue">
        {q.aliases.map((a) => (
          <li key={`${a.game}|${a.alias}|${a.trackId}`} className="tt-queue__item tt-queue__item--row">
            <span><code>{a.alias}</code> reads as <b>{a.trackName}</b><span className="tt-muted"> · {a.gameLabel} · {a.players} players</span></span>
            <Button variant="ghost" size="small" onClick={() => { void confirm({ title: `Stop reading "${a.alias}" as ${a.trackName}?`, body: "It stops reading for everyone. Players who picked it keep their own pick.", confirmLabel: "Block it" }).then((ok) => { if (ok) void post({ action: "alias_block", game: a.game, alias: a.alias, track: a.trackId }, "Blocked"); }); }}>Block</Button>
          </li>
        ))}
      </ul>
    </div>
  )) : null;

  // Opens on the first tab with something waiting (Britton, 2026-11-05: click in and see a queue).
  const waiting = [
    ["clips", q.videos.length], ["reports", q.tickets.length], ["claims", q.claims?.pending.length ?? 0], ["legacy", q.legacy?.total ?? 0],
  ] as const;
  const first = waiting.find(([, n]) => n > 0)?.[0] ?? "clips";
  return (
    <>
    {q.modes && <p className="tt-note">You check {q.modes.map(modeText).join(" and ")}.</p>}
    <Tabs
      className="tt-queue-tabs"
      variant="underline"
      defaultActiveTab={first}
      tabs={[
        { id: "clips", label: "Clips to check", badge: q.videos.length || undefined, content: clips },
        { id: "reports", label: "Reports", badge: q.tickets.length || undefined, content: reports },
        ...(claims ? [{ id: "claims", label: "Name claims", badge: q.claims!.pending.length || undefined, content: claims }] : []),
        ...(legacy ? [{ id: "legacy", label: "Imported proof", badge: q.legacy!.total || undefined, content: legacy }] : []),
        ...(team ? [{ id: "team", label: "Team", content: team }] : []),
        ...(shortNames ? [{ id: "short-names", label: "Short names", content: shortNames }] : []),
      ]}
    />
    </>
  );
}
