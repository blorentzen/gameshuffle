"use client";

/**
 * Share an entity (tournament / GS session) to your feed or a community feed.
 * A button + modal: pick a target (your feed or a joined community), add an
 * optional comment, and it posts a `share` card into that feed.
 */

import { useEffect, useState } from "react";
import { Button, Modal, Select } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { IconTrophy, IconDeviceGamepad2 } from "@tabler/icons-react";

interface MineCommunity { id: string; slug: string; name: string }

export function ShareToFeedButton({
  entityType,
  entityId,
  title,
  subtitle,
  url,
  size = "small",
  variant = "secondary",
  label = "Share",
}: {
  entityType: "tournament" | "session" | "board_game_night";
  entityId: string;
  title: string;
  subtitle?: string;
  url: string;
  size?: "small" | "medium" | "large";
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [communities, setCommunities] = useState<MineCommunity[]>([]);
  const [target, setTarget] = useState("feed"); // "feed" or a community id
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch("/api/communities/mine")
      .then((r) => (r.ok ? r.json() : { communities: [] }))
      .then((d) => { if (live) setCommunities((d.communities as MineCommunity[]) ?? []); })
      .catch(() => { if (live) setCommunities([]); });
    return () => { live = false; };
  }, [open]);

  if (!user) return null;

  const options = [
    { value: "feed", label: "Your feed" },
    ...communities.map((c) => ({ value: c.id, label: c.name })),
  ];

  const share = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: comment.trim() || `Check this out: ${title}`,
          kind: "share",
          communityId: target === "feed" ? null : target,
          meta: { entityType, entityId, title, subtitle, url },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        toast.success(target === "feed" ? "Shared to your feed." : "Shared to the community.");
        setOpen(false);
        setComment("");
        setTarget("feed");
      } else if (j.error === "not_a_member") {
        toast.error("Join that community first.");
      } else if (j.error === "rate_limited") {
        toast.error("You're posting too fast. Give it a sec.");
      } else {
        toast.error("Couldn't share. Try again.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(false);
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Share to a feed"
        size="small"
        primaryAction={{ label: busy ? "Sharing…" : "Share", onClick: share }}
        secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          <div style={{ padding: "0.7rem 0.9rem", borderRadius: "0.6rem", border: "1px solid var(--border-default)", background: "var(--surface-secondary, var(--surface-default))" }}>
            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-12)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>
              {entityType === "tournament" ? <><IconTrophy size={14} stroke={1.9} aria-hidden /> Tournament</> : <><IconDeviceGamepad2 size={14} stroke={1.9} aria-hidden /> Session</>}
            </span>
            <p style={{ margin: "var(--spacing-4) 0 0", fontWeight: 700 }}>{title}</p>
            {subtitle && <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>{subtitle}</p>}
          </div>
          <Select floatingLabel="Share to" options={options} value={target} onChange={(v) => setTarget(v as string)} fullWidth />
          <textarea
            className="save-setup-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Say something (optional)…"
            rows={3}
            style={{ resize: "vertical" }}
          />
        </div>
      </Modal>
    </>
  );
}
