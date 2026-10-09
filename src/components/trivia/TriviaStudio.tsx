"use client";

/**
 * The question studio (a CDS Modal over the builder): add questions to one
 * round from the host's library, the GameShuffle pack, a question they write,
 * or drafts from Claude. AI drafts land in the library as drafts and can't go
 * in a round until the host approves them; each one shows its answer line and
 * where to check it.
 */

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Input, Modal, Select, Switch, Tabs, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useAiAccess } from "@/components/ai/useAiAccess";
import { AiGatePrompt, allowanceText } from "@/components/ai/AiGate";
import type { LibraryQuestion } from "@/lib/trivia/store";
import type { QuestionKind, RoundStyle, TriviaQuestion } from "@/lib/trivia/rules";

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function toRoundQuestion(q: LibraryQuestion): TriviaQuestion {
  return {
    id: q.id, prompt: q.prompt, answer: q.answer, accept: q.accept, askAbout: q.askAbout, reject: q.reject, kind: q.kind,
    options: q.options ?? null, imageUrl: q.imageUrl ?? null, category: q.category, difficulty: q.difficulty, sources: q.sources, asOf: q.asOf, origin: q.origin,
  };
}

export function AnswerLine({ q }: { q: LibraryQuestion }) {
  return (
    <dl className="trivia-line">
      <dt>Answer</dt><dd>{q.answer}</dd>
      {q.accept.length > 0 && <><dt>Accept</dt><dd>{q.accept.join(", ")}</dd></>}
      {q.askAbout.length > 0 && <><dt>Ask about</dt><dd>{q.askAbout.join(", ")}</dd></>}
      {q.reject.length > 0 && <><dt>Reject</dt><dd>{q.reject.join(", ")}</dd></>}
      {q.sources && q.sources.length > 0 && (
        <><dt>Check</dt><dd>{q.sources.map((s, i) => <span key={i}>{i > 0 ? ", " : ""}{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</span>)}</dd></>
      )}
      {q.asOf && <><dt>As of</dt><dd>{q.asOf}{q.changeable ? " (can change: check before using)" : ""}</dd></>}
    </dl>
  );
}

export function TriviaStudio({ isOpen, onClose, roundTitle, roundStyle, inGame, onAdd }: {
  isOpen: boolean;
  onClose: () => void;
  roundTitle: string;
  roundStyle: RoundStyle;
  /** Library ids already somewhere in this night. */
  inGame: Set<string>;
  onAdd: (q: TriviaQuestion) => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState("mine");
  const [mine, setMine] = useState<LibraryQuestion[] | null>(null);
  const [pack, setPack] = useState<LibraryQuestion[] | null>(null);
  const [editing, setEditing] = useState<LibraryQuestion | null>(null);
  const [packCat, setPackCat] = useState("all");
  const ai = useAiAccess("trivia");
  const [gateOpen, setGateOpen] = useState(false);

  const loadMine = useCallback(async () => {
    const d = await fetch("/api/trivia/library", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    setMine(d?.ok ? (d.questions as LibraryQuestion[]) : []);
  }, []);
  useEffect(() => {
    if (!isOpen) return;
    void Promise.resolve().then(loadMine);
    void fetch("/api/trivia/library?pack=1", { cache: "no-store" }).then((r) => r.json()).then((d) => setPack(d?.ok ? d.questions : [])).catch(() => setPack([]));
  }, [isOpen, loadMine]);

  const setStatus = async (q: LibraryQuestion, status: "approved" | "retired") => {
    const d = await fetch(`/api/trivia/library/${q.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { toast.error("Couldn't save that."); return; }
    setMine((list) => (list ?? []).map((x) => (x.id === q.id ? d.question : x)).filter((x) => x.status !== "retired"));
    toast.success(status === "approved" ? "Approved" : "Dropped");
  };

  const pickable = (q: LibraryQuestion) =>
    q.status === "approved" && !inGame.has(q.id) && (roundStyle !== "picture" || q.kind === "picture") && (roundStyle === "picture" || q.kind !== "picture");

  const list = (items: LibraryQuestion[] | null, own: boolean) => {
    if (items === null) return <LoadingLines label="Loading" />;
    if (items.length === 0) return <p className="trivia-muted">{own ? "No questions yet. Write one, or draft some with AI." : "The GameShuffle pack is on its way: staff-checked questions land here each week."}</p>;
    return (
      <ul className="trivia-library">
        {items.map((q) => (
          <li key={q.id} className={`trivia-lib-q${q.status === "draft" ? " is-draft" : ""}`}>
            <div className="trivia-lib-q__head">
              <span className="trivia-muted">{q.category} · {q.difficulty}{q.kind !== "text" ? ` · ${q.kind}` : ""}</span>
              {q.status === "draft" && <Badge variant="warning" size="small">AI draft: check it</Badge>}
              {inGame.has(q.id) && <Badge variant="info" size="small">In this night</Badge>}
            </div>
            <p className="trivia-lib-q__prompt">{q.prompt}</p>
            {q.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- a question's picture, ours or the host's link
              <img className="trivia-lib-q__pic" src={q.imageUrl} alt="" loading="lazy" />
            )}
            <AnswerLine q={q} />
            <div className="trivia-row">
              {q.status === "draft" ? (
                <>
                  <Button variant="primary" size="small" onClick={() => void setStatus(q, "approved")}>Approve</Button>
                  <Button variant="secondary" size="small" onClick={() => { setEditing(q); setTab("write"); }}>Edit</Button>
                  <Button variant="ghost" size="small" onClick={() => void setStatus(q, "retired")}>Drop</Button>
                </>
              ) : (
                <>
                  <Button variant="primary" size="small" disabled={!pickable(q)} onClick={() => { onAdd(toRoundQuestion(q)); toast.success(`Added to ${roundTitle}`); }}>Add to {roundTitle}</Button>
                  {own && <Button variant="ghost" size="small" onClick={() => { setEditing(q); setTab("write"); }}>Edit</Button>}
                </>
              )}
            </div>
            {q.status === "draft" && q.origin === "ai" && <p className="trivia-ai-note">Drafted by AI. Check the answer against the sources before approving: AI gets facts wrong, most often on games and TV.</p>}
          </li>
        ))}
      </ul>
    );
  };

  // The pack is long: show what fits this round, by category.
  const packTab = () => {
    if (pack === null || pack.length === 0) return list(pack, false);
    const fits = pack.filter((q) => (roundStyle === "picture" ? q.kind === "picture" : q.kind !== "picture"));
    const cats = [...new Set(fits.map((q) => q.category ?? "General"))].sort();
    const cat = cats.includes(packCat) ? packCat : "all";
    const shown = fits.filter((q) => cat === "all" || q.category === cat);
    return (
      <div className="trivia-pack-tab">
        {cats.length > 1 && (
          <Select floatingLabel="Category" value={cat} onChange={(v) => setPackCat(String(v))}
            options={[{ value: "all", label: `Every category (${fits.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${fits.filter((q) => q.category === c).length})` }))]} />
        )}
        {list(shown, false)}
      </div>
    );
  };

  return (
    <>
      <Modal isOpen={isOpen && !gateOpen} onClose={onClose} title={`Add questions: ${roundTitle}`} size="large">
        <Tabs variant="underline" activeTab={tab} onChange={(id) => { setTab(id); if (id !== "write") setEditing(null); }}
          tabs={[
            { id: "mine", label: "Your questions", content: tab === "mine" ? list(mine, true) : null },
            { id: "pack", label: "GameShuffle pack", content: tab === "pack" ? packTab() : null },
            { id: "write", label: editing ? "Edit question" : "Write one", content: tab === "write" ? (
              <QuestionForm key={editing?.id ?? "new"} initial={editing} roundStyle={roundStyle}
                onSaved={(q, addNow) => {
                  setMine((list) => [q, ...(list ?? []).filter((x) => x.id !== q.id)]);
                  if (addNow && pickable(q)) { onAdd(toRoundQuestion(q)); toast.success(`Added to ${roundTitle}`); }
                  else toast.success("Saved to your questions");
                  setEditing(null);
                  setTab("mine");
                }} />
            ) : null },
            { id: "ai", label: "Draft with AI", content: tab === "ai" ? (
              <DraftForm info={ai.info} blocked={!!ai.block} onBlocked={() => setGateOpen(true)}
                onDrafted={(qs, remaining) => {
                  ai.spent(remaining);
                  setMine((list) => [...qs, ...(list ?? [])]);
                  toast.success(`${qs.length} drafts added to Your questions. Check each one before approving.`);
                  setTab("mine");
                }} />
            ) : null },
          ]} />
      </Modal>
      {ai.info && ai.block && <AiGatePrompt info={ai.info} block={ai.block} isOpen={gateOpen} onClose={() => setGateOpen(false)} />}
    </>
  );
}

function QuestionForm({ initial, roundStyle, onSaved }: { initial: LibraryQuestion | null; roundStyle: RoundStyle; onSaved: (q: LibraryQuestion, addNow: boolean) => void }) {
  const toast = useToast();
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [accept, setAccept] = useState((initial?.accept ?? []).join(", "));
  const [askAbout, setAskAbout] = useState((initial?.askAbout ?? []).join(", "));
  const [reject, setReject] = useState((initial?.reject ?? []).join(", "));
  const [kind, setKind] = useState<QuestionKind>(initial?.kind ?? (roundStyle === "picture" ? "picture" : "text"));
  const [options, setOptions] = useState((initial?.options ?? []).join(", "));
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [category, setCategory] = useState(initial?.category ?? "General");
  const [difficulty, setDifficulty] = useState<string>(initial?.difficulty ?? "medium");
  const [busy, setBusy] = useState(false);

  const save = async (addNow: boolean) => {
    setBusy(true);
    const question = { prompt, answer, accept: splitList(accept), askAbout: splitList(askAbout), reject: splitList(reject), kind, options: kind === "choice" ? splitList(options) : null, imageUrl: kind === "picture" ? imageUrl : null, category, difficulty };
    const res = initial
      ? await fetch(`/api/trivia/library/${initial.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, status: "approved" }) })
      : await fetch("/api/trivia/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    const errors: Record<string, string> = { bad_prompt: "Questions need 8 to 300 characters.", bad_answer: "Add the answer.", bad_options: "Choices need at least two options, one of them the answer.", needs_image: "Picture questions need an image link.", blocked: "That wording can't be used." };
    if (d?.ok) onSaved(d.question as LibraryQuestion, addNow);
    else toast.error(errors[d?.error] ?? "Couldn't save the question.");
  };

  return (
    <div className="trivia-form">
      <Textarea floatingLabel="Question" value={prompt} maxLength={300} rows={2} onChange={(e) => setPrompt(e.target.value)} />
      <Input fullWidth floatingLabel="Answer" value={answer} maxLength={120} onChange={(e) => setAnswer(e.target.value)} />
      <Input fullWidth floatingLabel="Also accept (commas between)" value={accept} onChange={(e) => setAccept(e.target.value)} />
      <Input fullWidth floatingLabel="Ask the host about (commas between)" value={askAbout} onChange={(e) => setAskAbout(e.target.value)} />
      <Input fullWidth floatingLabel="Reject (commas between)" value={reject} onChange={(e) => setReject(e.target.value)} />
      <div className="trivia-form__row">
        <Select floatingLabel="Type" value={kind} onChange={(v) => setKind(String(v) as QuestionKind)}
          options={[{ value: "text", label: "Typed answer" }, { value: "number", label: "Number or year" }, { value: "choice", label: "Multiple choice" }, { value: "picture", label: "Picture" }]} />
        <Select floatingLabel="Difficulty" value={difficulty} onChange={(v) => setDifficulty(String(v))}
          options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
        <Input fullWidth floatingLabel="Category" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
      </div>
      {kind === "choice" && <Input fullWidth floatingLabel="Choices (commas between, include the answer)" value={options} onChange={(e) => setOptions(e.target.value)} />}
      {kind === "picture" && <Input fullWidth floatingLabel="Image link (https://…)" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />}
      <div className="trivia-row">
        <Button variant="primary" disabled={busy} onClick={() => void save(true)}>Save and add to the round</Button>
        <Button variant="secondary" disabled={busy} onClick={() => void save(false)}>Save to your questions</Button>
      </div>
    </div>
  );
}

function DraftForm({ info, blocked, onBlocked, onDrafted }: {
  info: ReturnType<typeof useAiAccess>["info"];
  blocked: boolean;
  onBlocked: () => void;
  onDrafted: (qs: LibraryQuestion[], remaining: number | null | undefined) => void;
}) {
  const toast = useToast();
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState("8");
  const [difficulty, setDifficulty] = useState("mixed");
  const [familySafe, setFamilySafe] = useState(true);
  const [busy, setBusy] = useState(false);

  const draft = async () => {
    if (blocked) { onBlocked(); return; }
    setBusy(true);
    const d = await fetch("/api/trivia/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme, count: Number(count), difficulty, familySafe }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) { track(EVENTS.triviaQuestionsDrafted, { count: (d.questions as unknown[]).length }); onDrafted(d.questions as LibraryQuestion[], d.remaining); }
    else if (d?.error === "pro_required" || d?.error === "allowance_used" || d?.error === "daily_used" || d?.error === "unauthenticated") onBlocked();
    else toast.error(d?.error === "not_configured" ? "AI drafting isn't available right now." : "Couldn't draft questions right now. Try again in a moment.");
  };

  return (
    <div className="trivia-form">
      <p className="trivia-muted">Describe the round. Claude drafts questions with an answer line and where to check each fact; they go to Your questions as drafts for you to approve.</p>
      <Input fullWidth floatingLabel="Theme" placeholder="90s video games, medium, nothing too obscure" value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} />
      <div className="trivia-form__row">
        <Select floatingLabel="How many" value={count} onChange={(v) => setCount(String(v))} options={[4, 6, 8, 10].map((n) => ({ value: String(n), label: `${n} questions` }))} />
        <Select floatingLabel="Difficulty" value={difficulty} onChange={(v) => setDifficulty(String(v))}
          options={[{ value: "mixed", label: "A mix" }, { value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
      </div>
      <Switch label="Family-safe" checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} />
      <div className="trivia-row">
        <Button variant="primary" disabled={busy || theme.trim().length < 3} onClick={() => void draft()}>{busy ? "Drafting… (about 30 seconds)" : "Draft questions"}</Button>
        {allowanceText(info) && <span className="trivia-muted">{allowanceText(info)}</span>}
      </div>
    </div>
  );
}
