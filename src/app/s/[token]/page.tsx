import { createClient } from "@/lib/supabase/server";
import { Container, Button } from "@empac/cascadeds";
import { notFound } from "next/navigation";

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
