"use client";

/**
 * Play together: type the code from the other phone to join its game (the
 * same-table way in; far apart, the link does it). Opens the companion on
 * `?play=CODE`, where the join card takes over.
 */

import { useId, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { CODE_LENGTH, normalizeCode } from "@/lib/companion/liveRules";
import { useLiveReady } from "@/lib/companion/useLiveReady";

export function JoinByCode({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const ready = useLiveReady();
  const [raw, setRaw] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeCode(raw);
    if (!code) {
      setProblem(`Codes are ${CODE_LENGTH} letters and numbers, like KQ7 M3P.`);
      return;
    }
    window.location.assign(`/tcg-companion?play=${code}`);
  };

  if (!ready) return null;

  return (
    <form className={`companion-joincode${compact ? " companion-joincode--compact" : ""}`} onSubmit={submit}>
      <label className="companion-joincode__label" htmlFor={id}>Have a code? Join a game</label>
      <div className="companion-joincode__row">
        <Input
          id={id}
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value.toUpperCase());
            setProblem(null);
          }}
          placeholder="KQ7 M3P"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          aria-describedby={problem ? `${id}-problem` : undefined}
          error={!!problem}
          size="small"
        />
        <Button type="submit" variant="secondary" size="small" disabled={!raw.trim()}>
          Join
        </Button>
      </div>
      {problem && <p id={`${id}-problem`} className="companion-joincode__problem">{problem}</p>}
    </form>
  );
}
