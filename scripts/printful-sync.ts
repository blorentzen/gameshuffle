/**
 * Merch sync from the command line, against the .env.local project and the
 * Printful store in PRINTFUL_API_TOKEN.
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/printful-sync.ts          plan only (works before merch-m1.sql)
 *   npx tsx -r ./scripts/server-only-shim.cjs scripts/printful-sync.ts --write  sync for real (Platform's button does the same)
 *   add --full to price shipping and fetch size guides again
 */

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { planSync, syncFromPrintful } = await import("../src/lib/store/merchSync");
  const full = process.argv.includes("--full");
  if (process.argv.includes("--write")) {
    const s = await syncFromPrintful({ full });
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  const plan = await planSync({ full: true, dryRun: true });
  for (const l of plan.listings) {
    const rows = plan.rows.filter((r) => r.listing_key === l.group_key);
    const colors = [...new Set(rows.map((r) => r.color))];
    const shown = colors.filter((c) => !l.hidden_colors.includes(c ?? ""));
    const opts = [...new Set(rows.map((r) => r.option_value))];
    const prices = [...new Set(rows.map((r) => r.price_cents))].sort((a, b) => a - b).map((c) => `$${(c / 100).toFixed(2)}`);
    console.log(`\n${l.name}  (/shop/${l.slug}, ${l.item_type}, ${l.id ? "existing" : "new"})`);
    console.log(`  from: ${l.printful.map((p) => p.name).join(" + ")}`);
    console.log(`  colors shown ${shown.length} of ${colors.length}${l.hidden_colors.length ? `, hidden: ${l.hidden_colors.join(", ")}` : ""}`);
    console.log(`  ${l.option_label || "one size"}: ${opts.filter(Boolean).length ? opts.join(", ") : "-"}`);
    console.log(`  prices ${prices.join(", ")}; Printful shipping ${l.ship_cost_cents != null ? `$${(l.ship_cost_cents / 100).toFixed(2)}` : "?"}, arrives in ${l.delivery_min ?? "?"} to ${l.delivery_max ?? "?"} days`);
    console.log(`  size guide: ${l.size_guide ? `${l.size_guide.columns.join(", ")} (${l.size_guide.rows.length} sizes)` : "none"}; details: ${l.facts.length}`);
    console.log(`  sample row: ${rows[0]?.sku} "${rows[0]?.name}" ${rows[0]?.price_cents}c active=${rows[0]?.active}`);
  }
  console.log(`\n${plan.summary.printfulProducts} Printful products → ${plan.listings.length} shop products, ${plan.rows.length} sizes and colors.`);
  if (plan.summary.warnings.length) console.log(`Warnings:\n  - ${plan.summary.warnings.join("\n  - ")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
