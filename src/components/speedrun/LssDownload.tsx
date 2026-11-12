"use client";

/** "Download for LiveSplit" for a ready-made split list (the splits pages): a .lss file with the names and groups, no
 *  times, made in the browser (src/lib/speedrun/lss.ts). */

import { Button } from "@empac/cascadeds";
import { IconDownload } from "@tabler/icons-react";
import { EVENTS, track } from "@/lib/analytics/events";
import { lssFileName, writeLss } from "@/lib/speedrun/lss";

export function LssDownload({ game, category, names, from }: { game: string; category: string; names: string[]; from: string }) {
  const save = () => {
    const blob = new Blob([writeLss({ game, category, names })], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lssFileName(game, category);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    track(EVENTS.speedrunSplitsDownloaded, { from });
  };
  return <Button variant="secondary" iconBefore={IconDownload} onClick={save}>Download for LiveSplit</Button>;
}
