"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { COMMUNITY_SUBTYPES } from "@/data/community-sections";

const SUBTYPE_OPTIONS = COMMUNITY_SUBTYPES.map((s) => ({ value: s.value, label: s.label }));

/** Slugify a name the same way usernames are shaped (lowercase, a-z0-9-_). */
function toSlug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
}

const REASON_COPY: Record<string, string> = {
  slug_taken: "That URL is taken. Try another.",
  group_cap: "You've reached the community limit for now.",
  name_required: "Give your community a name.",
};

type Availability = "idle" | "checking" | "available" | "taken" | "invalid";

export function CreateGroupForm() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [avail, setAvail] = useState<Availability>("idle");
  const [subtype, setSubtype] = useState("family");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Debounced availability check; reveals the edit field if the auto URL is taken.
  const checkSlug = (s: string) => {
    if (typeof window !== "undefined") window.clearTimeout(debounceRef.current);
    if (s.length < 3) { setAvail(s.length === 0 ? "idle" : "invalid"); return; }
    setAvail("checking");
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/communities/availability?slug=${encodeURIComponent(s)}`);
        const j = await res.json().catch(() => null);
        if (j?.available) {
          setAvail("available");
        } else {
          setAvail(j?.reason === "slug_taken" ? "taken" : "invalid");
          if (j?.reason === "slug_taken") setEditingUrl(true); // push them to change it
        }
      } catch {
        setAvail("idle");
      }
    }, 400);
  };

  const onName = (v: string) => {
    setName(v);
    if (!slugEdited) { const s = toSlug(v); setSlug(s); checkSlug(s); }
  };

  const onSlug = (v: string) => {
    const s = toSlug(v);
    setSlug(s);
    setSlugEdited(true);
    checkSlug(s);
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) { setError("Give your community a name."); return; }
    if (slug.length < 3) { setError("Pick a URL of at least 3 characters."); return; }
    if (avail === "taken") { setError("That URL is taken. Try another."); setEditingUrl(true); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug, subtype }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        toast.success("Community created.");
        router.push(`/c/${j.slug}`);
      } else {
        setError(REASON_COPY[j?.error] ?? (typeof j?.error === "string" ? j.error : "Couldn't create the community."));
        if (j?.error === "slug_taken") { setAvail("taken"); setEditingUrl(true); }
        setBusy(false);
      }
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="account-card" style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-20)" }}>
      {error && <Alert variant="error">{error}</Alert>}

      <label className="hub-form__field">
        <span className="account-card__label">Name</span>
        <Input value={name} onChange={(e) => onName(e.target.value)} placeholder="The Smith Family Game Nights" maxLength={80} fullWidth />
      </label>

      <div className="hub-form__field">
        <span className="account-card__label">URL</span>
        {!editingUrl ? (
          <div className="community-url-preview">
            <span className="community-url-preview__value">
              gameshuffle.co/c/<strong>{slug || "your-community"}</strong>
            </span>
            <div className="community-url-preview__right">
              {slug.length >= 3 && <AvailabilityTag state={avail} />}
              <Button variant="ghost" size="small" onClick={() => setEditingUrl(true)} disabled={!slug}>Customize</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="community-url-edit">
              <span className="community-url-edit__prefix">gameshuffle.co/c/</span>
              <Input value={slug} onChange={(e) => onSlug(e.target.value)} placeholder="smith-game-nights" fullWidth />
            </div>
            <div className="community-url-edit__status">
              {slug.length >= 3 && <AvailabilityTag state={avail} />}
            </div>
          </>
        )}
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          {editingUrl ? "Lowercase letters, numbers, hyphens, underscores." : "Made from your name. Customize it if you'd like."}
        </span>
      </div>

      <label className="hub-form__field">
        <span className="account-card__label">Type</span>
        <Select options={SUBTYPE_OPTIONS} value={subtype} onChange={(v) => setSubtype((typeof v === "string" ? v : v[0] ?? "family"))} fullWidth />
        <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Sets sensible defaults; you can change what shows later.</span>
      </label>

      <div>
        <Button variant="primary" size="large" onClick={submit} disabled={busy || avail === "checking" || avail === "taken"}>
          {busy ? "Creating…" : "Create community"}
        </Button>
      </div>
    </div>
  );
}

function AvailabilityTag({ state }: { state: Availability }) {
  if (state === "checking") return <span className="community-avail community-avail--checking">Checking…</span>;
  if (state === "available") return <span className="community-avail community-avail--ok">✓ Available</span>;
  if (state === "taken") return <span className="community-avail community-avail--bad">✗ Taken, try another</span>;
  if (state === "invalid") return <span className="community-avail community-avail--bad">Not a valid URL</span>;
  return null;
}
