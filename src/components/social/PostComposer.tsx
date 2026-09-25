"use client";

/**
 * The inline post composer. The editor lives on the page; each tool icon opens
 * a focused modal:
 *   • image icon    → add one or many images
 *   • calendar icon → create a NEW event (game night) OR announce an existing
 *                     upcoming tournament/session (spread word about platform
 *                     activity)
 * Body uses CDS MentionInput (@-mentions); topics are bubbled chips (no
 * hashtag) added via a Combobox and sent alongside the body. Posts through
 * /api/social/posts; calls onPosted() so the parent refreshes.
 */

import { useEffect, useState } from "react";
import { TagCombobox } from "@/components/ui/TagCombobox";
import { MentionInput, Modal, Select, Input, Button, Icon, Tabs, type MentionUser } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import type { FeedPost } from "@/lib/social/feed";
import { IconTrophy, IconDeviceGamepad2, IconCalendarEvent } from "@tabler/icons-react";

const OTHER_GAME = "__other__";
const GAME_OPTIONS = [
  { value: "", label: "Pick a game" },
  ...FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name })),
  { value: OTHER_GAME, label: "Other…" },
];

type EventAttach =
  | { mode: "new"; game: string; when: string; capacity: string }
  | { mode: "share"; entityType: "tournament" | "session"; entityId: string; title: string; url: string };

interface UpcomingItem { kind: "tournament" | "game_night"; id: string; title: string; subtitle: string | null; url: string }

