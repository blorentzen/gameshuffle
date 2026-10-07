import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Token counts for one AI request, for the admin usage view. A route wraps its
 * generation in `withAiTokens`; every Claude call inside it adds to the count
 * (claude.ts calls `addAiTokens`). Nothing but the numbers is kept.
 */
export interface AiTokens { input: number; output: number; calls: number }

const store = new AsyncLocalStorage<AiTokens>();

export async function withAiTokens<T>(fn: () => Promise<T>): Promise<{ value: T; tokens: AiTokens }> {
  const tokens: AiTokens = { input: 0, output: 0, calls: 0 };
  const value = await store.run(tokens, fn);
  return { value, tokens };
}

export function addAiTokens(input: number, output: number): void {
  const t = store.getStore();
  if (!t) return;
  t.input += input;
  t.output += output;
  t.calls += 1;
}
