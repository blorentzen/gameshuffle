"use client";

/**
 * The night builder (before the room opens): rounds from the template, each
 * with its style, timer and points; questions added from the studio, or
 * filled from the GameShuffle pack in one tap, and put in order (SortableList:
 * drag handle plus arrows). Open the room when ready.
 */

import { useMemo, useState } from "react";
import { Badge, Button, Input, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { SortableList } from "@/components/ui/SortableList";
import { IconAction } from "@/components/actions/IconAction";
import { IconTrash } from "@tabler/icons-react";
import { TriviaStudio } from "./TriviaStudio";
import { SECONDS, STYLE_LABEL, TEMPLATES, roundTarget, type RoundStyle, type TriviaQuestion, type TriviaRound } from "@/lib/trivia/rules";

export interface BuilderGame { id: string; title: string; code: string; status: string; template: string | null; rounds: TriviaRound[] }

let keySeq = 0;
const withKeys = (qs: TriviaQuestion[]) => qs.map((q) => ({ ...q, _k: `q${++keySeq}` }));
type KeyedQ = TriviaQuestion & { _k: string };
type KeyedRound = Omit<TriviaRound, "questions"> & { questions: KeyedQ[]; _k: string };

export function TriviaBuilder({ game, onLive }: { game: BuilderGame; onLive: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const template = TEMPLATES.find((t) => t.id === game.template) ?? null;
  const [title, setTitle] = useState(game.title);
  const [rounds, setRounds] = useState<KeyedRound[]>(() => game.rounds.map((r) => ({ ...r, _k: `r${++keySeq}`, questions: withKeys(r.questions) })));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studio, setStudio] = useState<number | null>(null);
  const [filling, setFilling] = useState<number | "all" | null>(null);
  const [onStream, setOnStream] = useState(game.template === "stream");

  const inGame = useMemo(() => new Set(rounds.flatMap((r) => r.questions.map((q) => q.id)).filter((x): x is string => !!x)), [rounds]);
  const total = rounds.reduce((n, r) => n + r.questions.length, 0);
  const want = (r: KeyedRound, i: number) => (r.style === "final" ? 1 : roundTarget(template, i));
  const anyEmpty = rounds.some((r, i) => r.questions.length < want(r, i));

  const update = (i: number, patch: Partial<KeyedRound>) => {
    setRounds((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const payload = () => rounds.map(({ _k, questions, ...r }) => {
    void _k;
    return { ...r, questions: questions.map(({ _k: k, ...q }) => { void k; return q; }) };
  });

  const save = async (quiet = false): Promise<boolean> => {
    setSaving(true);
    const d = await fetch(`/api/trivia/games/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, rounds: payload() }) }).then((r) => r.json()).catch(() => null);
    setSaving(false);
    if (!d?.ok) { toast.error("Couldn't save the night."); return false; }
    setDirty(false);
    if (!quiet) toast.success("Saved");
    return true;
  };

  /** Fill empty slots from the pack (one round, or all of them). Saves first so the server fills what's on screen. */
  const fill = async (round?: number) => {
    setFilling(round ?? "all");
    try {
      if (dirty && !(await save(true))) return;
      const res = await fetch(`/api/trivia/games/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fill", round }) });
      const d = await res.json().catch(() => null);
      if (!d?.ok) { toast.error(d?.error === "pack_empty" ? "The GameShuffle pack isn't ready yet. Add your own questions or draft some with AI." : "Couldn't fill from the pack."); return; }
      const added = d.added as number;
      const short = d.short as number;
      if (added > 0) {
        setRounds((d.game.rounds as TriviaRound[]).map((r) => ({ ...r, _k: `r${++keySeq}`, questions: withKeys(r.questions) })));
        setDirty(false);
        track(EVENTS.triviaPackFilled, { added, scope: round === undefined ? "all" : "round" });
      }
      if (added === 0) toast.info(short > 0 ? "The pack has nothing new for this yet. Add your own questions." : "Those rounds are already full.");
      else toast.success(`Added ${added} question${added === 1 ? "" : "s"} from the GameShuffle pack${short > 0 ? `. ${short} spot${short === 1 ? "" : "s"} left for your own` : ""}`);
    } finally { setFilling(null); }
  };

  const openRoom = async () => {
    if (total === 0) { toast.error("Add at least one question first."); return; }
    const empty = rounds.filter((r) => r.questions.length === 0).length;
    if (!(await confirm({
      title: onStream ? "Start it on your stream?" : "Open the room?",
      body: `${onStream ? "Your chat answers with !a and viewers can answer on your live page. " : ""}Teams can join with code ${game.code} once it's open. ${empty ? `${empty} empty round${empty === 1 ? "" : "s"} will be left out. ` : ""}Rounds and questions can't be changed after this.`,
      confirmLabel: onStream ? "Start on stream" : "Open the room",
    }))) return;
    if (dirty && !(await save(true))) return;
    const d = await fetch(`/api/trivia/games/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "go_live", stream: onStream }) }).then((r) => r.json()).catch(() => null);
    if (d?.ok) { track(EVENTS.triviaRoomOpened, { questions: total }); toast.success(onStream ? "You're live with trivia. Open the first question when you're ready." : `Room open. Code ${d.code}`); onLive(); }
    else toast.error(({
      no_questions: "Add at least one question first.",
      pro_required: "Playing trivia on stream is part of GS Pro.",
      no_twitch: "Connect Twitch first (Streaming > Setup) so your chat can play.",
      stream_busy: "Another trivia night is already on your stream. End it first.",
    } as Record<string, string>)[d?.error] ?? "Couldn't open the room.");
  };

  return (
    <div className="trivia-builder">
      <div className="trivia-card trivia-builder__head">
        <h1 className="trivia-h2">Build your night</h1>
        <Input fullWidth floatingLabel="Night name" value={title} maxLength={80} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} />
        <p className="trivia-muted">{template ? `${template.label} template · ` : ""}{total} question{total === 1 ? "" : "s"} · join code <strong>{game.code}</strong></p>
        <div className="trivia-row">
          <Button variant="secondary" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : dirty ? "Save" : "Saved"}</Button>
          <Button variant="secondary" disabled={saving || filling !== null || !anyEmpty} onClick={() => void fill()}>{filling === "all" ? "Filling…" : "Fill every round from the pack"}</Button>
          <Button variant="primary" disabled={saving} onClick={() => void openRoom()}>{onStream ? "Start on stream" : "Open the room"}</Button>
        </div>
        <Switch label="Play it on my stream: chat answers with !a, viewers on my live page too (GS Pro)" checked={onStream} onChange={(e) => setOnStream(e.target.checked)} />
      </div>

      {rounds.map((r, i) => {
        const target = roundTarget(template, i);
        return (
          <div key={r._k} className="trivia-card trivia-round">
            <div className="trivia-round__head">
              <span className="trivia-round__num">{i + 1}</span>
              <Input fullWidth floatingLabel="Round name" value={r.title} maxLength={60} onChange={(e) => update(i, { title: e.target.value })} />
              <Badge variant={r.questions.length >= target ? "success" : "default"} size="small">{r.questions.length}/{r.style === "final" ? 1 : target}</Badge>
            </div>
            <div className="trivia-form__row">
              <Select floatingLabel="Style" value={r.style} onChange={(v) => update(i, { style: String(v) as RoundStyle, jokerAllowed: String(v) === "final" ? false : r.jokerAllowed })}
                options={(Object.keys(STYLE_LABEL) as RoundStyle[]).map((s) => ({ value: s, label: STYLE_LABEL[s] }))} />
              <Select floatingLabel="Time per question" value={String(r.seconds)} onChange={(v) => update(i, { seconds: Number(v) })}
                options={SECONDS.map((s) => ({ value: String(s), label: `${s} seconds` }))} />
              {(r.style === "classic" || r.style === "picture") && (
                <Select floatingLabel="Points each" value={String(r.points)} onChange={(v) => update(i, { points: Number(v) })}
                  options={[1, 2, 3, 5].map((n) => ({ value: String(n), label: `${n} point${n === 1 ? "" : "s"}` }))} />
              )}
            </div>
            {r.style !== "final" && <Switch label="Teams can play their joker here (doubles the round)" checked={r.jokerAllowed} onChange={(e) => update(i, { jokerAllowed: e.target.checked })} />}
            <p className="trivia-muted">
              {r.style === "confidence" ? "Teams rank their answers: each number from 1 to the question count, once. A right answer earns its number."
                : r.style === "final" ? "One question. Teams bet 0 to 20 points (never more than they have) and win or lose the bet."
                : r.style === "picture" ? "Every phone shows the picture with the question." : "Typed answers, judged from each question's answer line."}
            </p>

            {r.questions.length > 0 && (
              <SortableList items={r.questions} getId={(q) => q._k} onReorder={(next) => update(i, { questions: next })} handleLabel={(q) => `Reorder ${q.prompt.slice(0, 40)}`}>
                {(q, handle, qi) => (
                  <div className="trivia-q">
                    {handle}
                    <span className="trivia-q__num">{qi + 1}</span>
                    <span className="trivia-q__text"><strong>{q.prompt}</strong><span className="trivia-muted"> · {q.answer}</span></span>
                    <IconAction label={`Remove question ${qi + 1}`} icon={IconTrash} variant="danger" onClick={() => update(i, { questions: r.questions.filter((x) => x._k !== q._k) })} />
                  </div>
                )}
              </SortableList>
            )}
            <div className="trivia-row">
              <Button variant="secondary" size="small" disabled={r.style === "final" && r.questions.length >= 1} onClick={() => setStudio(i)}>Add questions</Button>
              {r.questions.length < want(r, i) && <Button variant="secondary" size="small" disabled={saving || filling !== null} onClick={() => void fill(i)}>{filling === i ? "Filling…" : "Fill from the pack"}</Button>}
              <Button variant="ghost" size="small" onClick={() => { setRounds((rs) => rs.filter((_, j) => j !== i)); setDirty(true); }}>Remove round</Button>
            </div>
          </div>
        );
      })}

      <Button variant="secondary" disabled={rounds.length >= 10} onClick={() => { setRounds((rs) => [...rs, { title: `Round ${rs.length + 1}`, style: "classic", points: 1, seconds: 45, jokerAllowed: true, questions: [], _k: `r${++keySeq}` }]); setDirty(true); }}>Add a round</Button>

      {studio !== null && rounds[studio] && (
        <TriviaStudio isOpen onClose={() => setStudio(null)} roundTitle={rounds[studio].title} roundStyle={rounds[studio].style} inGame={inGame}
          onAdd={(q) => update(studio, { questions: [...rounds[studio].questions, ...withKeys([q])] })} />
      )}
    </div>
  );
}
