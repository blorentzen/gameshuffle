"use client";

/**
 * The one GIF picker (GIF round 2): Reactions (GameShuffle's stickers), Your GIFs, Community (shared GIFs, searched
 * by tag or description) and Upload. Picking closes it and hands back what to attach.
 * CascadeDS has no picture-pick grid, so the grids are our own buttons (on the CascadeDS fix list).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Chip, EmptyState, Input, Modal, Tabs } from "@empac/cascadeds";
import { IconPhotoOff, IconSearch } from "@tabler/icons-react";
import { STICKERS, STICKER_GROUPS, stickerText } from "@/data/stickers";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { Attachment, AttachmentView, CommunityGif, GifView, MyGif } from "@/lib/gifs/rules";
import { GsSticker } from "./GsSticker";
import { GifUpload } from "./GifUpload";

export type PickerTab = "reactions" | "mine" | "community" | "upload";
export interface Picked { attachment: Attachment; view: AttachmentView }

function StickerTab({ onPick }: { onPick: (p: Picked) => void }) {
  const [hover, setHover] = useState<{ id: string; n: number } | null>(null);
  const play = (id: string) => setHover((h) => ({ id, n: (h?.n ?? 0) + 1 }));
  return (
    <div className="gif-picker">
      {STICKER_GROUPS.map((g) => (
        <section key={g} className="gif-picker__group" aria-label={g}>
          <h3 className="gif-picker__group-title">{g}</h3>
          <div className="gif-grid gif-grid--stickers">
            {STICKERS.filter((s) => s.group === g).map((s) => (
              <button
                key={s.id}
                type="button"
                className="gif-grid__item"
                title={s.meaning}
                aria-label={`${stickerText(s)}: ${s.meaning}`}
                onMouseEnter={() => play(s.id)}
                onFocus={() => play(s.id)}
                onClick={() => onPick({ attachment: { kind: "sticker", id: s.id }, view: { kind: "sticker", id: s.id } })}
              >
                <GsSticker id={s.id} size="md" still={hover?.id !== s.id} play={hover?.id === s.id ? hover.n : 0} />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A GIF button in a grid: the still frame, the animation while hovered or focused. */
function GifCell({ gif, label, held, onPick }: { gif: GifView; label?: string; held?: boolean; onPick: () => void }) {
  const [live, setLive] = useState(false);
  return (
    <button
      type="button"
      className="gif-grid__item"
      disabled={held}
      aria-label={held ? `${gif.alt || "Your GIF"}, waiting for a staff check` : gif.alt || "A GIF"}
      onMouseEnter={() => setLive(true)}
      onMouseLeave={() => setLive(false)}
      onFocus={() => setLive(true)}
      onBlur={() => setLive(false)}
      onClick={onPick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={live && !held ? gif.url : gif.still} alt="" loading="lazy" />
      {held ? <span className="gif-grid__label gif-grid__label--held">Waiting for a check</span> : label ? <span className="gif-grid__label">{label}</span> : null}
    </button>
  );
}

function MineTab({ onPick, onUpload }: { onPick: (p: Picked) => void; onUpload: () => void }) {
  const [data, setData] = useState<{ gifs: MyGif[]; used: number; limit: number } | null | "error">(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/gifs?tab=mine", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { if (alive) setData(j); })
      .catch(() => { if (alive) setData("error"); });
    return () => { alive = false; };
  }, []);
  if (data === null) return <LoadingLines label="Loading your GIFs" />;
  if (data === "error") return <p className="gif-picker__note" role="alert">Couldn&rsquo;t load your GIFs. Try again in a moment.</p>;
  if (!data.gifs.length) {
    return (
      <EmptyState
        variant="subtle"
        icon={<IconPhotoOff size={40} stroke={1.4} />}
        title="No GIFs yet"
        description="Upload one and it shows up here. It stays private until you share it."
        action={<Button variant="secondary" onClick={onUpload}>Upload a GIF</Button>}
      />
    );
  }
  return (
    <div className="gif-picker">
      <p className="gif-picker__note">{data.used} of {data.limit} GIFs</p>
      <div className="gif-grid">
        {data.gifs.map((g) => (
          <GifCell key={g.id} gif={g} held={g.status === "held"} onPick={() => onPick({ attachment: { kind: "gif", id: g.id }, view: { kind: "gif", gif: g } })} />
        ))}
      </div>
    </div>
  );
}

