import type { Metadata } from "next";
import Link from "next/link";
import { TriviaArticle } from "@/components/trivia/seo/TriviaArticle";
import { TRIVIA_PATH, occasionUrl, type Faq } from "@/data/trivia-seo";
import { triviaMetadata } from "@/lib/trivia/seoMeta";

const PATH = `${TRIVIA_PATH}/how-to-host`;
const TITLE = "How to Host a Trivia Night: Rules, Rounds and a Checklist";
const DESCRIPTION = "How to host a trivia night that runs smoothly: how many rounds and questions, team sizes, scoring with jokers and wagers, the rules to read out, and a checklist for the night.";

export const metadata: Metadata = triviaMetadata({ title: TITLE, description: DESCRIPTION, path: PATH, article: true });

const faq: Faq[] = [
  { q: "How many questions should a trivia night have?", a: "Most run 40 to 60: five to seven rounds of 8 to 10 questions, plus a final question. For a party or an office lunch, four rounds of 6 is plenty." },
  { q: "How long does a trivia night last?", a: "Plan about two minutes a question including the reveal, plus breaks between rounds. Four rounds of 6 is about 45 minutes; seven rounds of 8 is about two hours." },
  { q: "How many people should be on a trivia team?", a: "Four to six is the sweet spot. Bigger teams win too often and leave people out, so many hosts cap teams at six." },
  { q: "How do you score a trivia night?", a: "A point for each right answer is the base. Add a joker (one round of double points each team picks), a confidence round (teams bet 1 to 5 on their answers) and a final wager to keep the end close." },
  { q: "What rules should a trivia host read out?", a: "No phones except to answer, the host's ruling on close answers is final, spelling counts only if it changes the answer, and team sizes are capped. Read them before round one, not after a dispute." },
  { q: "What do you need to host a trivia night?", a: "Questions with answers you've checked, a way to show them (a TV or projector helps), a way to collect answers, and scoring. On GameShuffle the phones collect answers and the scoring is automatic." },
];

export default function HowToHostPage() {
  return (
    <TriviaArticle
      path={PATH}
      label="How to host"
      h1="How to host a trivia night"
      description={DESCRIPTION}
      lede="A good trivia night is mostly decided before anyone arrives: the right number of rounds, questions you've checked, clear rules and scoring that keeps every team in it until the end. Here's how to plan one, run it, and get people back next time."
      faq={faq}
    >
      <h2 id="format">1. Pick the format</h2>
      <p>Decide how long you have, then work backwards. Allow about two minutes per question including the reveal, and a short break between rounds.</p>
      <ul>
        <li><strong>Lunch hour or party warm-up:</strong> four rounds of 6, about 45 minutes. See the <Link href={occasionUrl("office-trivia-night")}>office trivia template</Link>.</li>
        <li><strong>A night in with friends:</strong> five rounds with a picture round and a final wager, about 75 minutes. See <Link href={occasionUrl("party-trivia")}>party trivia</Link>.</li>
        <li><strong>The weekly pub quiz:</strong> seven rounds of 8 and a final, about two hours. See <Link href={occasionUrl("bar-trivia")}>bar trivia</Link>.</li>
      </ul>
      <p>Mix it up: a picture round in the middle gives tables something to talk through, and a quick lightning round of 20-second questions picks the energy up near the end.</p>

      <h2 id="teams">2. Set up teams</h2>
      <p>Four to six people a team works best. Cap the size so one big group doesn&apos;t win every time, and let solo players join a team that&apos;s short. Every team needs a name; if they&apos;re stuck, the <Link href={`${TRIVIA_PATH}/team-names`}>trivia team name generator</Link> has plenty.</p>

      <h2 id="questions">3. Write (or find) good questions</h2>
      <ul>
        <li><strong>Check every answer.</strong> One wrong fact costs a host more goodwill than anything else. Keep a source for each question.</li>
        <li><strong>Write the answer line before the night:</strong> what you&apos;ll accept (a last name? a nickname?), what you&apos;ll ask about, and what you&apos;ll reject. It settles disputes before they start.</li>
        <li><strong>Mix the difficulty:</strong> mostly medium, a few easy ones so every table scores, and a few hard ones to separate the top.</li>
        <li><strong>Avoid one-word lookups.</strong> Questions that need a little reasoning are more fun and harder to cheat.</li>
        <li><strong>Watch facts that change:</strong> records, rosters and &quot;the latest&quot; anything. Note the date you checked them.</li>
      </ul>
      <p>On GameShuffle every question carries its answer line and sources, and you can fill rounds from a checked question pack, write your own, or have AI draft questions that you approve one by one.</p>

      <h2 id="scoring">4. Decide the scoring</h2>
      <ul>
        <li><strong>One point a right answer</strong> is the base for every round.</li>
        <li><strong>Joker:</strong> before a round starts, each team can play its joker on it to double every point in that round. One joker a night.</li>
        <li><strong>Confidence round:</strong> five questions, and each team gives every answer a different number from 1 to 5. Right answers score their number.</li>
        <li><strong>Final wager:</strong> teams bet some of their points on the last question. Right wins the bet, wrong loses it.</li>
        <li><strong>Half points</strong> for a partly right answer (half of a two-part answer) keep close calls fair.</li>
      </ul>

      <h2 id="rules">5. The rules to read out</h2>
      <ol>
        <li>Phones away, except to answer.</li>
        <li>The host&apos;s call on a close answer is final.</li>
        <li>Spelling only counts if it changes the answer.</li>
        <li>Teams of up to six.</li>
        <li>Answers lock when time&apos;s up.</li>
      </ol>
      <p>Read them before round one. It&apos;s much easier than ruling on them in the middle of a dispute.</p>

      <h2 id="checklist">6. The checklist for the night</h2>
      <ul>
        <li>Questions and answers checked, rounds in order</li>
        <li>The screen working (TV, projector or a shared screen on a call)</li>
        <li>A microphone if the room is loud</li>
        <li>Paper answer sheets as a backup (print some from the <Link href={`${TRIVIA_PATH}/answer-sheet`}>answer sheet maker</Link>)</li>
        <li>Prizes, and the date of the next one to announce at the end</li>
      </ul>

      <h2 id="after">7. Get them back next time</h2>
      <p>Announce the standings and the next date before people leave. Weekly nights live on regulars: same night, same time, and a running leaderboard gives teams a reason to come back.</p>
    </TriviaArticle>
  );
}
