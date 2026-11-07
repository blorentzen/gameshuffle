"use client";

/**
 * The owner's "Choose" on their profile's Highlights (context + rooms picks 2026-11-05, 7A): tick up to five in the
 * order you want them, or go back to the automatic ones. Saves through /api/account/profile-layout (PATCH highlights).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Modal } from "@empac/cascadeds";
import { IconPinned } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { MAX_HIGHLIGHTS } from "@/lib/profile/layout";

export function HighlightsPicker({ options, pinned }: { options: { id: string; label: string }[]; pinned: string[] | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => pinned ?? options.slice(0, MAX_HIGHLIGHTS).map((o) => o.id));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string, on: boolean) => setPicked((p) => (on ? (p.length < MAX_HIGHLIGHTS ? [...p, id] : p) : p.filter((x) => x !== id)));

  async function save(highlights: string[] | null) {
    setSaving(true);
    const r = await fetch("/api/account/profile-layout", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ highlights }) }).catch(() => null);
    setSaving(false);
    if (!r?.ok) { toast.error("That didn't save. Try again."); return; }
    toast.success(highlights ? "Highlights pinned" : "Back to automatic highlights");
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="small" iconBefore={IconPinned} onClick={() => setOpen(true)}>{pinned ? "Change" : "Pin yours"}</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Your highlights"
        size="small"
        className="pf-hl-pick"
        footer={(
          <div className="pf-hl-pick__foot">
            {pinned && <Button variant="ghost" onClick={() => void save(null)} disabled={saving}>Use automatic</Button>}
            <Button variant="primary" onClick={() => void save(picked)} disabled={saving || picked.length === 0}>Pin {picked.length}</Button>
          </div>
        )}
      >
        <p className="pf-hl-pick__note">Pick up to {MAX_HIGHLIGHTS}. They show in the order you tick them.</p>
        <ul className="pf-hl-pick__list">
          {options.map((o) => {
            const at = picked.indexOf(o.id);
            return (
              <li key={o.id}>
                <Checkbox
                  label={at >= 0 ? `${at + 1}. ${o.label}` : o.label}
                  checked={at >= 0}
                  disabled={at < 0 && picked.length >= MAX_HIGHLIGHTS}
                  onChange={(e) => toggle(o.id, e.target.checked)}
                />
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
