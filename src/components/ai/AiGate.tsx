"use client";

/**
 * What an AI tool shows when someone can't use it yet: signed out (make a
 * free account first), a free account on a GS Pro tool, or an allowance used
 * up. One CDS Modal, one question, buttons that say where they go. Also the
 * one-line allowance note shown under the AI tools.
 */

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Modal } from "@empac/cascadeds";
import { EVENTS, track } from "@/lib/analytics/events";
import { AI_FEATURES, type AiAccessInfo, type AiBlock } from "@/lib/ai/features";

function copyFor(block: AiBlock, info: AiAccessInfo): { title: string; body: string } {
  const { proPer30d, freePerDay } = info.limits;
  const feature = AI_FEATURES[info.feature];
  const proLine = `GS Pro includes ${proPer30d} AI uses every 30 days, across every AI tool.`;
  switch (block) {
    case "signin":
      return feature.free
        ? { title: "Make a free account to use AI", body: `${feature.label} is free to try with a GameShuffle account: ${freePerDay} a day. ${proLine}` }
        : { title: "This AI tool is part of GS Pro", body: `${feature.label} comes with GS Pro. ${proLine} Already on GS Pro? Sign in.` };
    case "pro":
      return { title: "This AI tool is part of GS Pro", body: `${feature.label} comes with GS Pro. ${proLine} Free accounts can still try AI setup, the night planner and the tournament helper ${freePerDay} times a day.` };
    case "daily":
      return { title: "That's today's free tries", body: `Free accounts get ${freePerDay} a day, and they reset at midnight Pacific time. ${proLine}` };
    case "allowance":
      return { title: "You've used your AI allowance", body: `GS Pro includes ${proPer30d} AI uses every 30 days, and each one comes back 30 days after you use it.` };
  }
}

export function AiGatePrompt({ info, block, isOpen, onClose }: {
  info: AiAccessInfo;
  block: AiBlock;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const back = encodeURIComponent(pathname || "/");
  const { title, body } = copyFor(block, info);
  const free = AI_FEATURES[info.feature].free;

  useEffect(() => {
    if (isOpen) track(EVENTS.aiGateShown, { feature: info.feature, reason: block });
  }, [isOpen, info.feature, block]);

  const go = (href: string) => { onClose(); router.push(href); };
  const pro = `/gs-pro?from=ai-${info.feature}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="small"
      footer={
        <div className="ai-gate__footer">
          {block === "signin" ? (
            <>
              <Button variant="secondary" onClick={() => go(`/login?redirect=${back}`)}>Sign in</Button>
              {free
                ? <Button variant="primary" onClick={() => go(`/signup?redirect=${back}`)}>Create a free account</Button>
                : <Button variant="primary" onClick={() => go(pro)}>See GS Pro</Button>}
            </>
          ) : block === "allowance" ? (
            <Button variant="primary" onClick={onClose}>OK</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>Not now</Button>
              <Button variant="primary" onClick={() => go(pro)}>See GS Pro</Button>
            </>
          )}
        </div>
      }
    >
      <p className="ai-gate__body">{body}</p>
    </Modal>
  );
}

/** "2 of 3 free tries left today" / "54 of 60 left this 30 days"; empty when there's nothing to say. */
export function allowanceText(info: AiAccessInfo | null): string {
  if (!info?.plan || info.plan === "staff" || info.remaining === null) return "";
  if (info.plan === "pro") return `${info.remaining} of ${info.limits.proPer30d} AI uses left this 30 days`;
  if (!AI_FEATURES[info.feature].free) return "";
  return `${info.remaining} of ${info.limits.freePerDay} free ${info.limits.freePerDay === 1 ? "try" : "tries"} left today`;
}
