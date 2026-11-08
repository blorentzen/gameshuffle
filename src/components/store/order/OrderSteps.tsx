/**
 * An order's tracker (order tracking picks 2026-11-08): ordered, being made, shipped, delivered, each with its date.
 * The same on the buyer's page and the staff page. An ordered list, so screen readers hear the steps in order.
 */

import { IconCheck } from "@tabler/icons-react";
import type { Step } from "@/lib/store/orderStage";

export function OrderSteps({ steps, label = "Where your order is" }: { steps: Step[]; label?: string }) {
  if (!steps.length) return null;
  return (
    <ol className="order-steps" aria-label={label}>
      {steps.map((s) => (
        <li key={s.label} className={`order-step order-step--${s.state}`} aria-current={s.state === "now" ? "step" : undefined}>
          <span className="order-step__dot" aria-hidden="true">{s.state === "done" && <IconCheck size={15} stroke={3} />}</span>
          <b>{s.label}</b>
          <span>{s.date}</span>
          <span className="sr-only">{s.state === "done" ? ", done" : s.state === "now" ? ", now" : ", next"}</span>
        </li>
      ))}
    </ol>
  );
}
