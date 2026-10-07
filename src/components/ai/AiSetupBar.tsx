"use client";

/**
 * "Describe your night" on a randomizer: one line of plain language becomes
 * the randomizer's options (POST /api/ai/setup). The randomizer still does
 * the rolling. Free to try with an account (a daily allowance); signed-out
 * visitors see a button that asks them to make a free account first.
 */

import { useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { IconSparkles } from "@tabler/icons-react";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS } from "@/components/ai/errors";
import { AiGatePrompt, allowanceText } from "@/components/ai/AiGate";
import { useAiAccess } from "@/components/ai/useAiAccess";

export function AiSetupBar<T extends Record<string, unknown>>({ game, placeholder, onApply }: {
  game: "goldeneye-007" | "pokemon-stadium";
  placeholder: string;
  onApply: (options: T) => void;
}) {
  const { info, block, spent } = useAiAccess("setup");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async () => {
    if (block) { setGate(true); return; }
    if (text.trim().length < 3) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/ai/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, text }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; options?: T & { summary?: string }; error?: string; remaining?: number | null };
      spent(data.remaining);
      if (!res.ok || !data.ok || !data.options) {
        if (data.error === "daily_used" || data.error === "unauthenticated") { setGate(true); return; }
        setNote({ ok: false, text: AI_ERRORS[data.error ?? ""] ?? "That didn't work. Try saying it another way." });
        return;
      }
      onApply(data.options);
      setNote({ ok: true, text: String(data.options.summary ?? "Done.") });
      track(EVENTS.aiSetupApplied, { game });
    } catch {
      setNote({ ok: false, text: "Couldn't reach GameShuffle. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

  const allowance = allowanceText(info);

  return (
    <div className="ai-setup">
      {block === "signin" ? (
        <div className="ai-setup__row ai-setup__row--ask">
          <p className="ai-setup__pitch">Say what kind of night you want and AI sets the options. Free with an account.</p>
          <Button variant="secondary" iconBefore={IconSparkles} onClick={() => setGate(true)}>Describe your night</Button>
        </div>
      ) : (
        <form className="ai-setup__row" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <Input fullWidth floatingLabel="Describe your night (optional)" placeholder={placeholder} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="secondary" iconBefore={IconSparkles} loading={busy} disabled={!block && text.trim().length < 3}>Set it up</Button>
        </form>
      )}
      {note ? (
        <p className={`ai-setup__note${note.ok ? "" : " is-error"}`} role="status">{note.text}{allowance && note.ok ? ` ${allowance}.` : ""}</p>
      ) : allowance ? (
        <p className="ai-setup__note">{allowance}</p>
      ) : null}
      {info && block && <AiGatePrompt info={info} block={block} isOpen={gate} onClose={() => setGate(false)} />}
    </div>
  );
}
