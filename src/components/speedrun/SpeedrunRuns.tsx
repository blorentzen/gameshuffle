"use client";

/**
 * My runs on the setup page (speedrun templates picks 2026-11-10, 6A): every run the runner keeps, the one on stream
 * first, with its PB and attempts; Use this run, Remove, and Add a run. Hidden until the database has the runs
 * (speedrun-m2). With GameShuffle for LiveSplit, opening another splits file switches the run on its own.
 */

import { useEffect, useState } from "react";
import { Badge, Button } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { boxArt } from "@/data/game-catalog";
import { gameEntry } from "@/lib/games/key";
import { fmtClock } from "@/lib/speedrun/time";
import type { SpeedrunRunView } from "@/lib/speedrun/runs";
import type { SpeedrunSetupView } from "@/lib/speedrun/types";

const ERRORS: Record<string, string> = {
  running: "Finish or reset the run that's going first.",
  too_many: "You can keep 20 runs. Remove one first.",
  not_ready: "My runs needs a quick update on our side first.",
};

export function SpeedrunRuns({ onSwitched, refreshKey }: { onSwitched: (v: SpeedrunSetupView) => void; refreshKey: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{ ready: boolean; runs: SpeedrunRunView[]; max: number } | null>(null);
  const [busy, setBusy] = useState(false);

  // Read again when the run on stream changes elsewhere on the page (game, category, splits or attempts).
  useEffect(() => {
    let alive = true;
    fetch("/api/speedrun/runs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [refreshKey]);

  async function act(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const res = await fetch("/api/speedrun/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    const d = (await res?.json().catch(() => null)) as { error?: string; setup?: SpeedrunSetupView; ready: boolean; runs: SpeedrunRunView[]; max: number } | null;
    if (!res?.ok || !d) { toast.error(ERRORS[d?.error ?? ""] ?? "Couldn't do that. Try again."); return; }
    setData({ ready: d.ready, runs: d.runs, max: d.max });
    if (d.setup) onSwitched(d.setup);
    toast.success(ok);
  }

  if (!data?.ready) return null;
  const name = (r: SpeedrunRunView) => r.game || "A new run";
  return (
    <section className="sr-sec" aria-labelledby="sr-runs-h">
      <div className="sr-sec__h"><h2 id="sr-runs-h">My runs</h2></div>
      <p className="sr-sub">Each run keeps its own splits, PB and attempts. The one on stream is what the overlay, chat and the phone remote use.</p>
      <ul className="sr-runs">
        {data.runs.map((r, i) => {
          const art = boxArt(gameEntry(r.game));
          const line = [r.category, r.pbMs != null ? `PB ${fmtClock(r.pbMs)}` : null, `${r.attempts.toLocaleString("en-US")} attempt${r.attempts === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
          return (
            <li key={r.id ?? `on-${i}`} className={`sr-run${r.active ? " is-on" : ""}`}>
              {art ? <span className="sr-run__art" style={{ backgroundImage: `url(${art})` }} aria-hidden="true" /> : <span className="sr-run__art sr-run__art--none" aria-hidden="true" />}
              <div className="sr-run__txt">
                <b>{name(r)}{r.active && <Badge variant="success" size="small">On stream</Badge>}</b>
                <span>{line}</span>
              </div>
              {!r.active && r.id && (
                <div className="sr-run__acts">
                  <Button variant="secondary" size="small" disabled={busy} onClick={() => void act({ action: "use", id: r.id }, `${name(r)} is on stream.`)}>Use this run</Button>
                  <Button variant="ghost" size="small" iconBefore={IconTrash} disabled={busy} aria-label={`Remove ${name(r)}${r.category ? `, ${r.category}` : ""}`}
                    onClick={async () => {
                      if (await confirm({ title: `Remove ${name(r)}${r.category ? ` (${r.category})` : ""}?`, body: "Its splits, PB and attempt count go. Attempts it already ran stay in your history.", confirmLabel: "Remove run" })) void act({ action: "remove", id: r.id }, "Run removed.");
                    }}>Remove</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="sr-tpl-acts">
        <Button variant="secondary" size="small" iconBefore={IconPlus} disabled={busy || data.runs.length >= data.max} onClick={() => void act({ action: "add" }, "A new run is on stream. Pick its game and splits below.")}>Add a run</Button>
      </div>
      <p className="sr-sub">With GameShuffle for LiveSplit, opening another splits file in LiveSplit switches the run here on its own.</p>
    </section>
  );
}
