import { redirect } from "next/navigation";
import { MESSAGING_ON } from "@/lib/social/messagingOn";

/**
 * Messaging moved into the Comms Center (/comms?tab=messages). This route is
 * kept as a redirect so old links + the profile "Message" button's
 * conversation deep-link continue to work.
 */
export default async function MessagesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  if (!MESSAGING_ON) redirect("/comms");
  redirect(c ? `/comms?tab=messages&c=${c}` : "/comms?tab=messages");
}
