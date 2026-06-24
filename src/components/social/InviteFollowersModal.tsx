"use client";

/**
 * Invite people you follow to a session or tournament. Drop-in modal: pass
 * the target { kind, targetId, targetName, link } and it sends actionable
 * invite notifications to the selected users via /api/invitations.
 */

import { useEffect, useState } from "react";
import { Modal } from "@empac/cascadeds";
import { FriendTile } from "@/components/social/FriendTile";
import type { FriendProfile } from "@/lib/social/topFriends";

export function InviteFollowersModal({
  kind,
  targetId,
  targetName,
  link,
  onClose,
}: {
  kind: "session" | "tournament";
  targetId: string;
  targetName: string;
  link?: string | null;
  onClose: () => void;
}) {
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/account/top-friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) setFollowing((b.following as FriendProfile[]) ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function send() {
    if (!selected.length) return;
    setSending(true);
    try {
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, targetId, targetName, link: link ?? null, inviteeIds: selected }),
      });
      const b = (await res.json().catch(() => ({}))) as { sent?: number };
      if (res.ok) setSent(b.sent ?? selected.length);
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Invite to ${targetName}`}
      size="medium"
      primaryAction={
        sent === null
          ? { label: sending ? "Sending…" : `Invite${selected.length ? ` (${selected.length})` : ""}`, onClick: () => void send() }
          : undefined
      }
      secondaryAction={{ label: sent === null ? "Cancel" : "Done", onClick: onClose }}
    >
      {sent !== null ? (
        <p style={{ color: "var(--text-secondary)" }}>
          Sent {sent} invite{sent === 1 ? "" : "s"}. 🎉
        </p>
      ) : loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : following.length === 0 ? (
        <p style={{ color: "var(--text-secondary)" }}>Follow people to invite them here.</p>
      ) : (
        <div className="friend-grid">
          {following.map((f) => {
            const on = selected.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                className={`tf-add${on ? " tf-add--on" : ""}`}
                onClick={() => toggle(f.id)}
              >
                <FriendTile friend={f} size={48} linked={false} />
                {on ? <span className="tf-add__plus">✓</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
