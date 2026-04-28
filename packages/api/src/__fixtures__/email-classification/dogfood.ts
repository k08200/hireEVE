import type { ClassifiedLabel } from "../../email-classifier.js";

export interface EmailClassificationFixture {
  id: string;
  note: string;
  from: string;
  subject: string;
  snippet: string;
  labels?: string[];
  expectedSyncPriority: "URGENT" | "NORMAL" | "LOW";
  expectedBatchLabel: ClassifiedLabel;
  knownHeuristicGap?: true;
}

export const dogfoodEmailClassificationFixtures: EmailClassificationFixture[] = [
  {
    id: "investor_reply_needs_same_day_review",
    note: "Investor/VC reply should not disappear as NORMAL when it asks for near-term review.",
    from: "Mina Park <mina@alpha-capital.com>",
    subject: "Re: Seed round follow-up",
    snippet: "Can you confirm the SAFE cap and pro-rata language by EOD tomorrow?",
    labels: ["INBOX", "UNREAD"],
    expectedSyncPriority: "URGENT",
    expectedBatchLabel: {
      priority: "high",
      category: "investor",
      needsReply: true,
      reason: "investor asks for deadline review",
    },
  },
  {
    id: "promo_urgent_discount_stays_low",
    note: "Marketing urgency language is not real user attention.",
    from: "marketing@brand.co.kr",
    subject: "긴급! 오늘만 50% 할인",
    snippet: "신규 가입 회원 한정 특별 할인입니다. 수신거부는 하단 링크.",
    labels: ["INBOX", "CATEGORY_PROMOTIONS"],
    expectedSyncPriority: "LOW",
    expectedBatchLabel: {
      priority: "low",
      category: "automated",
      needsReply: false,
      reason: "promotional urgency",
    },
  },
  {
    id: "newsletter_action_required_stays_low",
    note: "Newsletter/action-required copy should not trigger urgent alerts.",
    from: "newsletter@saas.example",
    subject: "Action required: update your workspace tips",
    snippet: "Weekly product tips and recommended workflows. Unsubscribe anytime.",
    labels: ["INBOX"],
    expectedSyncPriority: "LOW",
    expectedBatchLabel: {
      priority: "low",
      category: "automated",
      needsReply: false,
      reason: "newsletter sender",
    },
  },
  {
    id: "customer_contract_today_is_urgent",
    note: "Customer/prospect contract request with today deadline should be urgent.",
    from: "Jisoo Kim <jisoo@customer.co.kr>",
    subject: "계약서 오늘까지 회신 부탁드립니다",
    snippet: "내일 킥오프 전에 계약 조건 확인이 필요합니다.",
    labels: ["INBOX", "UNREAD"],
    expectedSyncPriority: "URGENT",
    expectedBatchLabel: {
      priority: "high",
      category: "customer",
      needsReply: true,
      reason: "customer deadline today",
    },
  },
  {
    id: "meeting_scheduling_is_normal",
    note: "Scheduling thread needs a reply, but it should not page as urgent.",
    from: "Minsoo <minsoo@partnerco.kr>",
    subject: "다음 주 미팅 일정 확인 부탁드립니다",
    snippet: "화요일 오후 3시에 가능하시면 캘린더 초대 보내드리겠습니다.",
    labels: ["INBOX", "UNREAD"],
    expectedSyncPriority: "NORMAL",
    expectedBatchLabel: {
      priority: "medium",
      category: "meeting",
      needsReply: true,
      reason: "scheduling reply needed",
    },
  },
  {
    id: "security_no_reply_does_not_need_reply",
    note: "Security/account email can be visible without becoming a reply-needed item.",
    from: "no-reply@accounts.example.com",
    subject: "Security alert: new sign-in",
    snippet: "We noticed a new sign-in from Chrome on macOS. If this was you, no action is needed.",
    labels: ["INBOX"],
    expectedSyncPriority: "LOW",
    expectedBatchLabel: {
      priority: "medium",
      category: "system",
      needsReply: false,
      reason: "security notification",
    },
  },
] as const;
