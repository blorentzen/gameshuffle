"use client";

/**
 * Platform admin ▸ Originals ▸ Break mode (staff): how break mode is used
 * this week, and the questions mods and streamers pulled from a break with
 * !gs pull. A pulled question stays out of every channel until staff decide:
 * Keep it (it can play again) or Retire it (it never comes back). Break
 * questions are built from the Daily's checked facts, so a pull usually
 * means a fact or its wording needs a look.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, StatCard } from "@empac/cascadeds";
import { IconCoffee, IconFlag, IconUsers } from "@tabler/icons-react";
import { AdminHeader, AdminPanel, AdminSection, AdminStats } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { BreakAdminSummary, PulledQuestion } from "@/lib/break/store";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function PlatformBreakTab() {
  const toast = useToast();
  const [data, setData] = useState<BreakAdminSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const j = await fetch("/api/admin/break", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setData(j as BreakAdminSummary);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const review = async (q: PulledQuestion, keep: boolean) => {
    setBusy(q.itemKey);
    const j = await fetch("/api/admin/break", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game: q.game, key: q.itemKey, keep }) })
      .then((r) => r.json()).catch(() => null);
    setBusy(null);
    if (!j?.ok) { toast.error("That didn't save."); return; }
    toast.success(keep ? "Kept. It can play again." : "Retired. It won't come back.");
    void load();
  };

  const header = <AdminHeader title="Break mode" intro="Games that run while a streamer is away. Questions mods pull from a break wait here for a decision." />;
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading" /></div>;
  if (!data.ready) return <div className="account-card admin-screen">{header}<Alert variant="warning" title="Not set up yet">Break mode&apos;s tables aren&apos;t on this database yet.</Alert></div>;

  return (
    <div className="account-card admin-screen">
      {header}
      <AdminStats label="Break mode this week" columns={3}>
        <StatCard label="Breaks" value={String(data.breaksThisWeek)} source={data.runningNow ? `${data.runningNow} running now` : "None running now"} icon={<IconCoffee size={20} />} variant="accent" />
        <StatCard label="Players" value={String(data.playersThisWeek)} source="Who scored, counted per break" icon={<IconUsers size={20} />} />
        <StatCard label="Pulled questions" value={String(data.waiting.length)} source="Waiting for a decision" icon={<IconFlag size={20} />} />
      </AdminStats>

      <AdminSection title="Pulled questions" intro="Out of every channel until you decide. Keep it if it's fine; retire it if the fact or wording is wrong.">
        {data.waiting.length === 0 ? (
          <EmptyState title="Nothing to review" description="When a mod types !gs pull during a break, the question shows up here." />
        ) : (
          <ul className="break-admin__list">
            {data.waiting.map((q) => (
              <li key={`${q.game}:${q.itemKey}`}>
                <AdminPanel>
                  <p className="break-admin__prompt">{q.prompt ?? q.itemKey}</p>
                  <p className="break-admin__meta">{q.gameName} · pulled {when(q.pulledAt)}{q.channel ? ` on ${q.channel}` : ""}</p>
                  <div className="break-admin__actions">
                    <Button size="small" variant="secondary" loading={busy === q.itemKey} disabled={!!busy} onClick={() => void review(q, true)}>Keep it</Button>
                    <Button size="small" variant="ghost" disabled={!!busy} onClick={() => void review(q, false)}>Retire it</Button>
                  </div>
                </AdminPanel>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {data.reviewed.length > 0 && (
        <AdminSection title="Decided" intro="The last 25 you've looked at. Change your mind any time.">
          <ul className="break-admin__list is-compact">
            {data.reviewed.map((q) => (
              <li key={`${q.game}:${q.itemKey}`} className="break-admin__row">
                <span className="break-admin__prompt">{q.prompt ?? q.itemKey}</span>
                <span className="break-admin__meta">{q.gameName} · {q.keep ? "Kept" : "Retired"}</span>
                <Button size="small" variant="ghost" disabled={!!busy} onClick={() => void review(q, !q.keep)}>{q.keep ? "Retire it" : "Keep it"}</Button>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}
    </div>
  );
}
