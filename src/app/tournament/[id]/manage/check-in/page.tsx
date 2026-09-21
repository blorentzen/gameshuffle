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
  if (!user) redirect(`/login?redirect=/tournament/${id}/manage/check-in`);
  const meta = await getEventMeta("tournament", id);
  if (!meta) notFound();
  if (!(await canManageEvent("tournament", id, user.id))) redirect(`/tournament/${id}`);
  return (
    <Container>
      <CheckInScanner type="tournament" eventId={id} title={meta.title} backHref={`/tournament/${id}/manage`} />
    </Container>
  );
}
