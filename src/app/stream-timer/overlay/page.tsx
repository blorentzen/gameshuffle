import { TimerOverlay } from "@/components/tools/TimerOverlay";

// Chrome-free (see ConditionalChrome). Robots noindex — it's a browser source.
export const metadata = { robots: { index: false, follow: false } };

export default async function TimerOverlayPage({
  searchParams,
}: {
  searchParams: Promise<{ mins?: string; label?: string }>;
}) {
  const sp = await searchParams;
  const mins = Math.max(0, Math.min(600, Number(sp.mins) || 15));
  const label = typeof sp.label === "string" ? sp.label.slice(0, 60) : "";

  return (
    <>
      {/* Transparent canvas for OBS — this URL only ever loads as a source. */}
      <style>{"html,body{background:transparent!important;margin:0;overflow:hidden;}"}</style>
      <TimerOverlay mins={mins} label={label} />
    </>
  );
}
