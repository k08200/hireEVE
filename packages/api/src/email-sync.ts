/**
 * Email Sync & AI Summarization Service
 *
 * Handles:
 * 1. Gmail → DB sync (persist emails locally for search/thread/AI)
 * 2. AI-powered summarization + classification
 * 3. Thread grouping by Gmail threadId
 * 4. Incremental sync (only fetch new emails)
 */

import { google } from "googleapis";
import { prisma } from "./db.js";
import { getAuthedClient } from "./gmail.js";
import { MODEL, openai } from "./openai.js";

// ─── Gmail → DB Sync ──────────────────────────────────────────────────────

interface GmailRawEmail {
  gmailId: string;
  threadId: string;
  from: string;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  body: string;
  htmlBody: string;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  receivedAt: Date;
}

/**
 * Fetch emails from Gmail API and return raw data.
 * Handles pagination and full body extraction.
 */
async function fetchGmailEmails(
  userId: string,
  maxResults = 30,
  query?: string,
): Promise<GmailRawEmail[] | null> {
  const auth = await getAuthedClient(userId);
  if (!auth) return null;

  const gmail = google.gmail({ version: "v1", auth });

  const listParams: {
    userId: string;
    maxResults: number;
    labelIds?: string[];
    q?: string;
  } = {
    userId: "me",
    maxResults,
  };

  if (query) {
    listParams.q = query;
  } else {
    listParams.labelIds = ["INBOX"];
  }

  const res = await gmail.users.messages.list(listParams);
  const messages = res.data.messages || [];

  const emails: GmailRawEmail[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = detail.data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    // Extract body
    let body = "";
    let htmlBody = "";
    const payload = detail.data.payload;

    if (payload?.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          body = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        if (part.mimeType === "text/html" && part.body?.data) {
          htmlBody = Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        // Handle nested multipart
        if (part.parts) {
          for (const sub of part.parts) {
            if (sub.mimeType === "text/plain" && sub.body?.data && !body) {
              body = Buffer.from(sub.body.data, "base64").toString("utf-8");
            }
            if (sub.mimeType === "text/html" && sub.body?.data && !htmlBody) {
              htmlBody = Buffer.from(sub.body.data, "base64").toString("utf-8");
            }
          }
        }
      }
    } else if (payload?.body?.data) {
      const decoded = Buffer.from(payload.body.data, "base64").toString("utf-8");
      if (payload.mimeType === "text/html") {
        htmlBody = decoded;
      } else {
        body = decoded;
      }
    }

    const labelIds = detail.data.labelIds || [];
    const dateStr = getHeader("Date");

    emails.push({
      gmailId: msg.id,
      threadId: detail.data.threadId || msg.id,
      from: getHeader("From"),
      to: getHeader("To"),
      cc: getHeader("Cc"),
      subject: getHeader("Subject"),
      snippet: detail.data.snippet || "",
      body,
      htmlBody,
      labels: labelIds,
      isRead: !labelIds.includes("UNREAD"),
      isStarred: labelIds.includes("STARRED"),
      receivedAt: dateStr ? new Date(dateStr) : new Date(),
    });
  }

  return emails;
}

/**
 * Sync Gmail → DB. Only inserts new emails, updates existing ones.
 * Returns count of new + updated emails.
 */
export async function syncEmails(
  userId: string,
  maxResults = 30,
  query?: string,
): Promise<{ synced: number; newCount: number; source: "gmail" }> {
  const rawEmails = await fetchGmailEmails(userId, maxResults, query);
  if (!rawEmails) throw new Error("Gmail not connected");

  let newCount = 0;

  for (const email of rawEmails) {
    const existing = await prisma.emailMessage.findUnique({
      where: { userId_gmailId: { userId, gmailId: email.gmailId } },
    });

    if (existing) {
      // Update read/star/labels status
      await prisma.emailMessage.update({
        where: { id: existing.id },
        data: {
          isRead: email.isRead,
          isStarred: email.isStarred,
          labels: email.labels,
        },
      });
    } else {
      // Classify priority using keyword heuristics first (fast)
      const priority = classifyPriority(email.from, email.subject, email.labels);

      await prisma.emailMessage.create({
        data: {
          userId,
          gmailId: email.gmailId,
          threadId: email.threadId,
          from: email.from,
          to: email.to,
          cc: email.cc || null,
          subject: email.subject,
          snippet: email.snippet,
          body: email.body || null,
          htmlBody: email.htmlBody || null,
          labels: email.labels,
          isRead: email.isRead,
          isStarred: email.isStarred,
          priority,
          receivedAt: email.receivedAt,
        },
      });
      newCount++;
    }
  }

  return { synced: rawEmails.length, newCount, source: "gmail" };
}

