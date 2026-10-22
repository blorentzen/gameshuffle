/**
 * The panel under the stream (318px wide, shows offline too): the channel's
 * top players, the next scheduled stream in the viewer's own time, and last
 * stream's recap. Reads /api/twitch-ext/panel (cached 30 seconds on the edge)
 * once a minute.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IconBroadcast, IconCalendarEvent, IconStar } from "@tabler/icons-react";
import "@empac/cascadeds/styles.css";
import "@/app/globals.css";
import "./ext.css";
import { extStore, type ExtPanelState } from "./api";
import { ExtHeader, Leaderboard } from "./shared";

const whenFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Panel() {
  const [p, setP] = useState<ExtPanelState | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const d = await extStore().panel();
      if (!active) return;
      if (d) { setP(d); setFailed(false); } else setFailed(true);
    };
    void load();
    const iv = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  if (!p) {
    return <main className="ext ext--panel"><ExtHeader channel={null} /><p className="ext-s ext-center">{failed ? "GameShuffle didn't answer. Try again in a moment." : "Loading…"}</p></main>;
  }
  const name = p.channel.name;
  if (!p.channel.connected) {
    return (
      <main className="ext ext--panel">
        <ExtHeader channel={name} />
        <p className="ext-s">{name} hasn&apos;t set up GameShuffle yet.</p>
      </main>
    );
  }
  return (
    <main className="ext ext--panel">
      <ExtHeader channel={name} />
      {p.channel.live && (
        <p className="ext-live"><IconBroadcast size={16} aria-hidden /> Live now. Open GameShuffle from the player&apos;s side bar to play along.</p>
      )}
      {p.leaderboard.length > 0
        ? <Leaderboard rows={p.leaderboard} title={`Top players on ${name}`} />
        : <p className="ext-s">No scores yet. Play along on the next stream to top the board.</p>}
      {p.next && (
        <section className="ext-block">
          <h2 className="ext-k"><IconCalendarEvent size={14} aria-hidden /> Next stream</h2>
          <p className="ext-s">{whenFmt.format(new Date(p.next.at))}{p.next.title ? ` · ${p.next.title}` : ""}</p>
        </section>
      )}
      {p.recap && p.recap.lines.length > 0 && (
        <section className="ext-block">
          <h2 className="ext-k"><IconStar size={14} aria-hidden /> Last stream</h2>
          <p className="ext-s">{p.recap.lines.join(" · ")}</p>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Panel />);
