"use client";

/**
 * Add or edit one team on the Teams page (overrides picks 2026-11-09): its tags (the first is the one tables show),
 * name, color and logo. The card saves first; a picture picked here then goes up as the first tag's logo through the
 * logos route, the same check and storage as the Logos part of the page. With wars-m6 (logos + MKCentral picks
 * 2026-11-09, all A): where the logo comes from (Automatic, your upload, or the linked MKCentral team's), with a line
 * saying which logo shows and why, saved after the card.
 */

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Chip, Input, Modal, Radio, RadioGroup, Switch } from "@empac/cascadeds";
import { IconEye, IconPhotoPlus } from "@tabler/icons-react";
import { AdminField } from "@/components/account/admin/AdminKit";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { useToast } from "@/components/toast/ToastProvider";
import { tagColor } from "@/lib/wars/look";
import { tagKey } from "@/lib/wars/tags";
import { LOGO_SOURCES, logoNow, ownLogo, splitTags, type LogoSource, type TeamView, type TeamsView } from "@/lib/wars/teamView";
import type { LogoPageData } from "@/lib/wars/logoAdmin";
import { WarTeamMark } from "./WarPageBits";
import { LOGO_ERRORS, LOGO_MAX_BYTES, LOGO_TYPES } from "./WarLogosManager";
import { errorText, teamsApi, type WithView } from "./teamsApi";

type Saved = LogoPageData["logos"][number];

const COLORS = [
  { value: "#2b52d6", label: "Blue" }, { value: "#8cc8f0", label: "Ice" }, { value: "#d9363e", label: "Red" }, { value: "#ff7a2f", label: "Orange" },
  { value: "#f2c14e", label: "Gold" }, { value: "#2fa36b", label: "Green" }, { value: "#c949e9", label: "Magenta" }, { value: "#16181f", label: "Black" },
];

export interface TeamDraft { team: TeamView | null; tag?: string; name?: string | null }

