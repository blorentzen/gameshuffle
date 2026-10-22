/**
 * The streamer's setup page (Twitch's Extensions manager ▸ GameShuffle ▸
 * Configure). Nothing to set here: it says whether this channel is connected
 * to GameShuffle and where the games are run from.
 */
import { createRoot } from "react-dom/client";
import { IconCircleCheck, IconPlugConnected } from "@tabler/icons-react";
import "@empac/cascadeds/styles.css";
import "@/app/globals.css";
import "./ext.css";
import { ExtHeader, useExt } from "./shared";

function Config() {
  const st = useExt();
  const s = st.state;
  if (!s) return <main className="ext ext--config"><ExtHeader channel={null} /><p className="ext-s">{st.failures >= 3 ? "GameShuffle isn't answering right now. Try again in a minute." : "Loading…"}</p></main>;
  return (
    <main className="ext ext--config">
      <ExtHeader channel={s.channel.name} />
      {s.channel.connected ? (
        <section className="ext-block">
          <h2 className="ext-title"><IconCircleCheck size={20} aria-hidden /> Your channel is connected</h2>
          <p className="ext-s">Add GameShuffle as a video component (the play-along card) and, if you like, a panel under your stream. Then run games the way you already do: from your stream page on GameShuffle or with chat commands like !poll, !bingo start and !gs brb. Whatever is running shows on the card.</p>
          <p className="ext-s">Viewers play anonymously until their first tap, when Twitch asks them to share their username. After that they&apos;re the same player as in your chat: the same tokens and scores.</p>
          {!s.channel.pro && <p className="ext-s">Polls, Stream Bingo, trivia nights, break mode and Chat Brain need GS Pro on GameShuffle. The leaderboard and the panel work on any plan.</p>}
        </section>
      ) : (
        <section className="ext-block">
          <h2 className="ext-title"><IconPlugConnected size={20} aria-hidden /> Connect this channel to GameShuffle</h2>
          <p className="ext-s">Sign in at gameshuffle.co, open Account, Streaming, and connect Twitch with this channel. Come back here afterwards; this page will say it&apos;s connected.</p>
        </section>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Config />);
