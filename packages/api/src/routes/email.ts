/**
 * Email API — Gmail integration with DB persistence, AI summarization,
 * thread grouping, search, and auto-reply rules.
 *
 * v2: All reads go through local DB (synced from Gmail).
 * Falls back to demo data when Gmail isn't connected.
 */

import type { EmailRuleAction, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import {
  checkAutoReplyRules,
  generateSmartReply,
  getEmailThreads,
  reconcileEmails,
  summarizeUnsummarizedEmails,
  syncEmails,
} from "../email-sync.js";
import { archiveEmail, sendEmail, toggleReadGmail, toggleStarGmail, trashEmail } from "../gmail.js";
import { sendPushNotification } from "../push.js";
import { pushNotification } from "../websocket.js";

// ─── Demo Data ────────────────────────────────────────────────────────────

const DEMO_EMAILS = [
  {
    id: "demo-1",
    gmailId: "demo-1",
    threadId: "thread-1",
    from: "investor@vc.com",
    to: "me@startup.com",
    subject: "Follow-up: Series A Discussion",
    snippet: "Hi, I wanted to follow up on our conversation last week about the Series A round...",
    body: "Hi,\n\nI wanted to follow up on our conversation last week about the Series A round. We're very interested in leading the round and would love to schedule a call this week to discuss terms.\n\nBest,\nInvestor",
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX", "IMPORTANT"],
    isRead: false,
    isStarred: false,
    priority: "URGENT" as const,
    category: "business",
    summary: "시리즈A 투자 후속 미팅 요청",
    keyPoints: ["시리즈A 리드 투자 관심", "이번 주 콜 요청"],
    actionItems: ["투자자와 콜 일정 잡기"],
    sentiment: "positive",
    receivedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-2",
    gmailId: "demo-2",
    threadId: "thread-2",
    from: "team@notion.so",
    to: "me@startup.com",
    subject: "Your weekly Notion digest",
    snippet:
      "Here's what happened in your workspace this week: 12 pages updated, 3 new databases...",
    body: "Here's what happened in your workspace this week:\n- 12 pages updated\n- 3 new databases created\n- 5 new members joined",
    date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: true,
    isStarred: false,
    priority: "LOW" as const,
    category: "automated",
    summary: "Notion 주간 활동 요약",
    keyPoints: ["12개 페이지 업데이트", "3개 DB 생성"],
    actionItems: [],
    sentiment: "neutral",
    receivedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-3",
    gmailId: "demo-3",
    threadId: "thread-3",
    from: "partner@company.co",
    to: "me@startup.com",
    subject: "Partnership Proposal — Q2 Collaboration",
    snippet:
      "We'd love to explore a partnership opportunity with your team for the upcoming quarter...",
    body: "We'd love to explore a partnership opportunity with your team for the upcoming quarter. Our proposal includes co-marketing, API integration, and revenue sharing.",
    date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: false,
    isStarred: false,
    priority: "NORMAL" as const,
    category: "business",
    summary: "Q2 파트너십 제안 (공동 마케팅 + API 연동)",
    keyPoints: ["공동 마케팅 제안", "API 연동", "수익 쉐어"],
    actionItems: ["파트너십 제안 검토 후 답변"],
    sentiment: "positive",
    receivedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-4",
    gmailId: "demo-4",
    threadId: "thread-4",
    from: "noreply@github.com",
    to: "me@startup.com",
    subject: "[hireEVE] New pull request #42: Add calendar integration",
    snippet: "k08200 opened a new pull request in hireEVE/probeai: Add calendar integration...",
    body: "k08200 opened a new pull request:\n\nAdd calendar integration\n\nThis PR adds Google Calendar sync and event management.",
    date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX", "CATEGORY_UPDATES"],
    isRead: true,
    isStarred: false,
    priority: "NORMAL" as const,
    category: "engineering",
    summary: "캘린더 연동 PR #42 오픈됨",
    keyPoints: ["Google Calendar 동기화 추가", "이벤트 관리 기능"],
    actionItems: ["PR 리뷰"],
    sentiment: "neutral",
    receivedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-5",
    gmailId: "demo-5",
    threadId: "thread-5",
    from: "accounting@service.com",
    to: "me@startup.com",
    subject: "Invoice #INV-2026-0089 — March Services",
    snippet: "Please find attached the invoice for March 2026 services. Total: $2,450.00...",
    body: "Please find attached the invoice for March 2026 services.\n\nTotal: $2,450.00\nDue Date: April 15, 2026\n\nPayment instructions enclosed.",
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: false,
    isStarred: false,
    priority: "NORMAL" as const,
    category: "billing",
    summary: "3월 서비스 인보이스 $2,450 (4/15 마감)",
    keyPoints: ["$2,450 청구", "4월 15일 결제 마감"],
    actionItems: ["인보이스 결제 처리"],
    sentiment: "neutral",
    receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

/** Parse email From header */
function parseFromHeader(from: string): { name: string; email: string } | null {
  if (!from) return null;
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/^["']|["']$/g, "").trim(),
      email: match[2].trim().toLowerCase(),
    };
  }
  const emailOnly = from.trim().toLowerCase();
  if (emailOnly.includes("@")) {
    return { name: emailOnly.split("@")[0], email: emailOnly };
  }
  return null;
}

const SKIP_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /notifications?@/i,
  /mailer-daemon@/i,
  /newsletter@/i,
];

/** Auto-add senders as contacts */
async function autoAddContacts(userId: string, emails: { from: string }[]): Promise<void> {
  const seen = new Set<string>();
  for (const email of emails) {
    const parsed = parseFromHeader(email.from);
    if (!parsed || SKIP_PATTERNS.some((p) => p.test(parsed.email))) continue;
    if (seen.has(parsed.email)) continue;
    seen.add(parsed.email);

    const existing = await prisma.contact.findFirst({ where: { userId, email: parsed.email } });
    if (existing) continue;
    try {
      await prisma.contact.create({
        data: { userId, name: parsed.name, email: parsed.email, tags: "auto-added" },
      });
    } catch {
      /* race condition */
    }
  }
}

export async function emailRoutes(app: FastifyInstance) {
  // ─── Sync & List Emails ───────────────────────────────────────────────
  // GET /api/email?filter=unread|urgent&search=keyword&category=billing&page=1
  app.get("/", async (request) => {
    const { filter, search, category, page } = request.query as {
      filter?: string;
      search?: string;
      category?: string;
      page?: string;
    };
    const uid = getUserId(request);
    const pageNum = parseInt(page || "1", 10);
    const pageSize = 20;

    // Check if Gmail is connected
    const token = await prisma.userToken.findFirst({ where: { userId: uid, provider: "google" } });

    if (!token) {
      // Demo mode
      let emails = [...DEMO_EMAILS];
      if (filter === "unread") emails = emails.filter((e) => !e.isRead);
      if (filter === "urgent") emails = emails.filter((e) => e.priority === "URGENT");
      if (search) {
        const s = search.toLowerCase();
        emails = emails.filter(
          (e) =>
            e.subject.toLowerCase().includes(s) ||
            e.from.toLowerCase().includes(s) ||
            e.snippet.toLowerCase().includes(s),
        );
      }
      if (category) emails = emails.filter((e) => e.category === category);
      return {
        emails,
        source: "demo",
        total: emails.length,
        unread: emails.filter((e) => !e.isRead).length,
        page: 1,
      };
    }

    // Sync from Gmail + reconcile stale data
    try {
      const syncResult = await syncEmails(uid, 30);

      // Reconcile: remove deleted/archived emails from DB
      await reconcileEmails(uid);

      // Auto-add contacts from synced emails
      if (syncResult.newCount > 0) {
        const newEmails = await prisma.emailMessage.findMany({
          where: { userId: uid },
          orderBy: { syncedAt: "desc" },
          take: syncResult.newCount,
        });
        autoAddContacts(uid, newEmails).catch(() => {});

        // Trigger AI summarization for new emails (non-blocking)
        summarizeUnsummarizedEmails(uid, syncResult.newCount).catch(() => {});

        // Check auto-reply rules for new emails
        for (const email of newEmails) {
          checkAndExecuteAutoReply(uid, email).catch(() => {});
        }
      }
    } catch {
      // Sync failed — serve from DB cache if available
    }

    // Build query
    // biome-ignore lint/suspicious/noExplicitAny: dynamic Prisma where clause
    const where: Record<string, any> = { userId: uid };
    if (filter === "unread") where.isRead = false;
    if (filter === "urgent") where.priority = "URGENT";
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: "insensitive" } },
        { from: { contains: search, mode: "insensitive" } },
        { snippet: { contains: search, mode: "insensitive" } },
      ];
    }

    const [emails, total, unreadCount] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      prisma.emailMessage.count({ where }),
      prisma.emailMessage.count({ where: { userId: uid, isRead: false } }),
    ]);

    // Map to API format
    const mapped = emails.map((e) => ({
      id: e.id,
      gmailId: e.gmailId,
      threadId: e.threadId,
      from: e.from,
      to: e.to,
      subject: e.subject,
      snippet: e.snippet,
      date: e.receivedAt.toISOString(),
      labels: e.labels,
      isRead: e.isRead,
      isStarred: e.isStarred,
      priority: e.priority,
      category: e.category,
      summary: e.summary,
      keyPoints: e.keyPoints ? JSON.parse(e.keyPoints) : [],
      actionItems: e.actionItems ? JSON.parse(e.actionItems) : [],
      sentiment: e.sentiment,
    }));

    return { emails: mapped, source: "gmail", total, unread: unreadCount, page: pageNum };
  });

  // ─── Thread View ──────────────────────────────────────────────────────
  // GET /api/email/threads?search=keyword&priority=URGENT&unread=true&page=1
  app.get("/threads", async (request) => {
    const { search, priority, unread, category, page } = request.query as {
      search?: string;
      priority?: string;
      unread?: string;
      category?: string;
      page?: string;
    };
    const uid = getUserId(request);

    const token = await prisma.userToken.findFirst({ where: { userId: uid, provider: "google" } });
    if (!token) {
      // Demo thread view
      const threads = DEMO_EMAILS.map((e) => ({
        threadId: e.threadId,
        subject: e.subject,
        participants: [e.from],
        messageCount: 1,
        lastMessage: {
          id: e.id,
          from: e.from,
          snippet: e.snippet,
          receivedAt: e.receivedAt,
          isRead: e.isRead,
        },
        hasUnread: !e.isRead,
        latestPriority: e.priority,
        summary: e.summary,
      }));
      return { threads, total: threads.length, source: "demo" };
    }

    const pageNum = parseInt(page || "1", 10);
    const result = await getEmailThreads(uid, {
      search,
      priority,
      unreadOnly: unread === "true",
      category,
      skip: (pageNum - 1) * 20,
      take: 20,
    });

    return { ...result, source: "gmail", page: pageNum };
  });

  // ─── Thread Detail ────────────────────────────────────────────────────
  // GET /api/email/thread/:threadId
  app.get("/thread/:threadId", async (request) => {
    const { threadId } = request.params as { threadId: string };
    const uid = getUserId(request);

    const messages = await prisma.emailMessage.findMany({
      where: { userId: uid, threadId },
      orderBy: { receivedAt: "asc" },
    });

    if (messages.length === 0) {
      return { error: "Thread not found" };
    }

    return {
      threadId,
      subject: messages[0].subject,
      messageCount: messages.length,
      messages: messages.map((m) => ({
        id: m.id,
        gmailId: m.gmailId,
        from: m.from,
        to: m.to,
        cc: m.cc,
        subject: m.subject,
        body: m.body,
        snippet: m.snippet,
        date: m.receivedAt.toISOString(),
        isRead: m.isRead,
        priority: m.priority,
        summary: m.summary,
        keyPoints: m.keyPoints ? JSON.parse(m.keyPoints) : [],
        actionItems: m.actionItems ? JSON.parse(m.actionItems) : [],
      })),
    };
  });

  // ─── Single Email Detail ──────────────────────────────────────────────
  // GET /api/email/:id
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);

    // Check DB first
    const dbEmail = await prisma.emailMessage.findFirst({
      where: { userId: uid, OR: [{ id }, { gmailId: id }] },
    });

    if (dbEmail) {
      // Mark as read
      if (!dbEmail.isRead) {
        await prisma.emailMessage.update({ where: { id: dbEmail.id }, data: { isRead: true } });
      }
      return {
        id: dbEmail.id,
        gmailId: dbEmail.gmailId,
        threadId: dbEmail.threadId,
        from: dbEmail.from,
        to: dbEmail.to,
        cc: dbEmail.cc,
        subject: dbEmail.subject,
        snippet: dbEmail.snippet,
        body: dbEmail.body,
        date: dbEmail.receivedAt.toISOString(),
        labels: dbEmail.labels,
        isRead: true,
        isStarred: dbEmail.isStarred,
        priority: dbEmail.priority,
        category: dbEmail.category,
        summary: dbEmail.summary,
        keyPoints: dbEmail.keyPoints ? JSON.parse(dbEmail.keyPoints) : [],
        actionItems: dbEmail.actionItems ? JSON.parse(dbEmail.actionItems) : [],
        sentiment: dbEmail.sentiment,
      };
    }

    // Demo fallback
    if (id.startsWith("demo-")) {
      const email = DEMO_EMAILS.find((e) => e.id === id);
      if (email) return { ...email, body: email.body };
    }

    return { error: "Email not found" };
  });

  // ─── Force Sync ───────────────────────────────────────────────────────
  // POST /api/email/sync
  app.post("/sync", async (request) => {
    const uid = getUserId(request);
    const { query, maxResults } = (request.body as { query?: string; maxResults?: number }) || {};

    try {
      const result = await syncEmails(uid, maxResults || 30, query);

      // Reconcile: remove deleted/archived emails from DB (blocking — wait for cleanup)
      const reconcileResult = await reconcileEmails(uid);

      // Trigger AI summarization (non-blocking)
      summarizeUnsummarizedEmails(uid, result.newCount).catch(() => {});

      return {
        ...result,
        removed: reconcileResult.removed,
        updated: reconcileResult.updated,
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Sync failed" };
    }
  });

  // ─── Reconcile (remove stale emails from DB) ──────────────────────────
  // POST /api/email/reconcile
  app.post("/reconcile", async (request) => {
    const uid = getUserId(request);
    try {
      const result = await reconcileEmails(uid);
      return result;
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Reconcile failed" };
    }
  });

  // ─── AI Summarize ─────────────────────────────────────────────────────
  // POST /api/email/summarize
  app.post("/summarize", async (request) => {
    const uid = getUserId(request);
    const { limit } = (request.body as { limit?: number }) || {};

    const count = await summarizeUnsummarizedEmails(uid, limit || 10);
    return { summarized: count };
  });

  // ─── Send Email ───────────────────────────────────────────────────────
  app.post("/send", { preHandler: requireAuth }, async (request) => {
    const uid = getUserId(request);
    const { to, subject, body } = request.body as { to: string; subject: string; body: string };

    if (!to || !subject || !body) {
      return { error: "Missing required fields: to, subject, body" };
    }

    const result = await sendEmail(uid, to, subject, body);
    return result;
  });

  // ─── Mark Read/Unread (syncs to Gmail) ──────────────────────────────
  // PATCH /api/email/:id/read
  app.patch("/:id/read", async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);
    const { isRead } = (request.body as { isRead?: boolean }) || {};
    const readVal = isRead !== false;

    const email = await prisma.emailMessage.findFirst({
      where: { userId: uid, OR: [{ id }, { gmailId: id }] },
    });
    if (!email) return { error: "Email not found" };

    // Sync to Gmail first, then update DB
    await toggleReadGmail(uid, email.gmailId, readVal).catch(() => {
      // Gmail sync failed — still update local DB
    });
    await prisma.emailMessage.update({
      where: { id: email.id },
      data: { isRead: readVal },
    });
    return { success: true };
  });

  // ─── Star/Unstar (syncs to Gmail) ─────────────────────────────────────
  // PATCH /api/email/:id/star
  app.patch("/:id/star", async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);
    const { isStarred } = (request.body as { isStarred?: boolean }) || {};
    const starVal = isStarred !== false;

    const email = await prisma.emailMessage.findFirst({
      where: { userId: uid, OR: [{ id }, { gmailId: id }] },
    });
    if (!email) return { error: "Email not found" };

    await toggleStarGmail(uid, email.gmailId, starVal).catch(() => {});
    await prisma.emailMessage.update({
      where: { id: email.id },
      data: { isStarred: starVal },
    });
    return { success: true };
  });

  // ─── Delete (trash in Gmail + remove from DB) ─────────────────────────
  // DELETE /api/email/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);

    const email = await prisma.emailMessage.findFirst({
      where: { userId: uid, OR: [{ id }, { gmailId: id }] },
    });
    if (!email) return reply.code(404).send({ error: "Email not found" });

    // Try Gmail first — only delete from DB if Gmail succeeds (or not connected)
    try {
      const result = await trashEmail(uid, email.gmailId);
      if (result && "error" in result) {
        // Gmail not connected — just remove from DB
        await prisma.emailMessage.deleteMany({ where: { id: email.id } });
        return { success: true, warning: "Gmail not connected, removed locally only" };
      }
    } catch (err) {
      const gErr = err as { message?: string };
      console.error(`[EMAIL] Gmail trash failed for ${email.gmailId}:`, gErr.message);
      return reply.code(502).send({ error: `Gmail delete failed: ${gErr.message || "unknown"}` });
    }

    // Gmail succeeded — DB already cleaned by trashEmail()
    return { success: true };
  });

  // ─── Archive (remove from inbox in Gmail + remove from DB) ────────────
  // POST /api/email/:id/archive
  app.post("/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);

    const email = await prisma.emailMessage.findFirst({
      where: { userId: uid, OR: [{ id }, { gmailId: id }] },
    });
    if (!email) return reply.code(404).send({ error: "Email not found" });

    try {
      const result = await archiveEmail(uid, email.gmailId);
      if (result && "error" in result) {
        await prisma.emailMessage.deleteMany({ where: { id: email.id } });
        return { success: true, warning: "Gmail not connected, removed locally only" };
      }
    } catch (err) {
      const gErr = err as { message?: string };
      console.error(`[EMAIL] Gmail archive failed for ${email.gmailId}:`, gErr.message);
      return reply.code(502).send({ error: `Gmail archive failed: ${gErr.message || "unknown"}` });
    }

    return { success: true };
  });

  // ─── Email Stats ──────────────────────────────────────────────────────
  app.get("/stats/summary", async (request) => {
    const uid = getUserId(request);

    const token = await prisma.userToken.findFirst({ where: { userId: uid, provider: "google" } });
    if (!token) {
      return {
        total: DEMO_EMAILS.length,
        unread: DEMO_EMAILS.filter((e) => !e.isRead).length,
        urgent: DEMO_EMAILS.filter((e) => e.priority === "URGENT").length,
        today: DEMO_EMAILS.filter(
          (e) => new Date(e.date).toDateString() === new Date().toDateString(),
        ).length,
        categories: { business: 2, automated: 1, engineering: 1, billing: 1 },
        source: "demo",
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, unread, urgent, today] = await Promise.all([
      prisma.emailMessage.count({ where: { userId: uid } }),
      prisma.emailMessage.count({ where: { userId: uid, isRead: false } }),
      prisma.emailMessage.count({ where: { userId: uid, priority: "URGENT" } }),
      prisma.emailMessage.count({ where: { userId: uid, receivedAt: { gte: todayStart } } }),
    ]);

    // Category breakdown
    const categories = await prisma.emailMessage.groupBy({
      by: ["category"],
      where: { userId: uid, category: { not: null } },
      _count: true,
    });

    const categoryMap: Record<string, number> = {};
    for (const c of categories) {
      if (c.category) categoryMap[c.category] = c._count;
    }

    return { total, unread, urgent, today, categories: categoryMap, source: "gmail" };
  });

  // ─── Auto-Reply Rules CRUD ────────────────────────────────────────────

  // GET /api/email/rules
  app.get("/rules", async (request) => {
    const uid = getUserId(request);
    const rules = await prisma.emailRule.findMany({
      where: { userId: uid },
      orderBy: { createdAt: "desc" },
    });
    return { rules: rules.map((r) => ({ ...r, conditions: JSON.parse(r.conditions) })) };
  });

  // POST /api/email/rules
  app.post("/rules", { preHandler: requireAuth }, async (request) => {
    const uid = getUserId(request);
    const { name, description, conditions, actionType, actionValue } = request.body as {
      name: string;
      description?: string;
      conditions: { from?: string[]; subjectContains?: string[]; category?: string[] };
      actionType: string;
      actionValue: string;
    };

    if (!name || !conditions || !actionValue) {
      return { error: "Missing required fields: name, conditions, actionValue" };
    }

    const rule = await prisma.emailRule.create({
      data: {
        userId: uid,
        name,
        description: description || null,
        conditions: JSON.stringify(conditions),
        actionType: (actionType as EmailRuleAction) || "AUTO_REPLY",
        actionValue,
      },
    });

    return { rule: { ...rule, conditions } };
  });

  // PATCH /api/email/rules/:id
  app.patch("/rules/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);
    const updates = request.body as {
      name?: string;
      description?: string;
      conditions?: object;
      actionType?: string;
      actionValue?: string;
      isActive?: boolean;
    };

    const rule = await prisma.emailRule.findFirst({ where: { id, userId: uid } });
    if (!rule) return { error: "Rule not found" };

    const data: Record<string, unknown> = {};
    if (updates.name !== undefined) data.name = updates.name;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.conditions !== undefined) data.conditions = JSON.stringify(updates.conditions);
    if (updates.actionType !== undefined) data.actionType = updates.actionType;
    if (updates.actionValue !== undefined) data.actionValue = updates.actionValue;
    if (updates.isActive !== undefined) data.isActive = updates.isActive;

    const updated = await prisma.emailRule.update({
      where: { id },
      data: data as Prisma.EmailRuleUpdateInput,
    });
    return { rule: { ...updated, conditions: JSON.parse(updated.conditions) } };
  });

  // DELETE /api/email/rules/:id
  app.delete("/rules/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);

    const rule = await prisma.emailRule.findFirst({ where: { id, userId: uid } });
    if (!rule) return { error: "Rule not found" };

    await prisma.emailRule.delete({ where: { id } });
    return { success: true };
  });
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