export function WarTeamEditor({ guild, draft, linksReady, logos, onLogos, onClose, onSaved }: {
  guild: string;
  draft: TeamDraft;
  /** Whether wars-m6.sql has run (the logo setting). */
  linksReady: boolean;
  logos: Saved[];
  onLogos: (update: (now: Saved[]) => Saved[]) => void;
  onClose: () => void;
  onSaved: (view: TeamsView | null) => void;
}) {
  const toast = useToast();
  const team = draft.team;
  const [tagsText, setTagsText] = useState((team?.tags ?? (draft.tag ? [draft.tag] : [])).join(", "));
  const [name, setName] = useState(team?.name ?? draft.name ?? "");
  const [colorOn, setColorOn] = useState(!!team?.color);
  // Turning a color on starts from the one tables pick now (the logo's, else the tag's), so nothing jumps.
  const picked = team?.logoColor ?? null;
  const [color, setColor] = useState(team?.color ?? picked ?? tagColor(team?.tags[0] ?? draft.tag ?? "GS"));
  const [file, setFile] = useState<{ file: File; preview: string } | null>(null);
  const [dropLogo, setDropLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savedSource: LogoSource = team?.links?.source ?? "auto";
  const [source, setSource] = useState<LogoSource>(savedSource);
  const pick = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (file) URL.revokeObjectURL(file.preview); }, [file]);

  const tags = splitTags(tagsText);
  const has = team ? ownLogo(team.tags, logos) : null;
  const upload = file?.preview ?? (dropLogo ? null : has?.url ?? null);
  // Which logo tables would show, and why (a saved team: its link and MKCentral's logo by tag are known).
  const links = linksReady ? team?.links ?? null : null;
  const now = links
    ? logoNow(source, { upload, linked: links.mkc ? { name: links.mkc.name, logo: links.mkc.logo } : null, tagLogo: links.tagLogo, pending: source !== savedSource || !!file || dropLogo })
    : null;
  const shownLogo = now ? now.url : linksReady ? upload : upload ?? team?.mkLogo ?? null;
  const label = name.trim() || tags[0] || "this team";

  const choose = (f: File | undefined) => {
    if (!f) return;
    if (!LOGO_TYPES.has(f.type)) { setError(LOGO_ERRORS.bad_type); return; }
    if (f.size > LOGO_MAX_BYTES) { setError("That picture is over 4 MB."); return; }
    setError(null);
    setDropLogo(false);
    setFile({ file: f, preview: URL.createObjectURL(f) });
  };

  const save = async () => {
    setError(null);
    if (!tags.length) { setError("Give the team at least one tag, like the one its players wear in their names."); return; }
    setSaving(true);
    const res = await teamsApi<WithView & { created: boolean; team: { id: string } }>("/api/war/teams", "POST", { guild, id: team?.id ?? null, name: name.trim() || null, tags, color: colorOn ? color : null });
    if (!res.ok) {
      setSaving(false);
      if (res.error === "tag_taken") {
        const other = res.data.other as { name: string | null; tags: string[] } | undefined;
        const clash = tags.find((t) => other?.tags.some((o) => tagKey(o) === tagKey(t))) ?? tags[0];
        setError(`${clash} is already a tag of ${other?.name ?? other?.tags[0] ?? "another team"}. A tag belongs to one team.`);
      } else {
        setError(errorText(res.error, { no_tag: "Give the team at least one tag." }));
      }
      return;
    }

    // The logo goes up under the first tag once the card is saved.
    let logoNote: string | null = null;
    if (file) {
      const form = new FormData();
      form.set("guild", guild);
      form.set("tag", tags[0]);
      form.set("name", name.trim());
      form.set("file", file.file);
      const up = await fetch("/api/war/logos", { method: "POST", body: form }).catch(() => null);
      const body = (await up?.json().catch(() => ({}))) as { logo?: Saved; unsure?: boolean; error?: string; reason?: string | null };
      if (up?.ok && body.logo) {
        const saved = body.logo;
        onLogos((now) => [...now.filter((l) => tagKey(l.tag) !== tagKey(saved.tag)), saved].sort((a, b) => a.tag.localeCompare(b.tag, "en", { sensitivity: "base" })));
        if (body.unsure) logoNote = "The logo shows in your server; GameShuffle's pages wait until we've had a look.";
      } else {
        logoNote = `The team saved, but not its logo. ${body.error === "refused" && body.reason ? `${LOGO_ERRORS.refused} ${body.reason}` : LOGO_ERRORS[body.error ?? ""] ?? "Try the logo again."}`;
      }
    } else if (dropLogo && has) {
      const del = await fetch(`/api/war/logos?guild=${encodeURIComponent(guild)}&tag=${encodeURIComponent(has.tag)}`, { method: "DELETE" }).catch(() => null);
      if (del?.ok) onLogos((now) => now.filter((l) => tagKey(l.tag) !== tagKey(has.tag)));
      else logoNote = "The team saved, but its logo is still there. Try removing it again.";
    }

    // Where the logo comes from, once the card exists.
    let view = res.data.view;
    if (linksReady && source !== savedSource) {
      const set = await teamsApi<WithView>("/api/war/teams/mkcentral", "POST", { guild, teamId: res.data.team.id, action: "logo", source });
      if (set.ok) view = set.data.view ?? view;
      else logoNote = `${logoNote ? `${logoNote} ` : ""}The team saved, but not where its logo comes from. ${errorText(set.error)}`;
    }

    setSaving(false);
    onSaved(view);
    if (logoNote) toast.info(logoNote);
    toast.success(res.data.created ? `${label} added` : `${label} saved`);
  };

  return (
    <Modal
      isOpen
      onClose={saving ? () => {} : onClose}
      title={team ? `Edit ${team.name ?? team.tags[0]}` : "Add a team"}
      size="medium"
      footer={
        <div className="admin-chatbot-modal-actions">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={saving}>{team ? "Save team" : "Add team"}</Button>
        </div>
      }
    >
      <form className="admin-form wt-form" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

        <AdminField label="Tags" helper="Every tag the team plays under, with commas between, like FRVR, Ω. The first one is the one tables show.">
          {(id, d) => <Input id={id} aria-describedby={d} value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="FRVR, Ω" fullWidth autoComplete="off" />}
        </AdminField>
        {tags.length > 0 && (
          <div className="wt-tags" aria-label="Tags as tables read them">
            {tags.map((t, i) => (
              <Chip key={t} size="small" variant={i === 0 ? "primary" : "default"} icon={i === 0 ? <IconEye size={14} aria-hidden /> : undefined}>
                {t}{i === 0 && <span className="sr-only"> (shown on tables)</span>}
              </Chip>
            ))}
          </div>
        )}

        <AdminField label="Team name" helper="Optional. Tables show it beside the tag.">
          {(id, d) => <Input id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Forever" fullWidth autoComplete="off" />}
        </AdminField>

        <div className="wt-field">
          <Switch checked={colorOn} onChange={(e) => setColorOn(e.target.checked)} label="Give the team its own color" aria-describedby="wt-color-help" />
          <p className="admin-field__help" id="wt-color-help">
            {colorOn ? "Used on war tables: the team's names, its total and its side of the table." : picked ? "Tables use a color picked from the logo now:" : "Without one, tables pick a color from the logo, or from the tag when the logo has none."}
            {!colorOn && picked && (
              <span className="wt-color wt-color--inline">
                <span className="wt-color__swatch" style={{ background: picked }} aria-hidden="true" />
                <span className="wt-color__hex">{picked}</span>
              </span>
            )}
          </p>
          {colorOn && <LookColorPicker label="Team color" value={color} onChange={setColor} presets={picked && !COLORS.some((c) => c.value === picked) ? [{ value: picked, label: "From the logo" }, ...COLORS] : COLORS} />}
        </div>

        <div className="wt-field" role="group" aria-labelledby="wt-logo-label">
          <span className="admin-field__label" id="wt-logo-label">Logo</span>
          <div className="wt-logo">
            <WarTeamMark tag={tags[0] ?? "?"} logo={shownLogo} color={colorOn ? color : null} size="lg" />
            <div className="wt-logo__side">
              <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="wl-drop__input" tabIndex={-1} aria-hidden="true" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="wt-logo__acts">
                <Button variant="secondary" size="small" iconBefore={IconPhotoPlus} onClick={() => pick.current?.click()} disabled={saving} aria-describedby="wt-logo-help">
                  {has || file ? "Choose another picture" : "Choose a picture"}
                </Button>
                {file && <Button variant="ghost" size="small" onClick={() => setFile(null)} disabled={saving}>Don&apos;t use it</Button>}
                {!file && has && !dropLogo && <Button variant="ghost" size="small" onClick={() => setDropLogo(true)} disabled={saving}>Remove the logo</Button>}
                {!file && dropLogo && <Button variant="ghost" size="small" onClick={() => setDropLogo(false)} disabled={saving}>Keep the logo</Button>}
              </div>
              <p className="admin-field__help" id="wt-logo-help">
                {file ? `${file.file.name} goes up when you save, as the ${tags[0] ?? "first tag"} logo.`
                  : dropLogo ? "The logo comes down when you save."
                  : has ? `Saved under ${has.tag}.`
                  : !linksReady && team?.mkLogo ? "From MKCentral. Choose a picture to give this server its own."
                  : "PNG, JPG, WebP or GIF, up to 4 MB. It's saved under the first tag and checked before it shows."}
              </p>
            </div>
          </div>
        </div>

        {linksReady && (
          <fieldset className="wt-field wt-source">
            <legend className="admin-field__label">Where the logo comes from</legend>
            <RadioGroup name={`wt-logo-source-${team?.id ?? "new"}`} value={source} onChange={(v) => setSource(v as LogoSource)} disabled={saving}>
              {LOGO_SOURCES.map((o) => <Radio key={o.id} value={o.id} label={o.label} helperText={o.line} />)}
            </RadioGroup>
            <p className="wt-source__now" aria-live="polite">
              {now ? now.line : "Once the team is saved, this says which logo tables show and why."}
            </p>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
