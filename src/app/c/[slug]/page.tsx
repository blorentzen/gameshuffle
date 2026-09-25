import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Card, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { resolveStreamSchedule } from "@/lib/schedule/streamSchedule";
import { StreamScheduleCard } from "@/components/schedule/StreamScheduleCard";
import { resolveProfileSkin, skinBackground, skinCssVars, hasCustomBackground } from "@/lib/profile/skin";
import { sanitizeCustomCss, CUSTOM_CSS_SCOPE } from "@/lib/profile/customCss";
import {
  getCommunityBySlug,
  listMembers,
  getMemberCount,
  isMember,
  getCommunityLinks,
  getCommunityCustomization,
  getCommunitySkinCss,
} from "@/lib/communities/membership";
import { resolveAccent, resolveAccentOn } from "@/lib/profile/accents";
import { COMMUNITY_SUBTYPES, communityPresentation } from "@/data/community-sections";
import { listNightsForCommunity } from "@/lib/game-nights/store";
import { nightVisual } from "@/data/game-night-visuals";
import { getLeaderboard } from "@/lib/economy/leaderboards";
import { getOpenMarketsForCommunity } from "@/lib/communities/markets";
import { getAccountBalance } from "@/lib/economy/accountWallet";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { listCommunityCrews, getViewerCrewTiers } from "@/lib/communities/crews";
import { listCommunityBattles, getCrewRecord } from "@/lib/communities/battles";
import { CommunityCrews } from "@/components/communities/CommunityCrews";
import { CommunityBattles } from "@/components/communities/CommunityBattles";
import { listCommunityFeed } from "@/lib/social/feed";
import { CommunityJoinButton } from "@/components/communities/CommunityJoinButton";
import { CommunityFeed } from "@/components/communities/CommunityFeed";
import { CommunityLinksEditor } from "@/components/communities/CommunityLinksEditor";
import { CommunityCustomizeEditor } from "@/components/communities/CommunityCustomizeEditor";
import { CommunityBannerUploader } from "@/components/communities/CommunityBannerUploader";
import { CommunityMemberAdmin } from "@/components/communities/CommunityMemberAdmin";
import { CommunityMarkets } from "@/components/communities/CommunityMarkets";
import { CommunityRaffle } from "@/components/communities/CommunityRaffle";
import { getOpenRaffle, getRaffleSummary, listRaffleHistory } from "@/lib/economy/raffles";
import { effectiveTier, type SubscriptionTier } from "@/lib/subscription";
import { resolveNameColor } from "@/data/arcade-items";
import { PlatformIcon } from "@/components/PlatformIcon";
import { COMMUNITY_LINK_LABEL } from "@/data/community-links";

function fmtNightWhen(iso: string | null, tz: string | null): string {
  if (!iso) return "Date TBA";
  try {
    return new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
  } catch {
    return new Date(iso).toLocaleDateString();
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) return { title: "Community not found" };
  const name = community.displayName || `@${community.slug}`;
  return {
    title: `${name} — Community`,
    description: `Join the ${name} community on GameShuffle — leaderboards, live sessions, and tournaments.`,
    alternates: { canonical: `https://www.gameshuffle.co/c/${community.slug}` },
  };
}

