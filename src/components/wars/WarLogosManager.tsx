"use client";

/**
 * A server's team logos on GameShuffle (war tools pick 5A, mockup in https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT):
 * drop as many pictures as you like, each file's name becomes its tag ("KC.png" is KC, "KC - Kart Club.png" also
 * names the team, like a Lorenzi team line), check the list, then Add sends them one at a time so each gets its own
 * answer. Below: the server's logos, and teams from its wars that have none here.
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconPhotoPlus, IconTrash, IconX } from "@tabler/icons-react";
import { AdminSection, AdminTable } from "@/components/account/admin/AdminKit";
import { IconAction } from "@/components/actions/IconAction";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { WarTeamMark } from "./WarPageBits";
import type { LogoPageData } from "@/lib/wars/logoAdmin";
import { tagFromFile } from "@/lib/wars/table";

type Saved = LogoPageData["logos"][number];
type State = "ready" | "saving" | "saved" | "held" | "failed";
interface Item { key: string; file: File; preview: string; tag: string; name: string; state: State; message: string | null }

export const LOGO_MAX_BYTES = 4 * 1024 * 1024;
export const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_BYTES = LOGO_MAX_BYTES;
const TYPES = LOGO_TYPES;
export const LOGO_ERRORS: Record<string, string> = {
  refused: "The picture check turned it down.",
  bad_image: "That file couldn't be opened as a picture.",
  too_big: "Over 4 MB.",
  bad_type: "Use PNG, JPG, WebP or GIF.",
  storage_off: "Uploads are off right now.",
  slow_down: "Too many at once. Wait a few minutes and add the rest.",
  no_tag: "Needs a tag.",
  not_yours: "Only the account that added the bot to this server can change its logos here.",
};

const ERRORS = LOGO_ERRORS;

let seq = 0;

/**
 * `logos` + `onLogos` hand the list to the page around it (the Teams page shows each team's logo and changes them
 * too); without them the list lives here.
 */
