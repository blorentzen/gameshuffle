"use client";

/**
 * A night with friends in one tap (dailies + explore picks 2026-11-05, 6A): Mario Party or Mario Kart makes a secret
 * night with your seat and three open ones, then this window hands you the code and the link to send, and lets you
 * save a seat for a friend (one notice each, "Nudges from friends" in Settings). A trivia night opens its builder.
 *
 * `useQuickStart()` gives `start(game)` and the window to render once.
 */

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Button, Modal } from "@empac/cascadeds";
import { IconCheck, IconCopy, IconLink, IconSend } from "@tabler/icons-react";
import { IconField } from "@/components/events/EventHeaderArt";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import type { QuickGame } from "@/lib/home/nextPicks";

interface Ready { code: string; path: string; game: string; friends: { id: string; name: string; avatar: string | null }[] }

const ERRORS: Record<string, string> = {
  signed_out: "Sign in to start a night.",
  slow_down: "That's a lot of nights in an hour. Try again in a bit.",
};

export function useQuickStart(from: string): { start: (game: QuickGame) => void; window: ReactNode } {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<Ready | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());

  async function start(game: QuickGame) {
    if (busy) return;
    setBusy(true);
    try {
      if (game === "trivia") {
        const r = await fetch("/api/trivia/games", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: "party" }) });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string };
        if (!r.ok || !j.id) { toast.error(ERRORS[j.error ?? ""] ?? "Couldn't start the trivia night. Try again."); return; }
        track(EVENTS.nightStarted, { format: "trivia", source: from });
        router.push(`/trivia/host/${j.id}`);
        return;
      }
      setReady(null);
      setSaved(new Set());
      setOpen(true);
      const r = await fetch("/api/party/quick", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game }) });
      const j = (await r.json().catch(() => ({}))) as Partial<Ready> & { error?: string };
      if (!r.ok || !j.code) { setOpen(false); toast.error(ERRORS[j.error ?? ""] ?? "Couldn't start the night. Try again."); return; }
      setReady(j as Ready);
      track(EVENTS.nightStarted, { format: "classic", source: from });
    } finally {
      setBusy(false);
    }
  }

  const url = ready ? `${window.location.origin}${ready.path}` : "";
  const text = ready ? `Join my ${ready.game} night on GameShuffle. Code ${ready.code}` : "";

  async function share() {
    if (!ready) return;
    try {
      if (navigator.share) { await navigator.share({ title: `${ready.game} night`, text, url }); return; }
    } catch { /* closed the sheet */ return; }
    copy();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${text}\n${url}`); toast.success("Link copied"); }
    catch { toast.error(`Couldn't copy. The link is ${url}`); }
  }
  async function seat(id: string) {
    if (!ready || saved.has(id)) return;
    setSaved((s) => new Set(s).add(id));
    const r = await fetch(`/api/party/${ready.code}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: id }) }).catch(() => null);
    if (!r || (!r.ok && r.status !== 409)) {
      setSaved((s) => { const n = new Set(s); n.delete(id); return n; });
      toast.error("That didn't send. Try again.");
    }
  }

  const window_ = (
    <Modal isOpen={open} onClose={() => setOpen(false)} title={ready ? `Your ${ready.game} night` : "Starting your night"} size="medium" className="qs">
      {!ready ? (
        <p className="qs__wait" role="status">Making your night and its code…</p>
      ) : (
        <div className="qs__body">
          <div className="qs__code">
            <IconField category="minigame" seed={ready.code} opacity={0.14} />
            <span className="qs__label">Your night&apos;s code</span>
            <b className="qs__value">{ready.code}</b>
            <span className="qs__note">Friends open the link on their phone and take a seat. Four seats: yours and three open.</span>
          </div>
          <div className="qs__actions">
            <Button variant="primary" iconBefore={IconSend} onClick={() => void share()}>Send the link</Button>
            <Button variant="secondary" iconBefore={IconCopy} onClick={() => void copy()}>Copy link</Button>
          </div>
          {ready.friends.length > 0 && (
            <section className="qs__friends" aria-labelledby="qs-friends">
              <h3 id="qs-friends">Save a seat for a friend</h3>
              <ul>
                {ready.friends.map((f) => (
                  <li key={f.id}>
                    <Avatar size="small" src={f.avatar ?? undefined} initials={f.name.slice(0, 1).toUpperCase()} alt="" />
                    <span className="qs__name">{f.name}</span>
                    {saved.has(f.id)
                      ? <span className="qs__saved"><IconCheck size={16} stroke={2.5} aria-hidden="true" />Seat saved</span>
                      : <Button variant="ghost" size="small" onClick={() => void seat(f.id)}>Save a seat<span className="sr-only"> for {f.name}</span></Button>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Button variant="secondary" iconBefore={IconLink} fullWidth onClick={() => router.push(ready.path)}>Open the night</Button>
        </div>
      )}
    </Modal>
  );

  return { start: (g) => void start(g), window: window_ };
}
