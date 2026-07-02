"use client";

/**
 * Built-in command reference — the full command catalog (token economy +
 * events included), grouped by family, fetched from the registry-driven
 * /api/commands/reference. Lives at the bottom of the Chat Commands tab so
 * streamers can discover every command without leaving account settings.
 */

import { useEffect, useState } from "react";
import { Accordion } from "@empac/cascadeds";
import type { CommandReferenceEntry } from "@/lib/twitch/commands/reference";

// Economy-forward order — surfacing the token/market/event commands is the
// whole point of this reference.
const FAMILY_META: { key: string; label: string }[] = [
  { key: "tokens", label: "Tokens" },
  { key: "market", label: "Markets & bounties" },
  { key: "community", label: "Community & events" },
  { key: "play", label: "Play & lobby" },
  { key: "race", label: "Randomizer" },
  { key: "picks", label: "Picks & bans" },
  { key: "mod", label: "Moderation" },
  { key: "core", label: "Core" },
  { key: "commands_admin", label: "Command admin" },
];

const AUTH_LABEL: Record<string, string> = {
  viewer: "Viewer",
  mod: "Mod",
  host: "Streamer",
};

export function CommandReference() {
  const [commands, setCommands] = useState<CommandReferenceEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/commands/reference", { cache: "no-store" });
        if (!res.ok) return;
        const b = (await res.json()) as { commands?: CommandReferenceEntry[] };
        if (!cancelled) setCommands(b.commands ?? []);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byFamily = new Map<string, CommandReferenceEntry[]>();
  for (const c of commands) {
    const arr = byFamily.get(c.family) ?? [];
    arr.push(c);
    byFamily.set(c.family, arr);
  }

  const items = FAMILY_META.filter((f) => (byFamily.get(f.key)?.length ?? 0) > 0).map((f) => {
    const rows = byFamily.get(f.key) ?? [];
    return {
      id: f.key,
      title: f.label,
      description: `${rows.length} command${rows.length === 1 ? "" : "s"}`,
      content: (
        <ul className="cmd-ref__list">
          {rows.map((c) => (
            <li key={c.name} className="cmd-ref__row">
              <code className="cmd-ref__trigger">{c.usage || c.trigger}</code>
              <span className={`cmd-ref__auth cmd-ref__auth--${c.authority}`}>
                {AUTH_LABEL[c.authority] ?? c.authority}
              </span>
              <span className="cmd-ref__desc">{c.summary}</span>
            </li>
          ))}
        </ul>
      ),
    };
  });

  return (
    <div className="account-card cmd-ref">
      <h2 className="account-tab__heading">Built-in command reference</h2>
      <p className="account-tab__intro">
        Every command GameShuffle ships — including the <strong>token economy</strong>{" "}
        (<code>!gs award</code>, <code>!gs bounty</code>, <code>!bet</code>,{" "}
        <code>!tokens</code>) and <strong>events</strong> (<code>!chaos</code>,{" "}
        <code>!random</code>). Customize flavor text in the sections above; these
        are the built-ins, grouped by area.
      </p>

      {!loaded ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <Accordion variant="bordered" allowMultiple defaultOpenIds={["tokens"]} items={items} />
      )}
    </div>
  );
}
