import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isStaffRequest } from "@/lib/auth/raw";
import { getStaffImpersonationState } from "@/lib/capabilities/staff-impersonation";
import { ScenariosPage } from "@/staff/scenarios/ScenariosPage";

export const metadata: Metadata = {
  title: "Staff Scenarios",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ id?: string | string[] }>;
}

export default async function StaffScenariosPage({ searchParams }: PageProps) {
  // Gate: only the real staff role gets in. Impersonation is a viewing
  // layer, not a real role downgrade — staff impersonating Free still
  // reaches this page. Per gs-dev-scenarios-spec.md §2.1, return 404
  // (not redirect) for non-staff to avoid leaking the route's existence.
  if (!(await isStaffRequest())) {
    notFound();
  }

  // Read the current impersonation state for the sidebar's "Viewing as"
  // label. The page itself isn't gated on the impersonated tier — it's
  // a tool for the *real* staff member.
  const impersonation = await getStaffImpersonationState();
  const currentTier =
    impersonation.viewingAsUnauth
      ? ("unauth" as const)
      : impersonation.viewingAsTier ?? ("default" as const);

  const params = await searchParams;
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;

  return <ScenariosPage currentTier={currentTier} initialId={idParam} />;
}
