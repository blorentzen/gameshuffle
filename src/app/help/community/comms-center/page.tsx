import type { Metadata } from "next";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/comms-center";
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
      <h1>Notifications &amp; Messages</h1>
      <p>
        Your notifications and your messages live together in the <strong>Comms Center</strong> at
        <code> /comms</code>. It has two tabs: <strong>Alerts</strong> for notifications and
        <strong> Messages</strong> for direct and group chats.
      </p>

      <h2>Getting there</h2>
      <p>
        Use the icons in the navbar: the <strong>bell</strong> opens your Alerts, the
        <strong> messages icon</strong> opens your Messages. Each shows an unread badge and deep-links
        straight to the right tab. (The old <code>/messages</code> link now redirects into the
        Messages tab.)
      </p>

      <h2>Alerts</h2>
      <p>
        The Alerts tab is your notification feed: new followers, replies and reactions on your posts,
        invitations, tournament updates, and more. Invitations show
        <strong> Accept</strong> / <strong>Decline</strong> right in the row. Opening the tab marks
        alerts as read, and the bell badge clears.
      </p>

      <h2>Messages</h2>
      <p>
        The Messages tab holds your direct messages and group chats. Start a new one with
        <strong> New message</strong>, and pick a conversation from the list to read and reply. Crew
        chats and other group conversations appear here too.
      </p>

      <h3>How direct messages work</h3>
      <p>
        DMs are <strong>mutual-follow only</strong>: you and the other person must both follow each
        other before you can message. This keeps inboxes free of spam. The new-message picker only
        shows people you mutually follow. If you can&apos;t message someone, follow them and ask them
        to follow back.
      </p>
      <p>
        <strong>Crew and group chats are the exception</strong>, they don&apos;t require mutual
        follows, so teammates can coordinate regardless of who follows whom.
      </p>
      <p>
        A new DM sends the other person a single ping so they know to check Messages; it doesn&apos;t
        spam their Alerts.
      </p>

      <h2>Starting a conversation from a profile</h2>
      <p>
        On someone&apos;s <a href="/help/community/public-profile">public profile</a>, use
        <strong> Message</strong> to open a DM (again, only when you mutually follow). <strong>Follow</strong>
        there to build that mutual connection.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> if messages or alerts aren&apos;t behaving.</p>
    </HelpArticle>
  );
}