export function PostComposer({
  communityId,
  communityName,
  isOwner = false,
  onPosted,
}: {
  communityId?: string;
  communityName?: string;
  isOwner?: boolean;
  /** Called after a successful post. Receives the hydrated post when the server
   *  returns it, so the parent can optimistically drop it to the top of the feed. */
  onPosted: (post?: FeedPost) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [value, setValue] = useState("");
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [tagOptions, setTagOptions] = useState<{ value: string; label: string }[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [event, setEvent] = useState<EventAttach | null>(null);
  const [asCommunity, setAsCommunity] = useState(false);
  const [posting, setPosting] = useState(false);

  // Modals
  const [imageOpen, setImageOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [evGame, setEvGame] = useState("");
  const [evGameOther, setEvGameOther] = useState("");
  const [evWhen, setEvWhen] = useState("");
  const [evCap, setEvCap] = useState("");
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/social/mention-users").then((r) => (r.ok ? r.json() : { users: [] })).catch(() => ({ users: [] })),
      fetch("/api/social/tags").then((r) => (r.ok ? r.json() : { tags: [] })).catch(() => ({ tags: [] })),
    ]).then(([mu, tg]) => {
      if (!live) return;
      setUsers((mu.users as MentionUser[]) ?? []);
      setTagOptions(((tg.tags as string[]) ?? []).map((t) => ({ value: t, label: t })));
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!eventOpen) return;
    let live = true;
    fetch("/api/social/upcoming").then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }))
      .then((d) => { if (live) setUpcoming((d.items as UpcomingItem[]) ?? []); });
    return () => { live = false; };
  }, [eventOpen]);

  // TagCombobox commits once per selection and clears itself, so every call
  // here is a topic to add. Formatting is preserved (case + spaces) — mirrors
  // normalizeTopic on the server; dedupe is case-insensitive so one post can't
  // hold "Intro" twice.
  function addTopic(raw: string) {
    const t = raw
      .replace(/^#+/, "")
      .replace(/[^\p{L}\p{N} _&+.-]/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 50);
    if (t.length >= 2 && !topics.some((x) => x.toLowerCase() === t.toLowerCase()) && topics.length < 10) {
      setTopics((ts) => [...ts, t]);
    }
  }

  const [dragging, setDragging] = useState(false);

  async function uploadFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (imgs.length === 0) return;
    setImageBusy(true);
    for (const file of imgs) {
      if (images.length >= 8) break;
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/social/posts/image", { method: "POST", body: fd });
        const d = await res.json().catch(() => ({}));
        if (res.ok && d.url) setImages((cur) => (cur.length < 8 ? [...cur, d.url as string] : cur));
        else toast.error(d.error === "too_large" ? "One image was too large (8MB max)." : "An image failed to upload.");
      } catch { toast.error("An image failed to upload."); }
    }
    setImageBusy(false);
  }

  async function onPickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    await uploadFiles(files);
  }

  function reset() {
    setValue(""); setTopics([]); setImages([]); setEvent(null); setAsCommunity(false);
    setEvGame(""); setEvGameOther(""); setEvWhen(""); setEvCap("");
  }

  async function submit() {
    const body = value.trim();
    if ((!body && images.length === 0) || posting || imageBusy) return;
    setPosting(true);
    const payload: Record<string, unknown> = { body, communityId: communityId ?? undefined, imageUrls: images, topics };
    if (isOwner && asCommunity) payload.asCommunity = true;
    if (event?.mode === "new") {
      payload.kind = "game_night";
      payload.meta = { game: event.game || null, startAt: event.when ? new Date(event.when).toISOString() : null, capacity: event.capacity ? Number(event.capacity) : null };
    } else if (event?.mode === "share") {
      payload.kind = "share";
      payload.meta = { entityType: event.entityType, entityId: event.entityId, title: event.title, url: event.url };
    }
    try {
      const res = await fetch("/api/social/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { reset(); onPosted((d.post as FeedPost) ?? undefined); }
      else if (res.status === 429) toast.error("You're posting too fast. Give it a sec.");
      else toast.error("Could not post. Try again.");
    } catch { toast.error("Network error. Try again."); }
    setPosting(false);
  }

  if (!user) return null;

  return (
    <div className="feed__composer" style={{ marginBottom: "var(--spacing-16)" }}>
      <MentionInput value={value} onChange={setValue} users={users} placeholder="What's on your mind?" minRows={2} maxRows={10} />

      {/* Topics */}
      <div style={{ marginTop: "var(--spacing-8)" }}>
        <TagCombobox
          options={tagOptions.filter((o) => !topics.includes(o.value))}
          onAdd={addTopic}
          placeholder={topics.length >= 10 ? "Topic limit reached" : "Add topics…"}
          allowCreate
          createLabel="Add topic"
          size="small"
          disabled={topics.length >= 10}
        />
        {topics.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-6)", marginTop: "var(--spacing-8)" }}>
            {topics.map((t) => (
              <button key={t} type="button" onClick={() => setTopics((ts) => ts.filter((x) => x !== t))} className="composer-topic-chip">{t} <Icon name="x" size="12" /></button>
            ))}
          </div>
        )}
      </div>

      {/* Attached images */}
      {images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)", marginTop: "var(--spacing-8)" }}>
          {images.map((src, i) => (
            <div key={i} className="composer-attach" style={{ width: 96, height: 96, margin: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="composer-attach__img" style={{ width: 96, height: 96, objectFit: "cover" }} />
              <button type="button" onClick={() => setImages((im) => im.filter((_, j) => j !== i))} aria-label="Remove image" className="composer-attach__remove"><Icon name="x" size="14" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Event/share summary */}
      {event && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginTop: "var(--spacing-8)", padding: "0.6rem 0.8rem", border: "1px solid var(--border-default)", borderRadius: "0.6rem" }}>
          <span aria-hidden>{event.mode === "share" ? (event.entityType === "tournament" ? <IconTrophy size={16} stroke={1.9} /> : <IconDeviceGamepad2 size={16} stroke={1.9} />) : <IconCalendarEvent size={16} stroke={1.9} />}</span>
          <span style={{ flex: 1, fontSize: "var(--font-size-14)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {event.mode === "share" ? `Announcing: ${event.title}` : `Event${event.game ? `: ${event.game}` : ""}`}
          </span>
          <button type="button" onClick={() => setEvent(null)} aria-label="Remove event" className="composer-tool"><Icon name="x" size="16" /></button>
        </div>
      )}

      {isOwner && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-6)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginTop: "var(--spacing-8)" }}>
          <input type="checkbox" checked={asCommunity} onChange={(e) => setAsCommunity(e.target.checked)} />
          Post as {communityName ?? "the community"}
        </label>
      )}

      <div className="composer-bar">
        <div className="composer-tools">
          <button type="button" className="composer-tool" title="Add photos" aria-label="Add photos" onClick={() => setImageOpen(true)}><Icon name="photo" size="20" /></button>
          <button type="button" className={`composer-tool${event ? " composer-tool--active" : ""}`} title="Add an event" aria-label="Add an event" onClick={() => setEventOpen(true)}><Icon name="calendar" size="20" /></button>
        </div>
        <Button variant="primary" onClick={() => void submit()} disabled={posting || imageBusy || (!value.trim() && images.length === 0)}>Post</Button>
      </div>

      {/* Image modal */}
      <Modal isOpen={imageOpen} onClose={() => setImageOpen(false)} title="Add photos" size="medium" primaryAction={{ label: "Done", onClick: () => setImageOpen(false) }}>
        <div className="composer-image-modal">
          {images.length < 8 && (
            <label
              className={`composer-dropzone${dragging ? " composer-dropzone--active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); if (!imageBusy) setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); if (!imageBusy) void uploadFiles(Array.from(e.dataTransfer.files ?? [])); }}
            >
              <input type="file" accept="image/*" multiple onChange={(e) => void onPickImages(e)} className="composer-dropzone__input" disabled={imageBusy} />
              <Icon name="photo" size="40" className="composer-dropzone__icon" />
              <span className="composer-dropzone__title">{imageBusy ? "Uploading…" : "Add photos"}</span>
              <span className="composer-dropzone__hint">Drag and drop, or click to browse · up to 8 · 8MB each</span>
            </label>
          )}
          {images.length >= 8 && (
            <p className="composer-image-modal__max">You&rsquo;ve added the maximum of 8 photos.</p>
          )}
          {images.length > 0 && (
            <div className="composer-image-grid">
              {images.map((src, i) => (
                <div key={i} className="composer-attach">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="composer-attach__img" />
                  <button type="button" onClick={() => setImages((im) => im.filter((_, j) => j !== i))} aria-label="Remove image" className="composer-attach__remove"><Icon name="x" size="14" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Event modal */}
      <Modal isOpen={eventOpen} onClose={() => setEventOpen(false)} title="Add an event" size="medium">
        <Tabs
          variant="underline"
          tabs={[
            {
              id: "new",
              label: "New event",
              content: (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)", paddingTop: "var(--spacing-8)" }}>
                  <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>Rally people for a game night — pick a game and time, and viewers can RSVP.</p>
                  <Select floatingLabel="Game" options={GAME_OPTIONS} value={evGame} onChange={(v) => setEvGame(v as string)} fullWidth />
                  {evGame === OTHER_GAME && (
                    <Input floatingLabel="Game name" value={evGameOther} onChange={(e) => setEvGameOther(e.target.value)} placeholder="Type the game" />
                  )}
                  <label style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
                    When (optional)
                    <input type="datetime-local" className="save-setup-input" value={evWhen} onChange={(e) => setEvWhen(e.target.value)} style={{ display: "block", marginTop: 4 }} />
                  </label>
                  <Input type="number" floatingLabel="Capacity (optional)" value={evCap} onChange={(e) => setEvCap(e.target.value)} />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      variant="primary"
                      size="small"
                      disabled={evGame === OTHER_GAME && !evGameOther.trim()}
                      onClick={() => {
                        const game = evGame === OTHER_GAME ? evGameOther.trim() : evGame;
                        setEvent({ mode: "new", game, when: evWhen, capacity: evCap });
                        setEventOpen(false);
                      }}
                    >Add to post</Button>
                  </div>
                </div>
              ),
            },
            {
              id: "announce",
              label: "Announce upcoming",
              content: (
                <div style={{ paddingTop: "var(--spacing-8)" }}>
                  <p style={{ margin: "0 0 var(--spacing-12)", fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>Spread the word about a tournament or session you&rsquo;re part of.</p>
                  {upcoming.length === 0 ? (
                    <p style={{ margin: 0, color: "var(--text-tertiary)", fontSize: "var(--font-size-14)" }}>Nothing upcoming to announce yet.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
                      {upcoming.map((it) => (
                        <button
                          key={`${it.kind}-${it.id}`}
                          type="button"
                          onClick={() => { setEvent({ mode: "share", entityType: it.kind === "tournament" ? "tournament" : "session", entityId: it.id, title: it.title, url: it.url }); setEventOpen(false); }}
                          style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", textAlign: "left", padding: "0.6rem 0.8rem", borderRadius: "0.6rem", border: "1px solid var(--border-default)", background: "var(--surface-default)", cursor: "pointer", font: "inherit" }}
                        >
                          <span aria-hidden>{it.kind === "tournament" ? <IconTrophy size={16} stroke={1.9} /> : <IconDeviceGamepad2 size={16} stroke={1.9} />}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                            {it.subtitle && <span style={{ display: "block", fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{it.subtitle}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
}
