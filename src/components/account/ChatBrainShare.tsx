"use client";

/**
 * Share a Chat Brain question to gather answers: a tracked link per platform
 * (?src= records where each answer came from), one-tap posts for X and Bluesky,
 * and the two share images (link preview size, and story size for Instagram
 * and TikTok, where links don't preview).
 */

import { Button, Modal } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

const PLATFORMS: { src: string; label: string }[] = [
  { src: "discord", label: "Discord" }, { src: "x", label: "X" }, { src: "bluesky", label: "Bluesky" },
  { src: "reddit", label: "Reddit" }, { src: "instagram", label: "Instagram (link in bio or story sticker)" }, { src: "tiktok", label: "TikTok (link in bio)" },
];

export function ChatBrainShare({ prompt, onClose }: { prompt: { id: string; text: string } | null; onClose: () => void }) {
  const toast = useToast();
  if (!prompt) return null;
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const link = (src: string) => `${base}/chat-brain/q/${prompt.id}?src=${src}`;
  const copy = (src: string) => navigator.clipboard.writeText(link(src)).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy"));
  const post = `${prompt.text} Answer in 5 seconds:`;
  return (
    <Modal isOpen onClose={onClose} title="Share this question" size="medium" secondaryAction={{ label: "Done", onClick: onClose }}>
      <div className="brain-share">
        <p className="brain-share__q">{prompt.text}</p>
        <div className="party-row">
          <a href={`https://twitter.com/intent/tweet?${new URLSearchParams({ text: post, url: link("x") })}`} target="_blank" rel="noreferrer"><Button size="small" variant="primary">Post on X</Button></a>
          <a href={`https://bsky.app/intent/compose?${new URLSearchParams({ text: `${post} ${link("bluesky")}` })}`} target="_blank" rel="noreferrer"><Button size="small" variant="primary">Post on Bluesky</Button></a>
        </div>
        <ul className="brain-share__links">
          {PLATFORMS.map((p) => (
            <li key={p.src}><span>{p.label}</span><Button size="small" variant="secondary" onClick={() => void copy(p.src)}>Copy link</Button></li>
          ))}
        </ul>
        <div className="party-row">
          <a href={`/api/chat-brain/share/${prompt.id}`} target="_blank" rel="noreferrer" download={`chat-brain-${prompt.id.slice(0, 8)}.png`}><Button size="small" variant="ghost">Link preview image</Button></a>
          <a href={`/api/chat-brain/share/${prompt.id}?format=story`} target="_blank" rel="noreferrer" download={`chat-brain-story-${prompt.id.slice(0, 8)}.png`}><Button size="small" variant="ghost">Story image (1080×1920)</Button></a>
        </div>
      </div>
    </Modal>
  );
}
