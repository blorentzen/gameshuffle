"use client";

/** The war page's small client pieces: a team's logo (its tag on a tile when there's none), Copy link, and the live refresh. */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@empac/cascadeds";
import { IconLink } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { track, EVENTS } from "@/lib/analytics/events";
import { tagColor } from "@/lib/wars/look";
import "@/styles/war-mark.css";

export function WarTeamMark({ tag, logo, size = "md" }: { tag: string; logo: string | null; size?: "md" | "lg" }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    // A picture that failed before the page woke up never fires onError here, so the ref checks it too.
    // eslint-disable-next-line @next/next/no-img-element -- a team logo from MKCentral or our storage, any size
    return <img className={`wp-mark wp-mark--${size}`} src={logo} alt="" onError={() => setFailed(true)} ref={(el) => { if (el?.complete && el.naturalWidth === 0) setFailed(true); }} />;
  }
  return <span className={`wp-mark wp-mark--${size} wp-mark--text`} style={{ background: tagColor(tag) }} aria-hidden="true">{[...tag].slice(0, 4).join("")}</span>;
}

export function WarCopyLink({ url }: { url: string }) {
  const toast = useToast();
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Link copied."); }
    catch { toast.info(url); }
    track(EVENTS.warPageCopied, {});
  };
  return <Button variant="secondary" size="large" iconBefore={IconLink} onClick={copy}>Copy link</Button>;
}

/** While a war is live, the page reads it again every 15 seconds (only while it's on screen). */
export function WarLiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [router]);
  return null;
}
