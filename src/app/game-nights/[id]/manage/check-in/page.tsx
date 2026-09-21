import { notFound, redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { canManageEvent, getEventMeta } from "@/lib/events/attendees";
import { CheckInScanner } from "@/components/events/CheckInScanner";

export const dynamic = "force-dynamic";

/** Door check-in for organizers: QR scan, ticket code, or name search. */
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/game-nights/${id}/manage/check-in`);
  const meta = await getEventMeta("game-night", id);
  if (!meta) notFound();
  if (!(await canManageEvent("game-night", id, user.id))) redirect(`/game-nights/${id}`);
  return (
    <Container>
      <CheckInScanner type="game-night" eventId={id} title={meta.title} backHref={`/game-nights/${id}/manage`} />
    </Container>
  );
}
