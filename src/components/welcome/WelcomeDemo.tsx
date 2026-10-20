"use client";

/**
 * A homepage hero demo inside a welcome page section (Britton's picks, 2026-10-19): drawn finished
 * until the section scrolls into view, then played once, with Play again. Reduced motion keeps the
 * finished state and no replay. The demos are pictures of the real tools, so they're hidden from
 * screen readers; the section's words say what they show.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@empac/cascadeds";
import { IconRotate } from "@tabler/icons-react";
import { BracketDemo, DailyDemo, KartDemo, PartyDemo, PollDemo, SmashDemo, WheelDemo } from "@/components/home/HeroShowcase";

const DEMOS = { kart: KartDemo, smash: SmashDemo, party: PartyDemo, daily: DailyDemo, wheel: WheelDemo, bracket: BracketDemo, poll: PollDemo };
export type WelcomeDemoId = keyof typeof DEMOS;

const query = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => { const m = window.matchMedia(query); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };

export function WelcomeDemo({ id, label }: { id: WelcomeDemoId; label: string }) {
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => true);
  const ref = useRef<HTMLDivElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setRound((r) => (r === 0 ? 1 : r)); io.disconnect(); }
    }, { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);
  const Demo = DEMOS[id];
  const playing = !reduced && round > 0;
  return (
    <div className="welcome-demo" ref={ref}>
      <div className="hero-show__demo welcome-demo__stage" aria-hidden="true">
        <Demo key={playing ? `play-${round}` : "rest"} play={playing} />
      </div>
      {!reduced && (
        <Button variant="ghost" size="small" iconBefore={IconRotate} onClick={() => setRound((r) => r + 1)} aria-label={`Play the ${label} example again`} className="welcome-demo__again">
          Play again
        </Button>
      )}
    </div>
  );
}
