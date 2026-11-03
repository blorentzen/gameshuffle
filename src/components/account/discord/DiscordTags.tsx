"use client";

/**
 * Streaming ▸ Discord bot ▸ Server replies: the web side of `/gs-tag` (name, web and docs pick 8A). Each reply has a
 * name members type (`/gs-tag show name:rules`) and the text the bot posts. They belong to the account, so every server
 * it runs the bot in shares them.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Input, Modal, Textarea } from "@empac/cascadeds";
import { IconMessageCircle } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

interface Tag { name: string; content: string; updated_at: string }

const ERRORS: Record<string, string> = {
  bad_name: "Names are up to 32 lowercase letters, numbers, spaces, dashes or underscores.",
  empty: "Write the reply.",
  pro_required: "Server replies are part of GS Pro.",
};

export function DiscordTags() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Tag | "new" | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/discord/bot/tags", { cache: "no-store" }).then((r) => r.json()).then((j: { tags?: Tag[] }) => { if (alive) setTags(j.tags ?? []); }).catch(() => { if (alive) setTags([]); });
    return () => { alive = false; };
  }, [version]);

  const remove = async (t: Tag) => {
    if (!(await confirm({ title: `Delete ${t.name}?`, body: "Members typing it get nothing back.", confirmLabel: "Delete the reply" }))) return;
    const res = await fetch(`/api/discord/bot/tags?name=${encodeURIComponent(t.name)}`, { method: "DELETE" });
    if (res.ok) { toast.success(`${t.name} is deleted.`); reload(); } else toast.error("That didn't work. Try again.");
  };

  if (!tags) return <p className="ladder-muted" role="status">Loading…</p>;
  return (
    <div className="discord-tags">
      {/* CDS EmptyState titles are always h3 (a CascadeDS gap): this keeps the heading order. */}
      <h2 className="sr-only">Your server replies</h2>
      {tags.length ? (
        <ul className="discord-tags__list">
          {tags.map((t) => (
            <li key={t.name} className="discord-tags__row">
              <div className="discord-tags__main">
                <code>{t.name}</code>
                <span className="discord-tags__text">{t.content}</span>
              </div>
              <div className="discord-tags__acts">
                <Button size="small" variant="secondary" onClick={() => setEditing(t)}>Edit</Button>
                <Button size="small" variant="ghost" onClick={() => remove(t)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState variant="subtle" icon={<IconMessageCircle size={28} aria-hidden />} title="No server replies yet" description="Members type /gs-tag show with a reply's name and the bot posts it: rules, links, how to join." />
      )}
      <div><Button onClick={() => setEditing("new")}>Add a reply</Button></div>
      {editing && <TagForm tag={editing === "new" ? null : editing} onClose={(changed) => { setEditing(null); if (changed) reload(); }} />}
    </div>
  );
}

function TagForm({ tag, onClose }: { tag: Tag | null; onClose: (changed: boolean) => void }) {
  const toast = useToast();
  const [name, setName] = useState(tag?.name ?? "");
  const [content, setContent] = useState(tag?.content ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/discord/bot/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content, was: tag?.name }) }).catch(() => null);
    const json = ((await res?.json().catch(() => ({}))) ?? {}) as { error?: string };
    setBusy(false);
    if (res?.ok) { toast.success("Saved."); onClose(true); } else toast.error(ERRORS[json.error ?? ""] ?? "That didn't save. Try again.");
  };
  return (
    <Modal isOpen onClose={() => onClose(false)} title={tag ? `Edit ${tag.name}` : "Add a reply"} footer={
      <div className="discord-tags__acts">
        <Button loading={busy} disabled={!name.trim() || !content.trim()} onClick={save}>Save</Button>
        <Button variant="ghost" onClick={() => onClose(false)}>Cancel</Button>
      </div>
    }>
      <div className="discord-tags__form">
        <Input floatingLabel="Name members type, like rules" value={name} maxLength={32} onChange={(e) => setName(e.target.value.toLowerCase())} fullWidth />
        <Textarea floatingLabel="What the bot posts" value={content} rows={6} maxLength={2000} onChange={(e) => setContent(e.target.value)} />
        <p className="discord-tags__hint">{content.length} of 2,000 characters. Members post it with <code>/gs-tag show name:{name.trim() || "rules"}</code>.</p>
      </div>
    </Modal>
  );
}
