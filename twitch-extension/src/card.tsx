/**
 * The play-along card: the video component (opens from the player's side bar)
 * and the phone view (under the video in the Twitch app) both load this. It
 * shows whatever the channel is running right now with the live page's own
 * cards (a break game, the trivia question, Chat Brain, a poll, Stream Bingo,
 * a Chat Draft) plus picks and bans; when nothing is running, the channel's
 * leaderboard. Picks: https://claude.ai/artifact/GrYGnPaUHT2yktw3b4XPhu.
 *
 * Viewers watch anonymously; the first time they play, Twitch asks them to
 * share their Twitch id, and from then on they're the same player as in chat.
 */
import { useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import "@empac/cascadeds/styles.css";
import "@/app/globals.css";
import "@/styles/live.css";
import "@/styles/tools.css";
import "@/styles/overlay.css";
import "./ext.css";
import { ToastProvider, useToast } from "@/components/toast/ToastProvider";
import { LiveHostContext, type LiveHostValue } from "@/components/live/LiveHost";
import { LivePollCard } from "@/components/live/LivePollCard";
import { LiveTriviaCard } from "@/components/live/LiveTriviaCard";
import { LiveBreakCard } from "@/components/live/LiveBreakCard";
import { LiveChatBrainCard } from "@/components/live/LiveChatBrainCard";
import { LiveBingoCard } from "@/components/live/LiveBingoCard";
import { LiveDraftCard } from "@/components/live/LiveDraftCard";
import { liveApi } from "./api";
import { extHost } from "./host";
import { ExtHeader, Leaderboard, useExt } from "./shared";
import { PicksCard } from "./PicksCard";

function Card() {
  const st = useExt();
  const toast = useToast();
  const signIn = useCallback((label: string) => {
    if (!extHost().requestShare()) toast.info(`Log in to Twitch to ${label}.`);
  }, [toast]);
  const host = useMemo<LiveHostValue>(() => ({ api: liveApi, signIn }), [signIn]);

  const s = st.state;
  if (!st.auth || !s) {
    const down = st.failures >= 3;
    return <main className="ext"><ExtHeader channel={null} /><p className="ext-s ext-center" role={down ? "alert" : undefined}>{down ? "GameShuffle isn't answering right now. It'll keep trying." : "Loading…"}</p></main>;
  }
  if (!s.channel.connected) {
    return (
      <main className="ext">
        <ExtHeader channel={s.channel.name} />
        <section className="ext-empty">
          {st.auth.role === "broadcaster" ? (
            <>
              <h2 className="ext-title">Connect your channel to GameShuffle</h2>
              <p className="ext-s">Sign in at gameshuffle.co and connect Twitch under Account, Streaming. Games you run there show up here for your viewers.</p>
            </>
          ) : (
            <>
              <h2 className="ext-title">No games on this channel yet</h2>
              <p className="ext-s">{s.channel.name} hasn&apos;t set up GameShuffle yet.</p>
            </>
          )}
        </section>
      </main>
    );
  }

  // The cards ignore the id (the store already knows the channel); it only has to be set.
  const cid = `twitch-${s.channel.name}`;
  return (
    <main className="ext">
      <ExtHeader channel={s.channel.name} tokens={st.shared ? st.me?.tokens ?? null : null} />
      <LiveHostContext.Provider value={host}>
        <div className="ext-cards">
          <LiveBreakCard communityId={cid} />
          <LiveTriviaCard communityId={cid} />
          <LiveChatBrainCard communityId={cid} />
          <LivePollCard communityId={cid} />
          <LiveBingoCard communityId={cid} />
          <LiveDraftCard communityId={cid} />
          {s.picks && <PicksCard picks={s.picks} ballot={st.me?.ballot ?? null} shared={st.shared} signIn={signIn} />}
        </div>
      </LiveHostContext.Provider>

      {!st.running && (
        <section className="ext-idle">
          <h2 className="ext-title">{s.channel.live ? "Nothing running right now" : `${s.channel.name} is offline`}</h2>
          <p className="ext-s">When {s.channel.name} starts a poll, Stream Bingo, a trivia night, a break game or Chat Brain, you play it right here.</p>
          {s.leaderboard && <Leaderboard rows={s.leaderboard} title={`Top players on ${s.channel.name}`} />}
        </section>
      )}

      {st.running && !st.shared && (
        <p className="ext-foot">Tap any game to play. Twitch asks once to share your username, so your points count in chat too.</p>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <ToastProvider>
    <Card />
  </ToastProvider>,
);
