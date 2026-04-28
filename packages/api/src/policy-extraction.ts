/**
 * Feedback policy extraction.
 *
 * Step 8.2 turns the append-only FeedbackEvent ledger into conservative,
 * read-only policy candidates. These candidates are not applied to agent
 * behavior yet; #170 will decide how to feed approved policy context into the
 * prompt, and #171 will give the user controls.
 */

import type { FeedbackEvent, FeedbackSignal } from "@prisma/client";
import { prisma } from "./db.js";

export type FeedbackPolicyCandidateKind =
  | "ALLOW_AFTER_SUGGESTION"
  | "REQUIRE_DRAFT_REVIEW"
  | "AVOID_SUGGESTION"
  | "LOWER_PRIORITY";

export type FeedbackPolicyScopeType = "RECIPIENT_TOOL" | "TOOL";

export interface FeedbackPolicyScope {
  type: FeedbackPolicyScopeType;
  toolName: string;
  recipient: string | null;
}

export interface FeedbackPolicySupport {
  approved: number;
  rejected: number;
  edited: number;
  ignored: number;
  snoozed: number;
  dismissed: number;
  total: number;
  distinctRecipients: number;
}

export interface FeedbackPolicyEvidence {
  id: string;
  signal: FeedbackSignal;
  evidence: string | null;
  createdAt: string;
}

export interface FeedbackPolicyCandidate {
  id: string;
  kind: FeedbackPolicyCandidateKind;
  scope: FeedbackPolicyScope;
  confidence: number;
  support: FeedbackPolicySupport;
  rationale: string;
  evidence: FeedbackPolicyEvidence[];
  active: false;
}

export interface FeedbackPolicyExtractionOptions {
  days?: number;
  limit?: number;
  minEvents?: number;
}

type FeedbackPolicyEvent = Pick<
  FeedbackEvent,
  "id" | "signal" | "toolName" | "recipient" | "threadId" | "evidence" | "createdAt"
>;

interface Bucket {
  scope: FeedbackPolicyScope;
  events: FeedbackPolicyEvent[];
  recipientKeys: Set<string>;
}

const DEFAULT_DAYS = 45;
const DEFAULT_LIMIT = 1000;
const DEFAULT_MIN_EVENTS = 3;