// ─── Gmail ↔ DB Reconciliation ────────────────────────────────────────────

/**
 * Reconcile local DB with Gmail.
 * Removes DB emails that no longer exist in Gmail INBOX (deleted/archived/trashed).
 * Updates read/star status for remaining emails.
 */
export async function reconcileEmails(
  userId: string,
): Promise<{ removed: number; updated: number }> {
  const auth = await getAuthedClient(userId);
  if (!auth) throw new Error("Gmail not connected");

  const gmail = google.gmail({ version: "v1", auth });

  // Get ALL current INBOX message IDs from Gmail (lightweight list call)
  const inboxIds = new Set<string>();
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["INBOX"],
      maxResults: 500,
      pageToken,
    });
    for (const msg of res.data.messages || []) {
      if (msg.id) inboxIds.add(msg.id);
    }
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  // Get all DB emails for this user
  const dbEmails = await prisma.emailMessage.findMany({
    where: { userId },
    select: { id: true, gmailId: true, isRead: true },
  });

  // Remove DB emails no longer in Gmail INBOX
  let removed = 0;
  const toRemove: string[] = [];
  for (const dbEmail of dbEmails) {
    if (!inboxIds.has(dbEmail.gmailId)) {
      toRemove.push(dbEmail.id);
      removed++;
    }
  }

  if (toRemove.length > 0) {
    await prisma.emailMessage.deleteMany({
      where: { id: { in: toRemove } },
    });
    console.log(`[EMAIL-SYNC] Reconciled: removed ${removed} stale emails for user ${userId}`);
  }

  // For remaining emails still in INBOX, batch-update read status
  let updated = 0;
  const remainingGmailIds = dbEmails.filter((e) => inboxIds.has(e.gmailId)).map((e) => e.gmailId);

  // Check read status for remaining emails (batch of 50)
  for (let i = 0; i < remainingGmailIds.length; i += 50) {
    const batch = remainingGmailIds.slice(i, i + 50);
    for (const gmailId of batch) {
      try {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: gmailId,
          format: "minimal",
        });
        const labelIds = detail.data.labelIds || [];
        const isRead = !labelIds.includes("UNREAD");
        const isStarred = labelIds.includes("STARRED");

        const result = await prisma.emailMessage.updateMany({
          where: { userId, gmailId },
          data: { isRead, isStarred, labels: labelIds },
        });
        if (result.count > 0) updated++;
      } catch {
        // Message might have been deleted between list and get — skip
      }
    }
  }

  return { removed, updated };
}

// ─── Priority Classification (keyword-based, fast) ────────────────────────

function classifyPriority(
  from: string,
  subject: string,
  labels: string[] = [],
): "URGENT" | "NORMAL" | "LOW" {
  const f = from.toLowerCase();
  const s = subject.toLowerCase();

  // Gmail category labels — promotions/social/forums are always LOW
  if (
    labels.includes("CATEGORY_PROMOTIONS") ||
    labels.includes("CATEGORY_SOCIAL") ||
    labels.includes("CATEGORY_FORUMS") ||
    labels.includes("SPAM") ||
    labels.includes("TRASH")
  ) {
    return "LOW";
  }

  // Low priority signals (automated/newsletter/ads)
  if (
    f.includes("noreply") ||
    f.includes("no-reply") ||
    f.includes("newsletter") ||
    f.includes("marketing") ||
    f.includes("digest") ||
    f.includes("notification") ||
    f.includes("promo") ||
    f.includes("info@") ||
    f.includes("news@") ||
    f.includes("updates@") ||
    f.includes("support@") ||
    f.includes("hello@") ||
    f.includes("team@") ||
    f.includes("mailer-daemon") ||
    f.includes("postmaster") ||
    s.includes("unsubscribe") ||
    s.includes("수신거부") ||
    s.includes("광고") ||
    s.includes("할인") ||
    s.includes("coupon") ||
    s.includes("sale") ||
    s.includes("offer") ||
    s.includes("deal") ||
    s.includes("promotion") ||
    s.includes("welcome to") ||
    s.includes("verify your") ||
    s.includes("confirm your")
  ) {
    return "LOW";
  }

  // Urgent signals
  if (
    s.includes("urgent") ||
    s.includes("긴급") ||
    s.includes("asap") ||
    s.includes("action required") ||
    s.includes("중요")
  ) {
    return "URGENT";
  }

  // Medium signals → NORMAL
  if (
    s.includes("invoice") ||
    s.includes("payment") ||
    s.includes("meeting") ||
    s.includes("미팅") ||
    s.includes("re:") ||
    s.includes("회신")
  ) {
    return "NORMAL";
  }

  return "NORMAL";
}

