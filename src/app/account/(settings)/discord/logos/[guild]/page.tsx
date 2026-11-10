import { redirect } from "next/navigation";

/** The Logos page grew into the Teams page (2026-11-09): old links open it. */
export default async function LogosMoved({ params }: { params: Promise<{ guild: string }> }) {
  const { guild } = await params;
  redirect(`/account/discord/teams/${encodeURIComponent(guild)}`);
}
