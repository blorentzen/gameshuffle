import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { getNight, getRsvps } from "@/lib/board-game-nights/store";
import { boardGameLevelLabel, boardGameLengthLabel } from "@/data/board-games";
import { RsvpControl } from "@/components/board-game-nights/RsvpControl";
import { NightMap } from "@/components/board-game-nights/NightMap";
import type { RsvpStatus } from "@/lib/board-game-nights/types";

function fmtWhen(iso: string | null, tz: string | null): string {
  if (!iso) return "Date to be announced";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
      timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export default async function NightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const night = await getNight(id);
  if (!night) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rsvps = await getRsvps(id);
  const going = rsvps.filter((r) => r.status === "going");
  const myRsvp: RsvpStatus | null = user
    ? rsvps.find((r) => r.user_id === user.id)?.status ?? null
    : null;
  const isHost = user?.id === night.host_id;

  const { data: host } = await supabase
    .from("users")
    .select("username, display_name")
    .eq("id", night.host_id)
    .maybeSingle();

  const attendeeIds = going.map((r) => r.user_id).slice(0, 40);
  const { data: attendees } = attendeeIds.length
    ? await supabase.from("users").select("id, username, display_name").in("id", attendeeIds)
    : { data: [] as { id: string; username: string | null; display_name: string | null }[] };

  const level = boardGameLevelLabel(night.level);

  return (
    <Container>
      <article className="bgn-detail" style={{ margin: "var(--spacing-48) 0 var(--spacing-64)", maxWidth: "70rem" }}>
        <p className="marketing-eyebrow">Board game night</p>
        <h1 className="bgn-detail__title">{night.title}</h1>
        <p className="bgn-detail__host">
          Hosted by{" "}
          {host?.username ? (
            <Link href={`/u/${host.username}`}>{host.display_name || host.username}</Link>
          ) : (
            host?.display_name || "a GameShuffle member"
          )}
        </p>

        <div className="bgn-detail__grid">
          <div className="bgn-detail__main">
            <div className="account-card">
              <div className="bgn-meta">
                <div className="bgn-meta__item">
                  <span className="bgn-meta__label">When</span>
                  <span className="bgn-meta__value">{fmtWhen(night.starts_at, night.timezone)}</span>
                </div>
                {night.place && (
                  <div className="bgn-meta__item">
                    <span className="bgn-meta__label">Where</span>
                    <span className="bgn-meta__value">{night.place}</span>
                  </div>
                )}
                {night.capacity != null && (
                  <div className="bgn-meta__item">
                    <span className="bgn-meta__label">Spots</span>
                    <span className="bgn-meta__value">
                      {going.length} / {night.capacity} going
                    </span>
                  </div>
                )}
              </div>

              {night.description && <p className="bgn-detail__desc">{night.description}</p>}

              {(level || (night.genres && night.genres.length > 0)) && (
                <div className="bgn-tagrow">
                  {level && <span className="bg-badge bg-badge--level">{level}</span>}
                  {(night.genres ?? []).map((g) => (
                    <span key={g} className="bg-tag">{g}</span>
                  ))}
                </div>
              )}
            </div>

            {night.lat != null && night.lng != null && (
              <div className="account-card">
                <h2>Where to find it</h2>
                {night.place && <p className="bgn-detail__desc" style={{ marginTop: 0 }}>{night.place}</p>}
                <NightMap lat={night.lat} lng={night.lng} place={night.place} />
              </div>
            )}

            {night.games.length > 0 && (
              <div className="account-card">
                <h2>Games being brought</h2>
                <ul className="bgn-gamelist">
                  {night.games.map((g, i) => (
                    <li key={`${g.name}-${i}`} className="bgn-gamelist__item">
                      {g.imageUrl ? (
                        <img src={g.imageUrl} alt="" className="bgn-gamelist__art" />
                      ) : (
                        <span className="bgn-gamelist__art bgn-gamelist__art--blank" />
                      )}
                      <span className="bgn-gamelist__name">{g.name}</span>
                      {g.length && <span className="bg-badge">{boardGameLengthLabel(g.length)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <aside className="bgn-detail__side">
            <div className="account-card">
              <h2>{isHost ? "You're hosting" : "RSVP"}</h2>
              {isHost ? (
                <>
                  <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "var(--spacing-12)" }}>
                    This is your night. Share the link so players can find and RSVP.
                  </p>
                  <Link href={`/board-game-nights/${night.id}/manage`} style={{ textDecoration: "none" }}>
                    <Button variant="secondary" fullWidth>Manage night</Button>
                  </Link>
                </>
              ) : (
                <RsvpControl nightId={night.id} initial={myRsvp} signedIn={!!user} />
              )}

              <h3 className="bgn-side__heading">Going ({going.length})</h3>
              {going.length === 0 ? (
                <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>No RSVPs yet. Be the first.</p>
              ) : (
                <ul className="bgn-attendees">
                  {(attendees ?? []).map((a) => (
                    <li key={a.id}>
                      {a.username ? (
                        <Link href={`/u/${a.username}`}>{a.display_name || a.username}</Link>
                      ) : (
                        a.display_name || "Member"
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>

        <p style={{ marginTop: "var(--spacing-32)" }}>
          <Link href="/board-game-nights">← All board-game nights</Link>
        </p>
      </article>
    </Container>
  );
}
