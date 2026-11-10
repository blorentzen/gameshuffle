"use client";

/**
 * A server's Teams page (overrides picks 2026-11-09; grew out of the Logos page, war tools pick 5A): each team's
 * logo, name, every tag it plays under (the first is the one tables show), color and players (in-game name → the
 * name and flag tables show, and who set it), then the logos as before, then how the server's typed races read and
 * its track nicknames. Before wars-m5.sql runs, only the logos. With wars-m6.sql (logos + MKCentral picks 2026-11-09,
 * all A): each team's MKCentral link (link, update, unlink), the logo it shows and why, and a linked team's MKCentral
 * players beside the server's own lines.
 */

import { useState } from "react";
import { Button, Chip, EmptyState } from "@empac/cascadeds";
import { IconEye, IconPlus, IconUserPlus, IconUsersGroup } from "@tabler/icons-react";
import { AdminRowMenu, AdminSection } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import type { LogoPageData } from "@/lib/wars/logoAdmin";
import { LOGO_SOURCE_LABEL, logoNow, ownLogo, type MkcPlayerView, type TeamPlayerView, type TeamView, type TeamsView } from "@/lib/wars/teamView";
import { WarTeamMark } from "./WarPageBits";
import { WarLogosManager } from "./WarLogosManager";
import { WarTeamEditor, type TeamDraft } from "./WarTeamEditor";
import { WarAddPlayers, WarEditPlayer, type PlayerPreset } from "./WarPlayerForms";
import { WarTeamPlayers } from "./WarTeamPlayers";
import { WarMkcLine, WarMkcLinkModal } from "./WarMkcLink";
import { WarServerSettings } from "./WarServerSettings";
import { WarTableLooks } from "./WarTableLooks";
import { errorText, teamsApi, type WithView } from "./teamsApi";

type Saved = LogoPageData["logos"][number];

const teamLabel = (t: TeamView) => t.name ?? t.tags[0];

function countLine(t: TeamView): string {
  const n = t.players.length;
  const own = t.players.filter((p) => p.setBy === "themselves").length;
  if (t.links?.mkc && t.mkcPlayers) {
    const m = t.mkcPlayers.length;
    return `${m} on MKCentral · ${n} on your list${own ? ` · ${own} set their own card` : ""}`;
  }
  if (!n) return "No players yet";
  return `${n === 1 ? "1 player" : `${n} players`}${own ? ` · ${own} set their own card` : ""}`;
}

/** The logo a team shows now (by its logo setting once wars-m6 has run). */
function logoOf(t: TeamView, logos: Saved[]) {
  const upload = ownLogo(t.tags, logos)?.url ?? null;
  if (!t.links) return { url: upload ?? t.mkLogo, line: null };
  const now = logoNow(t.links.source, { upload, linked: t.links.mkc ? { name: t.links.mkc.name, logo: t.links.mkc.logo } : null, tagLogo: t.links.tagLogo });
  return { url: now.url, line: `Logo: ${now.short} (${LOGO_SOURCE_LABEL[t.links.source]})` };
}

