import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Container, Button } from "@empac/cascadeds";
import { notFound } from "next/navigation";
import { GAMERTAG_PLATFORMS } from "@/data/gamertag-types";
import type { Gamertags } from "@/data/gamertag-types";
import { VerifiedBadge } from "@/components/VerifiedBadge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase
    .from("users")
    .select("display_name, username")
    .eq("username", username)
    .single();

  if (!user) return { title: "Player Not Found" };

  const displayName = user.display_name || user.username;
  return {
    title: `${displayName}'s Profile`,
    description: `View ${displayName}'s GameShuffle profile — tournaments, saved configurations, and competitive stats.`,
    openGraph: {
      title: `${displayName} | GameShuffle`,
      description: `View ${displayName}'s GameShuffle profile.`,
      url: `https://gameshuffle.co/u/${username}`,
      images: ["/images/opengraph/gameshuffle-main-og.jpg"],
    },
    alternates: {
      canonical: `https://gameshuffle.co/u/${username}`,
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("users")
    .select("id, display_name, username, gamertags, is_public, created_at, email_verified, avatar_source, discord_avatar, twitch_avatar")
    .eq("username", username)
    .eq("is_public", true)
    .single();

  if (!profile) {
    notFound();
  }

  const gamertags = (profile.gamertags as Gamertags) || {};
  const hasGamertags = Object.values(gamertags).some((v) => v);

  // Fetch this user's configs (both public and shared)
  const { data: configs } = await supabase
    .from("saved_configs")
    .select("id, config_name, randomizer_slug, share_token, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div className="account-card">
            <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginBottom: "2rem" }}>
              {(() => {
                const avatarUrl = profile.avatar_source === "discord" ? profile.discord_avatar
                  : profile.avatar_source === "twitch" ? profile.twitch_avatar : null;
                return avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: "50%", background: "#0E75C1",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: "1.5rem", fontWeight: 700, flexShrink: 0,
                  }}>
                    {(profile.display_name || username).split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                );
              })()}
              <div>
                <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>
                  {profile.display_name || username}
                  {profile.email_verified && <VerifiedBadge />}
                </h1>
                <span style={{ color: "#808080", fontSize: "14px" }}>
                  @{profile.username}
                </span>
              </div>
            </div>

            {hasGamertags && (
              <>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>Gamertags</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "2rem" }}>
                  {GAMERTAG_PLATFORMS.map((platform) => {
                    const value = gamertags[platform.key as keyof Gamertags];
                    if (!value) return null;
                    return (
                      <div key={platform.key} className="account-card__row">
                        <span className="account-card__label">{platform.label}</span>
                        <span className="account-card__value">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {configs && configs.length > 0 && (
              <>
                <h2 style={{ fontSize: "1.4rem", marginBottom: "1rem" }}>Shared Configs</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {configs.map((config) => (
                    <div key={config.id} className="config-list-item">
                      <div>
                        <span className="account-card__value">{config.config_name}</span>
                        <br />
                        <span className="account-card__label">{config.randomizer_slug}</span>
                      </div>
                      {config.share_token && (
                        <a href={`/s/${config.share_token}`}>
                          <Button variant="secondary" size="small">View</Button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}
