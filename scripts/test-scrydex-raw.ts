/**
 * Raw Scrydex response probe — inspect the actual JSON shape for one card so
 * we can see where image URLs live (top-level vs variants) and fix the select.
 *
 *   npx tsx scripts/test-scrydex-raw.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const base = "https://api.scrydex.com/pokemon/v1";
  const id = "sv10-81"; // Team Rocket's Mewtwo ex (Double Rare)

  // 1) Full response, NO select — see every field Scrydex returns.
  const url = new URL(`${base}/cards/${id}`);
  url.searchParams.set("casing", "snake");
  const res = await fetch(url, {
    headers: {
      "X-Api-Key": process.env.SCRYDEX_API_KEY ?? "",
      "X-Team-ID": process.env.SCRYDEX_TEAM_ID ?? "",
    },
  });
  console.log("HTTP", res.status);
  const json = await res.json();
  const data = json?.data ?? json;
  console.log("top-level keys:", Object.keys(data).sort().join(", "));
  console.log("\nimages:", JSON.stringify(data.images, null, 2));
  console.log(
    "\nvariants[0]:",
    JSON.stringify(Array.isArray(data.variants) ? data.variants[0] : data.variants, null, 2),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
