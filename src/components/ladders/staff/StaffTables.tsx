"use client";

/**
 * Staff page ▸ Tables: the tables waiting on someone, each with why, and the side-by-side review (pick 4A): the results
 * screenshot, each player as typed and as read, differences marked, and the Discord card's three choices.
 */

import { useEffect, useState } from "react";
import { Button, EmptyState, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { IconCircleCheck } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { TableScroll } from "@/components/ui/TableScroll";
import { formatLabel, ladderTablePath } from "@/lib/ladders/types";
import type { StaffTabProps } from "./RankedStaffHub";
import { num, relative, type ReviewData, type WaitingTable } from "./types";

const ERRORS: Record<string, string> = {
  not_pending: "Someone already dealt with this table.",
  no_read: "There's no screenshot reading for this table.",
  failed: "That didn't work. Try again in a moment.",
};

const title = (t: { number: number; format: number; tier: string | null }, knockout: boolean) =>
  [`Table ${num(t.number)}`, knockout ? "Knockout Tour" : formatLabel(t.format), t.tier ? `Tier ${t.tier}` : null].filter(Boolean).join(" · ");

/** Reasons that aren't the screenshot's differences (those show in the review table itself). */
const notDiff = (r: string) => !/^The text (says|has)\b|isn't on the screenshot$|^The screenshot also has\b/.test(r);

export function StaffTables({ data, act, reload, ladderId }: StaffTabProps) {
  const [open, setOpen] = useState<string | null>(null);
  const knockout = data.ladder.kind === "knockout";
  const { waiting, autoToday } = data.tables;
  const auto = data.ladder.settings.staff.autoVerify;
  return (
    <section className="ranked-staff__panel" aria-labelledby="staff-tables">
      <h2 id="staff-tables" className="sr-only">Tables</h2>
      <p className="ladder-note">
        {auto
          ? autoToday ? `${num(autoToday)} ${autoToday === 1 ? "table" : "tables"} verified on their own today.` : "Clean tables verify on their own. None have yet today."
          : "Clean tables wait for an updater here. An admin can let them verify on their own in Settings."}
      </p>
      {waiting.length ? (
        <ul className="ranked-staff__list">
          {waiting.map((t) => (
            <li key={t.id} className="ranked-staff__row">
              <div className="ranked-staff__row-main">
                <span className="ranked-staff__row-title">{title(t, knockout)}</span>
                <span className={t.autoAt ? "ranked-staff__row-auto" : "ranked-staff__row-why"}>{whyLine(t)}</span>
                <span className="ladder-muted">Submitted by {t.submittedByName ?? "a reporter"} · {relative(t.createdAt)}</span>
              </div>
              <Button size="small" variant={t.autoAt ? "secondary" : "primary"} onClick={() => setOpen(t.id)}>Review</Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState variant="subtle" icon={<IconCircleCheck size={28} aria-hidden />} title="Nothing is waiting" description="New tables show here as they come in, with what to look at." />
      )}
      {data.rooms.length > 0 && <RoomsNow {...{ data, act, reload, ladderId }} />}
      {open && <TableReview ladderId={ladderId} tableId={open} slug={data.ladder.slug} knockout={knockout} act={act} onClose={(changed) => { setOpen(null); if (changed) reload(); }} />}
    </section>
  );
}

/** Rooms the queue made that are still voting or playing; staff can cancel one that's stuck. */
function RoomsNow({ data, act, reload }: StaffTabProps) {
  const toast = useToast();
  const confirm = useConfirm();
  const cancel = async (id: string, n: number) => {
    if (!(await confirm({ title: `Cancel room ${num(n)}?`, body: "Its players go back to joining; nobody gets a penalty.", confirmLabel: "Cancel the room" }))) return;
    const res = await act({ action: "room_cancel", roomId: id });
    if (res.ok) { toast.success(`Room ${num(n)} is canceled.`); reload(); } else toast.error("That room already finished.");
  };
  return (
    <section className="ranked-staff__sec" aria-labelledby="staff-rooms">
      <h2 id="staff-rooms">Rooms playing now</h2>
      <ul className="ranked-staff__list">
        {data.rooms.map((r) => (
          <li key={r.id} className="ranked-staff__row">
            <div className="ranked-staff__row-main">
              <span className="ranked-staff__row-title">Room {num(r.number)} · {r.status === "voting" ? "voting a format" : data.ladder.kind === "knockout" ? "Knockout Tour" : formatLabel(r.format ?? 1)}</span>
              <span className="ladder-muted">{r.players} players{r.host ? ` · host ${r.host}` : ""} · made {relative(r.createdAt)}</span>
            </div>
            <Button size="small" variant="ghost" onClick={() => cancel(r.id, r.number)}>Cancel</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function whyLine(t: WaitingTable): string {
  if (t.autoAt) return `The text and the screenshot agree. Verifies on its own ${relative(t.autoAt)}.`;
  return t.reasons.length ? t.reasons.slice(0, 3).join(" · ") + (t.reasons.length > 3 ? ` · and ${t.reasons.length - 3} more` : "") : "Waiting on an updater";
}

function TableReview({ ladderId, tableId, slug, knockout, act, onClose }: { ladderId: string; tableId: string; slug: string; knockout: boolean; act: StaffTabProps["act"]; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [got, setGot] = useState<ReviewData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/ranked/${ladderId}/staff?table=${tableId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: ReviewData) => { if (alive) setGot(j); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [ladderId, tableId]);

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    const res = await act({ tableId, ...body });
    setBusy(false);
    if (res.ok) { toast.success(done); onClose(true); }
    else toast.error(ERRORS[res.error ?? ""] ?? ERRORS.failed);
  };

  const t = got?.table;
  const review = got?.review;
  const pending = t?.status === "pending";
  const useRead = !!review?.hasRead && review.differences > 0 && !knockout;
  const others = (t?.reasons ?? []).filter(notDiff);
  const footer = !t || !pending ? (
    <Button variant="secondary" onClick={() => onClose(false)}>Close</Button>
  ) : sending ? (
    <div className="ranked-review__actions">
      <Button variant="danger" loading={busy} onClick={() => run({ action: "send_back", note }, `Table ${num(t.number)} sent back.`)}>Send it back</Button>
      <Button variant="ghost" onClick={() => setSending(false)}>Keep it</Button>
    </div>
  ) : (
    <div className="ranked-review__actions">
      {useRead && <Button loading={busy} onClick={() => run({ action: "verify", useRead: true }, `Table ${num(t.number)} verified with the screenshot's numbers.`)}>Use the screenshot&apos;s numbers and verify</Button>}
      <Button variant={useRead ? "secondary" : "primary"} loading={busy && !useRead} onClick={() => run({ action: "verify" }, `Table ${num(t.number)} verified.`)}>{useRead ? "Verify as typed" : "Verify"}</Button>
      <Button variant="ghost" onClick={() => setSending(true)}>Send back</Button>
    </div>
  );

  return (
    <Modal isOpen onClose={() => onClose(false)} size="large" title={t ? title(t, knockout) : "Table"} footer={footer}>
      {!got ? (
        <p className="ladder-note" role="status">{failed ? "This table couldn't load." : "Loading…"}</p>
      ) : (
        <div className="ranked-review">
          <p className="ladder-muted">
            Submitted by {t!.submittedByName ?? "a reporter"} · {relative(t!.createdAt)}
            {!pending && ` · ${t!.status === "verified" ? (t!.autoVerified ? "verified on its own" : `verified by ${t!.verifiedByName ?? "an updater"}`) : t!.status === "denied" ? "sent back" : "undone"}`}
          </p>
          {t!.autoAt && pending && <p className="ranked-review__auto">The text and the screenshot agree. It verifies on its own {relative(t!.autoAt)} unless you act first.</p>}
          <div className="ranked-review__two">
            <figure className="ranked-review__shot">
              {t!.shotUrl ? (
                <a href={t!.shotUrl} target="_blank" rel="noreferrer"><img src={t!.shotUrl} alt={`The results screenshot for table ${num(t!.number)}`} /></a>
              ) : (
                <div className="ranked-review__noshot">No screenshot</div>
              )}
              {t!.shotUrl && <figcaption className="ladder-muted">Opens full size in a new tab.</figcaption>}
            </figure>
            <div className="ranked-review__table">
              <TableScroll label={`Table ${num(t!.number)}, as typed and as read`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Player</TableHead>
                      <TableHead>{knockout ? "Place typed" : "Typed"}</TableHead>
                      <TableHead>{knockout ? "Place read" : "Screenshot"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {review!.rows.map((r, i) => (
                      <TableRow key={`${r.name}-${i}`}>
                        <TableCell>
                          {r.name}
                          {r.team && <span className="ladder-muted"> · {r.team}</span>}
                          {r.readName && <span className="ranked-review__spelled"> (screenshot: {r.readName})</span>}
                        </TableCell>
                        <TableCell className={r.differs ? "ranked-review__diff ladder-num" : "ladder-num"}>{r.typed ?? "?"}</TableCell>
                        <TableCell className={r.differs ? "ranked-review__diff ladder-num" : "ladder-num"}>{review!.hasRead ? (r.read ?? "missing") : "not read"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableScroll>
              {review!.extra.length > 0 && <p className="ranked-review__why">The screenshot also has {review!.extra.join(", ")}.</p>}
              {got.missed.length > 0 && <p className="ranked-review__why">Missed races: {got.missed.map((m) => `${m.name} ${m.races}`).join(", ")}. Their teammates lose less.</p>}
              {others.length > 0 && (
                <ul className="ranked-review__reasons">
                  {others.map((r) => <li key={r}>{r}</li>)}
                </ul>
              )}
              {!review!.hasRead && <p className="ladder-muted">No screenshot was read for this table, so there&apos;s nothing to compare.</p>}
            </div>
          </div>
          {sending && (
            <Textarea floatingLabel="Why it's going back (the reporter sees this)" value={note} maxLength={300} rows={3} onChange={(e) => setNote(e.target.value)} />
          )}
          <ArrowLink href={ladderTablePath(slug, t!.number)}>The table&apos;s page</ArrowLink>
        </div>
      )}
    </Modal>
  );
}
