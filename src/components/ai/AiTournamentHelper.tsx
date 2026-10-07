"use client";

/**
 * "Draft it with AI" on the tournament create form: from how many players and
 * how long you have, suggest a format and draft the description, rules and an
 * announcement. Each piece has its own Use button; the organizer still edits
 * the form and creates the tournament as usual. Free with a daily cap while
 * Circuit is in preview (POST /api/ai/tournament).
 */

import { useState } from "react";
import { Button, Card, Input, Select, Textarea } from "@empac/cascadeds";
import { IconCopy, IconSparkles } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS } from "@/components/ai/errors";
import { AiGatePrompt, allowanceText } from "@/components/ai/AiGate";
import { useAiAccess } from "@/components/ai/useAiAccess";

interface Draft { format: string; formatWhy: string; description: string; rules: string; announcement: string }

const TIMES = [{ value: "60", label: "About an hour" }, { value: "120", label: "About 2 hours" }, { value: "180", label: "About 3 hours" }, { value: "300", label: "Most of a day" }];

export function AiTournamentHelper({ game, allowHeat, formatLabel, onUse }: {
  /** The game's name as players know it. */
  game: string;
  allowHeat: boolean;
  formatLabel: (value: string) => string;
  onUse: (part: { format?: string; description?: string; rules?: string }) => void;
}) {
  const toast = useToast();
  const { info, block, spent } = useAiAccess("tournament");
  const [gate, setGate] = useState(false);
  const [players, setPlayers] = useState("16");
  const [minutes, setMinutes] = useState("120");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const ask = async () => {
    if (block) { setGate(true); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/tournament", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, players: Number(players), minutes: Number(minutes), notes, allowHeat }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; draft?: Draft; error?: string; remaining?: number | null };
      spent(data.remaining);
      if (data.error === "daily_used" || data.error === "unauthenticated") { setGate(true); return; }
      if (!res.ok || !data.ok || !data.draft) { setError(AI_ERRORS[data.error ?? ""] ?? "That didn't work. Try again in a moment."); return; }
      setDraft(data.draft);
      track(EVENTS.aiTournamentDrafted, { game, players: Number(players) });
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const use = (part: Parameters<typeof onUse>[0], what: string) => { onUse(part); toast.success(`${what} added to the form`); };

  return (
    <Card variant="outlined" padding="medium" className="ai-tourney">
      <div className="ai-tourney__head">
        <h2 className="ai-tourney__title"><IconSparkles size={18} aria-hidden /> Draft it with AI</h2>
        <p className="ai-pack__hint">Not sure how to run it? Tell us roughly how many are coming and how long you have.</p>
      </div>
      <div className="ai-tourney__ask">
        <Input fullWidth type="number" floatingLabel="Players" min={2} max={256} value={players} onChange={(e) => setPlayers(e.target.value)} />
        <Select floatingLabel="Time" value={minutes} onChange={(v) => setMinutes(String(v))} options={TIMES} />
        <Input fullWidth floatingLabel="Anything else? (optional)" placeholder="Casual, some first-timers, on stream" value={notes} maxLength={400} onChange={(e) => setNotes(e.target.value)} />
        <Button variant="secondary" iconBefore={IconSparkles} loading={busy} onClick={() => void ask()}>{draft ? "Draft again" : "Draft it"}</Button>
      </div>
      {error ? <p className="ai-setup__note is-error" role="status">{error}</p> : allowanceText(info) ? <p className="ai-setup__note">{allowanceText(info)}</p> : null}
      {info && block && <AiGatePrompt info={info} block={block} isOpen={gate} onClose={() => setGate(false)} />}

      {draft && (
        <div className="ai-tourney__draft">
          <div className="ai-tourney__part">
            <p><strong>Format: {formatLabel(draft.format)}.</strong> {draft.formatWhy}</p>
            <Button size="small" variant="secondary" onClick={() => use({ format: draft.format }, "Format")}>Use this format</Button>
          </div>
          <div className="ai-tourney__part">
            <Textarea fullWidth floatingLabel="Description" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <Button size="small" variant="secondary" onClick={() => use({ description: draft.description }, "Description")}>Use this description</Button>
          </div>
          <div className="ai-tourney__part">
            <Textarea fullWidth floatingLabel="Rules" rows={7} value={draft.rules} onChange={(e) => setDraft({ ...draft, rules: e.target.value })} />
            <Button size="small" variant="secondary" onClick={() => use({ rules: draft.rules }, "Rules")}>Use these rules</Button>
          </div>
          <div className="ai-tourney__part">
            <Textarea fullWidth floatingLabel="Announcement (for Discord or social)" rows={4} value={draft.announcement} onChange={(e) => setDraft({ ...draft, announcement: e.target.value })} />
            <Button size="small" variant="secondary" iconBefore={IconCopy} onClick={() => navigator.clipboard.writeText(draft.announcement).then(() => toast.success("Announcement copied"), () => toast.error("Couldn't copy that"))}>Copy</Button>
          </div>
          <span className="party-row">
            <Button variant="primary" size="small" onClick={() => use({ format: draft.format, description: draft.description, rules: draft.rules }, "Format, description and rules")}>Use all three</Button>
          </span>
          <p className="ai-pack__note">Drafted by AI. Fill in the [placeholders] and read it over before you create the tournament.</p>
        </div>
      )}
    </Card>
  );
}