export function WarTeamsManager({ guild, serverName, logos: logoData, initial }: { guild: string; serverName: string; logos: LogoPageData; initial: TeamsView | null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [logos, setLogos] = useState<Saved[]>(logoData.logos);
  const [view, setView] = useState<TeamsView | null>(initial);
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [adding, setAdding] = useState<TeamView | null>(null);
  const [editing, setEditing] = useState<{ team: TeamView; player: TeamPlayerView } | null>(null);
  const [linking, setLinking] = useState<TeamView | null>(null);
  const [tying, setTying] = useState<{ team: TeamView; preset: PlayerPreset } | null>(null);

  // The view comes back with every change; null would mean the tables went away, so keep what's on screen.
  const take = (v: TeamsView | null) => { if (v) setView(v); };

  const removeTeam = async (t: TeamView) => {
    const ok = await confirm({
      title: `Remove ${teamLabel(t)}?`,
      body: "Its name, tags, color and player list go, and tables show the team as the game does. Its logo stays: logos belong to tags, below.",
      confirmLabel: "Remove team",
    });
    if (!ok) return;
    const res = await teamsApi<WithView>(`/api/war/teams?guild=${encodeURIComponent(guild)}&id=${encodeURIComponent(t.id)}`, "DELETE");
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    take(res.data.view);
    toast.success(`${teamLabel(t)} removed`);
  };

  const removePlayer = async (t: TeamView, p: TeamPlayerView) => {
    const ok = await confirm({ title: `Take ${p.ingame} off ${teamLabel(t)}?`, body: "Tables show them as the game does, or as their own card says.", confirmLabel: "Remove player" });
    if (!ok) return;
    const res = await teamsApi<WithView>(`/api/war/teams/players?guild=${encodeURIComponent(guild)}&id=${encodeURIComponent(p.id)}`, "DELETE");
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    take(res.data.view);
    toast.success(`${p.ingame} removed`);
  };

  const tie = (t: TeamView, p: MkcPlayerView) => setTying({ team: t, preset: { mkcPlayerId: p.id, name: p.name, shown: p.shown, flag: p.flag } });
  const latest = (t: TeamView) => view?.teams.find((x) => x.id === t.id) ?? t;

  return (
    <>
      {view && (
        <AdminSection
          title="Teams"
          intro={view.linksReady
            ? "Tables show each team's first tag; the others are tags it also plays under. What you set here sticks on every table this server posts, and comes before anything GameShuffle finds on MKCentral."
            : "Tables show each team's first tag; the others are tags it also plays under. What you set here sticks on every table this server posts. Linking teams to MKCentral and choosing where each logo comes from arrive with the next update."}
          actions={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setDraft({ team: null })}>Add a team</Button>}
        >
          {view.teams.length === 0 ? (
            <EmptyState
              icon={<IconUsersGroup size={28} aria-hidden />}
              title="No teams yet"
              description="Add your own team first: its tags, name and players. Then any team you play often."
              action={<Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setDraft({ team: null })}>Add a team</Button>}
            />
          ) : (
            <ul className="wt-list">
              {view.teams.map((t) => {
                const label = teamLabel(t);
                const logo = logoOf(t, logos);
                return (
                  <li key={t.id} className="wt-team">
                    <div className="wt-team__head">
                      <WarTeamMark tag={t.tags[0]} logo={logo.url} color={t.color} size="lg" />
                      <div className="wt-team__who">
                        <h3 className="wt-team__name">{label}</h3>
                        <div className="wt-tags">
                          {t.tags.map((g, i) => (
                            <Chip key={g} size="small" variant={i === 0 ? "primary" : "default"} icon={i === 0 ? <IconEye size={14} aria-hidden /> : undefined}>
                              {g}{i === 0 && <span className="sr-only"> (shown on tables)</span>}
                            </Chip>
                          ))}
                          {(t.color ?? t.logoColor) && (
                            <span className="wt-color" title={t.color ? "Team color" : "Picked from the logo"}>
                              <span className="wt-color__swatch" style={{ background: (t.color ?? t.logoColor)! }} aria-hidden="true" />
                              {!t.color && <span className="wt-color__from">from the logo</span>}
                              <span className="sr-only">{t.color ? `Team color ${t.color}` : `Tables use ${t.logoColor}, picked from the logo`}</span>
                            </span>
                          )}
                        </div>
                        {t.links && <WarMkcLine guild={guild} team={t} onLink={() => setLinking(t)} onView={take} />}
                        <p className="wt-team__line">{countLine(t)}</p>
                        {logo.line && <p className="wt-team__line">{logo.line}</p>}
                      </div>
                      <span className="admin-row-actions wt-team__acts">
                        <Button variant="ghost" size="small" onClick={() => setDraft({ team: t })} aria-label={`Edit ${label}`}>Edit</Button>
                        <Button variant="secondary" size="small" iconBefore={IconUserPlus} onClick={() => setAdding(t)} aria-label={`Add players to ${label}`}>Add players</Button>
                        <AdminRowMenu
                          label={`More for ${label}`}
                          items={[
                            ...(t.links?.mkc ? [{ label: "Link a different MKCentral team", onClick: () => setLinking(t) }] : []),
                            { label: "Remove team", danger: true, onClick: () => void removeTeam(t) },
                          ]}
                        />
                      </span>
                    </div>

                    <WarTeamPlayers
                      team={t}
                      onEdit={(p) => setEditing({ team: t, player: p })}
                      onRemove={(p) => void removePlayer(t, p)}
                      onAdd={(p) => tie(t, p)}
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {view.played.length > 0 && (
            <div className="wt-played">
              <p className="wt-played__label">From your wars, with no team set up yet:</p>
              <div className="wt-played__list">
                {view.played.map((p) => (
                  <Button key={p.tag} variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setDraft({ team: null, tag: p.tag, name: p.name })} aria-label={`Add ${p.name ?? p.tag} as a team`}>
                    {p.tag}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </AdminSection>
      )}

      <WarLogosManager guild={guild} serverName={serverName} initial={logoData} logos={logos} onLogos={setLogos} />

      <WarTableLooks guild={guild} />

      {view && <WarServerSettings guild={guild} view={view} />}

      {draft && (
        <WarTeamEditor
          guild={guild}
          draft={draft}
          linksReady={!!view?.linksReady}
          logos={logos}
          onLogos={setLogos}
          onClose={() => setDraft(null)}
          onSaved={(v) => { take(v); setDraft(null); }}
        />
      )}
      {adding && view && (
        <WarAddPlayers guild={guild} team={view.teams.find((t) => t.id === adding.id) ?? adding} onClose={() => setAdding(null)} onView={take} />
      )}
      {editing && (
        <WarEditPlayer guild={guild} team={editing.team} player={editing.player} onClose={() => setEditing(null)} onView={take} />
      )}
      {tying && (
        <WarAddPlayers guild={guild} team={latest(tying.team)} preset={tying.preset} onClose={() => setTying(null)} onView={take} />
      )}
      {linking && view && (
        <WarMkcLinkModal guild={guild} team={latest(linking)} games={view.games} onClose={() => setLinking(null)} onView={take} />
      )}
    </>
  );
}
