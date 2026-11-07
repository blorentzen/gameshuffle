import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/community/discord-alerts-and-reminders";
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
      <h1>Go-live alerts, server replies and reminders</h1>
      <p>
        The main GameShuffle bot can post go-live alerts for other creators, answer with replies you save, and send reminders.
        All three are part of GS Pro. Add the bot to your server first: see{" "}
        <Link href="/help/community/discord-bot">the Discord bot</Link>.
      </p>

      <h2>Go-live alerts</h2>
      <p>
        The bot posts in your server when creators you pick go live on Twitch. Set it up in{" "}
        <strong>Account &rsaquo; Discord &rsaquo; Channels &amp; posts</strong>, on the{" "}
        <strong>Go-live alerts</strong>{" "}card. If you run the bot in more than one server, pick the server at the top first:
        each server has its own list.
      </p>
      <ol>
        <li>In <strong>Post in</strong>, pick the channel for the alerts.</li>
        <li>In <strong>Ping</strong>, pick a role to mention, or leave it on No ping.</li>
        <li>Add creators. <strong>Someone you follow</strong>{" "}lists the people you follow on GameShuffle who have Twitch linked. <strong>Or any Twitch channel</strong>{" "}takes a channel name or a twitch.tv link, and that creator doesn&apos;t need GameShuffle.</li>
      </ol>
      <ul>
        <li>Each server can have up to 25 creators.</li>
        <li>The bot posts once per stream, with the stream&apos;s title, its game and a picture of the stream.</li>
        <li>The pencil sets a creator&apos;s own message, up to 300 characters. Use <code>{"{name}"}</code>, <code>{"{game}"}</code>, <code>{"{title}"}</code>{" "}and <code>{"{link}"}</code>. If you leave out <code>{"{link}"}</code>, the link goes at the end. Leave the message empty to use ours.</li>
        <li>The switch pauses one creator&apos;s alerts. The trash icon removes them.</li>
        <li>Your own channel doesn&apos;t need to be on the list. It already posts when you go live, through your settings higher up the same screen.</li>
      </ul>
      <p>Alerts stop posting if GS Pro ends, and pick up again when it&apos;s back.</p>

      <h2>Server replies with /gs-tag</h2>
      <p>
        Server replies are short posts your members call up by name: your rules, links, how to join a game night. They belong
        to your account, so every server you run the bot in shares them.
      </p>
      <p>
        Manage them in <strong>Account &rsaquo; Discord &rsaquo; Server replies</strong>: press{" "}
        <strong>Add a reply</strong>, fill in the <strong>Name members type</strong>{" "}(like <code>rules</code>) and{" "}
        <strong>What the bot posts</strong>, and save. Names are up to 32 lowercase letters, numbers, spaces, dashes or underscores, and a reply can be up to 1,900 characters, the same here and in Discord.
      </p>
      <p>In Discord:</p>
      <ul>
        <li><code>/gs-tag show name:rules</code>{" "}posts that reply in the channel. Anyone can use it.</li>
        <li><code>/gs-tag list</code>{" "}shows the reply names, only to the person who asked. Anyone can use it.</li>
        <li><code>/gs-tag set name:rules content:…</code>{" "}adds a reply or changes one. Members with Manage Server.</li>
        <li><code>/gs-tag delete name:rules</code>{" "}removes one. Members with Manage Server.</li>
      </ul>
      <p>Adding, changing and deleting replies need GS Pro, in Discord and on the website.</p>

      <h2>Reminders with /gs-remind</h2>
      <p>
        Anyone in your server can set a reminder for themselves, as long as the GameShuffle account that runs the bot there has
        GS Pro:
      </p>
      <p>
        <code>/gs-remind in:2h message:Start the tournament</code>
      </p>
      <ul>
        <li><strong>in</strong>{" "}is how long from now: <code>30s</code>, <code>10m</code>, <code>2h</code>{" "}or <code>1d</code>. A plain number means minutes. Anything from 30 seconds to 30 days works.</li>
        <li><strong>message</strong>{" "}is what to remind you about, up to 1,500 characters.</li>
        <li>When it&apos;s due, the bot posts the message in the same channel and pings you. Reminders go out once a minute, so one can arrive up to a minute late.</li>
        <li>Only you see the bot&apos;s confirmation.</li>
      </ul>
      <p>
        If your GameShuffle account has Discord connected, your upcoming reminders show on the <strong>Reminders</strong>{" "}tab
        of the <Link href="/comms?tab=reminders">Comms Center</Link>, where <strong>Cancel</strong>{" "}removes one before it goes
        off.
      </p>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a> and we&apos;ll help you set up the bot.</p>
    </HelpArticle>
  );
}
