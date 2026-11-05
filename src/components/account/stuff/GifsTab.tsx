"use client";

/**
 * My Stuff ▸ GIFs: every GIF you've uploaded, with its description, tags and sharing. Upload, edit and delete here;
 * pick them from the GIF button beside comments. Free accounts keep 25, GS Pro 250.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, EmptyState, Modal, StatCard } from "@empac/cascadeds";
import { IconEdit, IconPhotoOff, IconTrash, IconUpload } from "@tabler/icons-react";
import { AdminScreen, AdminStats } from "@/components/account/admin/AdminKit";
import { IconAction } from "@/components/actions/IconAction";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToast } from "@/components/toast/ToastProvider";
import { GifDetailsForm } from "@/components/gifs/GifDetailsForm";
import { GifImage } from "@/components/gifs/GifImage";
import { GifUpload } from "@/components/gifs/GifUpload";
import type { MyGif } from "@/lib/gifs/rules";

type Data = { gifs: MyGif[]; used: number; limit: number };

export function GifsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null | "soon" | "error">(null);
  const [version, setVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<MyGif | null>(null);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let alive = true;
    fetch("/api/gifs?tab=mine", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 503) return setData("soon");
        if (!r.ok) return setData("error");
        setData(await r.json());
      })
      .catch(() => { if (alive) setData("error"); });
    return () => { alive = false; };
  }, [version]);

  const remove = async (g: MyGif) => {
    if (!(await confirm({ title: "Delete this GIF?", body: "Comments that used it will say the GIF was removed.", confirmLabel: "Delete GIF" }))) return;
    const res = await fetch(`/api/gifs/${g.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) { toast.success("GIF deleted"); reload(); }
    else toast.error("Couldn't delete that GIF. Try again.");
  };

  const full = typeof data === "object" && data !== null && data.used >= data.limit;
  const upload = <Button variant="primary" iconBefore={IconUpload} disabled={full} onClick={() => setUploading(true)}>Upload a GIF</Button>;

  return (
    <AdminScreen
      title="GIFs"
      intro="The GIFs you've uploaded. They stay private until you share one; shared GIFs go in Community with your name on them."
      actions={data && typeof data === "object" ? upload : undefined}
    >
      {data === null ? <LoadingLines label="Loading your GIFs" /> : null}
      {data === "soon" ? <p className="gif-picker__note">GIFs are coming soon.</p> : null}
      {data === "error" ? <p className="gif-picker__note" role="alert">Couldn&rsquo;t load your GIFs. Try again in a moment.</p> : null}
      {data && typeof data === "object" ? (
        <>
          <AdminStats columns={3} label="Your GIFs">
            <StatCard label="GIFs" value={`${data.used} of ${data.limit}`} />
            <StatCard label="Shared" value={String(data.gifs.filter((g) => g.shared && g.status === "ok").length)} />
            <StatCard label="Times used" value={String(data.gifs.reduce((n, g) => n + g.uses, 0))} />
          </AdminStats>
          {full ? <p className="gif-picker__note">You&rsquo;ve reached {data.limit} GIFs. Delete one to upload another{data.limit < 250 ? ", or keep up to 250 with GS Pro" : ""}.</p> : null}
          {data.gifs.length === 0 ? (
            <EmptyState
              variant="subtle"
              icon={<IconPhotoOff size={40} stroke={1.4} />}
              title="No GIFs yet"
              description="Upload a GIF to use it in comments. GameShuffle's reactions are always there in the GIF button too."
              action={upload}
            />
          ) : (
            <ul className="gif-mine">
              {data.gifs.map((g) => (
                <li key={g.id} className="gif-mine__item">
                  <GifImage gif={g} maxWidth={220} />
                  <div className="gif-mine__meta">
                    <p className="gif-mine__alt">{g.alt || "No description yet"}</p>
                    <p className="gif-mine__line">
                      {g.status === "held" ? "Waiting for a staff check" : g.shared ? "Shared" : "Private"}
                      {g.tags.length ? ` · ${g.tags.join(", ")}` : ""}
                    </p>
                    <div className="gif-mine__actions">
                      <IconAction label="Edit GIF" icon={IconEdit} onClick={() => setEditing(g)} />
                      <IconAction label="Delete GIF" icon={IconTrash} variant="danger" onClick={() => void remove(g)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {uploading ? (
        <Modal isOpen onClose={() => { setUploading(false); reload(); }} title="Upload a GIF" size="medium">
          <GifUpload onUploaded={() => undefined} />
        </Modal>
      ) : null}
      {editing ? (
        <Modal isOpen onClose={() => setEditing(null)} title="Edit GIF" size="medium">
          <div className="gif-upload__row">
            <GifImage gif={editing} maxWidth={160} />
            <GifDetailsForm gif={editing} onSaved={() => { setEditing(null); reload(); }} />
          </div>
        </Modal>
      ) : null}
    </AdminScreen>
  );
}
