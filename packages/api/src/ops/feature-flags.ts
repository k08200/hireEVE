/**
 * One truthful snapshot of every operator feature flag — the answer to "what
 * is actually on right now?" without grepping Render env or probing behavior.
 *
 * Two source kinds, reported as such:
 * - `importTime`: config.ts consts frozen when the process booted. An env edit
 *   without a restart does NOT change these — reporting the const (not the
 *   live env) is what makes the endpoint truthful.
 * - `dynamic`: flags the code re-reads per call (togglable without restart).
 */

import {
  AUTO_REPLY_LINKED_INBOX_ENABLED,
  CONTACT_ENGAGEMENT_IN_JUDGE,
  FALLBACK_REJUDGE_SWEEP,
  LEARNED_RULES_IN_JUDGE,
  MULTI_INBOX_SYNC_ENABLED,
  PAYWALL_ENABLED,
  SENDER_TRAITS_IN_JUDGE,
} from "../config.js";

export interface FlagsReport {
  importTime: Record<string, boolean>;
  dynamic: Record<string, boolean>;
  /** Non-flag operational config presence (never the values). */
  configured: Record<string, boolean>;
}

const TRUTHY = new Set(["true", "1", "yes", "on"]);

/** Dynamic env flag as its reading site interprets it. Pure over `env`. */
export function dynamicFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  return TRUTHY.has((env[key] ?? "").toLowerCase());
}

export function collectFeatureFlags(env: NodeJS.ProcessEnv = process.env): FlagsReport {
  // Every key below is the EXACT env variable name — copy-paste-able into
  // Render. (A prettified display name already caused an operator to create
  // `DB_HEARTBEAT`/`SENTRY` vars that nothing reads, 2026-07-20.)
  return {
    importTime: {
      SENDER_TRAITS_IN_JUDGE,
      LEARNED_RULES_IN_JUDGE,
      CONTACT_ENGAGEMENT_IN_JUDGE,
      FALLBACK_REJUDGE_SWEEP,
      MULTI_INBOX_SYNC_ENABLED,
      AUTO_REPLY_LINKED_INBOX_ENABLED,
      PAYWALL_ENABLED,
      // Scheduler-scoped consts (module-private there; same boot-time freeze).
      PROACTIVE_ACTIONS_ENABLED: env.PROACTIVE_ACTIONS_ENABLED === "true",
      DB_HEARTBEAT_ENABLED: env.DB_HEARTBEAT_ENABLED === "true",
    },
    dynamic: {
      ATTENTION_AGING_ENABLED: dynamicFlag(env, "ATTENTION_AGING_ENABLED"),
      ICLOUD_INBOX_ENABLED: dynamicFlag(env, "ICLOUD_INBOX_ENABLED"),
      OUTLOOK_INBOX_ENABLED: dynamicFlag(env, "OUTLOOK_INBOX_ENABLED"),
      JUDGE_INCLUDE_BODY: dynamicFlag(env, "JUDGE_INCLUDE_BODY"),
      AUTO_TIER_EXECUTION: env.AUTO_TIER_EXECUTION === "true",
      CI_NOISE_SILENT_FLOOR: dynamicFlag(env, "CI_NOISE_SILENT_FLOOR"),
      SENDER_ADDRESS_INDEX_ENABLED: dynamicFlag(env, "SENDER_ADDRESS_INDEX_ENABLED"),
      LOG_RETENTION_ENABLED:
        env.LOG_RETENTION_ENABLED === "true" || env.LOG_RETENTION_ENABLED === "1",
      PHONE_ESCALATION_ENABLED: dynamicFlag(env, "PHONE_ESCALATION_ENABLED"),
      // Read at request time by config.ts `providerInboxSelectorEnabled()`, so
      // it belongs here rather than in the boot-frozen map above.
      PROVIDER_INBOX_SELECTOR_ENABLED: dynamicFlag(env, "PROVIDER_INBOX_SELECTOR_ENABLED"),
      TIER_V2_ENABLED: dynamicFlag(env, "TIER_V2_ENABLED"),
      AUTO_MODE_SEND_ENABLED: dynamicFlag(env, "AUTO_MODE_SEND_ENABLED"),
      SPAM_INTAKE_ENABLED: dynamicFlag(env, "SPAM_INTAKE_ENABLED"),
    },
    configured: {
      GMAIL_PUBSUB_TOPIC: Boolean(env.GMAIL_PUBSUB_TOPIC),
      EMBEDDING_MODEL: Boolean(env.EMBEDDING_MODEL),
      TWILIO_ACCOUNT_SID: Boolean(env.TWILIO_ACCOUNT_SID),
      SENTRY_DSN: Boolean(env.SENTRY_DSN),
      MS_CLIENT_ID: Boolean(env.MS_CLIENT_ID),
    },
  };
}

/**
 * Ontology v2 classification (5 tiers + autoEligible; docs/design/
 * tier-ontology-v2.md). Dynamic: read per judgement so a flip needs no
 * redeploy. OFF = the shipped v1 4-tier rule.
 */
export function tierV2Enabled(): boolean {
  return dynamicFlag(process.env, "TIER_V2_ENABLED");
}

/**
 * auto 모드 unattended replies for autoEligible items. Independent of (and
 * meaningless without) TIER_V2_ENABLED; both OFF by default. The flip is a
 * separate founder decision from the classification flip.
 */
export function autoModeSendEnabled(): boolean {
  return dynamicFlag(process.env, "AUTO_MODE_SEND_ENABLED");
}

/**
 * Spam-lane ingestion: sync the most recent SPAM-labeled Gmail messages so a
 * real mail Gmail wrongly spammed still reaches the queue (never PUSH — see
 * the judge's spam floor). Dynamic; OFF = the historical INBOX-only sync.
 */
export function spamIntakeEnabled(): boolean {
  return dynamicFlag(process.env, "SPAM_INTAKE_ENABLED");
}
