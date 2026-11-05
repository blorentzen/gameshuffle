"use client";

/** A GIF's description, tags and sharing, saved together (after an upload and in My Stuff ▸ GIFs). */

import { useState } from "react";
import { Button, Chip, FormField, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { GIF_ALT_MAX, GIF_TAGS_MAX, cleanTags, type MyGif } from "@/lib/gifs/rules";

export function GifDetailsForm({ gif, onSaved, saveLabel = "Save" }: { gif: MyGif; onSaved: (gif: MyGif) => void; saveLabel?: string }) {
  const toast = useToast();
  const [alt, setAlt] = useState(gif.alt);
  const [tags, setTags] = useState<string[]>(gif.tags);
  const [draft, setDraft] = useState("");
  const [shared, setShared] = useState(gif.shared);
  const [saving, setSaving] = useState(false);
  const id = `gif-${gif.id.slice(0, 8)}`;

  const addTag = () => {
    const next = cleanTags([...tags, ...draft.split(",")]);
    setTags(next);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    const finalTags = draft.trim() ? cleanTags([...tags, ...draft.split(",")]) : tags;
    const res = await fetch(`/api/gifs/${gif.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alt, tags: finalTags, shared }),
    }).catch(() => null);
    setSaving(false);
    const j = (await res?.json().catch(() => null)) as { gif?: MyGif; error?: string } | null;
    if (res?.ok && j?.gif) {
      setTags(j.gif.tags);
      setDraft("");
      toast.success("Saved");
      onSaved(j.gif);
      return;
    }
    toast.error(j?.error === "blocked_words" ? "That description or a tag has words we don't allow." : "Couldn't save that. Try again.");
  };

  return (
    <div className="gif-upload__fields">
      <FormField label="Description" htmlFor={`${id}-alt`} helperText="Read aloud to people using screen readers.">
        <Input id={`${id}-alt`} value={alt} maxLength={GIF_ALT_MAX} onChange={(e) => setAlt(e.target.value)} fullWidth />
      </FormField>
      <FormField label="Tags" htmlFor={`${id}-tag`} helperText={`Up to ${GIF_TAGS_MAX}. People find shared GIFs by them.`}>
        <div className="gif-upload__tags">
          {tags.map((t) => (
            <Chip key={t} label={t} removable onRemove={() => setTags(tags.filter((x) => x !== t))} />
          ))}
          {tags.length < GIF_TAGS_MAX ? (
            <Input
              id={`${id}-tag`}
              value={draft}
              placeholder="mario kart, win"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
              onBlur={() => { if (draft.trim()) addTag(); }}
            />
          ) : null}
        </div>
      </FormField>
      <Switch
        checked={shared}
        onChange={(e) => setShared(e.target.checked)}
        label="Share with everyone"
        helperText={gif.status === "held" ? "It joins Community once staff have checked it." : "It goes in Community with your name on it."}
      />
      <div>
        <Button variant="primary" loading={saving} onClick={() => void save()}>{saveLabel}</Button>
      </div>
    </div>
  );
}
