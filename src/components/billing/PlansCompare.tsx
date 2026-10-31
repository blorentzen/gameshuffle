"use client";

/**
 * "What's included" (try before paying picks, 2026-10-29, C1-C4): Free, Supporter, GS Pro, and Backer and
 * Champion side by side, on /gs-pro and /support (#included), where every "See what's included" link lands.
 * Wide screens: one CDS Table in a sideways scroller. Phones: one plan at a time, picked with chips, with
 * that plan's button under its rows. The Supporter column follows the support_supporter_looks switch
 * (on by default; thank-yous only if it's turned off). Rows in src/data/plans-compare.ts.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCheck, IconHeart } from "@tabler/icons-react";
import { TableScroll } from "@/components/ui/TableScroll";
import { useAuth } from "@/components/auth/AuthProvider";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { usePublicPricing } from "@/lib/pricing/usePublicPricing";
import { usd } from "@/lib/pricing/publicTypes";
import { supportLevel } from "@/lib/support/rules";
import { COMPARE_GROUPS, PLAN_IDS, cellFor, type CompareCell, type PlanId } from "@/data/plans-compare";
import "@/styles/plans-compare.css";

function Cell({ value }: { value: CompareCell }) {
  if (value === true) return <span className="plans-compare__yes"><IconCheck size={14} aria-hidden="true" /><span className="sr-only">Included</span></span>;
  if (value === false) return <span className="plans-compare__no">Not included</span>;
  return <span>{value}</span>;
}

export function PlansCompare({ titleClassName, from }: {
  /** The page's own section title class, so the heading matches its neighbors. */
  titleClassName?: string;
  /** Analytics place name. */
  from: string;
}) {
  const status = useSupportStatus();
  const pricing = usePublicPricing();
  const { user } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanId>("supporter");
  const looksOn = !!status?.supporterLooks;
  const pro = usd(pricing.plans.pro?.monthly ?? 9);
  const sup = usd((supportLevel("supporter")?.cents ?? 300) / 100);
  const backer = usd((supportLevel("backer")?.cents ?? 900) / 100);
  const champ = usd((supportLevel("champion")?.cents ?? 2500) / 100);

  const head: Record<PlanId, { name: string; price: string }> = {
    free: { name: "Free", price: "$0" },
    supporter: { name: "Supporter", price: `${sup} a month` },
    pro: { name: "GS Pro", price: `${pro} a month, 14 days free` },
    backer: { name: "Backer · Champion", price: `${backer} · ${champ} a month` },
  };
  const action: Record<PlanId, { label: string; href: string } | null> = {
    free: user ? null : { label: "Make a free account", href: "/signup" },
    supporter: { label: `Support for ${sup} a month`, href: `/support?level=supporter&from=${encodeURIComponent(`included-${from}`)}#give` },
    pro: { label: "Start GS Pro free", href: `/gs-pro?from=${encodeURIComponent(`included-${from}`)}#pricing` },
    backer: { label: `Back for ${backer} a month`, href: `/support?level=backer&from=${encodeURIComponent(`included-${from}`)}#give` },
  };
  const go = (href: string) => router.push(href);

  return (
    <section id="included" className="plans-compare" aria-labelledby="included-title">
      <h2 id="included-title" className={titleClassName}>What&apos;s included</h2>

      <div className="plans-compare__wide">
        <TableScroll label="What each plan includes">
          <Table className="plans-compare__table">
            <TableHeader>
              <TableRow>
                <TableHead><span className="sr-only">Feature</span></TableHead>
                {PLAN_IDS.map((p) => (
                  <TableHead key={p} className={p === "pro" ? "plans-compare__hl" : undefined}>
                    <span className="plans-compare__th">
                      <span className="plans-compare__plan">{head[p].name}</span>
                      <span className="plans-compare__price">{head[p].price}</span>
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARE_GROUPS.map((g) => [
                <TableRow key={`g-${g.label}`} className="plans-compare__group">
                  <TableCell colSpan={5}>{g.label}</TableCell>
                </TableRow>,
                ...g.rows.map((r) => (
                  <TableRow key={r.label}>
                    <TableCell className="plans-compare__feature">{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</TableCell>
                    {PLAN_IDS.map((p) => <TableCell key={p} className={p === "pro" ? "plans-compare__hl" : undefined}><Cell value={cellFor(r, p, looksOn)} /></TableCell>)}
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </TableScroll>
      </div>

      <div className="plans-compare__phone">
        <div className="plans-compare__chips" role="group" aria-label="Show a plan">
          {PLAN_IDS.map((p) => <Chip key={p} label={p === "backer" ? "Backer" : head[p].name} clickable selected={plan === p} onClick={() => setPlan(p)} />)}
        </div>
        <p className="plans-compare__phone-head"><b>{head[plan].name}</b> · {head[plan].price}</p>
        {COMPARE_GROUPS.map((g) => (
          <div key={g.label} className="plans-compare__phone-group">
            <h3>{g.label}</h3>
            <dl>
              {g.rows.map((r) => (
                <div key={r.label} className="plans-compare__phone-row">
                  <dt>{r.href ? <Link href={r.href}>{r.label}</Link> : r.label}</dt>
                  <dd><Cell value={cellFor(r, plan, looksOn)} /></dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {action[plan] && (
          <Button variant={plan === "pro" ? "primary" : "secondary"} fullWidth iconBefore={plan === "supporter" || plan === "backer" ? IconHeart : undefined} onClick={() => go(action[plan]!.href)}>{action[plan]!.label}</Button>
        )}
      </div>
    </section>
  );
}
