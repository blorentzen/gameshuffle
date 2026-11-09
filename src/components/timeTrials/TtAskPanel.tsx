"use client";

/**
 * A reviewer's ask on a time, in its window (picks 2026-11-08): what was asked, the conversation, and for the player
 * the ways to answer it: a new clip, a picture, fixing the time, or a reply. Any of them puts the time back in front
 * of a reviewer, marked Updated. Reviewers see the thread here too; they answer it from the queue.
 *
 * After a reviewer fixed the time themselves (state "fixed", picks 2026-11-09) it's the fix and a reply box: a reply
 * reopens the thread for the reviewers. The window's own buttons (Add a clip, Fix the time) stay where they are.
 */

import { useState } from "react";
import { Button, FormField, Input } from "@empac/cascadeds";
import { IconPencil, IconSend, IconVideo } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { TtTimeDetail } from "@/lib/timeTrials/detail";
import { TtAddShot } from "./TtAddShot";
import { TtFixTime } from "./TtFixTime";

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

/** Your clip of the run, for a reviewer to check (also used in the window for a top-ten time with no ask). */
export function TtClipForm({ timeId, onDone, onCancel }: { timeId: string; onDone: () => void; onCancel: () => void }) {
  const [clip, setClip] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(`/api/time-trials/${timeId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "video", url: clip.trim() }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { toast.error(j.error === "bad_video" ? "Paste a clip link from YouTube, Twitch, Streamable, Medal, X, Bluesky, TikTok or Instagram." : "That didn't send. Try again."); return; }
      toast.success("Sent. A reviewer checks it next.");
      onDone();
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="tt-askp__clip" onSubmit={send}>
      <FormField label="Clip link (the run's last 30 seconds, through the finish)" htmlFor={`tt-clip-${timeId}`}>
        <Input id={`tt-clip-${timeId}`} value={clip} onChange={(e) => setClip(e.target.value)} placeholder="https://" autoComplete="off" fullWidth />
      </FormField>
      <div className="tt-add__actions">
        <Button type="submit" variant="primary" loading={busy} disabled={!clip.trim()}>Send the clip</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function TtAskPanel({ time, onChanged }: { time: TtTimeDetail; onChanged: () => void }) {
  const ask = time.ask!;
  const [open, setOpen] = useState<"clip" | "fix" | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const waiting = ask.state === "waiting_review";
  const fixed = ask.state === "fixed";

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/time-trials/tickets/${ask.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", body: reply.trim() }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!j.ok) { toast.error("That didn't send. Try again."); return; }
      toast.success("Sent to the reviewers.");
      setReply(""); onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="tt-askp" aria-labelledby="tt-askp-h">
      <h3 id="tt-askp-h">{fixed ? (time.you ? "A reviewer fixed this time" : "Fixed by a reviewer") : !time.you ? "Update asked" : waiting ? "Sent. A reviewer will look again." : "A reviewer asked you to update this time"}</h3>
      <ul className="tt-askp__thread">
        {ask.messages.map((m, i) => (
          <li key={i}>
            <span className="tt-askp__who"><b>{m.role === "owner" && time.you ? "You" : m.name}</b> · {ago(m.at)}</span>
            <span>{m.body}{m.link && <>{" "}<a href={m.link} target="_blank" rel="noopener noreferrer nofollow">Link</a></>}</span>
          </li>
        ))}
      </ul>
      {time.you && (
        <>
          {fixed ? null : open === "fix" ? (
            <TtFixTime time={time} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); onChanged(); }} />
          ) : open === "clip" ? (
            <TtClipForm timeId={time.id} onCancel={() => setOpen(null)} onDone={() => { setOpen(null); onChanged(); }} />
          ) : (
            <div className="tt-askp__btns">
              <Button variant="primary" size="small" iconBefore={IconVideo} onClick={() => setOpen("clip")}>{time.videoUrl || time.status === "rejected" ? "Replace the clip" : "Add a clip"}</Button>
              {!time.proofUrl && <TtAddShot timeId={time.id} game={time.game} timeMs={time.timeMs} onDone={onChanged} />}
              {time.canFix && <Button variant="secondary" size="small" iconBefore={IconPencil} onClick={() => setOpen("fix")}>Fix the time</Button>}
            </div>
          )}
          {!open && (
            <form className="tt-askp__reply" onSubmit={sendReply}>
              <FormField label={fixed ? "Something wrong with the fix? Reply to the reviewer" : "Reply to the reviewer"} htmlFor="tt-askp-reply">
                <Input id="tt-askp-reply" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="Your reply" fullWidth />
              </FormField>
              <Button type="submit" variant="secondary" size="small" iconBefore={IconSend} loading={busy} disabled={!reply.trim()}>Send</Button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
