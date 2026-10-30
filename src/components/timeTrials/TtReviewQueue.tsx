"use client";

/**
 * The reviewers' queue (round 2, 5A/6A): clips to check, oldest first, and open report tickets. A clip
 * that checks out flips the time to Verified; one that doesn't asks for a reason the player sees.
 * Staff also manage the time trial reviewers here, and the short names players taught the import reader
 * (three players picking the same track for a name makes it read for everyone; staff can block one).
 * Used on /time-trials/review and Platform ▸ Time trials.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, FormField, Input, Tabs } from "@empac/cascadeds";
import { IconCamera, IconCircleCheck, IconVideo } from "@tabler/icons-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { QueueTicket, QueueVideo, Reviewer } from "@/lib/timeTrials/review";
import type { CommunityAlias } from "@/lib/timeTrials/aliases";

type Queue = { videos: QueueVideo[]; tickets: QueueTicket[]; reviewers: Reviewer[] | null; aliases: CommunityAlias[] | null; staff: boolean };

const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const STATE: Record<QueueTicket["state"], string> = { open: "New", waiting_review: "Owner answered", waiting_owner: "Waiting on the owner", kept: "Kept", removed: "Removed" };

export function TtReviewQueue() {
  const [q, setQ] = useState<Queue | null>(null);
  const [failed, setFailed] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [username, setUsername] = useState("");
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

  async function post(body: Record<string, unknown>, done: string): Promise<boolean> {
    const j = (await fetch("/api/time-trials/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!j.ok) { toast.error(j.error === "no_user" ? "No account with that username." : j.error === "reason_needed" ? "Say why the clip doesn't match." : "That didn't save. Try again."); return false; }
    toast.success(done);
    reload();
    return true;
  }

  if (failed) return <p className="tt-note">You need to be a time trial reviewer to see this.</p>;
  if (!q) return <p className="tt-note" role="status">Loading the queue…</p>;

  const clips = q.videos.length === 0 ? <EmptyState title="No clips to check" description="Clips players add for their times show up here." /> : (
    <ul className="tt-queue">
      {q.videos.map((v) => (
        <li key={v.time.id} className="tt-queue__item">
          <p className="tt-queue__head"><b>{v.name}</b> · {v.label}</p>
          <p className="tt-queue__links">
            {v.time.proofUrl && <a href={v.time.proofUrl} target="_blank" rel="noopener noreferrer nofollow"><IconCamera size={16} aria-hidden="true" /> Screenshot</a>}
            {v.time.videoUrl && <a href={v.time.videoUrl} target="_blank" rel="noopener noreferrer nofollow"><IconVideo size={16} aria-hidden="true" /> Clip</a>}
            <span className="tt-muted">Added {when.format(new Date(v.time.createdAt))}</span>
          </p>
          {rejecting === v.time.id ? (
            <form className="tt-queue__reject" onSubmit={(e) => { e.preventDefault(); setBusy(v.time.id); void post({ action: "video", timeId: v.time.id, ok: false, note: reason }, "Sent back to the player").then((ok) => { setBusy(null); if (ok) { setRejecting(null); setReason(""); } }); }}>
              <FormField label="Why doesn't it match? (the player sees this)" htmlFor={`tt-rej-${v.time.id}`}>
                <Input id={`tt-rej-${v.time.id}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} fullWidth />
              </FormField>
              <div className="tt-add__actions">
                <Button type="submit" variant="danger" loading={busy === v.time.id} disabled={!reason.trim()}>Send back</Button>
                <Button type="button" variant="ghost" onClick={() => { setRejecting(null); setReason(""); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <div className="tt-add__actions">
              <Button variant="primary" iconBefore={IconCircleCheck} loading={busy === v.time.id} onClick={() => { setBusy(v.time.id); void post({ action: "video", timeId: v.time.id, ok: true }, "Verified").then(() => setBusy(null)); }}>Clip checks out</Button>
              <Button variant="secondary" onClick={() => { setRejecting(v.time.id); setReason(""); }}>Doesn&apos;t match</Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const reports = q.tickets.length === 0 ? <EmptyState title="No open reports" description="Times people report from a board or Discord show up here." /> : (
    <ul className="tt-queue">
      {q.tickets.map((t) => (
        <li key={t.id} className="tt-queue__item">
          <p className="tt-queue__head"><b>{t.ownerName}</b> · {t.label}</p>
          <p className="tt-note">{t.reporterName}: &ldquo;{t.reason ?? "Reported"}&rdquo;</p>
          <p className="tt-queue__links"><span className="tt-chip tt-chip--wait">{STATE[t.state]}</span> <Link href={`/time-trials/tickets/${t.id}`}>Open the ticket</Link></p>
        </li>
      ))}
    </ul>
  );

  const reviewers = q.reviewers ? (
    <div className="tt-reviewers">
      <form className="tt-compare__row" onSubmit={(e) => { e.preventDefault(); setBusy("add"); void post({ action: "reviewer_add", username }, "Reviewer added").then((ok) => { setBusy(null); if (ok) setUsername(""); }); }}>
        <FormField label="Add a reviewer by username" htmlFor="tt-rev-add">
          <Input id="tt-rev-add" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </FormField>
        <Button type="submit" variant="secondary" loading={busy === "add"} disabled={!username.trim()}>Add</Button>
      </form>
      {q.reviewers.length === 0 ? <p className="tt-note">No reviewers besides staff yet. Reviewers see only this queue.</p> : (
        <ul className="tt-queue">
          {q.reviewers.map((r) => (
            <li key={r.userId} className="tt-queue__item tt-queue__item--row">
              <span><b>{r.name}</b>{r.username ? <span className="tt-muted"> @{r.username}</span> : null}</span>
              <Button variant="ghost" size="small" onClick={() => { void confirm({ title: `Remove ${r.name} as a reviewer?`, confirmLabel: "Remove reviewer" }).then((ok) => { if (ok) void post({ action: "reviewer_remove", userId: r.userId }, "Reviewer removed"); }); }}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

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

  return (
    <Tabs
      variant="underline"
      tabs={[
        { id: "clips", label: "Clips to check", badge: q.videos.length || undefined, content: clips },
        { id: "reports", label: "Reports", badge: q.tickets.length || undefined, content: reports },
        ...(reviewers ? [{ id: "reviewers", label: "Reviewers", content: reviewers }] : []),
        ...(shortNames ? [{ id: "short-names", label: "Short names", content: shortNames }] : []),
      ]}
    />
  );
}