function CommunityTab({ onPick }: { onPick: (p: Picked) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [tags, setTags] = useState<string[]>([]);
  const [gifs, setGifs] = useState<CommunityGif[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = useRef(0);

  const load = useCallback(async (offset: number) => {
    const ask = ++asked.current;
    const res = await fetch(`/api/gifs?tab=community&sort=${sort}&q=${encodeURIComponent(q)}&offset=${offset}`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { gifs?: CommunityGif[]; tags?: string[] } | null;
    if (ask !== asked.current) return;
    if (!res?.ok || !j?.gifs) { setFailed(true); return; }
    setFailed(false);
    if (offset === 0 && j.tags?.length) setTags(j.tags);
    setGifs((prev) => (offset ? [...(prev ?? []), ...j.gifs!] : j.gifs!));
    setMore(j.gifs.length >= 48);
  }, [q, sort]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(0), q ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  return (
    <div className="gif-picker">
      <div className="gif-picker__bar gif-picker__bar--search">
        <Input
          aria-label="Search shared GIFs"
          placeholder="Search shared GIFs"
          iconBefore={IconSearch}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          fullWidth
        />
      </div>
      <div className="gif-picker__bar">
        <Chip label="Popular" clickable selected={sort === "popular" && !q} onClick={() => { setQ(""); setSort("popular"); }} />
        <Chip label="Newest" clickable selected={sort === "new" && !q} onClick={() => { setQ(""); setSort("new"); }} />
        {tags.map((t) => <Chip key={t} label={t} clickable selected={q === t} onClick={() => setQ(q === t ? "" : t)} />)}
      </div>
      {failed ? <p className="gif-picker__note" role="alert">Couldn&rsquo;t load shared GIFs. Try again in a moment.</p> : null}
      {gifs === null && !failed ? <LoadingLines label="Loading shared GIFs" /> : null}
      {gifs && !gifs.length ? (
        <p className="gif-picker__note">{q ? `No shared GIFs match "${q}" yet.` : "Nobody has shared a GIF yet. Upload one and share it to start the library."}</p>
      ) : null}
      {gifs && gifs.length ? (
        <div className="gif-grid">
          {gifs.map((g) => (
            <GifCell key={g.id} gif={g} label={`by ${g.by}`} onPick={() => onPick({ attachment: { kind: "gif", id: g.id }, view: { kind: "gif", gif: g } })} />
          ))}
        </div>
      ) : null}
      {more ? <div><Button variant="secondary" onClick={() => void load(gifs?.length ?? 0)}>Show more</Button></div> : null}
    </div>
  );
}

export function GifPicker({ open, onClose, onPick, start = "reactions" }: {
  open: boolean;
  onClose: () => void;
  onPick: (p: Picked) => void;
  start?: PickerTab;
}) {
  const [tab, setTab] = useState<PickerTab>(start);
  const pick = (p: Picked) => { onPick(p); onClose(); };
  if (!open) return null;
  return (
    <Modal isOpen={open} onClose={onClose} title="Add a GIF" size="large" className="gif-picker-modal">
      <Tabs
        activeTab={tab}
        onChange={(t) => setTab(t as PickerTab)}
        variant="underline"
        tabs={[
          { id: "reactions", label: "Reactions", content: tab === "reactions" ? <StickerTab onPick={pick} /> : null },
          { id: "mine", label: "Your GIFs", content: tab === "mine" ? <MineTab onPick={pick} onUpload={() => setTab("upload")} /> : null },
          { id: "community", label: "Community", content: tab === "community" ? <CommunityTab onPick={pick} /> : null },
          {
            id: "upload", label: "Upload",
            content: tab === "upload" ? <GifUpload onUse={(g) => pick({ attachment: { kind: "gif", id: g.id }, view: { kind: "gif", gif: g } })} /> : null,
          },
        ]}
      />
    </Modal>
  );
}