// ─── AI Summarization ─────────────────────────────────────────────────────

interface AISummaryResult {
  summary: string;
  category: string;
  keyPoints: string[];
  actionItems: string[];
  sentiment: "positive" | "negative" | "neutral";
  priority: "URGENT" | "NORMAL" | "LOW";
}

/**
 * Summarize a batch of emails using LLM.
 * Processes unsummarized emails for a user.
 */
export async function summarizeUnsummarizedEmails(userId: string, limit = 10): Promise<number> {
  if (!openai) return 0;

  const unsummarized = await prisma.emailMessage.findMany({
    where: { userId, summary: null, body: { not: null } },
    orderBy: { receivedAt: "desc" },
    take: limit,
  });

  if (unsummarized.length === 0) return 0;

  let count = 0;

  for (const email of unsummarized) {
    try {
      const result = await summarizeEmail(
        email.from,
        email.subject,
        email.body || email.snippet || "",
      );
      // Don't let AI upgrade LOW emails (ads/promotions) to URGENT
      const aiPriority =
        email.priority === "LOW" && result.priority === "URGENT" ? "LOW" : result.priority;

      await prisma.emailMessage.update({
        where: { id: email.id },
        data: {
          summary: result.summary,
          category: result.category,
          keyPoints: JSON.stringify(result.keyPoints),
          actionItems: JSON.stringify(result.actionItems),
          sentiment: result.sentiment,
          priority: aiPriority,
        },
      });
      count++;
    } catch {
      // Skip failed summarization, will retry next cycle
    }
  }

  return count;
}

async function summarizeEmail(
  from: string,
  subject: string,
  body: string,
): Promise<AISummaryResult> {
  // Truncate very long bodies
  const truncatedBody = body.length > 3000 ? body.slice(0, 3000) + "\n...(truncated)" : body;

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an email analysis AI. Analyze the email and return a JSON object with:
{
  "summary": "One-line summary in Korean (max 80 chars)",
  "category": "billing|meeting|engineering|conversation|automated|newsletter|personal|business|other",
  "keyPoints": ["Key point 1", "Key point 2"],
  "actionItems": ["Action item if any"],
  "sentiment": "positive|negative|neutral",
  "priority": "URGENT|NORMAL|LOW"
}

Priority rules:
- URGENT: requires action within 24h, payment due, critical issue, explicit urgency
- NORMAL: regular business email, reply expected, meeting invite
- LOW: newsletter, notification, automated, no action needed

Always respond in Korean for summary and keyPoints.`,
      },
      {
        role: "user",
        content: `From: ${from}\nSubject: ${subject}\n\n${truncatedBody}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(content) as Partial<AISummaryResult>;

  return {
    summary: parsed.summary || subject,
    category: parsed.category || "other",
    keyPoints: parsed.keyPoints || [],
    actionItems: parsed.actionItems || [],
    sentiment: parsed.sentiment || "neutral",
    priority: parsed.priority || "NORMAL",
  };
}

// ─── Thread Grouping ──────────────────────────────────────────────────────

export interface EmailThread {
  threadId: string;
  subject: string;
  participants: string[];
  messageCount: number;
  lastMessage: {
    id: string;
    from: string;
    snippet: string;
    receivedAt: Date;
    isRead: boolean;
  };
  hasUnread: boolean;
  latestPriority: "URGENT" | "NORMAL" | "LOW";
}

/**
 * Get email threads for a user, grouped by Gmail threadId.
 */
