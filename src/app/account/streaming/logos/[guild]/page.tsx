import { redirect } from "next/navigation";

/** Moved with the Discord screens (2026-11-05): a server's team logos live under Account ▸ Discord. */
export default async function MovedLogos({ params }: { params: Promise<{ guild: string }> }) {
  const { guild } = await params;
  redirect(`/account/discord/logos/${encodeURIComponent(guild)}`);
}
