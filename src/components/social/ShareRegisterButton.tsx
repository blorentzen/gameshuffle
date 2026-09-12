"use client";

/**
 * Inline tournament registration on a feed announcement — the piece that turns a
 * "share" into an actionable signup unit. On mount it reads the tournament's live
 * state (open / full / already-registered / you're-hosting / live) and renders
 * the right footer: a one-tap Register while registration is open, or a status
 * line otherwise. Registering is optimistic via /api/tournament/[id]/quick-join.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface State {
  loading: boolean;
  status: string | null;
  registered: boolean;
  registeredStatus: string | null;
  isOrganizer: boolean;
  full: boolean;
}

export function ShareRegisterButton({ tournamentId, readOnly = false }: { tournamentId: string; readOnly?: boolean }) {
  const toast = useToast();
  const [s, setS] = useState<State>({ loading: true, status: null, registered: false, registeredStatus: null, isOrganizer: false, full: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (readOnly) return;
    let live = true;
    fetch(`/api/tournament/${tournamentId}/quick-join`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live) return;
        if (!d?.ok) { setS((p) => ({ ...p, loading: false })); return; }
        setS({ loading: false, status: d.status, registered: !!d.registered, registeredStatus: d.registeredStatus ?? null, isOrganizer: !!d.isOrganizer, full: !!d.full });
      })
      .catch(() => { if (live) setS((p) => ({ ...p, loading: false })); });
    return () => { live = false; };
  }, [tournamentId, readOnly]);

  async function register() {
    if (busy || s.registered) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/quick-join`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setS((p) => ({ ...p, registered: true, registeredStatus: d.status ?? "registered" }));
        toast.success(d.already ? "You're already signed up." : d.status === "confirmed" ? "You're in! 🏁" : "Request sent 🏁");
      } else {
        toast.error(
          d.error === "full" ? "This tournament is full."
          : d.error === "not_open" ? "Registration isn't open."
          : d.error === "verification_required" ? "Verify your email to register."
          : "Couldn't register. Try again.",
        );
      }
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  }

  // Signed-out preview: a plain sign-up nudge instead of a live status fetch.
  if (readOnly) {
    return (
      <div className="share-card__register">
        <span className="share-card__register-label">Sign up to register</span>
        <Link href="/signup?redirect=/communities" className="share-card__register-link">Sign up</Link>
      </div>
    );
  }

  // Nothing to show while loading, or for tournaments that aren't joinable and
  // that the viewer has no relationship to (keeps closed/complete cards clean).
  if (s.loading) return null;
  if (s.status !== "open" && s.status !== "in_progress" && !s.registered) return null;

  let label: string;
  let action: React.ReactNode = null;
  if (s.registered) {
    label = s.registeredStatus === "confirmed" ? "You're registered" : "Registration requested";
  } else if (s.isOrganizer) {
    label = "You're hosting this";
  } else if (s.status === "in_progress") {
    label = "Racing now";
  } else if (s.full) {
    label = "Tournament full";
  } else {
    label = "Sign up to play";
    action = <Button variant="primary" size="small" onClick={register} disabled={busy}>{busy ? "Registering…" : "Register"}</Button>;
  }

  return (
    <div className="share-card__register">
      <span className="share-card__register-label">{s.registered ? `✓ ${label}` : label}</span>
      {action}
    </div>
  );
}
