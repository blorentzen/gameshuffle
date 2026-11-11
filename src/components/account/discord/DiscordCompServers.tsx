"use client";

/**
 * GameShuffle Competitive's servers (picks 2026-10-30): each with the channel its posts go to, its Mario Kart lounge
 * posts (rank-ups free; division roles and the Monday board GS Pro; moved here from GameShuffle, whose settings for
 * the server come along), its speedrun posts (new PBs free, pace alerts GS Pro), its time trial panels (post, move or take down; picks Nn8Qv4EVRDL6zojwHVCcdN), Remove,
 * and Add it to a server. Free accounts: 1 server, GS Pro: 5, counted apart from GameShuffle's own.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Switch } from "@empac/cascadeds";
import Link from "next/link";
import { MMR_GAMES, MMR_GAME_IDS } from "@/lib/mmr/rules";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { AdminSection } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

type PanelGame = "mk8dx" | "mkworld" | "both";
interface Lounge { rankUps: boolean; rolesGame: string | null; boardGame: string | null; carried: boolean }
interface Speedrun { pbs: boolean; pace: boolean; paceRole: string | null }
interface Server { guildId: string; name: string | null; removedAt: string | null; settings: { channel?: string | null; ttPanels?: Partial<Record<PanelGame, { channel: string; message: string }>> }; lounge?: Lounge; speedrun?: Speedrun }
interface Data { live: boolean; ready: boolean; limit: number; pro?: boolean; servers: Server[] }

const LOUNGE_GAMES = [{ value: "", label: "Off" }, ...MMR_GAME_IDS.map((g) => ({ value: g, label: MMR_GAMES[g].short }))];

/** The server's Mario Kart lounge posts: rank-ups (free), division roles and the Monday board (GS Pro). Saves on change. */
function LoungePanel({ guildId, start, pro, hasChannel }: { guildId: string; start: Lounge; pro: boolean; hasChannel: boolean }) {
  const toast = useToast();
  const [lounge, setLounge] = useState(start);
  const save = async (patch: Partial<Pick<Lounge, "rankUps" | "rolesGame" | "boardGame">>) => {
    const before = lounge;
    setLounge({ ...lounge, ...patch, carried: false });
    const res = await fetch("/api/discord/apps/comp/servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ guild: guildId, lounge: patch }) }).catch(() => null);
    if (res?.ok) toast.success("Saved");
    else { setLounge(before); toast.error(res?.status === 403 ? "Division roles and the Monday board come with GS Pro." : "Couldn't save that. Try again in a moment."); }
  };
  return (
    <div className="discord-apps__panel">
      <strong>Mario Kart lounge</strong>
      <p className="discord-apps__help">For members who confirmed their lounge name on <Link href="/lounge">GameShuffle</Link>.{lounge.carried ? " These came over from GameShuffle in this server." : ""}</p>
      <Switch label="Post rank-ups" checked={lounge.rankUps} onChange={(e) => void save({ rankUps: e.target.checked })} />
      <p className="discord-apps__help">{hasChannel ? "When a member reaches a new division, once per season." : "Rank-ups need a channel: pick where posts go above."}</p>
      <div className="discord-apps__panel-row">
        <Select id={`comp-roles-${guildId}`} floatingLabel="Division roles follow" fullWidth value={lounge.rolesGame ?? ""} disabled={!pro} onChange={(v) => void save({ rolesGame: String(v) || null })} options={LOUNGE_GAMES} />
        <Select id={`comp-board-${guildId}`} floatingLabel="Monday board covers" fullWidth value={lounge.boardGame ?? ""} disabled={!pro} onChange={(v) => void save({ boardGame: String(v) || null })} options={LOUNGE_GAMES} />
      </div>
      <p className="discord-apps__help">
        {pro
          ? "Division roles: the bot makes Iron to Grandmaster the first time, so it needs Manage Roles with its own role above them. Rank-ups and the board go to the channel above."
          : <>Division roles and the Monday board come with <Link href="/gs-pro?from=comp-lounge">GS Pro</Link>. Rank-ups are free.</>}
      </p>
    </div>
  );
}

/** Speedrun posts (speedrun Discord picks 2026-11-10): new PBs (free), PB pace alerts with an optional role ping (GS Pro). */
function SpeedrunPanel({ guildId, start, pro, hasChannel, roles }: { guildId: string; start: Speedrun; pro: boolean; hasChannel: boolean; roles: { id: string; name: string }[] | null }) {
  const toast = useToast();
  const [sr, setSr] = useState(start);
  const save = async (patch: Partial<Speedrun>) => {
    const before = sr;
    setSr({ ...sr, ...patch });
    const res = await fetch("/api/discord/apps/comp/servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ guild: guildId, speedrun: patch }) }).catch(() => null);
    if (res?.ok) toast.success("Saved");
    else { setSr(before); toast.error(res?.status === 403 ? "PB pace alerts come with GS Pro." : "Couldn't save that. Try again in a moment."); }
  };
  return (
    <div className="discord-apps__panel">
      <strong>Speedrunning</strong>
      <p className="discord-apps__help">For you and members who connected GameShuffle with Discord and run with a <Link href="/speedrun">GameShuffle speedrun setup</Link>. Anyone can look a runner up with /pb.</p>
      <Switch label="Post new PBs" checked={sr.pbs} onChange={(e) => void save({ pbs: e.target.checked })} />
      <p className="discord-apps__help">{hasChannel ? "The time, how much faster, gold splits and a Watch on Twitch button, after the runner's stream delay." : "PB posts need a channel: pick where posts go above."}</p>
      <Switch label="PB pace alerts" checked={sr.pace} disabled={!pro} onChange={(e) => void save({ pace: e.target.checked })} />
      <div className="discord-apps__panel-row">
        <Select id={`comp-pace-role-${guildId}`} floatingLabel="Pace alerts ping" fullWidth value={sr.paceRole ?? ""} disabled={!pro || !sr.pace || !roles}
          onChange={(v) => void save({ paceRole: String(v) || null })}
          options={[{ value: "", label: roles ? "No one" : "Loading roles…" }, ...(roles ?? []).map((r) => ({ value: r.id, label: `@${r.name}` }))]} />
      </div>
      <p className="discord-apps__help">
        {pro
          ? "Once per run, when a live runner is ahead of PB with a quarter of the run left. The bot can only ping roles that allow mentions."
          : <>PB pace alerts come with <Link href="/gs-pro?from=comp-speedrun">GS Pro</Link>. PB posts are free.</>}
      </p>
    </div>
  );
}

const INSTALL = "/api/discord/bot/install/start?app=comp";
const ERRORS: Record<string, string> = {
  server_taken: "Another GameShuffle account already has GameShuffle Competitive in that server.",
  server_limit: "You're at your plan's server limit for GameShuffle Competitive. Remove one, or upgrade to GS Pro for up to 5.",
  not_ready: "This needs a quick update on our side first. Try again later.",
  access_denied: "Discord didn't finish adding it. Try again when you're ready.",
};
const PANEL_GAMES: { value: PanelGame; label: string }[] = [
  { value: "mk8dx", label: "Mario Kart 8 Deluxe" },
  { value: "mkworld", label: "Mario Kart World" },
  { value: "both", label: "Both games" },
];
const PANEL_ERRORS: Record<string, string> = {
  no_access: "GameShuffle Competitive can't post in that channel. Give it Send Messages there and try again.",
  no_channel: "That channel isn't there any more.",
  failed: "The panel couldn't be posted. Try again?",
};

function ServerRow({ s, pro, onChanged }: { s: Server; pro: boolean; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [channels, setChannels] = useState<{ id: string; name: string }[] | null>(null);
  const [roles, setRoles] = useState<{ id: string; name: string }[] | null>(null);
  const [channel, setChannel] = useState(s.settings.channel ?? "");
  const [panelGame, setPanelGame] = useState<PanelGame>("mk8dx");
  const [panelChannel, setPanelChannel] = useState("");
  const [posting, setPosting] = useState(false);
  const panels = (Object.entries(s.settings.ttPanels ?? {}) as [PanelGame, { channel: string }][]);
  const channelName = (id: string) => channels?.find((c) => c.id === id)?.name ?? null;

  useEffect(() => {
    let gone = false;
    void fetch(`/api/discord/apps/comp/servers?guild=${encodeURIComponent(s.guildId)}`).then((r) => r.json()).then((d: { channels?: { id: string; name: string }[] | null; roles?: { id: string; name: string }[] | null }) => {
      if (gone) return;
      setChannels(d.channels ?? []);
      setRoles(d.roles ?? []);
    }).catch(() => { if (!gone) { setChannels([]); setRoles([]); } });
    return () => { gone = true; };
  }, [s.guildId]);

  const save = async (v: string) => {
    setChannel(v);
    const res = await fetch("/api/discord/apps/comp/servers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ guild: s.guildId, settings: { channel: v || null } }) });
    if (res.ok) toast.success("Saved"); else toast.error("Couldn't save that. Try again?");
  };
  const remove = async () => {
    const ok = await confirm({ title: `Forget ${s.name ?? "this server"}?`, body: "GameShuffle stops posting there. To take the bot out of the server too, remove it in Discord's server settings.", confirmLabel: "Forget server" });
    if (!ok) return;
    const res = await fetch(`/api/discord/apps/comp/servers?guild=${encodeURIComponent(s.guildId)}`, { method: "DELETE" });
    if (res.ok) { toast.success("Server forgotten."); onChanged(); } else toast.error("Couldn't do that. Try again?");
  };
  const postPanel = async () => {
    if (!panelChannel) return;
    setPosting(true);
    const res = await fetch("/api/discord/apps/comp/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "panel", guild: s.guildId, channel: panelChannel, game: panelGame }) }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { ok?: boolean; pinned?: boolean; error?: string } | undefined;
    setPosting(false);
    if (!data?.ok) { toast.error(PANEL_ERRORS[data?.error ?? ""] ?? PANEL_ERRORS.failed); return; }
    toast.success(data.pinned ? "Panel posted and pinned." : "Panel posted. Pin it in Discord so it stays at the top.");
    onChanged();
  };
  const takeDown = async (game: PanelGame) => {
    const label = PANEL_GAMES.find((g) => g.value === game)?.label ?? "this";
    const ok = await confirm({ title: `Take down the ${game === "both" ? "time trial" : label} panel?`, body: "Its message is deleted from the channel. Times stay on the boards.", confirmLabel: "Take it down" });
    if (!ok) return;
    const res = await fetch("/api/discord/apps/comp/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "panel_remove", guild: s.guildId, game }) }).catch(() => null);
    if (res?.ok) { toast.success("Panel taken down."); onChanged(); } else toast.error("Couldn't do that. Try again?");
  };

  return (
    <li className="discord-apps__server">
      <div className="discord-apps__server-head">
        <strong>{s.name ?? "A server"}</strong>
        {s.removedAt && <span className="discord-apps__note">The bot was removed from this server</span>}
      </div>
      <div className="discord-apps__server-row">
        <Select id={`comp-ch-${s.guildId}`} floatingLabel="Posts go to" fullWidth value={channel}
          disabled={!channels}
          onChange={(v) => void save(String(v))}
          options={[{ value: "", label: channels ? "Pick a channel" : "Loading channels…" }, ...(channels ?? []).map((c) => ({ value: c.id, label: `#${c.name}` }))]} />
        <Button variant="ghost" size="small" iconBefore={IconTrash} onClick={() => void remove()} aria-label={`Forget ${s.name ?? "this server"}`}>Forget</Button>
      </div>
      {!s.removedAt && (
        <div className="discord-apps__panel">
          <strong>Time trial panel</strong>
          {panels.length ? (
            <ul className="discord-apps__panels">
              {panels.map(([g, p]) => (
                <li key={g}>
                  <span>{PANEL_GAMES.find((x) => x.value === g)?.label} · {channelName(p.channel) ? `#${channelName(p.channel)}` : "a channel"}</span>
                  <Button variant="ghost" size="small" onClick={() => void takeDown(g)} aria-label={`Take down the ${PANEL_GAMES.find((x) => x.value === g)?.label} panel`}>Take it down</Button>
                </li>
              ))}
            </ul>
          ) : <p className="discord-apps__help">A message with Add a time, Top ten and My times, kept up to date as times come in.</p>}
          <div className="discord-apps__panel-row">
            <Select id={`comp-panel-game-${s.guildId}`} floatingLabel="Game" fullWidth value={panelGame}
              onChange={(v) => setPanelGame(String(v) as PanelGame)} options={PANEL_GAMES} />
            <Select id={`comp-panel-ch-${s.guildId}`} floatingLabel="Channel" fullWidth value={panelChannel} disabled={!channels}
              onChange={(v) => setPanelChannel(String(v))}
              options={[{ value: "", label: channels ? "Pick a channel" : "Loading channels…" }, ...(channels ?? []).map((c) => ({ value: c.id, label: `#${c.name}` }))]} />
            <Button variant="secondary" disabled={!panelChannel || posting} onClick={() => void postPanel()}>
              {s.settings.ttPanels?.[panelGame] ? "Move the panel" : "Post the panel"}
            </Button>
          </div>
          <p className="discord-apps__help">Or type /tt panel in the channel. Posting again moves it.</p>
        </div>
      )}
      {!s.removedAt && s.lounge && <LoungePanel guildId={s.guildId} start={s.lounge} pro={pro} hasChannel={!!channel} />}
      {!s.removedAt && s.speedrun && <SpeedrunPanel guildId={s.guildId} start={s.speedrun} pro={pro} hasChannel={!!channel} roles={roles} />}
      {!s.removedAt && (
        <div className="discord-apps__panel">
          <strong>Teams</strong>
          <p className="discord-apps__help">Names, tags, colors, logos and players for war cards, tables and the overlay. Add logos many at once there, or one at a time with /logo add.</p>
          <div><ArrowLink href={`/account/discord/teams/${s.guildId}`}>Manage teams</ArrowLink></div>
        </div>
      )}
    </li>
  );
}

export function DiscordCompServers() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/discord/apps/comp/servers", { cache: "no-store" }).catch(() => null);
    setData(res?.ok ? ((await res.json()) as Data) : { live: false, ready: false, limit: 1, servers: [] });
  }, []);
  useEffect(() => {
    void load();
    // Back from Discord's install screen.
    const q = new URLSearchParams(window.location.search);
    if (q.get("discord_installed")) toast.success(q.get("discord_installed") === "again" ? "GameShuffle Competitive is already in that server." : "GameShuffle Competitive is in your server. Pick the channel for its posts.");
    const err = q.get("discord_install_error");
    if (err) toast.error(ERRORS[err] ?? "Couldn't add GameShuffle Competitive. Try again?");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <p className="discord-apps__help">Loading…</p>;
  if (!data.ready) return <p className="discord-apps__help">GameShuffle Competitive needs a quick update on our side before it can be added. Check back soon.</p>;
  const active = data.servers.filter((s) => !s.removedAt);
  return (
    <AdminSection title="GameShuffle Competitive">
      <p className="discord-apps__help">Time trials, wars, MMR and room reads, with short commands: /tt, /war, /mmr, /room and /pb, plus Mario Kart lounge rank-ups, division roles, the Monday board and speedrun PB posts. Its servers count apart from GameShuffle&apos;s: {data.limit === 1 ? "1 server" : `up to ${data.limit} servers`} on your plan.</p>
      {data.servers.length ? (
        <ul className="discord-apps__servers">
          {data.servers.map((s) => <ServerRow key={s.guildId} s={s} pro={!!data.pro} onChanged={() => void load()} />)}
        </ul>
      ) : <p className="discord-apps__help">It isn&apos;t in any of your servers yet.</p>}
      <div>
        {active.length < data.limit
          ? <Button variant={data.servers.length ? "secondary" : "primary"} iconBefore={IconPlus} onClick={() => window.location.assign(INSTALL)}>{data.servers.length ? "Add it to another server" : "Add it to a server"}</Button>
          : <p className="discord-apps__help">That&apos;s your plan&apos;s limit. GS Pro adds it to up to 5 servers.</p>}
      </div>
    </AdminSection>
  );
}
