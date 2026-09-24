"use client";

/**
 * Links & spotlight editor (Brand & Theme tab) — a Linktree-style set of link
 * buttons and a single Twitch/YouTube spotlight embed for /u. Autosaves through
 * /api/account/profile-links, which re-validates everything (https-only links, a
 * parsed spotlight id/slug/name — never a raw embed URL).
 */

import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Icon, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { createClient } from "@/lib/supabase/client";
import { SOCIAL_PLATFORMS, socialUrl, type Socials } from "@/data/socials-types";
import {
  MAX_LINKS,
  safeLinkUrl,
  parseSpotlightInput,
  resolveProfileLinks,
  resolveProfileSpotlight,
  type ProfileLink,
  type SpotlightKind,
} from "@/lib/profile/links";

const SPOTLIGHT_KINDS: { value: SpotlightKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "youtube", label: "YouTube" },
  { value: "twitch_channel", label: "Twitch channel" },
  { value: "twitch_clip", label: "Twitch clip" },
];

const PLACEHOLDER: Record<SpotlightKind, string> = {
  none: "",
  youtube: "YouTube video URL or id",
  twitch_channel: "twitch.tv/yourname or channel name",
  twitch_clip: "Twitch clip URL or slug",
};

export function ProfileLinksEditor() {
  const toast = useToast();
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [spotKind, setSpotKind] = useState<SpotlightKind>("none");
  const [spotInput, setSpotInput] = useState("");
  const [spotValue, setSpotValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [socials, setSocials] = useState<Socials>({});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const armed = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile-links")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setLinks(resolveProfileLinks(j.links));
        const sp = resolveProfileSpotlight(j.spotlight);
        setSpotKind(sp.kind);
        setSpotValue(sp.value);
        if (sp.value) setSpotInput(sp.value);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Socials already filled in on the Profile tab. Retyping them here is busywork,
  // and the two drift apart the moment someone changes one and forgets the other.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user || cancelled) return;
      return supabase.from("users").select("socials").eq("id", data.user.id).maybeSingle()
        .then(({ data: row }) => { if (!cancelled && row?.socials) setSocials(row.socials as Socials); });
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!armed.current) { armed.current = true; return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/account/profile-links", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links, spotlight: { kind: spotKind, value: spotValue } }),
        });
        if (res.ok) setSaveState("saved");
        else { setSaveState("error"); if ((await res.json().catch(() => null))?.error === "migration_pending") toast.error("Links saving isn't enabled yet."); }
      } catch { setSaveState("error"); }
    }, 700);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links, spotKind, spotValue]);

  const setLink = (i: number, patch: Partial<ProfileLink>) => setLinks((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const addLink = () => setLinks((l) => (l.length >= MAX_LINKS ? l : [...l, { label: "", url: "" }]));
  const removeLink = (i: number) => setLinks((l) => l.filter((_, idx) => idx !== i));

  /**
   * Socials worth offering: filled in, resolvable to a URL, and not already
   * linked. A platform stays on offer after importing if you removed it again,
   * and nothing stops you adding a second YouTube by hand — a channel and a
   * clips channel are a normal thing to want.
   */
  const importable = SOCIAL_PLATFORMS
    .map((p) => ({ key: p.key as string, label: p.label as string, url: socialUrl(p.key, socials[p.key as keyof Socials]) }))
    .filter((p): p is { key: string; label: string; url: string } => p.url !== null)
    .filter((p) => !links.some((l) => l.url.trim() === p.url));

  const importSocial = (label: string, url: string) => {
    if (links.length >= MAX_LINKS) { toast.error(`That's the limit of ${MAX_LINKS} links.`); return; }
    setLinks((l) => [...l, { label, url }]);
  };

  const onSpotInput = (v: string) => {
    setSpotInput(v);
    setSpotValue(spotKind === "none" ? null : parseSpotlightInput(spotKind, v));
  };
  const onSpotKind = (k: SpotlightKind) => {
    setSpotKind(k);
    setSpotValue(k === "none" ? null : parseSpotlightInput(k, spotInput));
  };

  if (loading) return <div className="account-card"><p style={{ color: "var(--text-secondary)" }}>Loading links…</p></div>;

  const spotBad = spotKind !== "none" && spotInput.trim() !== "" && !spotValue;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Links &amp; spotlight</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      <p className="account-tab__intro">Add link buttons (your Discord, socials, store) and feature one clip or stream at the top of your profile.</p>

      {/* Links */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)", marginBottom: "var(--spacing-16)" }}>
        {links.map((l, i) => {
          const bad = l.url.trim() !== "" && !safeLinkUrl(l.url);
          return (
            <div key={i} style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 8rem", minWidth: 0 }}><Input value={l.label} onChange={(e) => setLink(i, { label: e.target.value })} placeholder="Label (e.g. Discord)" fullWidth /></span>
              <span style={{ flex: "2 1 12rem", minWidth: 0 }}><Input value={l.url} onChange={(e) => setLink(i, { url: e.target.value })} placeholder="https://…" variant={bad ? "error" : "default"} fullWidth /></span>
              <IconButton variant="tertiary" size="small" aria-label="Remove link" onClick={() => removeLink(i)}><Icon name="x" size="18" /></IconButton>
            </div>
          );
        })}
        {links.length < MAX_LINKS && (
          <Button variant="secondary" size="small" onClick={addLink} style={{ alignSelf: "flex-start" }}>+ Add link</Button>
        )}

        {importable.length > 0 && links.length < MAX_LINKS && (
          <div style={{ marginTop: "var(--spacing-4)" }}>
            <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>
              Pull in from your profile
            </span>
            <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
              {importable.map((p) => (
                <Button key={p.key} variant="secondary" size="small" onClick={() => importSocial(p.label, p.url)} title={p.url}>
                  + {p.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", margin: 0 }}>
          Links must start with https://. Up to {MAX_LINKS} — enough for your main channels without the profile turning into a link farm.
          Add a platform more than once if you need to (a main channel and a clips channel, say).
        </p>
      </div>

      {/* Spotlight */}
      <div style={{ borderTop: "1px solid var(--border-subtle, var(--border-default))", paddingTop: "var(--spacing-16)" }}>
        <span className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-8)" }}>Spotlight embed</span>
        <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginBottom: "var(--spacing-12)" }}>
          {SPOTLIGHT_KINDS.map((k) => (
            <Button key={k.value} variant={spotKind === k.value ? "primary" : "secondary"} size="small" onClick={() => onSpotKind(k.value)}>{k.label}</Button>
          ))}
        </div>
        {spotKind !== "none" && (
          <>
            <Input value={spotInput} onChange={(e) => onSpotInput(e.target.value)} placeholder={PLACEHOLDER[spotKind]} variant={spotBad ? "error" : "default"} fullWidth />
            <p style={{ fontSize: "var(--font-size-12)", color: spotBad ? "var(--error-600, #c11a10)" : "var(--text-tertiary)", marginTop: "var(--spacing-6)" }}>
              {spotBad ? "Couldn't read that — paste the URL or id." : spotValue ? "✓ Looks good — it'll show at the top of your profile." : "Paste a URL or id."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
