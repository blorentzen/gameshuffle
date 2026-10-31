/**
 * GameShuffle's Facebook Instant Game: three tabs, the Daily Shuffle (opens
 * first), the Daily Dex and Chat Brain Daily (Britton's picks, 2026-10-18,
 * https://claude.ai/artifact/P1nLRnQraMgvSavH3c4Jgk and
 * https://claude.ai/artifact/VuVfmLAmw6DXapsC3s3eRZ). A friend who opens a
 * shared card lands on that card's game. Built into a zip by
 * scripts/build-instant-game.ts and uploaded to Meta.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Tabs } from "@empac/cascadeds";
import "@empac/cascadeds/styles.css";
import "./game.css";
import { SHUFFLE, dayKey } from "@/lib/originals/daily";
import { DEX } from "@/lib/originals/dailyDex";
import { gameHost, liveStreak, type GameTab, type SaveData } from "./host";
import { DailyGame } from "./daily";
import { BrainGame } from "./brain";

const host = gameHost();
const TAB_NAMES: Record<GameTab, string> = { daily: "the Daily Shuffle", dex: "the Daily Dex", brain: "Chat Brain" };

function App({ first }: { first: GameTab }) {
  const [save, setSaveState] = useState<SaveData | null>(null);
  const [tab, setTab] = useState<GameTab>(first);
  const loaded = useRef(false);

  useEffect(() => { void host.load().then(setSaveState); }, []);
  // Every change after the first load goes to Facebook's player storage.
  useEffect(() => {
    if (!save) return;
    if (!loaded.current) { loaded.current = true; return; }
    void host.save(save);
  }, [save]);

  const setSave = useCallback((fn: (s: SaveData) => SaveData) => setSaveState((prev) => (prev ? fn(prev) : prev)), []);
  const share = useCallback((image: string, text: string) => host.share(image, text, tab), [tab]);

  if (!save) {
    return <main className="ig"><Header streak={0} game={tab} /><section className="ig-card ig-center"><p>Loading today&apos;s games…</p></section></main>;
  }

  const today = dayKey();
  const streak = tab === "brain" ? liveStreak(save.streak, today) : liveStreak(save.streaks?.[tab === "dex" ? "dex" : "shuffle"], today);

  return (
    <main className="ig">
      <Header streak={streak} game={tab} />
      <Tabs
        className="ig-tabs"
        variant="underline"
        fullWidth
        activeTab={tab}
        onChange={(id) => setTab(id as GameTab)}
        tabs={[
          { id: "daily", label: "Daily", content: <DailyGame schedule={SHUFFLE} save={save} setSave={setSave} onShare={share} /> },
          { id: "dex", label: "Dex", content: <DailyGame schedule={DEX} save={save} setSave={setSave} onShare={share} /> },
          { id: "brain", label: "Chat Brain", content: <BrainGame save={save} setSave={setSave} onShare={share} /> },
        ]}
      />
    </main>
  );
}

function Header({ streak, game }: { streak: number; game: GameTab }) {
  return (
    <header className="ig-head">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="logo-color.svg" alt="GameShuffle" className="ig-logo" width={164} height={22} />
      {streak > 0 && <span className="ig-streak" aria-label={`${streak} day streak in ${TAB_NAMES[game]}`}>🔥 {streak}</span>}
    </header>
  );
}

host.start().catch(() => { /* outside Facebook, or Facebook already started us */ }).finally(() => {
  const el = document.getElementById("root");
  if (el) createRoot(el).render(<App first={host.entry() ?? "daily"} />);
});
