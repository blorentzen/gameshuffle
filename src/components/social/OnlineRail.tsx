"use client";

/**
 * "Who's online" chat rail — the online people you follow, each a one-tap
 * Message that opens (or starts) a DM and jumps to the Comms Center. The
 * social-home sidebar.
 */

import { useState } from "react";
import Link from "next/link";
import { Card } from "@empac/cascadeds";
import { UserAvatar, type AvatarSource } from "@/components/UserAvatar";
import { useMessenger } from "@/components/social/MessengerProvider";
import { useToast } from "@/components/toast/ToastProvider";
import type { OnlineConnection } from "@/lib/social/follows";
import { IconMessageCircle } from "@tabler/icons-react";

export function OnlineRail({ people }: { people: OnlineConnection[] }) {
  const { openConversation } = useMessenger();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  // Click a person → pop the floating chat window (Messenger), not the hub.
  const message = async (userId: string) => {
    setBusy(userId);
    try {
      const res = await fetch("/api/messages/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: userId }),
      });
      const b = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (res.ok && b.id) openConversation(b.id);
      else if (b.error === "not_mutual") toast.error("You can message each other once you both follow.");
      else toast.error("Couldn't open the chat. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card padding="large">
      <h2 style={{ fontSize: "var(--font-size-16)", fontWeight: 700, margin: "0 0 var(--spacing-12)", display: "flex", alignItems: "center", gap: "var(--spacing-6)" }}>
        Online now
        <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {people.length}</span>
      </h2>
      {people.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          Nobody you follow is online right now. <Link href="/players" style={{ color: "var(--bg-primary, var(--primary-600))" }}>Find players →</Link>
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-4)" }}>
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => message(p.id)}
                disabled={busy === p.id}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: "var(--spacing-8)", padding: "var(--spacing-6) var(--spacing-8)", borderRadius: "0.5rem", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", font: "inherit" }}
              >
                <span style={{ position: "relative", display: "inline-flex", flex: "0 0 auto" }}>
                  <UserAvatar
                    user={{
                      id: p.id,
                      avatar_source: (p.avatarSource as AvatarSource | null) ?? "dicebear",
                      avatar_seed: p.avatarSeed,
                      avatar_options: p.avatarOptions as Record<string, string> | null,
                      discord_avatar: p.discordAvatar,
                      twitch_avatar: p.twitchAvatar,
                    }}
                    size={30}
                    alt={p.name}
                  />
                  <span style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", background: "#22c55e", border: "2px solid var(--surface-default)" }} />
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--font-size-14)", fontWeight: 600, color: p.nameColor ?? undefined }}>{p.name}</span>
                <span aria-hidden style={{ color: "var(--text-tertiary)", display: "inline-flex" }}>{busy === p.id ? "…" : <IconMessageCircle size={16} stroke={1.9} />}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
