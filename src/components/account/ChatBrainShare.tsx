"use client";

/**
 * Share a Chat Brain question to gather answers: a tracked link per platform
 * (?src= records where each answer came from), one-tap posts for X and Bluesky,
 * and the two share images (link preview size, and story size for Instagram
 * and TikTok, where links don't preview).
 */

import { Button, Modal } from "@empac/cascadeds";
import { PlatformIcon } from "@/components/PlatformIcon";
import { useToast } from "@/components/toast/ToastProvider";

// `icon` is the PlatformIcon key (the same service icons as socials on /u).
// Reddit and email have no icon in that set yet and fall back to the link glyph.
const PLATFORMS: { src: string; icon: string; label: string }[] = [
  { src: "discord", icon: "discord", label: "Discord" }, { src: "x", icon: "twitter", label: "X" }, { src: "bluesky", icon: "bluesky", label: "Bluesky" },
  { src: "reddit", icon: "reddit", label: "Reddit" }, { src: "instagram", icon: "instagram", label: "Instagram (link in bio or story sticker)" },
  { src: "tiktok", icon: "tiktok", label: "TikTok (link in bio)" }, { src: "email", icon: "email", label: "Email" },
];

const XIcon = () => <PlatformIcon platform="twitter" dim={false} />;
const BlueskyIcon = () => <PlatformIcon platform="bluesky" dim={false} />;

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
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated preview, not a static asset */}
        <img className="brain-share__preview" src={`/api/chat-brain/share/${prompt.id}`} alt={`Share image: ${prompt.text}`} width={1200} height={630} />
        <div className="party-row">
          <a href={`https://twitter.com/intent/tweet?${new URLSearchParams({ text: post, url: link("x") })}`} target="_blank" rel="noreferrer"><Button size="small" variant="secondary" iconBefore={XIcon}>Post on X</Button></a>
          <a href={`https://bsky.app/intent/compose?${new URLSearchParams({ text: `${post} ${link("bluesky")}` })}`} target="_blank" rel="noreferrer"><Button size="small" variant="secondary" iconBefore={BlueskyIcon}>Post on Bluesky</Button></a>
        </div>
        <ul className="brain-share__links">
          {PLATFORMS.map((p) => (
            <li key={p.src}><span className="brain-share__platform"><PlatformIcon platform={p.icon} size={18} />{p.label}</span><Button size="small" variant="ghost" onClick={() => void copy(p.src)}>Copy link</Button></li>
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
