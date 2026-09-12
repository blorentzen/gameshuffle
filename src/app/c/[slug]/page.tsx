import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, Card, Button } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import {
  getCommunityBySlug,
  listMembers,
  getMemberCount,
  isMember,
  getCommunityLinks,
} from "@/lib/communities/membership";
import { getLeaderboard } from "@/lib/economy/leaderboards";
import { getOpenMarketsForCommunity } from "@/lib/communities/markets";
import { getAccountBalance } from "@/lib/economy/accountWallet";
import { listCommunityFeed } from "@/lib/social/feed";
import { CommunityJoinButton } from "@/components/communities/CommunityJoinButton";
import { CommunityFeed } from "@/components/communities/CommunityFeed";
import { CommunityLinksEditor } from "@/components/communities/CommunityLinksEditor";
import { CommunityMarkets } from "@/components/communities/CommunityMarkets";
import { resolveNameColor } from "@/data/arcade-items";
import { PlatformIcon } from "@/components/PlatformIcon";
import { COMMUNITY_LINK_LABEL } from "@/data/community-links";

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

  const [members, memberCount, leaderboard, viewerIsMember, feed, links] = await Promise.all([
    listMembers(community.id, 60),
    getMemberCount(community.id),
    getLeaderboard({ kind: "combined", communityId: community.id, limit: 10 }).catch(() => []),
    user ? isMember(user.id, community.id) : Promise.resolve(false),
    listCommunityFeed({ communityId: community.id, viewerId: user?.id ?? "", limit: 20 }).catch(() => []),
    getCommunityLinks(community.id).catch(() => []),
  ]);
  const openMarkets = await getOpenMarketsForCommunity(community.id).catch(() => []);
  const accountBalance = user ? await getAccountBalance(user.id).catch(() => 0) : 0;

  const name = community.displayName || `@${community.slug}`;
  const isOwner = !!user && user.id === community.ownerUserId;

  return (
    <main style={{ background: "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))", minHeight: "100vh", paddingBottom: "var(--spacing-64)" }}>
      <Container>
        {/* Header */}
        <section style={{ padding: "var(--spacing-48) 0 var(--spacing-24)" }}>
          <p className="marketing-eyebrow" style={{ marginBottom: "var(--spacing-8)" }}>Community</p>
          <h1 style={{ fontSize: "var(--font-size-36)", fontWeight: 800, margin: "0 0 var(--spacing-8)", lineHeight: 1.1 }}>{name}</h1>
          <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-20)" }}>@{community.slug}</p>
          <CommunityJoinButton communityId={community.id} slug={community.slug} initialMember={viewerIsMember} initialCount={memberCount} />
          <div style={{ display: "flex", gap: "var(--spacing-8)", flexWrap: "wrap", marginTop: "var(--spacing-16)" }}>
            <Link href={`/live/${community.slug}`} style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="small">Watch live</Button>
            </Link>
            <Link href={`/u/${community.slug}`} style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="small">View profile</Button>
            </Link>
          </div>

          {/* Where to find the creator — their live + community links. */}
          {(links.length > 0 || isOwner) && (
            <div style={{ marginTop: "var(--spacing-20)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", flexWrap: "wrap", marginBottom: "var(--spacing-8)" }}>
                <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "var(--font-size-12)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>Where to find us</span>
                {isOwner && <CommunityLinksEditor communityId={community.id} initialLinks={links} />}
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
          {openMarkets.length > 0 && (
            <Card padding="large" style={{ borderColor: "var(--primary-300, var(--border-default))", background: "color-mix(in srgb, var(--primary-500) 5%, var(--surface-default))" }}>
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

          {/* Feed */}
          <Card padding="large">
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>Community feed</h2>
            {!viewerIsMember && (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>Join the community to post.</p>
            )}
            <CommunityFeed communityId={community.id} communityName={name} initialPosts={feed} canPost={viewerIsMember} isOwner={isOwner} currentUserId={user?.id ?? null} />
          </Card>

          {/* Leaderboard */}
          <Card padding="large">
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

          {/* Members */}
          <Card padding="large">
            <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: "0 0 var(--spacing-16)" }}>
              Members <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>· {memberCount.toLocaleString()}</span>
              {members.some((m) => m.online) && (
                <span style={{ marginLeft: "var(--spacing-12)", fontSize: "var(--font-size-14)", fontWeight: 600, color: "#16a34a" }}>● {members.filter((m) => m.online).length} online</span>
              )}
            </h2>
            {members.length === 0 ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-14)", margin: 0 }}>Be the first to join.</p>
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
                  return m.username ? (
                    <Link key={m.userId} href={`/u/${m.username}`} style={{ textDecoration: "none", color: "inherit" }}>{inner}</Link>
                  ) : (
                    <div key={m.userId}>{inner}</div>
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
