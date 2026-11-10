"use client";

/**
 * How war tables look in each of a server's channels (the Teams page; table look picks 2026-11-09, all as recommended).
 * Pick a channel, then its look; every change saves itself and the preview redraws from the channel's newest table
 * (or a sample with the server's teams). Free: the three layouts, medals, what's behind the table. GS Pro or Supporter
 * looks: frame colors, fonts, the light version and hiding the gameshuffle.co line. Those can be tried here; tables
 * show them while the account that added GameShuffle Competitive to the server has looks, and the choice is kept.
 */

import { useEffect, useMemo, useState } from "react";
import { Button, Switch } from "@empac/cascadeds";
import { IconPhotoOff } from "@tabler/icons-react";
import { AdminField, AdminSection, SaveStatus } from "@/components/account/admin/AdminKit";
import { Select } from "@/components/ui/Select";
import { LookColorPicker } from "@/components/tools/looks/LookColorPicker";
import { LooksPrompt } from "@/components/billing/LooksOnly";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import {
  cleanTableLook, layoutLabel, TABLE_FONTS, TABLE_FRAMES, TABLE_GROUNDS, TABLE_LAYOUTS, tablePaidUsed,
  type TableFont, type TableGround, type TableLayout, type TableLook,
} from "@/lib/wars/tableLook";
import { errorText, teamsApi } from "./teamsApi";

interface ChannelRow { id: string; name: string | null; wars: boolean; team: string | null; look: TableLook | null; background: string | null }
interface Loaded { ready: boolean; paidShown: boolean; channels: ChannelRow[] }

const one = (v: string | string[]) => String(Array.isArray(v) ? v[0] : v);
const channelName = (c: ChannelRow) => (c.name ? `#${c.name}` : "A channel GameShuffle can't see now");

export function WarTableLooks({ guild }: { guild: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void teamsApi<Loaded>(`/api/war/teams/tables?guild=${encodeURIComponent(guild)}`, "GET").then((res) => {
      if (!live) return;
      if (!res.ok) { setError(errorText(res.error)); return; }
      setData(res.data);
      setChannel(res.data.channels[0]?.id ?? null);
    });
    return () => { live = false; };
  }, [guild]);

  if (error) return <AdminSection title="War tables"><p className="admin-field__error" role="alert">{error}</p></AdminSection>;
  if (!data) return <AdminSection title="War tables" intro="Loading this server's channels…"><span /></AdminSection>;
  if (!data.ready) return null;

  const current = data.channels.find((c) => c.id === channel) ?? null;
  const update = (row: ChannelRow) => setData((d) => (d ? { ...d, channels: d.channels.map((c) => (c.id === row.id ? row : c)) } : d));
  const groups = [
    { label: "War channels", options: data.channels.filter((c) => c.wars).map((c) => ({ value: c.id, label: channelName(c), description: [c.team, c.look ? layoutLabel(c.look.layout) : "Stacked"].filter(Boolean).join(" · ") })) },
    { label: "Other channels", options: data.channels.filter((c) => !c.wars).map((c) => ({ value: c.id, label: channelName(c) })) },
  ].filter((g) => g.options.length);

  return (
    <AdminSection title="War tables" intro="How the table pictures look in each channel. Changes save themselves. In Discord, the table form can draw one table in another layout.">
      {data.channels.length === 0 ? (
        <p className="admin-section__intro">GameShuffle can&apos;t see this server&apos;s channels right now. Check that GameShuffle Competitive is still in the server.</p>
      ) : (
        <>
          <AdminField label="Channel">
            {(id) => <Select id={id} value={channel ?? ""} fullWidth groups={groups} onChange={(v) => setChannel(one(v))} />}
          </AdminField>
          {current && <ChannelLook key={current.id} guild={guild} row={current} paidShown={data.paidShown} onChange={update} />}
        </>
      )}
    </AdminSection>
  );
}

