import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/comms-center";
const meta = findArticle(HREF)!;

export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  alternates: { canonical: `https://www.gameshuffle.co${HREF}` },
  openGraph: { siteName: "GameShuffle", title: `${meta.title} | GameShuffle Help`, description: meta.description, url: `https://www.gameshuffle.co${HREF}` },
  robots: { index: true, follow: true },
};

export default function Page() {
  return (
    <HelpArticle href={HREF}>
      <h1>Your inbox</h1>
      <p>
        Your notifications live in the <strong>Inbox</strong> at <code>/comms</code>. It has two tabs:
        <strong> Alerts</strong> for what happened, and <strong>Reminders</strong>{" "}for what&apos;s coming up.
      </p>

      <h2>Getting there</h2>
      <p>
        On a phone, tap <strong>Inbox</strong> in the bar along the bottom; on a computer, use the
        <strong> bell</strong>{" "}in the navbar. Both show how many alerts you haven&apos;t seen.
      </p>

      <h2>Alerts</h2>
      <p>
        The Alerts tab is your notification feed: new followers, replies and reactions on your posts,
        invitations, tournament updates, and more. Invitations show
        <strong> Accept</strong> / <strong>Decline</strong> right in the row. Opening the tab marks
        alerts as read, and the bell badge clears.
      </p>

      <h2>Choosing what reaches you</h2>
      <p>
        <Link href="/settings/notifications">Settings ▸ Notifications</Link> lets you choose, for each kind of news,
        whether it reaches you on GameShuffle, by email or on Discord.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> if alerts aren&apos;t behaving.</p>
    </HelpArticle>
  );
}
