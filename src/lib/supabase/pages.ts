/**
 * Supabase hands back at most 1,000 rows per request, whatever `.limit()`
 * asks for, so a read that needs every row has to page. Found 2026-10-19 when
 * the game trivia packs took the pack past 1,000 questions: Fire Round's pool,
 * the question pages and the import's duplicate check all stopped at 1,000.
 *
 * `page(from, to)` builds a fresh query ending in `.range(from, to)`; give it
 * a stable order (an id last) so pages don't overlap or skip rows.
 */

export const PAGE_ROWS = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string; code?: string } | null };

export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max = 20_000,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE_ROWS) {
    const { data, error } = await page(from, from + PAGE_ROWS - 1);
    if (error) return { data: out, error };
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_ROWS) break;
  }
  return { data: out, error: null };
}
