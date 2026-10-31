"use client";

/**
 * Platform admin ▸ Overview ▸ Growth: signups, who's still around (groups by
 * last visit, each exportable as a list of people who opted in to marketing
 * email), and why people deleted their accounts. Data from
 * /api/admin/lifecycle; the export only ever includes opted-in addresses.
 */

import { useEffect, useState } from "react";
import { Alert, Badge, Button, EmptyState, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconDownload, IconMail, IconUserMinus, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

type ActivitySegment = "active" | "dormant" | "at_risk" | "cold" | "never_seen";

const SEGMENTS: { key: ActivitySegment; label: string; hint: string; tone: "success" | "info" | "warning" | "default" }[] = [
  { key: "active", label: "Active", hint: "In the last 7 days", tone: "success" },
  { key: "dormant", label: "Drifting", hint: "7 to 30 days ago", tone: "info" },
  { key: "at_risk", label: "At risk", hint: "30 to 90 days ago", tone: "warning" },
  { key: "cold", label: "Gone quiet", hint: "Over 90 days ago", tone: "default" },
  { key: "never_seen", label: "Never came back", hint: "No visit after signing up", tone: "default" },
];

interface Summary {
  totalUsers: number;
  signups7d: number;
  signups30d: number;
  segments: Record<ActivitySegment, number>;
  churn30d: number;
  churnTotal: number;
  churnReasons: { reason: string; label: string; count: number }[];
  marketingOptIns: number;
  generatedAt: string;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const share = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "-");
const ICON = 20;

export function PlatformGrowthTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/lifecycle", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => { if (alive) setSummary(body.summary as Summary); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="account-card admin-screen">
      <AdminHeader title="Growth" intro="Signups, who's still around, and why people leave. Each group can be downloaded as a mailing list of the people in it who opted in to marketing email." />

      {error ? (
        <Alert variant="error">Couldn&apos;t load the growth numbers. Reload the page to try again.</Alert>
      ) : !summary ? (
        <LoadingLines label="Loading" />
      ) : (
        <>
          <AdminStats label="Growth">
            <StatCard label="Accounts" value={fmt(summary.totalUsers)} icon={<IconUsers size={ICON} />} variant="accent" />
            <StatCard label="Signups this week" value={fmt(summary.signups7d)} source={`${fmt(summary.signups30d)} in 30 days`} icon={<IconUserPlus size={ICON} />} />
            <StatCard label="Opted in to marketing" value={fmt(summary.marketingOptIns)} source={`${share(summary.marketingOptIns, summary.totalUsers)} of accounts`} icon={<IconMail size={ICON} />} />
            <StatCard label="Deleted, last 30 days" value={fmt(summary.churn30d)} source={`${fmt(summary.churnTotal)} all time`} icon={<IconUserMinus size={ICON} />} />
          </AdminStats>

          <AdminSection title="Who's still around" intro="Every account in one group, by when it last visited.">
            <AdminTable label="Accounts by last visit">
              <Table variant="striped">
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <TableHead>Last visit</TableHead>
                    <TableHead align="right">Accounts</TableHead>
                    <TableHead align="right">Share</TableHead>
                    <TableHead align="right">Mailing list</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SEGMENTS.map((s) => {
                    const count = summary.segments[s.key] ?? 0;
                    return (
                      <TableRow key={s.key}>
                        <TableCell><Badge variant={s.tone} size="small">{s.label}</Badge></TableCell>
                        <TableCell>{s.hint}</TableCell>
                        <TableCell align="right" className="admin-num">{fmt(count)}</TableCell>
                        <TableCell align="right" className="admin-num">{share(count, summary.totalUsers)}</TableCell>
                        <TableCell align="right">
                          <Button
                            variant="secondary"
                            size="small"
                            iconBefore={IconDownload}
                            disabled={count === 0}
                            aria-label={`Download the ${s.label} mailing list`}
                            onClick={() => { window.location.href = `/api/admin/lifecycle/export?segment=${s.key}`; }}
                          >
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>
          </AdminSection>

          <AdminSection title="Why people leave" intro="The reason picked when someone deletes their account.">
            {summary.churnReasons.length === 0 ? (
              <EmptyState variant="bordered" icon={<IconUserMinus size={28} />} title="No one has deleted an account yet" description="Reasons show here once someone does." />
            ) : (
              <AdminTable label="Reasons for deleting an account">
                <Table variant="striped">
                  <TableHeader><TableRow><TableHead>Reason</TableHead><TableHead align="right">Accounts</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {summary.churnReasons.map((r) => (
                      <TableRow key={r.reason}>
                        <TableCell>{r.label}</TableCell>
                        <TableCell align="right" className="admin-num">{fmt(r.count)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AdminTable>
            )}
          </AdminSection>
        </>
      )}
    </div>
  );
}
