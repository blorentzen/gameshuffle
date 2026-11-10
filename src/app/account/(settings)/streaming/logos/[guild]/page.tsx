import { redirect } from "next/navigation";

/** Moved with the Discord screens (2026-11-05), then grew into the Teams page (2026-11-09). */
export default async function MovedLogos({ params }: { params: Promise<{ guild: string }> }) {
  const { guild } = await params;
  redirect(`/account/discord/teams/${encodeURIComponent(guild)}`);
}
