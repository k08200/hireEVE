/**
 * Lane chip for mail-list rows — shows WHICH lane a message landed in, next
 * to the sender (the desktop shell's row-signal doctrine). Reuses the
 * canonical TIER_VISUAL vocabulary so the lane-identity guard keeps covering
 * one definition; the tint rides the --color-tier-* hue tokens so the
 * light/dark ink pairs stay the measured ones from globals.css. Callers pass
 * a recorded lane only — no lane, no chip, never a guess.
 */

import type { LiveTier } from "@klorn/contract";
import { TIER_VISUAL } from "./firewall-board";

// Hue token per lane for the chip tint. Record keys are exempt from the
// lane-vocabulary guard (unlike array literals); SILENT keeps its muted
// stone hue on purpose — a silenced lane must not glow.
const CHIP_HUE: Record<LiveTier, string> = {
  PUSH: "var(--color-tier-push)",
  MEETING: "var(--color-tier-meeting)",
  QUEUE: "var(--color-tier-queue)",
  INFO: "var(--color-tier-info)",
  SILENT: "var(--color-tier-silent)",
};

export function LaneChip({ tier }: { tier: LiveTier }) {
  const visual = TIER_VISUAL[tier];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[10px] font-semibold tracking-[0.08em] ${visual.accent}`}
      style={{
        backgroundColor: `color-mix(in oklab, ${CHIP_HUE[tier]} 13%, transparent)`,
      }}
    >
      {visual.label}
    </span>
  );
}
