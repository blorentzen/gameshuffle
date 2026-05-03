/**
 * /hub/sessions/[slug]/configure
 *
 * Backward-compatibility redirect — the configure surface merged into
 * the session detail page's tab system (Configure / Modules /
 * Redemptions tabs at /hub/sessions/[slug]?tab=...). External links
 * pointing here continue to work; they land on the unified detail page
 * with the Configure tab pre-selected.
 */

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ConfigureRedirect({ params }: PageProps) {
  const { slug } = await params;
  redirect(`/hub/sessions/${slug}?tab=configure`);
}
