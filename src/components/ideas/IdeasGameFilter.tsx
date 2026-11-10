"use client";

/**
 * The Idea Board's game filter (spaces first wave, 2026-11-09): every game with public ideas, most ideas first. Picking
 * one keeps the category and sort and opens /ideas?game=<key>; the game's space is a link beside it.
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function IdeasGameFilter({ games, value, query }: {
  games: { key: string; name: string; count: number }[];
  value: string;
  /** The other filters in the address, kept when the game changes. */
  query: Record<string, string>;
}) {
  const router = useRouter();
  const options = [
    { value: "", label: "All games" },
    ...games.map((g) => ({ value: g.key, label: `${g.name} (${g.count})` })),
  ];
  return (
    <Select
      floatingLabel="Game"
      size="small"
      searchable={games.length > 10}
      options={options}
      value={value}
      onChange={(v) => {
        const p = new URLSearchParams(query);
        const key = String(v ?? "");
        if (key) p.set("game", key); else p.delete("game");
        const q = p.toString();
        router.push(q ? `/ideas?${q}` : "/ideas");
      }}
    />
  );
}
