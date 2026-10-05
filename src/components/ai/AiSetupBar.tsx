"use client";

/**
 * "Describe your night" on a randomizer: one line of plain language becomes
 * the randomizer's options (POST /api/ai/setup). The randomizer still does
 * the rolling. Free with a daily cap for signed-in accounts.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@empac/cascadeds";
import { IconSparkles } from "@tabler/icons-react";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS } from "@/components/ai/errors";

export function AiSetupBar<T extends Record<string, unknown>>({ game, placeholder, onApply }: {
  game: "goldeneye-007" | "pokemon-stadium";
  placeholder: string;
  onApply: (options: T) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string; signIn?: boolean; pro?: boolean } | null>(null);

  const submit = async () => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/ai/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game, text }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; options?: T & { summary?: string }; error?: string };
      if (!res.ok || !data.ok || !data.options) {
        setNote({ ok: false, text: AI_ERRORS[data.error ?? ""] ?? "That didn't work. Try saying it another way.", signIn: data.error === "unauthenticated", pro: data.error === "daily_used" });
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

  return (
    <div className="ai-setup">
      <form className="ai-setup__row" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Input floatingLabel="Describe your night (optional)" placeholder={placeholder} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="secondary" iconBefore={IconSparkles} loading={busy} disabled={text.trim().length < 3}>Set it up</Button>
      </form>
      {note && (
        <p className={`ai-setup__note${note.ok ? "" : " is-error"}`} role="status">
          {note.text}
          {note.signIn && <> <Link href="/login">Sign in</Link></>}
          {note.pro && <> <Link href="/gs-pro?from=ai-setup">See GS Pro</Link></>}
        </p>
      )}
    </div>
  );
}
