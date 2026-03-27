import type { User } from "@supabase/supabase-js";

export function isEmailVerified(user: User | null): boolean {
  return !!user?.email_confirmed_at;
}