/** One channel's look (keyed by channel, so switching channels never saves one channel's look into another). */
function ChannelLook({ guild, row, paidShown, onChange }: { guild: string; row: ChannelRow; paidShown: boolean; onChange: (row: ChannelRow) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [look, setLook] = useState<TableLook>(() => row.look ?? cleanTableLook({}));
  const [held, setHeld] = useState<string[]>(() => (paidShown ? [] : tablePaidUsed(row.look ?? cleanTableLook({}))));
  const set = <K extends keyof TableLook>(k: K, v: TableLook[K]) => setLook((l) => ({ ...l, [k]: v }));

  const { status } = useAutosave(look, async (v) => {
    const res = await teamsApi<{ look: TableLook; held: string[] }>("/api/war/teams/tables", "PUT", { guild, channel: row.id, look: v });
    if (!res.ok) { toast.error(errorText(res.error)); return false; }
    setHeld(res.data.held);
    onChange({ ...row, look: res.data.look });
    return true;
  });

  // The preview follows the look a moment after it stops changing (one picture, not one per click).
  const query = useMemo(() => JSON.stringify(look), [look]);
  const [shownQuery, setShownQuery] = useState(query);
  useEffect(() => { const t = setTimeout(() => setShownQuery(query), 450); return () => clearTimeout(t); }, [query]);
  const [bump, setBump] = useState(0);
  const src = `/api/war/teams/tables/preview?guild=${encodeURIComponent(guild)}&channel=${encodeURIComponent(row.id)}&look=${encodeURIComponent(shownQuery)}${bump ? `&v=${bump}` : ""}`;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const paidNow = tablePaidUsed(look);
  const showHeld = !paidShown && paidNow.length > 0;
  const frame = TABLE_FRAMES.find((f) => f.id === look.frame);

  const dropBackground = async () => {
    if (!(await confirm({ title: "Stop using the saved background?", body: "New tables in this channel go back to the background below. Posted tables keep theirs.", confirmLabel: "Stop using it" }))) return;
    const res = await teamsApi<{ background: null }>("/api/war/teams/tables", "PUT", { guild, channel: row.id, background: null });
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    onChange({ ...row, look, background: null });
    toast.success("Saved background removed");
    setBump((b) => b + 1);
  };

  return (
    <div className="wtl">
      <figure className="wtl__preview" aria-busy={loaded !== src && failed !== src}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a drawn PNG from our own route */}
        <img
          src={src}
          alt={`Preview of a war table in ${channelName(row)}: ${layoutLabel(look.layout)}.`}
          className={loaded === src ? "wtl__img" : "wtl__img wtl__img--loading"}
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(src)}
        />
        <figcaption className="wtl__caption">
          {failed === src ? "The preview couldn't be drawn just now." : row.wars ? "This channel's newest table, in this look." : "A sample with your teams, in this look."}
        </figcaption>
      </figure>

      <div className="wtl__controls">
        <div className="wt-setting__head">
          <h3 className="wt-setting__title">Look for {channelName(row)}</h3>
          <SaveStatus status={status} />
        </div>

        <AdminField label="Layout" helper={TABLE_LAYOUTS.find((l) => l.id === look.layout)?.line}>
          {(id, d) => <Select id={id} aria-describedby={d} value={look.layout} fullWidth onChange={(v) => set("layout", one(v) as TableLayout)} options={TABLE_LAYOUTS.map((l) => ({ value: l.id, label: l.label }))} />}
        </AdminField>

        <div className="wt-field">
          <Switch checked={look.medals} onChange={(e) => set("medals", e.target.checked)} label="Medals for 1st, 2nd and 3rd" aria-describedby="wtl-medals" />
          <p className="admin-field__help" id="wtl-medals">{look.medals ? "Everyone else shows their place as text." : "Every player shows their place as text."}</p>
        </div>

        {row.background ? (
          <div className="wt-field">
            <span className="admin-field__label">Background</span>
            <div className="wtl__bg">
              {/* eslint-disable-next-line @next/next/no-img-element -- the channel's saved upload */}
              <img src={row.background} alt="" className="wtl__bg-thumb" />
              <p className="admin-field__help">This channel&apos;s saved background, from the table form.</p>
              <Button variant="ghost" size="small" iconBefore={IconPhotoOff} onClick={() => void dropBackground()}>Stop using it</Button>
            </div>
          </div>
        ) : (
          <AdminField label="Background" helper="Upload one in the table form in Discord to use your own picture.">
            {(id, d) => <Select id={id} aria-describedby={d} value={look.ground} fullWidth onChange={(v) => set("ground", one(v) as TableGround)} options={TABLE_GROUNDS.map((g) => ({ value: g.id, label: g.label }))} />}
          </AdminField>
        )}

        <div className="wtl__paid">
          <h4 className="wtl__paid-title">GS Pro or Supporter looks</h4>
          <p className="admin-field__help">Try them here. Tables show them while the account that added GameShuffle Competitive to this server has GS Pro or Supporter looks.</p>
          <AdminField label="Frame colors" helper={look.frame === "teams" ? "The header and the line between teams follow the teams." : "The header bar and the line between teams. Team colors stay on names and totals."}>
            {(id, d) => (
              <Select
                id={id} aria-describedby={d} value={look.frame} fullWidth onChange={(v) => set("frame", one(v))}
                options={TABLE_FRAMES.map((f) => ({ value: f.id, label: f.label, description: f.paid ? "GS Pro or Supporter looks" : "Free" }))}
              />
            )}
          </AdminField>
          {frame?.id === "custom" && (
            <div className="wtl__colors">
              <LookColorPicker label="First color" value={look.c1} onChange={(v) => set("c1", v)} presets={[{ value: "#8cc8f0", label: "Ice" }, { value: "#2b52d6", label: "Blue" }, { value: "#d9363e", label: "Red" }, { value: "#16181f", label: "Black" }]} />
              <LookColorPicker label="Second color" value={look.c2} onChange={(v) => set("c2", v)} presets={[{ value: "#f2c14e", label: "Gold" }, { value: "#c949e9", label: "Magenta" }, { value: "#2fa36b", label: "Green" }, { value: "#ff7a2f", label: "Orange" }]} />
            </div>
          )}
          <AdminField label="Font" helper="For the header, team names, scores and totals. Player names stay easy to read.">
            {(id, d) => <Select id={id} aria-describedby={d} value={look.font} fullWidth onChange={(v) => set("font", one(v) as TableFont)} options={TABLE_FONTS.map((f) => ({ value: f.id, label: f.label, description: f.paid ? "GS Pro or Supporter looks" : "Free" }))} />}
          </AdminField>
          <div className="wt-field">
            <Switch checked={look.light} onChange={(e) => set("light", e.target.checked)} label="Light version" />
          </div>
          <div className="wt-field">
            <Switch checked={look.brand} onChange={(e) => set("brand", e.target.checked)} label="Show gameshuffle.co in the corner" />
          </div>
          {showHeld && (
            <>
              <p className="wtl__held" role="status">
                Saved. Tables here are drawn without {listWords(held.length ? held : paidNow)} until the account that added GameShuffle Competitive has GS Pro or Supporter looks.
              </p>
              <LooksPrompt what="Frame colors, fonts and the light version" from="war-table-looks" compact />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function listWords(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
