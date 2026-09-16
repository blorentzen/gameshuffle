import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/communities-and-crews";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Communities &amp; Crews</h1>
      <p>
        A community is a streamer&apos;s space on GameShuffle for their followers and crews. It has its
        own page with a feed, a leaderboard, prediction markets when you&apos;re live, and
        <strong> crews</strong>: per-game rosters that represent your community in competition.
      </p>

      <h2>Where your community comes from</h2>
      <p>
        You don&apos;t create a community by hand. Yours is set up automatically the first time you
        stream or run a GameShuffle activity after
        <a href="/help/getting-started/connecting-twitch"> connecting Twitch</a>. It lives at
        <code> gameshuffle.co/c/your-handle</code>, using the same handle as your profile and live
        page.
      </p>

      <h2>The community page</h2>
      <p>A community page (<code>/c/handle</code>) shows:</p>
      <ul>
        <li><strong>Header</strong> with the community name, a Join button, and links to Watch live and View profile.</li>
        <li><strong>Live prediction</strong> when the creator is live with an open market.</li>
        <li><strong>Crews</strong>, the per-game rosters (below).</li>
        <li><strong>Crew battles</strong>, cross-community matches and win/loss records.</li>
        <li><strong>Community feed</strong> for posts (members can post).</li>
        <li><strong>Leaderboard</strong> of top token holders.</li>
        <li><strong>Members</strong> grid with who&apos;s online.</li>
      </ul>

      <h2>Joining a community</h2>
      <p>
        On any community page, click <strong>Join community</strong> (it becomes <strong>Joined
        &#10003;</strong>). Joining lets you post in the feed and is the first step to representing in
        a crew. Signed-out visitors are sent to log in first. Browse communities from the
        <strong> Community Hub</strong> at <code>/communities</code>. The community feed and hub are
        in Beta and rolling out, so you may not see them on every account yet.
      </p>

      <h2>Crews</h2>
      <p>
        A crew is your community&apos;s roster for a single game, one crew per game. Members climb a
        ladder: <strong>prospect</strong> &rarr; <strong>representative</strong> &rarr;
        <strong> captain</strong>.
      </p>

      <h3>Represent your community</h3>
      <p>
        On the community page&apos;s Crews card, use <strong>&ldquo;Represent this community in a
        game&rdquo;</strong>, pick a game, and click <strong>Join crew</strong>. You join as a
        prospect. You must be a member of the community first.
      </p>

      <h3>Managing a crew</h3>
      <p>
        A community&apos;s <strong>owner and mods</strong>, plus any <strong>captain</strong> of that
        game&apos;s crew, can manage the roster: promote and demote members, remove them, or
        <strong> Add as rep</strong> to recruit someone straight in as a representative. Any member
        can leave their own crew.
      </p>

      <h3>Crew chat</h3>
      <p>
        Each crew gets a group chat, opened with the <strong>Crew chat</strong> button on the crew.
        Crew chats are for teammates, so they skip the mutual-follow rule that
        <a href="/help/community/comms-center"> normal DMs</a> use, everyone on the roster can
        coordinate regardless of who follows whom.
      </p>

      <h2>Crew battles</h2>
      <p>
        Communities can challenge each other to crew battles in a shared game. A battle moves from
        proposed to accepted to completed with a result, and each community&apos;s win/loss record
        shows on its page. A crew captain or the community&apos;s owner/mods can propose, accept, and
        report battles.
      </p>

      <h2>Crews in tournaments</h2>
      <p>
        Crews matter most in a <a href="/help/tournaments/multi-crew-tournaments">multi-crew
        tournament</a>, where each player represents a community and points roll up into live crew
        standings on your dashboard, your overlay, and in chat with <code>!crews</code>.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you get your community going.</p>
    </HelpArticle>
  );
}
