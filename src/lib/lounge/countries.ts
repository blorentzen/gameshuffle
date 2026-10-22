/** A country's English name from its two-letter code (the lounge stores codes). */
const names = (() => { try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; } })();

export function countryName(code: string): string {
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return code;
  try { return names?.of(c) ?? c; } catch { return c; }
}