export default async function CommunityHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isChannel = community.kind === "channel";
  const [members, memberCount, leaderboard, viewerIsMember, feed, links, crews] = await Promise.all([
    listMembers(community.id, 60),
    getMemberCount(community.id),
    // Economy leaderboard is a channel (streamer) feature — group communities
    // (families / orgs / events) carry no economy, so skip it entirely.
    isChannel ? getLeaderboard({ kind: "combined", communityId: community.id, limit: 10 }).catch(() => []) : Promise.resolve([]),
    user ? isMember(user.id, community.id) : Promise.resolve(false),
    listCommunityFeed({ communityId: community.id, viewerId: user?.id ?? "", limit: 20 }).catch(() => []),
    getCommunityLinks(community.id).catch(() => []),
    listCommunityCrews(community.id).catch(() => []),
  ]);
  // Prediction markets are also economy/channel-only.
  const openMarkets = isChannel ? await getOpenMarketsForCommunity(community.id).catch(() => []) : [];
  const communityNights = await listNightsForCommunity(community.id).catch(() => []);
  const accountBalance = user ? await getAccountBalance(user.id).catch(() => 0) : 0;
  // Raffle (repeatable token sink) — channels only (they carry the economy).
  const raffleRow = community.kind === "channel" ? await getOpenRaffle(community.id).catch(() => null) : null;
  const raffle = raffleRow ? await getRaffleSummary(raffleRow, user?.id ?? null).catch(() => null) : null;
  const raffleHistory = community.kind === "channel" ? await listRaffleHistory(community.id).catch(() => []) : [];
  // Owner's stream schedule (guarded) — surfaced as its own card.
  // Stream schedule is a streamer thing → channel communities only.
  const streamSchedule = isChannel && community.ownerUserId
    ? resolveStreamSchedule((await supabase.from("users").select("stream_schedule").eq("id", community.ownerUserId).maybeSingle()).data?.stream_schedule)
    : null;
  // Live raffle updates are Circuit-gated (real-time = paid) on the owner's tier.
  let raffleLive = false;
  if (raffleRow && community.ownerUserId) {
    const { data: owner } = await supabase.from("users").select("subscription_tier, role, circuit_tier, circuit_status").eq("id", community.ownerUserId).maybeSingle();
    raffleLive = effectiveTier({
      tier: (owner?.subscription_tier as SubscriptionTier | null) ?? "free",
      role: (owner?.role as string | null) ?? null,
      circuitTier: (owner?.circuit_tier as string | null) ?? null,
      circuitStatus: (owner?.circuit_status as string | null) ?? null,
    }) === "pro";
  }

  const name = community.displayName || `@${community.slug}`;
  const isOwner = !!user && user.id === community.ownerUserId;

  // Crew personalization context: the viewer's tiers + whether they can manage
  // (community owner/mod; captains are handled per-game inside the component).
  const viewerCrewTiers = user ? await getViewerCrewTiers(community.id, user.id).catch(() => ({})) : {};
  let viewerRole: string | null = null;
  if (user) {
    const { data: roleRow } = await supabase.from("community_members").select("role").eq("community_id", community.id).eq("user_id", user.id).maybeSingle();
    viewerRole = (roleRow as { role: string } | null)?.role ?? null;
  }
  // Page management (customize, banner, links, members) — owner + admin.
  const canManage = isOwner || viewerRole === "admin";
  // Crews/chat moderation — the lighter mod tier, plus anyone who can manage.
  const canManageCrews = canManage || viewerRole === "mod";
  const captainGames = Object.entries(viewerCrewTiers).filter(([, t]) => t === "captain").map(([g]) => g);
  const [battles, crewRecord] = await Promise.all([
    listCommunityBattles(community.id).catch(() => []),
    getCrewRecord(community.id).catch(() => ({})),
  ]);

  // Owner-curated personalization (tagline / blurb / accent). Guarded read.
  const customization = await getCommunityCustomization(community.id).catch(() => ({ tagline: null, blurb: null, accent: null, bannerUrl: null, hiddenSections: [] as string[], pinnedPostId: null as string | null }));

  // Phase 3: subtype-aware presentation (header icon, section order, feed copy).
  const pres = communityPresentation(community.kind, community.subtype ?? null);
  // Section render order comes from the subtype preset; CSS `order` reorders the
  // grid items without moving the DOM (hidden sections still render nothing).
  const orderOf = (key: string) => pres.sectionOrder.indexOf(key);

  // Recent posts for the "pin a post" picker in the customize editor.
  const recentPostOptions = feed.slice(0, 15).map((p) => ({
    id: p.id,
    label: (p.body?.trim().slice(0, 60) || "(post)") + ((p.body?.length ?? 0) > 60 ? "…" : ""),
  }));

  // A community is something the owner created → wear their personal theme. A
  // community-specific accent (if set) overrides the owner's personal accent so
  // the community has its own identity.
  const ownerTheme = community.ownerUserId ? await getOwnerThemeVars(community.ownerUserId) : {};
  const communityAccent = resolveAccent(customization.accent);

  // Community skin + custom CSS (parity with profile customization). Guarded;
  // CSS re-sanitized on read (only sanitized CSS is ever stored).
  const { skin: communitySkin, cssRaw } = await getCommunitySkinCss(community.id).catch(() => ({ skin: null as ReturnType<typeof resolveProfileSkin> | null, cssRaw: null }));
  const skin = communitySkin ?? resolveProfileSkin(null);
  const skinBg = skinBackground(skin);
  const communityCss = sanitizeCustomCss(cssRaw).css;

  const themeStyle: React.CSSProperties = {
    ...ownerTheme,
    // The owner's brand primary, so the skin layer can keep the CTA visible
    // against the owner's background.
    ...skinCssVars(skin, (ownerTheme as Record<string, string>)["--brand-primary"]),
    ...(communityAccent
      ? { ["--profile-accent" as string]: communityAccent, ["--profile-accent-on" as string]: resolveAccentOn(customization.accent) ?? "#fff" }
      : {}),
  };
  const bg = skinBg ?? "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

  return (
    <main
      className={`community-page${hasCustomBackground(skin) ? " gs-skinned" : ""}${communityCss ? ` ${CUSTOM_CSS_SCOPE}` : ""}`}
      style={{
        ...themeStyle,
        // The owner's brand primary, so the skin layer can keep the CTA visible
    // against the owner's background.
    ...skinCssVars(skin, (ownerTheme as Record<string, string>)["--brand-primary"]),
        background: bg,
        ...(skin.bg.kind === "image" ? { backgroundSize: "cover", backgroundPosition: "center", backgroundAttachment: "fixed", backgroundRepeat: "no-repeat" } : {}),
        minHeight: "100vh",
        paddingBottom: "var(--spacing-64)",
      }}
    >
      {communityCss && <style dangerouslySetInnerHTML={{ __html: communityCss }} />}
      {customization.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={customization.bannerUrl} alt="" style={{ width: "100%", height: "clamp(140px, 22vw, 260px)", objectFit: "cover", display: "block" }} />
      )}
      <Container>
        {/* Header */}
        {/* Colours come from CSS, not inline styles, so a skinned page can
            override them. Inline wins the cascade, which is exactly why the
            title was invisible on an orange background. */}
        <section className="chero">
          <p className="marketing-eyebrow chero__eyebrow">
            {pres.icon && <span aria-hidden style={{ marginRight: "0.4em" }}>{pres.icon}</span>}
            {community.kind === "group"
              ? (COMMUNITY_SUBTYPES.find((s) => s.value === community.subtype)?.label ?? "Community")
              : "Community"}
          </p>
          <h1 className="chero__title">{name}</h1>
          <p className="chero__handle">@{community.slug}</p>
          {customization.tagline ? (
            <p className="chero__tagline">{customization.tagline}</p>
          ) : pres.descriptor ? (
            <p className="chero__descriptor">{pres.descriptor}</p>
          ) : null}
          {crews.length > 0 && (
            <p className="chero__crews">
              {crews.reduce((n, c) => n + c.total, 0)} representing across {crews.length} {crews.length === 1 ? "game" : "games"}
            </p>
          )}
          <CommunityJoinButton communityId={community.id} slug={community.slug} initialMember={viewerIsMember} initialCount={memberCount} joinLabel={pres.joinLabel} joinedLabel={pres.joinedLabel} />
          <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginTop: "var(--spacing-16)" }}>
            {community.kind === "channel" && (
              <>
                <Link href={`/live/${community.slug}`} style={{ textDecoration: "none" }}>
                  <Button variant="secondary" size="small">Watch live</Button>
                </Link>
                <Link href={`/u/${community.slug}`} style={{ textDecoration: "none" }}>
                  <Button variant="secondary" size="small">View profile</Button>
                </Link>
              </>
            )}
            {canManage && <CommunityCustomizeEditor communityId={community.id} initial={{ ...customization, skin, css: cssRaw ?? "" }} recentPosts={recentPostOptions} />}
            {canManage && <CommunityBannerUploader communityId={community.id} hasBanner={!!customization.bannerUrl} />}
          </div>
          {customization.blurb && (
            <p className="chero__blurb">{customization.blurb}</p>
          )}

          {/* Where to find the creator — their live + community links. */}
          {(links.length > 0 || canManage) && (
            <div style={{ marginTop: "var(--spacing-20)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap", marginBottom: "var(--spacing-8)" }}>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-12)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Where to find us</span>
                {canManage && <CommunityLinksEditor communityId={community.id} initialLinks={links} />}
              </div>
              {links.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)" }}>
                  {links.map((l) => (
                    <a key={l.platform} href={l.url} target="_blank" rel="noopener noreferrer nofollow"
                      style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-6)", textDecoration: "none", color: "var(--text-secondary)", fontSize: "var(--font-size-14)", padding: "0.4rem 0.7rem", borderRadius: "0.6rem", border: "1px solid var(--border-default)", background: "var(--surface-default)" }}>
                      <PlatformIcon platform={l.platform} size={16} dim={false} />
                      {COMMUNITY_LINK_LABEL[l.platform] ?? l.platform}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--spacing-20)" }}>
          {/* Live prediction markets (only when the creator is live with an open market) */}
          {!customization.hiddenSections.includes("markets") && openMarkets.length > 0 && (
            <Card padding="large" style={{ order: orderOf("markets"), borderColor: "var(--primary-300, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 5%, var(--surface-default))" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", marginBottom: "var(--spacing-12)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#e0245e", display: "inline-block" }} />
                <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: 0 }}>Live prediction{openMarkets.length > 1 ? "s" : ""}</h2>
              </div>
              <CommunityMarkets
                communityId={community.id}
                slug={community.slug}
                markets={openMarkets}
                isMember={viewerIsMember}
                initialBalance={accountBalance}
              />
            </Card>
          )}

          {/* Raffle — repeatable token sink (channels only) */}
          {community.kind === "channel" && (raffle || canManageCrews || raffleHistory.length > 0) && (
            <div style={{ order: orderOf("raffles") }}>
              <CommunityRaffle
                communityId={community.id}
                initialRaffle={raffle}
                canManage={canManageCrews}
                signedIn={!!user}
                initialBalance={accountBalance}
                live={raffleLive}
                history={raffleHistory}
              />
            </div>
          )}

          {/* Crews — per-game representation rosters */}
          {!customization.hiddenSections.includes("crews") && (
            <div style={{ order: orderOf("crews") }}>
              <CommunityCrews
                communityId={community.id}
                crews={crews}
                viewerTiers={viewerCrewTiers}
                isMember={viewerIsMember}
                canManage={canManageCrews}
                viewerId={user?.id ?? ""}
                members={members.map((m) => ({ id: m.userId, name: m.displayName || m.username || "Player" }))}
              />
            </div>
          )}

          {/* Crew battles — cross-community matches + record */}
          {!customization.hiddenSections.includes("battles") && (
            <div style={{ order: orderOf("battles") }}>
              <CommunityBattles
                communityId={community.id}
                battles={battles}
                record={crewRecord}
                canManage={canManageCrews}
                captainGames={captainGames}
              />
            </div>
          )}

          {/* Feed */}
          <Card padding="large" style={{ order: orderOf("feed") }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>{pres.feedHeading}</h2>
            {!viewerIsMember && (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>Join the community to post.</p>
            )}
            {viewerIsMember && feed.length === 0 && (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>{pres.feedEmpty}</p>
            )}
            <CommunityFeed communityId={community.id} communityName={name} initialPosts={feed} canPost={viewerIsMember} isOwner={isOwner} currentUserId={user?.id ?? null} pinnedPostId={customization.pinnedPostId} />
          </Card>

          {/* Game nights posted to this community */}
          {communityNights.length > 0 && (
            <Card padding="large" style={{ order: orderOf("gamenights") }}>
              <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>Game nights</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))", gap: "var(--spacing-12)" }}>
                {communityNights.map((n) => {
                  const v = nightVisual(n.id);
                  return (
                    <Link key={n.id} href={`/game-nights/${n.id}`} className="bgn-card">
                      <span className={`bgn-card__hero${n.cover_image_url ? " bgn-card__hero--img" : ""}`} style={n.cover_image_url ? undefined : { background: v.gradient }}>
                        {n.cover_image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={n.cover_image_url} alt="" className="bgn-card__hero-photo" />
                          : <span className="bgn-card__hero-emoji" aria-hidden>{v.emoji}</span>}
                      </span>
                      <span className="bgn-card__body">
                        <span className="bgn-card__when">{fmtNightWhen(n.starts_at, n.timezone)}</span>
                        <span className="bgn-card__title">{n.title}</span>
                        {n.place && <span className="bgn-card__place">{n.place}</span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Leaderboard — economy, channel communities only */}
          {isChannel && !customization.hiddenSections.includes("leaderboard") && (
          <Card padding="large" style={{ order: orderOf("leaderboard") }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>No token activity yet. Play, chat, or bet to climb the board.</p>
            ) : (
              <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
                {leaderboard.map((row, i) => (
                  <li key={row.identityId} style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", fontSize: "var(--font-size-14)" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, width: "1.8rem", color: i < 3 ? "var(--bg-primary, var(--primary-600))" : "var(--text-tertiary)" }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.displayName || "Anonymous"}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{row.score.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          )}

          {/* Stream schedule */}
          {streamSchedule && (
            <Card padding="large" style={{ order: orderOf("members") }}>
              <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>Stream schedule</h2>
              <StreamScheduleCard schedule={streamSchedule} />
            </Card>
          )}

          {/* Members */}
          <Card padding="large" style={{ order: orderOf("members") }}>
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>
              {pres.membersLabel} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {memberCount.toLocaleString()}</span>
              {members.some((m) => m.online) && (
                <span style={{ marginLeft: "var(--spacing-12)", fontSize: "var(--font-size-14)", fontWeight: 600, color: "#16a34a" }}>● {members.filter((m) => m.online).length} online</span>
              )}
            </h2>
            {members.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>{pres.membersEmpty}</p>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "var(--spacing-8) var(--spacing-16)" }}>
                {members.map((m) => {
                  const label = m.displayName || (m.username ? `@${m.username}` : "Member");
                  const inner = (
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
                      <span style={{ position: "relative", display: "inline-flex", width: 28, height: 28, borderRadius: "50%", alignItems: "center", justifyContent: "center", background: "color-mix(in srgb, var(--primary-500) 16%, var(--surface-default))", fontWeight: 700, flex: "0 0 auto" }}>
                        {label.replace("@", "")[0]?.toUpperCase() ?? "?"}
                        {m.online && <span title="Online" style={{ position: "absolute", bottom: 0, right: 0, width: 9, height: 9, borderRadius: "50%", background: "#22c55e", border: "2px solid var(--surface-default)" }} />}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: resolveNameColor(m.nameColorItem) ?? undefined }}>{label}{m.role !== "member" ? <em style={{ color: "var(--text-tertiary)", fontStyle: "normal" }}> · {m.role}</em> : null}</span>
                    </div>
                  );
                  // Owner + admins manage members; but only the owner may
                  // grant/revoke the admin role or act on another admin.
                  const targetIsAdmin = m.role === "admin";
                  const showAdmin =
                    canManage &&
                    m.userId !== community.ownerUserId &&
                    (isOwner || !targetIsAdmin);
                  return (
                    <div key={m.userId}>
                      {m.username ? (
                        <Link href={`/u/${m.username}`} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>
                      ) : inner}
                      {showAdmin && (
                        <CommunityMemberAdmin communityId={community.id} userId={m.userId} name={label} role={m.role} canGrantAdmin={isOwner} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </Container>
    </main>
  );
}
