"use client";

/**
 * "Write it up with AI" for a finished stream or live night: drafts a Discord
 * post and a short post from GameShuffle's own record of what happened, both
 * editable, each with a Copy button. Nothing is posted for you.
 * GS Pro, counted against the monthly AI allowance (POST /api/ai/recap).
 */

import { useState } from "react";
import Link from "next/link";
import { Alert, Button, Modal, Textarea } from "@empac/cascadeds";
import { IconCopy, IconSparkles } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_ERRORS } from "@/components/ai/errors";

type Target = { kind: "night"; code: string } | { kind: "stream"; sessionId: string };

export function AiRecapButton({ target, link, size = "small", variant = "secondary" }: {
  target: Target;
  /** Added to the end of each post when copied (the recap page or night link). */
  link?: string;
  size?: "small" | "medium";
  variant?: "secondary" | "primary";
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discord, setDiscord] = useState("");
  const [short, setShort] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/recap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; discord?: string; short?: string; remaining?: number | null; error?: string };
      if (!res.ok || !data.ok) { setError(AI_ERRORS[data.error ?? ""] ?? "That didn't work. Try again in a moment."); return; }
      setDiscord(data.discord ?? "");
      setShort(data.short ?? "");
      setRemaining(data.remaining ?? null);
      track(EVENTS.aiRecapGenerated, { kind: target.kind });
    } catch {
      setError("Couldn't reach GameShuffle. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const openIt = () => { setOpen(true); if (!discord && !busy) void generate(); };
  const copy = (text: string, what: string) => navigator.clipboard.writeText(link ? `${text}\n${link}` : text).then(
    () => { toast.success(`${what} copied`); track(EVENTS.resultCopied, { tool: `ai-recap-${target.kind}` }); },
    () => toast.error("Couldn't copy that"),
  );

  return (
    <>
      <Button variant={variant} size={size} iconBefore={IconSparkles} onClick={openIt}>Write it up with AI</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Your recap"
        size="medium"
        footer={
          <div className="ai-pack__footer">
            <span className="ai-pack__allowance">{remaining === null ? "" : `${remaining} left this month`}</span>
            <Button variant="secondary" loading={busy} onClick={() => void generate()}>Write another</Button>
            <Button variant="primary" onClick={() => setOpen(false)}>Done</Button>
          </div>
        }
      >
        <div className="ai-pack">
          {error && (
            <Alert variant={error === AI_ERRORS.pro_required ? "info" : "error"}>
              {error}{error === AI_ERRORS.pro_required && <> <Link href="/gs-pro?from=ai-recap">See GS Pro</Link></>}
            </Alert>
          )}
          {busy && !discord && <p className="ai-pack__hint">Writing it up from what happened…</p>}
          {discord && (
            <>
              <div className="ai-recap__block">
                <Textarea fullWidth floatingLabel="For Discord" rows={7} value={discord} onChange={(e) => setDiscord(e.target.value)} />
                <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => copy(discord, "Discord post")}>Copy</Button>
              </div>
              <div className="ai-recap__block">
                <Textarea fullWidth floatingLabel={`For X or Bluesky (${short.length} / 280)`} rows={3} value={short} maxLength={280} onChange={(e) => setShort(e.target.value)} />
                <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => copy(short, "Post")}>Copy</Button>
              </div>
            </>
          )}
          <p className="ai-pack__note">Written by AI from GameShuffle&apos;s record of what happened. Edit anything before you post it{link ? "; the link is added when you copy" : ""}.</p>
        </div>
      </Modal>
    </>
  );
}
