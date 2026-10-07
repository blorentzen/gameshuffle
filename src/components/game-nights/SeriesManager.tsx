"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { cadenceLabel } from "@/lib/game-nights/seriesSchedule";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { IconAction } from "@/components/actions/IconAction";
import { IconTrash } from "@tabler/icons-react";

export interface SeriesRow {
  id: string;
  name: string;
  cadence: string;
  active: boolean;
  nextAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "Paused";
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export function SeriesManager({ initial }: { initial: SeriesRow[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [series, setSeries] = useState<SeriesRow[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  if (series.length === 0) return null;

  const call = async (id: string, init: RequestInit) => {
    const res = await fetch(`/api/game-nights/series/${id}`, init).catch(() => null);
    return !!res && res.ok;
  };

  const toggle = async (s: SeriesRow) => {
    setBusy(s.id);
    const ok = await call(s.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) });
    setBusy(null);
    if (ok) {
      setSeries((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active, nextAt: !s.active ? x.nextAt : null } : x)));
      toast.success(s.active ? "Series paused" : "Series resumed");
    } else toast.error("Couldn't update the series.");
  };

  const generate = async (s: SeriesRow) => {
    setBusy(s.id);
    const res = await fetch(`/api/game-nights/series/${s.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate" }),
    }).catch(() => null);
    setBusy(null);
    const data = res && res.ok ? await res.json().catch(() => null) : null;
    if (data?.created) toast.success("Next night added to your schedule.", { title: "Generated" });
    else if (res && res.ok) toast.success("The next night is already scheduled.");
    else toast.error("Couldn't generate the next night.");
  };

  const remove = async (s: SeriesRow) => {
    if (!(await confirm({ title: `Stop the "${s.name}" series?`, body: "Nights already created stay, and no new ones are added.", confirmLabel: "Stop series" }))) return;
    setBusy(s.id);
    const ok = await call(s.id, { method: "DELETE" });
    setBusy(null);
    if (ok) {
      setSeries((prev) => prev.filter((x) => x.id !== s.id));
      toast.success("Series removed");
    } else toast.error("Couldn't remove the series.");
  };

  return (
    <div style={{ marginBottom: "var(--spacing-40)" }}>
      <h2 className="bgn-side__heading" style={{ marginTop: 0 }}>Your recurring series</h2>
      <div className="bgn-series__list">
        {series.map((s) => (
          <div key={s.id} className={`bgn-series__row${s.active ? "" : " bgn-series__row--paused"}`}>
            <div className="bgn-series__info">
              <span className="bgn-series__name">{s.name}</span>
              <span className="bgn-series__meta">
                {cadenceLabel(s.cadence)} · {s.active ? `next ${fmtDate(s.nextAt)}` : "paused"}
              </span>
            </div>
            <div className="bgn-series__actions">
              {s.active && (
                <Button variant="ghost" size="small" disabled={busy === s.id} onClick={() => generate(s)}>Generate next</Button>
              )}
              <Button variant="ghost" size="small" disabled={busy === s.id} onClick={() => toggle(s)}>
                {s.active ? "Pause" : "Resume"}
              </Button>
              <IconAction label={`Stop the "${s.name}" series`} icon={IconTrash} variant="danger" disabled={busy === s.id} onClick={() => remove(s)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