export async function getEmailThreads(
  userId: string,
  options: {
    skip?: number;
    take?: number;
    unreadOnly?: boolean;
    priority?: string;
    category?: string;
    search?: string;
  } = {},
): Promise<{ threads: EmailThread[]; total: number }> {
  const where: Record<string, unknown> = { userId };

  if (options.unreadOnly) where.isRead = false;
  if (options.priority) where.priority = options.priority;
  if (options.category) where.category = options.category;
  if (options.search) {
    where.OR = [
      { subject: { contains: options.search, mode: "insensitive" } },
      { from: { contains: options.search, mode: "insensitive" } },
      { snippet: { contains: options.search, mode: "insensitive" } },
      { body: { contains: options.search, mode: "insensitive" } },
    ];
  }

  // Get all matching emails
  const emails = await prisma.emailMessage.findMany({
    where: where as Parameters<typeof prisma.emailMessage.findMany>[0] extends { where?: infer W }
      ? W
      : never,
    orderBy: { receivedAt: "desc" },
  });

  // Group by threadId
  const threadMap = new Map<string, typeof emails>();
  for (const email of emails) {
    const tid = email.threadId || email.gmailId;
    const existing = threadMap.get(tid) || [];
    existing.push(email);
    threadMap.set(tid, existing);
  }

  // Build thread summaries
  const threads: EmailThread[] = [];
  for (const [threadId, msgs] of threadMap) {
    const sorted = msgs.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    const latest = sorted[0];
    const participants = [...new Set(sorted.map((m) => m.from))];

    threads.push({
      threadId,
      subject: latest.subject,
      participants,
      messageCount: sorted.length,
      lastMessage: {
        id: latest.id,
        from: latest.from,
        snippet: latest.snippet || "",
        receivedAt: latest.receivedAt,
        isRead: latest.isRead,
      },
      hasUnread: sorted.some((m) => !m.isRead),
      latestPriority: latest.priority as "URGENT" | "NORMAL" | "LOW",
    });
  }

  // Sort threads by latest message date
  threads.sort((a, b) => b.lastMessage.receivedAt.getTime() - a.lastMessage.receivedAt.getTime());

  const total = threads.length;
  const skip = options.skip || 0;
  const take = options.take || 20;

  return {
    threads: threads.slice(skip, skip + take),
    total,
  };
}

// ─── Auto-Reply Engine ────────────────────────────────────────────────────

interface MatchedRule {
  ruleId: string;
  ruleName: string;
  actionType: string;
  actionValue: string;
}

/**
 * Check if an email matches any active auto-reply rules.
 */
export async function checkAutoReplyRules(
  userId: string,
  email: { from: string; subject: string; category?: string | null },
): Promise<MatchedRule | null> {
  const rules = await prisma.emailRule.findMany({
    where: { userId, isActive: true },
  });

  for (const rule of rules) {
    const conditions = JSON.parse(rule.conditions) as {
      from?: string[];
      subjectContains?: string[];
      category?: string[];
    };

    let matches = true;

    // Check from
    if (conditions.from?.length) {
      const fromLower = email.from.toLowerCase();
      if (!conditions.from.some((f) => fromLower.includes(f.toLowerCase()))) {
        matches = false;
      }
    }

    // Check subject keywords
    if (conditions.subjectContains?.length) {
      const subjectLower = email.subject.toLowerCase();
      if (!conditions.subjectContains.some((kw) => subjectLower.includes(kw.toLowerCase()))) {
        matches = false;
      }
    }

    // Check category
    if (conditions.category?.length && email.category) {
      if (!conditions.category.includes(email.category)) {
        matches = false;
      }
    }

    if (matches) {
      // Update trigger count
      await prisma.emailRule.update({
        where: { id: rule.id },
        data: {
          triggerCount: { increment: 1 },
          lastTriggeredAt: new Date(),
        },
      });

      return {
        ruleId: rule.id,
        ruleName: rule.name,
        actionType: rule.actionType,
        actionValue: rule.actionValue,
      };
    }
  }

  return null;
}

/**
 * Generate a smart auto-reply using LLM.
 * Uses the rule template + email context to create a personalized response.
 */
export async function generateSmartReply(
  template: string,
  email: { from: string; subject: string; body: string },
): Promise<string> {
  if (!openai) return template;

  const response = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `You are a professional email reply assistant. Generate a polite, natural reply based on the template and context.
Write in the same language as the incoming email (Korean or English).
Keep it concise (2-4 sentences). Do not add subject line — just the body.`,
      },
      {
        role: "user",
        content: `Template: ${template}\n\nIncoming email:\nFrom: ${email.from}\nSubject: ${email.subject}\nBody: ${email.body.slice(0, 1500)}`,
      },
    ],
  });

  return response.choices[0]?.message?.content || template;
}
