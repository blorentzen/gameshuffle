import type { Metadata } from "next";
import Link from "next/link";
import { HelpArticle } from "@/components/help/HelpArticle";
import { findArticle } from "@/lib/help/manifest";

const HREF = "/help/apps/trivia-nights";
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
      <h1>Trivia Nights</h1>
      <p>
        <Link href="/trivia">Trivia Nights</Link> runs a pub-style quiz for a party, the office, a fundraiser or a weekly bar
        night. You run it from your phone, teams answer on theirs, and a TV or laptop shows the questions and the scores.
        Hosting is free with a GameShuffle account. Teams don&apos;t need one.
      </p>

      <h2>Set up a night</h2>
      <ol>
        <li>On <Link href="/trivia">/trivia</Link>, pick an occasion. Each template sets the rounds: classic questions, a picture round, a confidence round and a final wager, in a length that fits the occasion.</li>
        <li>Tap <strong>Fill every round from the pack</strong> to fill the whole night from the GameShuffle question pack in one go, or fill one round at a time. It mixes categories and difficulty, and skips questions you asked at your earlier nights while it has others.</li>
        <li>Swap anything you don&apos;t like: remove a question, drag them into a new order, or tap <strong>Add questions</strong> to pick from the pack, your own questions, or write one.</li>
        <li>Change a round&apos;s name, style, timer and points, or add and remove rounds.</li>
        <li>When you&apos;re ready, tap <strong>Open the room</strong>. Rounds can&apos;t change after that.</li>
      </ol>

      <h2>Questions and answer lines</h2>
      <p>
        Every question has an <strong>answer line</strong>: the answer, other answers to accept, answers to ask you about, and
        answers to reject. Typed answers are judged from it, so &ldquo;Neil Armstrong&rdquo; and &ldquo;armstrong&rdquo; both
        count, small typos count, but numbers never count as a typo (1969 isn&apos;t 1996). Anything close that the line
        doesn&apos;t settle waits for you.
      </p>
      <p>
        Questions in the GameShuffle pack are checked by our team against a source before hosts see them, and the ones whose
        answer can change say when they were checked. With GS Pro you can also have AI draft questions for a theme. Drafts come
        with sources and an answer line, and stay drafts until you approve them, because AI gets facts wrong (most often about
        games and TV).
      </p>

      <h2>Run the room</h2>
      <ul>
        <li>Open the <strong>TV view</strong> on a screen everyone can see. It shows the join code and a QR code, then each question with a countdown.</li>
        <li>Teams scan the code or go to gameshuffle.co/trivia, enter the code and pick a team name. Teammates join the same team from the team&apos;s link. Up to 40 teams can play.</li>
        <li>From your phone: <strong>Show question</strong>, then answers lock when the timer ends (or tap <strong>Lock answers now</strong>).</li>
        <li>Answers are grouped by spelling, so you rule on each one once for every team that wrote it: <strong>Right</strong>, <strong>Wrong</strong> or, where it can award something, <strong>Half</strong>. Anything you leave counts as wrong.</li>
        <li><strong>Reveal the answer</strong> to show it on the TV and add the points, then show the standings whenever you like and move on.</li>
      </ul>
      <p>Phones and the TV never show an answer before you reveal it, and no team can see another team&apos;s answers.</p>

      <h2>Round styles</h2>
      <ul>
        <li><strong>Classic:</strong> one to five points per right answer.</li>
        <li><strong>Picture round:</strong> every phone and the TV show the picture with the question.</li>
        <li><strong>Confidence:</strong> teams rank their answers, using each number from 1 to the number of questions once. A right answer earns its number.</li>
        <li><strong>Final wager:</strong> one question. Teams bet 0 to 20 points, never more than they have, and win or lose the bet.</li>
        <li><strong>Joker:</strong> each team can play one joker per night, on a round that allows it and before that round starts. It doubles the points they earn in that round.</li>
      </ul>

      <h2>Still need help?</h2>
      <p>Email <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
    </HelpArticle>
  );
}
