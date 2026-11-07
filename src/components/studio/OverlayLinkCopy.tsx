"use client";

/**
 * Your overlay link with Copy, for the Studio's tool pages and the OBS setup step. One link carries every tool; the
 * full link (and making a new one) stays on Tools ▸ Overlay layout.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { IconCopy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";

export function OverlayLinkCopy({ primary = false }: { primary?: boolean }) {
  const toast = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    let alive = true;
    fetch("/api/account/overlay-layout", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (alive) { setToken((b?.overlayToken as string | null) ?? null); setOrigin(window.location.origin); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!token) return null;
  const url = `${origin}/overlay/${token}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success("Overlay link copied. Paste it into a Browser source."); }
    catch { toast.error("Couldn't copy. Open Tools ▸ Overlay layout for the link."); }
  }
  return (
    <div className="studio-obs">
      <code className="studio-obs__url" aria-label="Your overlay link (hidden)">{origin.replace(/^https?:\/\//, "")}/overlay/••••••</code>
      <Button variant={primary ? "primary" : "secondary"} size="small" iconBefore={IconCopy} onClick={() => void copy()}>Copy for OBS</Button>
    </div>
  );
}