export function WarLogosManager({ guild, serverName, initial, logos: shared, onLogos }: { guild: string; serverName: string; initial: LogoPageData; logos?: Saved[]; onLogos?: Dispatch<SetStateAction<Saved[]>> }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [own, setOwn] = useState<Saved[]>(initial.logos);
  const logos = shared ?? own;
  const setLogos = onLogos ?? setOwn;
  const [teams, setTeams] = useState(initial.teams);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const urls = previews.current;
    return () => { for (const u of urls) URL.revokeObjectURL(u); };
  }, []);

  const addFiles = (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith("image/"));
    if (pics.length < files.length) toast.info("Only pictures can be logos; the other files were left out.");
    setItems((now) => [...now, ...pics.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      const { tag, name } = tagFromFile(file.name);
      return { key: `f${++seq}`, file, preview, tag, name, state: "ready" as State, message: null };
    })]);
  };

  const drop = (key: string) => setItems((now) => {
    const it = now.find((i) => i.key === key);
    if (it) { URL.revokeObjectURL(it.preview); previews.current.delete(it.preview); }
    return now.filter((i) => i.key !== key);
  });
  const edit = (key: string, patch: Partial<Item>) => setItems((now) => now.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // What each row will do, before anything is sent.
  const problem = (it: Item): string | null => {
    const tag = it.tag.trim();
    if (!tag) return "Needs a tag.";
    if ([...tag].length > 12) return "Tags are 12 characters at most.";
    if (it.file.size > MAX_BYTES) return ERRORS.too_big;
    if (!TYPES.has(it.file.type)) return ERRORS.bad_type;
    if (items.filter((o) => o.state === "ready" && o.tag.trim().toLowerCase() === tag.toLowerCase()).length > 1) return `Two files have the tag ${tag}.`;
    return null;
  };
  const plan = (it: Item): string => {
    const tag = it.tag.trim();
    return logos.some((l) => l.tag.toLowerCase() === tag.toLowerCase()) ? `Replaces the ${tag} logo` : "New";
  };

  const ready = items.filter((i) => i.state === "ready" && !problem(i));
  const blocked = items.filter((i) => i.state === "ready" && problem(i));

  const addAll = async () => {
    setBusy(true);
    let added = 0;
    for (const it of ready) {
      edit(it.key, { state: "saving", message: "Checking…" });
      const form = new FormData();
      form.set("guild", guild);
      form.set("tag", it.tag.trim());
      form.set("name", it.name.trim());
      form.set("file", it.file);
      const res = await fetch("/api/war/logos", { method: "POST", body: form }).catch(() => null);
      const body = (await res?.json().catch(() => ({}))) as { logo?: Saved; unsure?: boolean; error?: string; reason?: string | null };
      if (!res?.ok || !body.logo) {
        edit(it.key, { state: "failed", message: body.error === "refused" && body.reason ? `${ERRORS.refused} ${body.reason}` : ERRORS[body.error ?? ""] ?? "Couldn't add it. Try again?" });
        if (body.error === "slow_down" || body.error === "not_yours") break;
        continue;
      }
      added++;
      const saved = body.logo;
      setLogos((now) => [...now.filter((l) => l.tag.toLowerCase() !== saved.tag.toLowerCase()), saved].sort((a, b) => a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })));
      setTeams((now) => now.filter((t) => t.tag.toLowerCase() !== saved.tag.toLowerCase()));
      edit(it.key, body.unsure
        ? { state: "held", message: "Added. It shows in your server; GameShuffle's pages wait until we've had a look." }
        : { state: "saved", message: "Added" });
    }
    setBusy(false);
    if (added) toast.success(added === 1 ? "1 logo added" : `${added} logos added`);
  };

  const clearDone = () => setItems((now) => {
    for (const i of now.filter((i) => i.state === "saved" || i.state === "held")) { URL.revokeObjectURL(i.preview); previews.current.delete(i.preview); }
    return now.filter((i) => i.state !== "saved" && i.state !== "held");
  });

  const remove = async (l: Saved) => {
    if (!(await confirm({ title: `Remove the ${l.tag} logo?`, body: "War cards, tables and the overlay go back to the team's MKCentral logo, or its tag.", confirmLabel: "Remove logo", danger: true }))) return;
    const res = await fetch(`/api/war/logos?guild=${encodeURIComponent(guild)}&tag=${encodeURIComponent(l.tag)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) { toast.error("Couldn't remove it. Try again?"); return; }
    setLogos((now) => now.filter((o) => o.tag !== l.tag));
    toast.success(`${l.tag} logo removed`);
  };

  const done = items.some((i) => i.state === "saved" || i.state === "held");
  // A logo added elsewhere on the page (a team's own Edit) takes its team off this list too.
  const bare = teams.filter((t) => !logos.some((l) => l.tag.toLowerCase() === t.tag.toLowerCase()));

  return (
    <>
      <AdminSection title="Add logos" intro="Each file's name becomes its tag: KC.png turns into KC, and KC - Kart Club.png also names the team. Check the list, then add them all.">
        <label
          className={`wl-drop${dragging ? " wl-drop--active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) addFiles(Array.from(e.dataTransfer.files ?? [])); }}
        >
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="wl-drop__input" disabled={busy} onChange={(e) => { if (e.target.files?.length) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
          <IconPhotoPlus size={36} stroke={1.75} className="wl-drop__icon" aria-hidden="true" />
          <span className="wl-drop__title">Drop logos here, or choose files</span>
          <span className="wl-drop__hint">PNG, JPG, WebP or GIF, up to 4 MB each. Every picture is checked before it shows.</span>
        </label>

        {items.length > 0 && (
          <>
            <AdminTable label="Logos to add">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Picture</TableHead>
                    <TableHead>Tag</TableHead>
                    <TableHead>Team name (optional)</TableHead>
                    <TableHead>What happens</TableHead>
                    <TableHead><span className="sr-only">Take it off the list</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const p = it.state === "ready" ? problem(it) : null;
                    const locked = it.state !== "ready";
                    return (
                      <TableRow key={it.key}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not uploaded yet */}
                        <TableCell><img className="wl-thumb" src={it.preview} alt={it.file.name} /></TableCell>
                        <TableCell><Input aria-label={`Tag for ${it.file.name}`} value={it.tag} maxLength={24} onChange={(e) => edit(it.key, { tag: e.target.value })} disabled={locked} /></TableCell>
                        <TableCell><Input aria-label={`Team name for ${it.file.name}`} value={it.name} maxLength={60} onChange={(e) => edit(it.key, { name: e.target.value })} disabled={locked} /></TableCell>
                        <TableCell><span className={`wl-state wl-state--${p ? "problem" : it.state}`}>{p ?? it.message ?? plan(it)}</span></TableCell>
                        <TableCell>{it.state !== "saving" && <IconAction label={`Take ${it.file.name} off the list`} icon={IconX} onClick={() => drop(it.key)} disabled={busy} />}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>
            <div className="wl-actions">
              <Button variant="primary" onClick={() => void addAll()} loading={busy} disabled={!ready.length || busy}>{ready.length === 1 ? "Add 1 logo" : `Add ${ready.length} logos`}</Button>
              {done && !busy && <Button variant="ghost" onClick={clearDone}>Clear the added ones</Button>}
              {blocked.length > 0 && <span className="wl-note">{blocked.length === 1 ? "1 needs a fix first." : `${blocked.length} need a fix first.`}</span>}
            </div>
          </>
        )}
      </AdminSection>

      <AdminSection title={`In ${serverName}`} intro={logos.length ? `${logos.length} ${logos.length === 1 ? "logo" : "logos"}, used on war cards, tables and the overlay.` : "No logos of its own yet."}>
        {logos.length > 0 && (
          <ul className="wl-grid">
            {logos.map((l) => (
              <li key={l.tag} className="wl-tile">
                <WarTeamMark tag={l.tag} logo={l.url} size="lg" />
                <span className="wl-tile__tag">{l.tag}</span>
                <span className="wl-tile__line">{l.verdict === "unsure" ? "Waiting for a look" : l.name || (l.by ? `Added by ${l.by}` : "")}</span>
                <span className="wl-tile__act"><IconAction label={`Remove the ${l.tag} logo`} icon={IconTrash} variant="danger" onClick={() => void remove(l)} /></span>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      {bare.length > 0 && (
        <AdminSection title="Teams from your wars" intro="Teams this server has played that have no logo here. Drop a file named after the tag to give one its own.">
          <ul className="wl-grid">
            {bare.map((t) => (
              <li key={t.tag} className="wl-tile">
                <WarTeamMark tag={t.tag} logo={t.logo} size="lg" />
                <span className="wl-tile__tag">{t.tag}</span>
                <span className="wl-tile__line">{t.source === "mkcentral" ? "From MKCentral" : "No logo yet"}</span>
              </li>
            ))}
          </ul>
        </AdminSection>
      )}
    </>
  );
}
