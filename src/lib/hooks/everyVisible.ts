/**
 * Runs `fn` every `ms` while the tab is visible, and once straight away when it comes back. The
 * /live game cards used to refresh every 2 to 3.5 seconds in hidden tabs too (about 130 requests a
 * minute per open tab, even with nothing running). Returns the cleanup.
 */
export function everyVisible(fn: () => unknown, ms: number): () => void {
  const visible = () => typeof document === "undefined" || document.visibilityState === "visible";
  const iv = window.setInterval(() => { if (visible()) void fn(); }, ms);
  const onVisible = () => { if (visible()) void fn(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(iv);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
