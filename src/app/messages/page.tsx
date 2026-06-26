import { redirect } from "next/navigation";

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
  redirect(c ? `/comms?tab=messages&c=${c}` : "/comms?tab=messages");
}