async function checkAndExecuteAutoReply(
  userId: string,
  email: { from: string; subject: string; body?: string | null; category?: string | null },
): Promise<void> {
  const matched = await checkAutoReplyRules(userId, email);
  if (!matched) return;

  if (matched.actionType === "AUTO_REPLY" || matched.actionType === "DRAFT_REPLY") {
    const replyBody = await generateSmartReply(matched.actionValue, {
      from: email.from,
      subject: email.subject,
      body: email.body || "",
    });

    if (matched.actionType === "AUTO_REPLY") {
      // Extract email address from From header
      const parsed = parseFromHeader(email.from);
      if (parsed) {
        await sendEmail(userId, parsed.email, `Re: ${email.subject}`, replyBody);

        // Notify user about auto-reply
        await prisma.notification.create({
          data: {
            userId,
            type: "email",
            title: "자동 답변 발송됨",
            message: `"${matched.ruleName}" 규칙에 의해 ${parsed.email}에 자동 답변이 발송되었습니다.`,
          },
        });
        pushNotification(userId, {
          type: "email",
          title: "자동 답변 발송됨",
          message: `${parsed.email}에 자동 답변 완료`,
        });
      }
    } else {
      // DRAFT_REPLY — just notify, user reviews
      await prisma.notification.create({
        data: {
          userId,
          type: "email",
          title: "답변 초안 생성됨",
          message: `"${matched.ruleName}" 규칙에 의해 ${email.from}에 대한 답변 초안이 생성되었습니다.`,
        },
      });
      pushNotification(userId, {
        type: "email",
        title: "답변 초안 생성됨",
        message: `${email.from} 답변 초안 준비 완료`,
      });
    }
  } else if (matched.actionType === "NOTIFY") {
    sendPushNotification(userId, {
      title: `[EVE] ${email.subject}`,
      body: `From: ${email.from}`,
      url: "/email",
    });
  }
}
