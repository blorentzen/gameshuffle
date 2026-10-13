import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TriviaArticle } from "@/components/trivia/seo/TriviaArticle";
import { OCCASIONS, occasionBySlug, occasionUrl } from "@/data/trivia-seo";
import { TEMPLATES } from "@/lib/trivia/rules";
import { sampleQuestions } from "@/lib/trivia/topics";
import { triviaMetadata } from "@/lib/trivia/seoMeta";

/** Sample questions come from the approved pack, so refresh once a day. */
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return OCCASIONS.map((o) => ({ occasion: o.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ occasion: string }> }): Promise<Metadata> {
  const page = occasionBySlug((await params).occasion);
  if (!page) return {};
  return triviaMetadata({ title: page.title, description: page.description, path: occasionUrl(page.slug), article: true });
}

const STYLE_WORDS: Record<string, string> = { classic: "", picture: "picture round", confidence: "confidence round, bet 1 to 5", final: "a wager" };

export default async function OccasionPage({ params }: { params: Promise<{ occasion: string }> }) {
  const page = occasionBySlug((await params).occasion);
  if (!page) notFound();
  const template = TEMPLATES.find((t) => t.id === page.templateId);
  const samples = await sampleQuestions(page.sampleCategories, 4).catch(() => []);

  return (
    <TriviaArticle
      path={occasionUrl(page.slug)}
      label={page.label}
      h1={page.h1}
      description={page.description}
      lede={page.lede}
      faq={page.faq}
      templateId={page.templateId}
      startLabel="Start with this template"
    >
      <ul className="trivia-facts" aria-label="At a glance">
        {page.facts.map((f) => <li key={f}>{f}</li>)}
      </ul>

      {template && (
        <>
          <h2 id="rounds">What&apos;s in the template</h2>
          <ol>
            {template.rounds.map((r, i) => (
              <li key={i}>
                <strong>{r.title}</strong>
                {r.style === "final" ? ": one question to bet on" : `: ${r.count} questions`}
                {STYLE_WORDS[r.style] && r.style !== "final" ? ` (${STYLE_WORDS[r.style]})` : ""}
                {r.jokerAllowed ? ", joker allowed" : ""}
                {r.seconds ? `, ${r.seconds} seconds a question` : ""}
              </li>
            ))}
          </ol>
          <p>Change any round, swap questions, or add your own before the night. Nothing is locked in until you open the room.</p>
        </>
      )}

      <h2 id="how-to-run">How to run it</h2>
      <ol>
        {page.howTo.map((s) => <li key={s.title}><strong>{s.title}.</strong> {s.text}</li>)}
      </ol>

      <h2 id="tips">Tips from hosts</h2>
      <ul>
        {page.tips.map((t) => <li key={t}>{t}</li>)}
      </ul>

      {samples.length > 0 && (
        <>
          <h2 id="sample-questions">Sample questions</h2>
          <p>A few from GameShuffle&apos;s checked question pack, which you can fill the rounds from in one tap.</p>
          <ol className="trivia-samples">
            {samples.map((q) => (
              <li key={q.id}>
                <span>{q.prompt}</span>
                <span className="trivia-samples__answer">Answer: {q.answer}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </TriviaArticle>
  );
}
