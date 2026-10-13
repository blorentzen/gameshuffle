"use client";

/**
 * "Save to my decks" on a deck guide page: copies the guide's list into
 * My Stuff ▸ My Collection ▸ Deck lists, where it's checked against Standard,
 * matched against My Cards and playable in the companion. Signed out, it's a
 * sign-in link that comes back here.
 */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBookmarkPlus, IconCheck } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";

export function SaveGuideDeck({ slug, size = "large" }: { slug: string; size?: "small" | "medium" | "large" }) {
  const { user, loading } = useAuth();
  const toast = useToast();
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const here = `/pokemon-tcg/decks/${slug}`;

  if (loading) return null;
  if (!user) {
    return (
      <Link href={`/login?redirect=${encodeURIComponent(here)}`} className="deck-save">
        <Button variant="secondary" size={size} iconBefore={IconBookmarkPlus}>Sign in to save this deck</Button>
      </Link>
    );
  }
  if (saved) {
    return (
      <Link href="/account/stuff?tab=tcg-decks" className="deck-save">
        <Button variant="secondary" size={size} iconBefore={IconCheck}>Saved: see my decks</Button>
      </Link>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/tcg/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ guide: slug }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.toast({ variant: "warning", message: body.message ?? "That didn't save. Try again." }); return; }
      setSaved(body.deck.id);
      toast.toast({ variant: "success", message: "Saved to My Collection ▸ Deck lists." });
    } catch {
      toast.toast({ variant: "warning", message: "That didn't save. Check your connection." });
    } finally { setBusy(false); }
  };

  return (
    <Button variant="secondary" size={size} iconBefore={IconBookmarkPlus} onClick={save} loading={busy} disabled={busy}>
      Save to my decks
    </Button>
  );
}
