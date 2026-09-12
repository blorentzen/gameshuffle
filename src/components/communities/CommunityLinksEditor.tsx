"use client";

/**
 * Owner-only editor for a community's creator links ("where to find us").
 * A button that opens a modal of platform + URL rows; saves via PATCH.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, Select, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { COMMUNITY_LINK_PLATFORMS, type CommunityLink } from "@/data/community-links";

const OPTIONS = COMMUNITY_LINK_PLATFORMS.map((p) => ({ value: p.key, label: p.label }));
const placeholderFor = (key: string) => COMMUNITY_LINK_PLATFORMS.find((p) => p.key === key)?.placeholder ?? "https://";

export function CommunityLinksEditor({ communityId, initialLinks }: { communityId: string; initialLinks: CommunityLink[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<CommunityLink[]>(initialLinks.length ? initialLinks : []);
  const [saving, setSaving] = useState(false);

  const addRow = () => {
    const used = new Set(rows.map((r) => r.platform));
    const next = COMMUNITY_LINK_PLATFORMS.find((p) => !used.has(p.key))?.key ?? COMMUNITY_LINK_PLATFORMS[0].key;
    setRows((r) => [...r, { platform: next, url: "" }]);
  };
  const setRow = (i: number, patch: Partial<CommunityLink>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const links = rows.filter((r) => r.url.trim());
      const res = await fetch(`/api/communities/${communityId}/links`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        toast.success("Links updated.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error("Couldn't save links.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setSaving(false);
  };

  return (
    <>
      <Button variant="secondary" size="small" onClick={() => setOpen(true)}>Manage links</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Where to find your community"
        size="medium"
        primaryAction={{ label: saving ? "Saving…" : "Save", onClick: save }}
        secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
            Add the places you go live and where your community hangs out. These show on your public community page.
          </p>
          {rows.length === 0 && <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>No links yet.</p>}
          {rows.map((row, i) => (
            <div key={i} style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ width: 150, flex: "0 0 auto" }}>
                <Select options={OPTIONS} value={row.platform} onChange={(v) => setRow(i, { platform: v as string })} fullWidth />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Input type="url" value={row.url} placeholder={placeholderFor(row.platform)} onChange={(e) => setRow(i, { url: e.target.value })} />
              </div>
              <Button variant="ghost" size="small" onClick={() => removeRow(i)}>Remove</Button>
            </div>
          ))}
          <div>
            <Button variant="secondary" size="small" onClick={addRow} disabled={rows.length >= COMMUNITY_LINK_PLATFORMS.length}>+ Add link</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
