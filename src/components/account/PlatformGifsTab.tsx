"use client";

/**
 * Platform ▸ People ▸ GIFs: GIFs the automatic check held (only their uploader sees them) and GIFs people reported.
 * Allow puts one back; Remove takes it down for good (files deleted, fingerprint kept so the same GIF can't return).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState } from "@empac/cascadeds";
import { IconShieldCheck } from "@tabler/icons-react";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToast } from "@/components/toast/ToastProvider";
import { GifImage } from "@/components/gifs/GifImage";
import { REPORT_REASONS } from "@/lib/moderation/reasons";
import type { GifView } from "@/lib/gifs/rules";

interface StaffGif extends GifView {
  owner: { id: string; name: string; username: string | null };
  status: "ok" | "held";
  shared: boolean;
  reason: string | null;
  tags: string[];
  reports: { id: string; reason: string; details: string | null; createdAt: string }[];
  createdAt: string;
}

const reasonLabel = (id: string) => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function PlatformGifsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [gifs, setGifs] = useState<StaffGif[] | null | "soon" | "error">(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/gifs", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 503) return setGifs("soon");
        if (!r.ok) return setGifs("error");
        setGifs(((await r.json()) as { gifs: StaffGif[] }).gifs);
      })
      .catch(() => { if (alive) setGifs("error"); });
    return () => { alive = false; };
  }, [version]);

  const act = async (g: StaffGif, action: "allow" | "remove") => {
    if (action === "remove" && !(await confirm({ title: "Remove this GIF?", body: "It comes off every page, its files are deleted, and the same GIF can't be uploaded again.", confirmLabel: "Remove GIF" }))) return;
    setBusy(g.id);
    const reason = action === "remove" ? (g.reports[0] ? reasonLabel(g.reports[0].reason) : g.reason ?? "Removed by staff") : undefined;
    const res = await fetch("/api/admin/gifs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: g.id, action, reason }),
    }).catch(() => null);
    setBusy(null);
    if (res?.ok) { toast.success(action === "allow" ? "GIF allowed" : "GIF removed"); reload(); }
    else toast.error("That didn't work. Try again.");
  };

  return (
    <AdminScreen title="GIFs" intro="GIFs the automatic check wasn't sure about (only their uploader sees them until you decide) and GIFs people reported.">
      {gifs === null ? <LoadingLines label="Loading GIFs to check" /> : null}
      {gifs === "soon" ? <p className="gif-picker__note">The GIF tables aren&rsquo;t in this database yet.</p> : null}
      {gifs === "error" ? <p className="gif-picker__note" role="alert">Couldn&rsquo;t load the GIFs. Try again in a moment.</p> : null}
      {Array.isArray(gifs) && gifs.length === 0 ? (
        <EmptyState variant="subtle" icon={<IconShieldCheck size={40} stroke={1.4} />} title="Nothing to check" description="Held and reported GIFs show up here." />
      ) : null}
      {Array.isArray(gifs) && gifs.length ? (
        <ul className="gif-staff">
          {gifs.map((g) => (
            <li key={g.id} className="gif-staff__row">
              <GifImage gif={g} maxWidth={140} />
              <div className="gif-staff__info">
                <p className="gif-staff__why">
                  {g.status === "held" ? `Held by the check${g.reason ? `: ${g.reason}` : ""}` : `Reported ${g.reports.length === 1 ? "once" : `${g.reports.length} times`}`}
                </p>
                {g.reports.length ? (
                  <ul className="gif-staff__reports">
                    {g.reports.map((r) => <li key={r.id}>{reasonLabel(r.reason)}{r.details ? `: ${r.details}` : ""} · {when(r.createdAt)}</li>)}
                  </ul>
                ) : null}
                <p className="gif-staff__line">
                  Uploaded by {g.owner.username ? <Link href={`/u/${g.owner.username}`}>{g.owner.name}</Link> : g.owner.name} · {when(g.createdAt)} · {g.shared ? "shared" : "private"}
                  {g.alt ? ` · "${g.alt}"` : ""}
                </p>
              </div>
              <div className="gif-staff__actions">
                <Button variant="secondary" size="small" loading={busy === g.id} onClick={() => void act(g, "allow")}>Allow</Button>
                <Button variant="danger" size="small" disabled={busy === g.id} onClick={() => void act(g, "remove")}>Remove</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </AdminScreen>
  );
}
