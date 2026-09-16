"use client";

import { useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

/** Save this night's setup as a reusable template (host, on the manage page). */
export function SaveTemplateButton({ nightId }: { nightId: string }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/board-game-nights/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromNightId: nightId }),
    }).catch(() => null);
    setSaving(false);
    if (res && res.ok) toast.success("You can start a new night from it any time.", { title: "Saved as a template" });
    else toast.error("Couldn't save the template. Try again.");
  };

  return (
    <Button variant="secondary" size="small" onClick={save} disabled={saving}>
      {saving ? "Saving…" : "Save as template"}
    </Button>
  );
}
