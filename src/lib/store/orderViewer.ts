import "server-only";

/**
 * Who's looking at an order (its page and the request routes): the account that placed it or whose confirmed email
 * it used, a browser that unlocked it (lookup code or an email's link), or staff. One check for the page and the API.
 */

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ORDER_COOKIE, ordersInCookie, parseOrderNumber } from "./access";
import { canViewOrder, orderByNumber } from "./lookup";

export type ViewerOrder = NonNullable<Awaited<ReturnType<typeof orderByNumber>>>;

export async function orderForViewer(code: string): Promise<{ order: ViewerOrder; owner: boolean; userId: string | null; signedIn: boolean; staff: boolean } | null> {
  const n = parseOrderNumber(code);
  if (!n) return null;
  const order = await orderByNumber(n);
  if (!order) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const jar = await cookies();
  const owner = !!user && (order.user_id === user.id || (!!user.email_confirmed_at && !!order.email && user.email?.toLowerCase() === order.email.toLowerCase()));
  let allowed = canViewOrder(order, { userId: user?.id, email: user?.email ?? null, emailConfirmed: !!user?.email_confirmed_at, cookieIds: ordersInCookie(jar.get(ORDER_COOKIE)?.value) });
  let staff = false;
  if (user) {
    const { data: me } = await createServiceClient().from("users").select("role").eq("id", user.id).maybeSingle();
    staff = me?.role === "staff" || me?.role === "admin";
    allowed = allowed || staff;
  }
  if (!allowed) return null;
  return { order, owner, userId: user?.id ?? null, signedIn: !!user, staff };
}
