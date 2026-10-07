import type { Metadata } from "next";
import { ProToolCta } from "@/components/tools/ProToolCta";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { StreamTimerTool } from "@/components/tools/StreamTimerTool";
import { IconHourglass } from "@tabler/icons-react";

export const metadata: Metadata = {
  title: "Stream Timer: free countdown timer + OBS overlay",
  description:
    "A free stream countdown timer for 'starting soon', BRB, and break screens, with a transparent OBS browser-source overlay. No account required.",
  alternates: { canonical: "https://www.gameshuffle.co/stream-timer" },
  openGraph: { title: "Free Stream Timer", url: "https://www.gameshuffle.co/stream-timer" },
};

export default function StreamTimerPage() {
  return (
    <main>
      <FreeToolShell icon={IconHourglass} name="Stream Timer" lede={<>A countdown for &ldquo;starting soon&rdquo;, breaks, and BRB screens. Use it on screen, or drop the transparent overlay into OBS.</>}>
        <StreamTimerTool />
      </FreeToolShell>
      <ProToolCta />
    </main>
  );
}
