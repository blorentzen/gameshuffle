import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Container, Button } from "@empac/cascadeds";
import { notFound } from "next/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const supabase = await createClient();
  const { data: config } = await supabase
    .from("saved_configs")
    .select("config_name, randomizer_slug")
    .eq("share_token", token)
    .single();

  if (!config) {
    return { title: "Shared Configuration", robots: { index: false, follow: false } };
  }

  const gameLabel = config.randomizer_slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  return {
    title: config.config_name,
    description: `Check out this ${gameLabel} configuration on GameShuffle — ${config.config_name}. Open it to load the full setup instantly.`,
    openGraph: {
      title: `${config.config_name} | GameShuffle`,
      description: `A shared ${gameLabel} configuration. Open in GameShuffle to use it instantly.`,
      url: `https://gameshuffle.co/s/${token}`,
      images: ["/images/opengraph/gameshuffle-main-og.jpg"],
    },
    alternates: {
      canonical: `https://gameshuffle.co/s/${token}`,
    },
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SharedConfigPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const { data: config } = await supabase
    .from("saved_configs")
    .select("*")
    .eq("share_token", token)
    .single();

  if (!config) {
    notFound();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configData = config.config_data as Record<string, any>;

  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="account-card" style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2>{config.config_name}</h2>
          <p style={{ color: "#808080", marginBottom: "1.5rem" }}>
            Shared configuration for{" "}
            <strong>{config.randomizer_slug}</strong>
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {configData.mode && (
              <div className="account-card__row">
                <span className="account-card__label">Mode</span>
                <span className="account-card__value">
                  {String(configData.mode)}
                </span>
              </div>
            )}
            {configData.playerCount && (
              <div className="account-card__row">
                <span className="account-card__label">Players</span>
                <span className="account-card__value">
                  {String(configData.playerCount)}
                </span>
              </div>
            )}
            {configData.trackCount && (
              <div className="account-card__row">
                <span className="account-card__label">Tracks</span>
                <span className="account-card__value">
                  {String(configData.trackCount)}
                </span>
              </div>
            )}
            {configData.charFilters &&
              (configData.charFilters as string[]).length > 0 && (
                <div className="account-card__row">
                  <span className="account-card__label">Character Filters</span>
                  <span className="account-card__value">
                    {(configData.charFilters as string[]).join(", ")}
                  </span>
                </div>
              )}
            {configData.vehiFilters &&
              (configData.vehiFilters as string[]).length > 0 && (
                <div className="account-card__row">
                  <span className="account-card__label">Vehicle Filters</span>
                  <span className="account-card__value">
                    {(configData.vehiFilters as string[]).join(", ")}
                  </span>
                </div>
              )}
            {configData.ruleset && (
              <div className="account-card__row">
                <span className="account-card__label">Ruleset</span>
                <span className="account-card__value">
                  {String(configData.ruleset)}
                </span>
              </div>
            )}
          </div>

          <div style={{ marginTop: "2rem" }}>
            <a href={`/randomizers/${config.randomizer_slug}`}>
              <Button variant="primary">Open Randomizer</Button>
            </a>
          </div>
        </div>
      </Container>
    </main>
  );
}
