"use client";

/**
 * Why people leave, for staff: the notes left when deleting an account (Platform ▸ Overview ▸ Growth,
 * from /api/admin/lifecycle) and why members cancel GS Pro, GS Circuit and monthly support
 * (Platform ▸ Overview ▸ Revenue, from /api/admin/cancellations). Admin kit + CDS only.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, EmptyState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconMessageCircle, IconUserMinus } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminSection, AdminTable } from "@/components/account/admin/AdminKit";
import type { DeletionComment } from "@/lib/platform/lifecycle";
import type { CancellationSummary } from "@/lib/billing/cancellations";
import "@/styles/leave-reasons.css";

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const n = (x: number) => x.toLocaleString("en-US");

/** Growth: the latest notes left when deleting an account. */
export function DeletionComments({ comments }: { comments: DeletionComment[] }) {
  return (
    <AdminSection title="Notes from people who deleted" intro="The latest 20 notes left with a deletion, newest first. Only the team sees these.">
      {comments.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconMessageCircle size={28} />} title="No notes yet" description="When someone leaves a note while deleting their account, it shows here." />
      ) : (
        <AdminTable label="Notes left when deleting an account">
          <Table variant="striped" dense>
            <TableHeader>
              <TableRow>
                <TableHead>When (Pacific)</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comments.map((c, i) => (
                <TableRow key={`${c.at}-${i}`}>
                  <TableCell>{when(c.at)}</TableCell>
                  <TableCell>{c.plan}</TableCell>
                  <TableCell>{c.reason}</TableCell>
                  <TableCell><p className="leave-comment">{c.comment}</p></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </AdminTable>
      )}
    </AdminSection>
  );
}

const STATUS: Record<"ending" | "ended" | "stayed", { label: (at: string | null) => string; tone: "warning" | "default" | "success" }> = {
  ending: { label: (at) => (at ? `Ends ${day(at)}` : "Ending"), tone: "warning" },
  ended: { label: () => "Ended", tone: "default" },
  stayed: { label: () => "Kept their plan", tone: "success" },
};

/** Revenue: why members cancel, ours and Stripe's reasons together, then the latest comments. */
export function CancelReasons() {
  const [data, setData] = useState<CancellationSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/cancellations", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: CancellationSummary & { ok: boolean }) => { if (alive) { if (j.ok) setData(j); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  return (
    <AdminSection
      title="Why people cancel"
      intro="Why members cancel GS Pro, GS Circuit and monthly support: their answer in our Before you go window, else the reason Stripe's cancel page asked. Counts only cancels Stripe confirmed."
    >
      {failed ? (
        <Alert variant="error">Couldn&apos;t load the reasons. Try Refresh in a moment.</Alert>
      ) : !data ? (
        <LoadingLines label="Loading reasons" />
      ) : !data.ready ? (
        <Alert variant="info">Reasons start saving once the database update for them runs.</Alert>
      ) : (
        <>
          {data.tally.length === 0 ? (
            <EmptyState variant="bordered" icon={<IconUserMinus size={28} />} title="No cancellations with a reason yet" description="Each cancel shows here once Stripe confirms it." />
          ) : (
            <AdminTable label="Reasons for cancelling, by plan">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reason</TableHead>
                    <TableHead align="right">GS Pro</TableHead>
                    <TableHead align="right">GS Circuit</TableHead>
                    <TableHead align="right">Support</TableHead>
                    <TableHead align="right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tally.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell>{r.label}</TableCell>
                      <TableCell align="right" className="admin-num">{n(r.pro)}</TableCell>
                      <TableCell align="right" className="admin-num">{n(r.circuit)}</TableCell>
                      <TableCell align="right" className="admin-num">{n(r.support)}</TableCell>
                      <TableCell align="right" className="admin-num"><strong>{n(r.total)}</strong></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          )}
          {data.stayed > 0 && (
            <p className="leave-note">{n(data.stayed)} more started to cancel and kept their plan.</p>
          )}

          <h3 className="leave-subhead">Latest comments</h3>
          {data.latest.length === 0 ? (
            <EmptyState variant="bordered" icon={<IconMessageCircle size={28} />} title="No comments yet" description="Comments from the Before you go window and Stripe's cancel page show here." />
          ) : (
            <AdminTable label="Latest comments left when cancelling">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>When (Pacific)</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Where it stands</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.latest.map((c, i) => (
                    <TableRow key={`${c.at}-${i}`}>
                      <TableCell>{when(c.at)}</TableCell>
                      <TableCell>{c.plan}</TableCell>
                      <TableCell>{c.reason}</TableCell>
                      <TableCell><Badge size="small" variant={STATUS[c.status].tone}>{STATUS[c.status].label(c.cancelAt)}</Badge></TableCell>
                      <TableCell><p className="leave-comment">{c.comment}</p></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          )}
        </>
      )}
    </AdminSection>
  );
}
