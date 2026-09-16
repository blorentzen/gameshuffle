"use client";

import { useEffect, useState } from "react";
import { Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

/**
 * Post a night to one of the host's communities (or none). The community page
 * lists its upcoming nights. Degrades: shows a note if the feature isn't
 * migrated yet, or if the host has no communities.
 */

const ERR: Record<string, string> = {
  migration_pending: "Posting nights to a community isn't enabled yet.",
  not_a_member: "You can only post to a community you belong to.",
};

export function NightCommunityPicker({ nightId, initialCommunityId }: { nightId: string; initialCommunityId?: string | null }) {
  const toast = useToast();
  const [options, setOptions] = useState<{ id: string; name: string }[] | null>(null);
  const [value, setValue] = useState<string>(initialCommunityId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/communities/mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled) setOptions(Array.isArray(j?.communities) ? j.communities : []); })
      .catch(() => { if (!cancelled) setOptions([]); });
    return () => { cancelled = true; };
  }, []);

  const save = async (next: string) => {
    const prev = value;
    setValue(next); // optimistic
    setSaving(true);
    try {
      const res = await fetch(`/api/board-game-nights/${nightId}/community`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: next || null }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        toast.success(next ? "Posted to community." : "Removed from community.");
      } else {
        setValue(prev);
        toast.error(ERR[j?.error] ?? "Couldn't update. Try again.");
      }
    } catch {
      setValue(prev);
      toast.error("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  };

  // Nothing to offer — hide the card rather than show an empty picker.
  if (options !== null && options.length === 0) return null;

  return (
    <div className="account-card">
      <h2 className="bgn-event-h2">Post to a community</h2>
      <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", margin: "0 0 var(--spacing-16)" }}>
        Show this night on one of your communities&rsquo; pages so members can find and RSVP.
      </p>
      <Select
        value={value}
        onChange={(v) => save(typeof v === "string" ? v : (v[0] ?? ""))}
        disabled={saving || options === null}
        fullWidth
        aria-label="Community to post this night to"
        options={[
          { value: "", label: "Not posted to a community" },
          ...(options ?? []).map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
    </div>
  );
}
