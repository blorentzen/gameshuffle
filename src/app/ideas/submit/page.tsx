"use client";

import { useState } from "react";
import Link from "next/link";
import { Container, Input, Textarea, Select, Button } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import {
  IDEA_LIMITS,
  IDEA_CATEGORIES,
  IDEA_CATEGORY_LABELS,
  type IdeaCategory,
} from "@/lib/ideas/constants";

const CATEGORY_OPTIONS = IDEA_CATEGORIES.map((c) => ({ value: c, label: IDEA_CATEGORY_LABELS[c] }));

export default function SubmitIdeaPage() {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<IdeaCategory>("game_idea");
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Please complete the verification.");
      return;
    }
    setSubmitting(true);
    const res = await fetch("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category, turnstileToken: token }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    setError(
      d?.error === "rate_limited"
        ? `You can submit up to ${IDEA_LIMITS.submissionsPer24h} ideas per day. Try again tomorrow.`
        : "Couldn't submit that — check your entry and try again.",
    );
  }

  if (done) {
    return (
      <Container className="ideas-page">
        <div className="ideas-submit__done">
          <h1 className="ideas-page__title">Idea submitted</h1>
          <p className="ideas-page__lead">
            Thanks! Every idea goes through a quick review before it appears on the board — this
            keeps the board focused. Once it&apos;s approved it&apos;ll go live and start collecting
            votes. You can track its status any time.
          </p>
          <div className="ideas-submit__actions">
            <Link href="/ideas/mine">
              <Button variant="primary">View my ideas</Button>
            </Link>
            <Button variant="secondary" onClick={() => { setTitle(""); setBody(""); setDone(false); }}>
              Submit another
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container className="ideas-page">
        <h1 className="ideas-page__title">Submit an idea</h1>
        <p className="ideas-page__lead">Sign in to share a game idea, randomizer concept, or feature request.</p>
        <Link href="/login?redirect=/ideas/submit">
          <Button variant="primary">Log in</Button>
        </Link>
      </Container>
    );
  }

  return (
    <Container className="ideas-page">
      <h1 className="ideas-page__title">Submit an idea</h1>
      <p className="ideas-page__lead">
        Game ideas, randomizer concepts, tools, and features. The community votes, and ideas enter
        batched review cycles — every reviewed idea gets a public verdict.
      </p>

      <form onSubmit={submit} className="ideas-submit__form">
        <div className="ideas-field">
          <Input
            floatingLabel="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={IDEA_LIMITS.titleMax}
            fullWidth
            required
          />
          <span className="ideas-field__count">{title.length}/{IDEA_LIMITS.titleMax}</span>
        </div>

        <Select
          floatingLabel="Category"
          options={CATEGORY_OPTIONS}
          value={category}
          onChange={(v) => setCategory(v as IdeaCategory)}
          fullWidth
        />

        <div className="ideas-field">
          <Textarea
            floatingLabel="Describe your idea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={IDEA_LIMITS.bodyMax}
            rows={6}
            fullWidth
            required
          />
          <span className="ideas-field__count">{body.length}/{IDEA_LIMITS.bodyMax}</span>
        </div>

        <TurnstileWidget onToken={setToken} />
        {error && <p className="ideas-submit__error">{error}</p>}

        <Button type="submit" variant="primary" loading={submitting} disabled={!title.trim() || !body.trim()}>
          Submit for review
        </Button>
      </form>
    </Container>
  );
}
