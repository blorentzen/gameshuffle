"use client";

/**
 * Status & now-playing editor (Brand & Theme tab) — a short status line and a
 * currently-playing game for /u. Autosaves through /api/account/profile-status
 * (plain-text, length-capped, normalized server-side). The walk-up anthem shown
 * on the profile is set on the Walk-Up tab; it surfaces automatically.
 */

import { useEffect, useRef, useState } from "react";
import { Button, Chip, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import { resolveProfileStatus, resolveNowPlaying } from "@/lib/profile/status";

export function ProfileStatusEditor() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [nowPlaying, setNowPlaying] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const armed = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/profile-status")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        setStatus(resolveProfileStatus(j.status) ?? "");
        setNowPlaying(resolveNowPlaying(j.nowPlaying) ?? "");
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!armed.current) { armed.current = true; return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const res = await fetch("/api/account/profile-status", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, nowPlaying }),
        });
        if (res.ok) setSaveState("saved");
        else { setSaveState("error"); if ((await res.json().catch(() => null))?.error === "migration_pending") toast.error("This isn't enabled yet."); }
      } catch { setSaveState("error"); }
    }, 700);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, nowPlaying]);

  if (loading) return <div className="account-card"><p style={{ color: "var(--text-secondary)" }}>Loading…</p></div>;

  return (
    <div className="account-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 className="account-tab__heading" style={{ margin: 0 }}>Status &amp; now playing</h2>
        <span style={{ fontSize: "var(--font-size-12)", color: saveState === "error" ? "var(--error-600, #c11a10)" : "var(--text-tertiary)" }}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
      </div>
      <p className="account-tab__intro">A short line and what you&rsquo;re playing right now, shown at the top of your profile. Your walk-up song (set on the Walk-Up tab) appears here too.</p>

      <div style={{ marginBottom: "var(--spacing-16)" }}>
        <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-6)" }}>Status</label>
        <Input value={status} onChange={(e) => setStatus(e.target.value.slice(0, 120))} placeholder="e.g. Grinding for the weekend tournament" fullWidth />
      </div>

      <div>
        <label className="account-card__label" style={{ display: "block", marginBottom: "var(--spacing-6)" }}>Now playing</label>
        <Input value={nowPlaying} onChange={(e) => setNowPlaying(e.target.value.slice(0, 60))} placeholder="Game you're playing" fullWidth />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-6)", marginTop: "var(--spacing-8)" }}>
          {FAVORITE_GAME_CATALOG.map((g) => (
            <Chip key={g.name} label={g.name} clickable onClick={() => setNowPlaying(g.name)} />
          ))}
          {nowPlaying && <Button variant="ghost" size="small" onClick={() => setNowPlaying("")}>Clear</Button>}
        </div>
      </div>
    </div>
  );
}
