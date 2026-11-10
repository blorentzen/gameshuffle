import { redirect } from "next/navigation";

/** A server's Teams page lives under Account ▸ Discord; this address forwards there. */
export default async function MovedTeams({ params }: { params: Promise<{ guild: string }> }) {
  const { guild } = await params;
  redirect(`/account/discord/teams/${encodeURIComponent(guild)}`);
}
