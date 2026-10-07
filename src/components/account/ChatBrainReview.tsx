"use client";

/**
 * Platform ▸ Chat Brain ▸ Review and publish. Pick a prompt; its answers arrive
 * grouped by spelling. Apply the spelling merges, ask Claude to group by
 * meaning, then fix anything by hand: rename, merge (tick and merge), split (tap
 * an alias off a group), hide. The board preview updates as you go, using the
 * same rules as the published board. Publish freezes it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Checkbox, Chip, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { buildBoard, type BoardAnswer } from "@/lib/chatbrain/rules";
import { LoadingLines } from "@/components/loading/LoadingLines";

interface Prompt { id: string; text: string; status: string; answers: number; minAnswers: number }
interface Group { id: string; label: string; keys: string[]; hidden: boolean }
interface Loaded { total: number; counts: Record<string, number>; samples: Record<string, string[]>; suggestions: { into: string; from: string }[]; published: { answers: BoardAnswer[]; publishedAt: string } | null; text: string }

let seq = 0;
const nid = () => `g${++seq}`;

export function ChatBrainReview({ prompts, onPublished }: { prompts: Prompt[]; onPublished: () => void }) {
  const toast = useToast();
  const [promptId, setPromptId] = useState<string | null>(prompts[0]?.id ?? null);
  const [data, setData] = useState<Loaded | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setData(null);
    const j = await fetch(`/api/admin/chat-brain/review?id=${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) { toast.error("Couldn't load that prompt."); return; }
    const counts: Record<string, number> = {}, samples: Record<string, string[]> = {};
    for (const g of j.groups as { key: string; count: number; samples: string[] }[]) { counts[g.key] = g.count; samples[g.key] = g.samples; }
    setData({ total: j.total, counts, samples, suggestions: j.suggestions, published: j.published, text: j.prompt.text });
    setGroups((j.groups as { key: string; label: string }[]).map((g) => ({ id: nid(), label: g.label, keys: [g.key], hidden: false })));
    setPicked([]);
  }, [toast]);
  useEffect(() => { if (promptId) void load(promptId); }, [promptId, load]);

  const countOf = useCallback((g: Group) => g.keys.reduce((n, k) => n + (data?.counts[k] ?? 0), 0), [data]);
  const sorted = useMemo(() => [...groups].sort((a, b) => countOf(b) - countOf(a)), [groups, countOf]);
  const preview = useMemo(() => (data ? buildBoard(groups.map((g) => ({ label: g.label, aliases: g.keys, count: countOf(g), hidden: g.hidden })), data.total) : []), [groups, data, countOf]);

  const mergeInto = (ids: string[]) => {
    const chosen = groups.filter((g) => ids.includes(g.id));
    if (chosen.length < 2) return;
    const keep = chosen.sort((a, b) => countOf(b) - countOf(a))[0];
    setGroups((cur) => cur.filter((g) => !ids.includes(g.id) || g.id === keep.id).map((g) => (g.id === keep.id ? { ...g, keys: chosen.flatMap((c) => c.keys) } : g)));
    setPicked([]);
  };
  const split = (g: Group, key: string) => {
    if (g.keys.length < 2) return;
    setGroups((cur) => [...cur.map((x) => (x.id === g.id ? { ...x, keys: x.keys.filter((k) => k !== key) } : x)), { id: nid(), label: data?.samples[key]?.[0] ?? key, keys: [key], hidden: false }]);
  };
  const applySpelling = () => {
    if (!data) return;
    let next = groups;
    for (const s of data.suggestions) {
      const into = next.find((g) => g.keys.includes(s.into)), from = next.find((g) => g.keys.includes(s.from));
      if (into && from && into.id !== from.id) next = next.filter((g) => g.id !== from.id).map((g) => (g.id === into.id ? { ...g, keys: [...g.keys, ...from.keys] } : g));
    }
    setGroups(next);
    toast.success(`Applied ${data.suggestions.length} spelling merge${data.suggestions.length === 1 ? "" : "s"}`);
  };
  const askClaude = async () => {
    if (!promptId) return;
    setBusy("ai");
    try {
      const j = await fetch("/api/admin/chat-brain/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ai", id: promptId }) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "not_configured" ? "The Anthropic key isn't set up here." : "Claude couldn't group these. Try again."); return; }
      setGroups((j.groups as { label: string; keys: string[] }[]).map((g) => ({ id: nid(), label: g.label, keys: g.keys, hidden: false })));
      toast.success("Claude's grouping applied. Check it before publishing.");
    } finally { setBusy(null); }
  };
  const publish = async () => {
    if (!promptId) return;
    setBusy("publish");
    try {
      const j = await fetch("/api/admin/chat-brain/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", id: promptId, groups: groups.map((g) => ({ label: g.label, keys: g.keys, hidden: g.hidden })) }) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "not_enough" ? "Not enough answers for a board yet (at least 3 answers given by 2 or more people)." : "Couldn't publish."); return; }
      toast.success("Board published");
      onPublished();
      void load(promptId);
    } finally { setBusy(null); }
  };

  if (!prompts.length) return <p className="dbot-muted">Nothing waiting for review. Send a prompt here from Collecting once it has enough answers.</p>;

  return (
    <div className="brain-review">
      <div className="brain-review__pick" role="group" aria-label="Prompts to review">
        {prompts.map((p) => <Chip key={p.id} label={`${p.text.slice(0, 48)}${p.text.length > 48 ? "…" : ""} · ${p.answers}`} clickable selected={p.id === promptId} onClick={() => setPromptId(p.id)} />)}
      </div>

      {!data ? <LoadingLines label="Loading answers" /> : (
        <>
          <h3 className="brain-review__q">{data.text}</h3>
          <p className="dbot-muted">{data.total} answers in {groups.length} groups.{data.published ? ` Published ${new Date(data.published.publishedAt).toLocaleDateString()}; publishing again replaces the board.` : ""}</p>

          <div className="party-row">
            <Button size="small" variant="secondary" disabled={!data.suggestions.length} onClick={applySpelling}>Apply {data.suggestions.length} spelling merges</Button>
            <Button size="small" variant="secondary" disabled={busy === "ai"} onClick={() => void askClaude()}>{busy === "ai" ? "Claude is grouping…" : "Ask Claude to group by meaning"}</Button>
            <Button size="small" variant="secondary" disabled={picked.length < 2} onClick={() => mergeInto(picked)}>Merge {picked.length || ""} selected</Button>
          </div>

          <div className="brain-review__cols">
            <ul className="brain-review__groups">
              {sorted.map((g) => (
                <li key={g.id} className={`brain-review__group${g.hidden ? " is-hidden" : ""}`}>
                  <div className="brain-review__grow">
                    <Checkbox checked={picked.includes(g.id)} onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, g.id] : cur.filter((x) => x !== g.id)))} aria-label={`Select ${g.label}`} />
                    <Input value={g.label} maxLength={60} aria-label="Group label" onChange={(e) => setGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, label: e.target.value } : x)))} />
                    <Badge variant="info" size="small">{countOf(g)}</Badge>
                    <Switch size="small" label="Hide" checked={g.hidden} onChange={(e) => setGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, hidden: e.target.checked } : x)))} />
                  </div>
                  <div className="brain-review__keys">
                    {g.keys.map((k) => (
                      <Chip key={k} size="small" label={`${data.samples[k]?.[0] ?? k} · ${data.counts[k] ?? 0}`} removable={g.keys.length > 1} onRemove={() => split(g, k)} title={(data.samples[k] ?? []).join(", ")} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>

            <aside className="brain-review__preview">
              <h4>Board preview</h4>
              {preview.length === 0 ? (
                <Alert variant="warning" title="No board yet">A board needs at least 3 answers that 2 or more people gave.</Alert>
              ) : (
                <ol>{preview.map((b) => <li key={b.rank}><span>{b.label}</span><strong>{b.points}</strong></li>)}</ol>
              )}
              <Button variant="primary" fullWidth disabled={!preview.length || busy === "publish"} onClick={() => void publish()}>{busy === "publish" ? "Publishing…" : data.published ? "Publish again" : "Publish board"}</Button>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