export async function getFeedbackPolicyCandidates(
  userId: string,
  opts: FeedbackPolicyExtractionOptions = {},
): Promise<{ since: string; candidates: FeedbackPolicyCandidate[] }> {
  const days = clampInteger(opts.days ?? DEFAULT_DAYS, 1, 365);
  const limit = clampInteger(opts.limit ?? DEFAULT_LIMIT, 50, 5000);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const events = await prisma.feedbackEvent.findMany({
    where: { userId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    since: since.toISOString(),
    candidates: extractFeedbackPolicyCandidates(events, {
      minEvents: opts.minEvents,
    }),
  };
}

export function extractFeedbackPolicyCandidates(
  events: FeedbackPolicyEvent[],
  opts: Pick<FeedbackPolicyExtractionOptions, "minEvents"> = {},
): FeedbackPolicyCandidate[] {
  const minEvents = clampInteger(opts.minEvents ?? DEFAULT_MIN_EVENTS, 2, 20);
  const buckets = buildBuckets(events);
  const candidates: FeedbackPolicyCandidate[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.events.length < minEvents) continue;
    if (!shouldConsiderBucket(bucket)) continue;

    const support = countSignals(bucket.events, bucket.recipientKeys.size);
    const candidate = candidateFromSupport(bucket.scope, support, bucket.events, minEvents);
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort(compareCandidates);
}

function buildBuckets(events: FeedbackPolicyEvent[]): Map<string, Bucket> {
  const buckets = new Map<string, Bucket>();
  for (const event of events) {
    if (!event.toolName) continue;
    const toolName = event.toolName.trim();
    if (!toolName) continue;

    const recipient = normaliseRecipient(event.recipient);
    addToBucket(buckets, { type: "TOOL", toolName, recipient: null }, event, recipient);
    if (recipient) {
      addToBucket(
        buckets,
        { type: "RECIPIENT_TOOL", toolName, recipient },
        { ...event, recipient },
        recipient,
      );
    }
  }
  return buckets;
}

function addToBucket(
  buckets: Map<string, Bucket>,
  scope: FeedbackPolicyScope,
  event: FeedbackPolicyEvent,
  recipient: string | null,
) {
  const key = scopeKey(scope);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { scope, events: [], recipientKeys: new Set() };
    buckets.set(key, bucket);
  }
  bucket.events.push(event);
  if (recipient) bucket.recipientKeys.add(recipient);
}

function candidateFromSupport(
  scope: FeedbackPolicyScope,
  support: FeedbackPolicySupport,
  events: FeedbackPolicyEvent[],
  minEvents: number,
): FeedbackPolicyCandidate | null {
  const explicitNegative = support.rejected + support.dismissed;
  const quietNegative = support.ignored + support.snoozed;
  const total = support.total;

  if (
    support.approved >= minEvents &&
    support.approved / total >= 0.75 &&
    support.edited === 0 &&
    explicitNegative === 0
  ) {
    return makeCandidate(
      "ALLOW_AFTER_SUGGESTION",
      scope,
      support,
      support.approved,
      events,
      "The user repeatedly approves this proposal pattern with no explicit negative signal.",
    );
  }

  if (support.edited >= 2 && support.edited / total >= 0.5) {
    return makeCandidate(
      "REQUIRE_DRAFT_REVIEW",
      scope,
      support,
      support.edited,
      events,
      "The user often edits this pattern, so EVE should keep it reviewable as a draft.",
    );
  }

  if (explicitNegative >= 2 && explicitNegative / total >= 0.6) {
    return makeCandidate(
      "AVOID_SUGGESTION",
      scope,
      support,
      explicitNegative,
      events,
      "The user repeatedly rejects or dismisses this proposal pattern.",
    );
  }

  if (quietNegative >= minEvents && support.approved === 0 && quietNegative / total >= 0.75) {
    return makeCandidate(
      "LOWER_PRIORITY",
      scope,
      support,
      quietNegative,
      events,
      "The user repeatedly ignores or snoozes this proposal pattern.",
    );
  }

  return null;
}

function makeCandidate(
  kind: FeedbackPolicyCandidateKind,
  scope: FeedbackPolicyScope,
  support: FeedbackPolicySupport,
  dominantCount: number,
  events: FeedbackPolicyEvent[],
  rationale: string,
): FeedbackPolicyCandidate {
  return {
    id: `feedback-policy:${kind}:${scopeKey(scope)}`,
    kind,
    scope,
    confidence: confidence(dominantCount, support.total),
    support,
    rationale,
    evidence: events.slice(0, 3).map((event) => ({
      id: event.id,
      signal: event.signal,
      evidence: event.evidence,
      createdAt: event.createdAt.toISOString(),
    })),
    active: false,
  };
}

function countSignals(
  events: FeedbackPolicyEvent[],
  distinctRecipients: number,
): FeedbackPolicySupport {
  const support: FeedbackPolicySupport = {
    approved: 0,
    rejected: 0,
    edited: 0,
    ignored: 0,
    snoozed: 0,
    dismissed: 0,
    total: events.length,
    distinctRecipients,
  };

  for (const event of events) {
    if (event.signal === "APPROVED") support.approved += 1;
    else if (event.signal === "REJECTED") support.rejected += 1;
    else if (event.signal === "EDITED") support.edited += 1;
    else if (event.signal === "IGNORED") support.ignored += 1;
    else if (event.signal === "SNOOZED") support.snoozed += 1;
    else if (event.signal === "DISMISSED") support.dismissed += 1;
  }

  return support;
}

function shouldConsiderBucket(bucket: Bucket): boolean {
  if (bucket.scope.type === "RECIPIENT_TOOL") return true;
  const hasRecipientlessEvents = bucket.events.some(
    (event) => !normaliseRecipient(event.recipient),
  );
  return hasRecipientlessEvents || bucket.recipientKeys.size >= 2;
}

function compareCandidates(a: FeedbackPolicyCandidate, b: FeedbackPolicyCandidate): number {
  const confidenceDiff = b.confidence - a.confidence;
  if (confidenceDiff !== 0) return confidenceDiff;
  const specificityDiff = specificity(b.scope) - specificity(a.scope);
  if (specificityDiff !== 0) return specificityDiff;
  return b.support.total - a.support.total;
}

function specificity(scope: FeedbackPolicyScope): number {
  return scope.type === "RECIPIENT_TOOL" ? 1 : 0;
}

function confidence(dominantCount: number, total: number): number {
  const ratio = dominantCount / total;
  const volumeBonus = Math.min(0.12, Math.max(0, total - DEFAULT_MIN_EVENTS) * 0.03);
  return Math.round(Math.min(0.95, Math.max(0.55, ratio - 0.05 + volumeBonus)) * 100) / 100;
}

function scopeKey(scope: FeedbackPolicyScope): string {
  const base = `${scope.type.toLowerCase()}:${slug(scope.toolName)}`;
  return scope.recipient ? `${base}:${slug(scope.recipient)}` : base;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.@-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normaliseRecipient(recipient: string | null): string | null {
  const normalised = recipient?.trim().toLowerCase();
  return normalised ? normalised : null;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
