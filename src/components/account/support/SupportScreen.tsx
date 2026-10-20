"use client";

/**
 * Account ▸ Support GameShuffle (Britton's picks, 2026-10-19, VDh1QfETVjNTjjzeiKqLNg): give once
 * or monthly from the account, and for supporters, since when, how long the badge lasts, their
 * level and Founding number, monthly support (a new level from the form replaces the old one;
 * stopped or the card changed in the Stripe portal), every gift (one-time ones too), their place
 * on the wall (autosaved), and a card to share. Data from /api/account/support.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, EmptyState, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { IconHeart } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminField, AdminScreen, AdminSection, AdminTable, SaveStatus } from "@/components/account/admin/AdminKit";
import { SupportForm } from "@/components/support/SupportForm";
import { SupporterShare } from "@/components/support/SupporterShare";
import { WALL_NAME_MAX, WALL_NOTE_MAX, dollars, levelGrantsPro, supportLevel } from "@/lib/support/rules";
import type { SupporterInfo } from "@/lib/support/store";
import "@/styles/support.css";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" });
const BACK = "/account?tab=support";

export function SupportScreen() {
  const [data, setData] = useState<{ available: boolean; ready: boolean; info: SupporterInfo | null } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetch("/api/account/support", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive) return;
      if (d) setData(d); else setFailed(true);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const intro = "Support GameShuffle once or every month. Every bit keeps the servers on, the free games free and new ones coming.";
  if (failed) return <AdminScreen title="Support GameShuffle" intro={intro}><EmptyState title="Couldn't load your support" description="Reload the page to try again." /></AdminScreen>;
  if (!data) return <AdminScreen title="Support GameShuffle" intro={intro}><LoadingLines label="Loading your support" /></AdminScreen>;
  const info = data.info;
  const gave = !!info && (info.supporter || info.gifts.length > 0);

  return (
    <AdminScreen title="Support GameShuffle" intro={intro}>
      {info?.supporter && <YourSupport info={info} />}
      {gave && info && <Gifts info={info} />}
      {gave && info && <Wall info={info} />}
      <AdminSection
        title={info?.monthly ? "Change your level or give once" : info?.supporter ? "Give again" : "Support GameShuffle"}
        intro={info?.supporter ? undefined : "Monthly as a Supporter, a Backer (GS Pro included) or a Champion, or once for any amount. You get the Supporter badge on your profile for a year (or while you give monthly), and a spot on the supporters wall if you like."}
      >
        <div className="support-account__give" id="give"><SupportForm back={BACK} thanks={false} wall={gave && info ? info.wall : undefined} startLevel={info?.monthly?.level ?? null} /></div>
      </AdminSection>
    </AdminScreen>
  );
}

function YourSupport({ info }: { info: SupporterInfo }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const manage = async () => {
    setBusy(true);
    const res = await fetch("/api/stripe/portal", { method: "POST" }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : null;
    if (res?.ok && body?.url) { window.location.assign(body.url); return; }
    setBusy(false);
    toast.error("Couldn't open billing. Try again in a moment.");
  };
  const m = info.monthly;
  return (
    <AdminSection title="Your support">
      <div className="support-account__you">
        <span className="support-tile" aria-hidden="true"><IconHeart size={22} stroke={2} /></span>
        <div className="support-account__you-text">
          <p className="support-account__you-title">{info.level === "champion" ? "You're a Champion" : info.level === "backer" ? "You're a Backer" : "You're a supporter"}</p>
          <p className="support-account__you-line">
            {info.since ? `Supporter since ${monthYear(info.since)}` : "Thank you"}
            {info.badgeUntil ? ` · your badge shows until ${day(info.badgeUntil)}` : m ? " · your badge shows while you give monthly" : ""}
            {info.founding ? ` · Founding supporter #${info.founding}` : ""}
          </p>
          {levelGrantsPro(info.level) && <p className="support-account__you-line">GS Pro is included with your level: the Twitch and Discord tools, themes and the AI features.</p>}
        </div>
      </div>
      {m && (
        <div className="support-account__row">
          <p>
            {supportLevel(m.level)?.name ?? "Monthly"} · {dollars(m.amountCents)} a month{" "}
            {m.renewsAt ? (m.cancelAtPeriodEnd ? `· stops after ${day(m.renewsAt)}` : `· next payment ${day(m.renewsAt)}`) : ""}
            {m.status === "past_due" ? " · the last payment didn't go through: update your card to keep it going" : ""}
          </p>
          <Button variant="secondary" size="small" onClick={() => void manage()} disabled={busy}>{busy ? "Opening…" : "Stop or update your card"}</Button>
        </div>
      )}
      <div className="support-account__row">
        <p>Share a card that says you back GameShuffle. It brings friends here to play.</p>
        <SupporterShare label="Share your card" variant="secondary" />
      </div>
    </AdminSection>
  );
}

function Gifts({ info }: { info: SupporterInfo }) {
  if (!info.gifts.length) return null;
  return (
    <AdminSection title="Your gifts">
      <AdminTable label="Your gifts">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>Kind</TableHead><TableHead>Amount</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {info.gifts.slice(0, 25).map((g, i) => (
              <TableRow key={`${g.paidAt}-${i}`}>
                <TableCell>{day(g.paidAt)}</TableCell>
                <TableCell>{g.kind === "monthly" ? "Monthly" : "Once"}</TableCell>
                <TableCell>{dollars(g.cents)}{g.refunded ? " (refunded)" : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
    </AdminSection>
  );
}

function Wall({ info }: { info: SupporterInfo }) {
  const toast = useToast();
  const [wall, setWall] = useState({ name: info.wall.name ?? "", note: info.wall.note ?? "", show: info.wall.show });
  const [problem, setProblem] = useState<string | null>(null);
  const { status } = useAutosave(wall, async (w) => {
    if (w.show && !w.name.trim()) { setProblem("Add a name to go on the wall."); return false; }
    const res = await fetch("/api/account/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(w) }).catch(() => null);
    if (res?.ok) { setProblem(null); return true; }
    const body = res ? ((await res.json().catch(() => ({}))) as { message?: string }) : null;
    setProblem(body?.message ?? "Couldn't save. Try again.");
    toast.error(body?.message ?? "Couldn't save. Try again.");
    return false;
  });
  return (
    <AdminSection title="The supporters wall" intro="Your name and a short note on the supporters wall at /support, if you'd like." actions={<SaveStatus status={status} />}>
      <div className="support-account__wall">
        <AdminField label="Name on the wall">
          {(id, describedBy) => <Input id={id} aria-describedby={describedBy} value={wall.name} onChange={(e) => setWall((w) => ({ ...w, name: e.target.value }))} maxLength={WALL_NAME_MAX} fullWidth />}
        </AdminField>
        <AdminField label="A short note (optional)">
          {(id, describedBy) => <Textarea id={id} aria-describedby={describedBy} value={wall.note} onChange={(e) => setWall((w) => ({ ...w, note: e.target.value }))} maxLength={WALL_NOTE_MAX} rows={2} />}
        </AdminField>
        <Checkbox checked={wall.show} onChange={(e) => setWall((w) => ({ ...w, show: e.target.checked }))} label="Show my name and note on the supporters wall" />
        {problem && <Alert variant="warning">{problem}</Alert>}
      </div>
    </AdminSection>
  );
}
