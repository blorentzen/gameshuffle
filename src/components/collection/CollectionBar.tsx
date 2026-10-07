"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Alert, Button, Modal, Switch } from "@empac/cascadeds";
import { IconAdjustments } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { summarize, type GameCollection } from "@/lib/collection/core";
import type { useGameCollection } from "@/hooks/useGameCollection";
import { LoadingLines } from "@/components/loading/LoadingLines";

// The editor carries every game's catalog, so it only loads when opened.
const CollectionEditor = dynamic(() => import("./CollectionEditor").then((m) => m.CollectionEditor), {
  ssr: false,
  loading: () => <LoadingLines label="Loading" />,
});

/**
 * One-line status plus the switch and edit button, for the top of a randomizer.
 * Takes the randomizer's own useGameCollection result, so a change here reaches
 * the rolls straight away.
 */
export function CollectionBar({ slug, col }: { slug: string; col: ReturnType<typeof useGameCollection> }) {
  const toast = useToast();
  const { collection, save, source, customized, signedIn } = col;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GameCollection>(collection);
  const summary = summarize(collection);

  const openEditor = () => { setDraft(collection); setOpen(true); };
  const commit = async () => {
    const ok = await save(draft);
    setOpen(false);
    if (ok) toast.success(source === "account" ? "Saved to your account" : "Saved in this browser");
    else toast.error("Couldn't save to your account. It's saved in this browser for now.");
  };

  return (
    <div className="collection-bar">
      <span className="collection-bar__text">
        <IconAdjustments size={18} stroke={1.8} aria-hidden />
        {customized
          ? <span><strong>{collection.enabled ? "Using your collection" : "Using everything"}</strong>{collection.enabled ? `: ${summary}` : ""}</span>
          : <span><strong>Missing some DLC or characters?</strong> Tell us what you have and rolls will skip the rest.</span>}
      </span>
      <span className="party-row">
        {customized && <Switch label="Use my collection" checked={collection.enabled} onChange={(e) => void save({ ...collection, enabled: e.target.checked })} />}
        <Button variant="secondary" size="small" onClick={openEditor}>{customized ? "Edit my collection" : "Choose what I have"}</Button>
      </span>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="What you have" size="large"
        primaryAction={{ label: "Save", onClick: commit }} secondaryAction={{ label: "Cancel", onClick: () => setOpen(false) }}>
        {!signedIn && (
          <Alert variant="info">
            This saves in this browser. <Link href="/signup">Create a free account</Link> to keep your collection on every device.
          </Alert>
        )}
        <CollectionEditor slug={slug} value={draft} onChange={setDraft} />
      </Modal>
    </div>
  );
}

