/**
 * Autonomous Agent — EVE's proactive reasoning brain
 *
 * Unlike background.ts (simple cron checks) and automation-scheduler.ts (rule-based),
 * this agent uses LLM reasoning to analyze user state and take intelligent actions.
 *
 * Flow (every N minutes per user, configurable):
 * 1. Gather full user context (tasks, calendar, emails, notes, reminders, contacts)
 * 2. Send context + available tools to LLM
 * 3. LLM reasons about what needs attention and what actions to take
 * 4. Execute actions or send smart notifications with reasoning
 * 5. Log all decisions to AgentLog for transparency
 *
 * Modes:
 * - SUGGEST: Only sends notifications with reasoning (default, safe)
 * - AUTO: Executes low-risk actions automatically (future)
 */

import { prisma } from "./db.js";
import { listEmails } from "./gmail.js";
import { loadMemoriesForPrompt } from "./memory.js";
import { AGENT_MODEL, openai } from "./openai.js";
import { sendPushNotification } from "./push.js";
import { ALL_TOOLS, executeToolCall } from "./tool-executor.js";
import { pushNotification } from "./websocket.js";

const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute (respects per-user intervals)
const MAX_TOOL_CALLS = 5;
const MAX_CONTEXT_ITEMS = 10;
const CONCURRENCY_LIMIT = 5; // Max users to run concurrently

// Safe write tools allowed in AUTO mode — low-risk operations only
const AUTO_SAFE_WRITE_TOOLS = new Set([
  "create_reminder",
  "dismiss_reminder",
  "update_task",
  "classify_emails",
]);

let intervalId: ReturnType<typeof setInterval> | null = null;

// Track last run per user to respect per-user interval
const lastRunTime = new Map<string, number>();

// Dedup: track recent notification titles with TTL to avoid repeating the same insight
// Map<userId, Map<titleHash, expiresAt>> — entries auto-expire, NOT cleared each cycle
const recentNotifications = new Map<string, Map<string, number>>();

/** Prune expired dedup entries (called each cycle) */
function pruneDedup() {
  const now = Date.now();
  for (const [userId, entries] of recentNotifications) {
    for (const [key, expiresAt] of entries) {
      if (now > expiresAt) entries.delete(key);
    }
    if (entries.size === 0) recentNotifications.delete(userId);
  }
}

function getNotifKey(title: string): string {
  // Simple hash: lowercase, strip whitespace, take first 50 chars
  return title.toLowerCase().replace(/\s+/g, "").slice(0, 50);
}

/** Track LLM token usage for cost monitoring */
async function trackTokenUsage(
  userId: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined,
) {
  if (!usage) return;
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  const total = usage.total_tokens || prompt + completion;
  // Rough cost estimate for nano model: ~$0.10/M input, ~$0.40/M output
  const estimatedCost = prompt * 0.0000001 + completion * 0.0000004;
  try {
    // biome-ignore lint/suspicious/noExplicitAny: TokenUsage may not be in generated Prisma types
    await (prisma as any).tokenUsage.create({
      data: {
        userId,
        model: AGENT_MODEL,
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: total,
        estimatedCost,
      },
    });
  } catch {
    // Non-critical — silently fail
  }
}

/** Log agent activity for transparency */
async function logAgentAction(
  userId: string,
  action: string,
  summary: string,
  tool?: string,
  reasoning?: string,
) {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: AgentLog not in generated Prisma types yet
    await (prisma as any).agentLog.create({
      data: { userId, action, summary, tool, reasoning },
    });
  } catch {
    // Logging is non-critical — silently fail before migration
  }
}

/** Gather feedback on recent agent notifications — read rate tells us if we're helpful */
async function getAgentFeedback(userId: string): Promise<string> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h
    const recentAgentNotifs = await prisma.notification.findMany({
      where: {
        userId,
        title: { startsWith: "[EVE]" },
        createdAt: { gte: since },
      },
      select: { title: true, isRead: true, type: true },
    });

    if (recentAgentNotifs.length === 0) return "";

    const total = recentAgentNotifs.length;
    const read = recentAgentNotifs.filter((n: { isRead: boolean }) => n.isRead).length;
    const ignored = total - read;
    const readRate = Math.round((read / total) * 100);

    // Collect categories of ignored notifications
    const ignoredCategories = recentAgentNotifs
      .filter((n: { isRead: boolean }) => !n.isRead)
      .map((n: { type: string }) => n.type);
    const categoryCount = new Map<string, number>();
    for (const cat of ignoredCategories) {
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
    }

    let feedback = `## Agent Feedback (last 24h)\n`;
    feedback += `- Notifications sent: ${total}, Read: ${read} (${readRate}%), Ignored: ${ignored}\n`;

    if (ignored > 0 && categoryCount.size > 0) {
      const cats = [...categoryCount.entries()]
        .map(([cat, count]) => `${cat}(${count})`)
        .join(", ");
      feedback += `- Ignored categories: ${cats}\n`;
      feedback += `- IMPORTANT: Reduce notifications in ignored categories. Only notify about truly actionable items.\n`;
    }

    if (readRate >= 80) {
      feedback += `- Good engagement! Keep current notification quality.\n`;
    } else if (readRate < 50) {
      feedback += `- Low engagement — be MORE selective. Skip low-priority items entirely.\n`;
    }

    return feedback;
  } catch {
    return "";
  }
}

/** Load recent proposal history so agent can learn from approved/rejected actions */
async function getProposalHistory(userId: string): Promise<string> {
  try {
    // biome-ignore lint/suspicious/noExplicitAny: PendingAction not in generated Prisma types yet
    const recentActions = await (prisma as any).pendingAction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (recentActions.length === 0) return "";

    const lines = recentActions.map(
      (a: {
        toolName: string;
        status: string;
        reasoning: string | null;
        result: string | null;
        createdAt: Date;
      }) => {
        const date = a.createdAt.toLocaleDateString("ko-KR");
        const reason = a.status === "REJECTED" && a.result ? ` — ${a.result}` : "";
        return `- [${a.status}] ${a.toolName}: ${(a.reasoning || "").slice(0, 80)}${reason} (${date})`;
      },
    );

    const approved = recentActions.filter(
      (a: { status: string }) => a.status === "EXECUTED",
    ).length;
    const rejected = recentActions.filter(
      (a: { status: string }) => a.status === "REJECTED",
    ).length;
    const pending = recentActions.filter((a: { status: string }) => a.status === "PENDING").length;

    let summary = `\n## Recent Proposals (last ${recentActions.length})\n`;
    summary += `Approved: ${approved}, Rejected: ${rejected}, Pending: ${pending}\n`;
    summary += lines.join("\n");

    if (rejected > approved && recentActions.length >= 3) {
      summary += `\n\nIMPORTANT: More proposals rejected than approved. Be MORE selective and only propose clearly valuable actions.`;
    }

    if (pending > 0) {
      summary += `\n\nNote: ${pending} proposal(s) still pending. Do NOT propose similar actions until they are resolved.`;
    }

    return summary;
  } catch {
    return "";
  }
}

/** Gather full user context for LLM reasoning */
async function gatherUserContext(userId: string): Promise<string> {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Check if Google is connected for email context
  const hasGoogle = await prisma.userToken.findFirst({
    where: { userId, provider: "google" },
    select: { id: true },
  });

  const [
    tasks,
    calendar,
    reminders,
    notes,
    unreadNotifs,
    emails,
    contacts,
    recentAgentLogs,
    recentChatMessages,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { not: "DONE" } },
      orderBy: { dueDate: "asc" },
      take: MAX_CONTEXT_ITEMS,
    }),
    prisma.calendarEvent.findMany({
      where: { userId, startTime: { gte: now, lte: in7d } },
      orderBy: { startTime: "asc" },
      take: MAX_CONTEXT_ITEMS,
    }),
    prisma.reminder.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { remindAt: "asc" },
      take: MAX_CONTEXT_ITEMS,
    }),
    prisma.note.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
    hasGoogle
      ? listEmails(userId, 5)
          .then((res) => ("emails" in res ? res.emails : []))
          .catch(() => [] as Array<{ from: string; subject: string; snippet: string }>)
      : ([] as Array<{ from: string; subject: string; snippet: string }>),
    // Key contacts for cross-domain reasoning (e.g., link email sender to contact)
    prisma.contact.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { name: true, email: true, company: true, role: true, tags: true },
    }),
    // Recent agent decisions — continuity across cycles (prevents amnesia)
    // biome-ignore lint/suspicious/noExplicitAny: AgentLog not in generated Prisma types yet
    (prisma as any).agentLog
      .findMany({
        where: { userId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { action: true, summary: true, createdAt: true },
      })
      .catch(() => []),
    // Recent user chat messages — understand what user is working on / asked about
    prisma.message
      .findMany({
        where: {
          conversation: { userId },
          role: "USER",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { content: true, createdAt: true },
      })
      .catch(() => []),
  ]);

  const sections: string[] = [];

  sections.push(
    `## Current Time\nKST: ${kst.toISOString().replace("Z", "+09:00")}\nUTC: ${now.toISOString()}`,
  );

  if (tasks.length > 0) {
    const taskLines = tasks.map(
      (t: { dueDate: Date | null; priority: string | null; title: string; status: string }) => {
        const due = t.dueDate ? t.dueDate.toISOString().split("T")[0] : "no due date";
        const overdue = t.dueDate && t.dueDate < now ? " ⚠️ OVERDUE" : "";
        const dueSoon = t.dueDate && t.dueDate < in24h && !overdue ? " ⏰ DUE SOON" : "";
        return `- [${t.priority || "MEDIUM"}] ${t.title} (due: ${due}${overdue}${dueSoon}) — status: ${t.status}`;
      },
    );
    sections.push(`## Open Tasks (${tasks.length})\n${taskLines.join("\n")}`);
  } else {
    sections.push("## Open Tasks\nNone");
  }

  if (calendar.length > 0) {
    const calLines = calendar.map(
      (e: { title: string; startTime: Date; meetingLink: string | null }) => {
        const start = e.startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        const minutesUntil = Math.round((e.startTime.getTime() - now.getTime()) / 60_000);
        const soon = minutesUntil <= 30 && minutesUntil > 0 ? " 🔴 STARTING SOON" : "";
        const meeting = e.meetingLink ? ` [meeting: ${e.meetingLink}]` : "";
        return `- ${e.title} @ ${start}${soon}${meeting}`;
      },
    );
    sections.push(`## Upcoming Calendar (next 7 days)\n${calLines.join("\n")}`);
  } else {
    sections.push("## Upcoming Calendar\nNone");
  }

  if (reminders.length > 0) {
    const remLines = reminders.map((r: { title: string; remindAt: Date }) => {
      const at = r.remindAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const overdue = r.remindAt < now ? " ⚠️ PAST DUE" : "";
      return `- ${r.title} @ ${at}${overdue}`;
    });
    sections.push(`## Pending Reminders\n${remLines.join("\n")}`);
  }

  if (notes.length > 0) {
    const noteLines = notes.map(
      (n: { title: string; updatedAt: Date }) =>
        `- ${n.title} (updated: ${n.updatedAt.toISOString().split("T")[0]})`,
    );
    sections.push(`## Recent Notes\n${noteLines.join("\n")}`);
  }

  if (emails && emails.length > 0) {
    const emailLines = emails.map(
      (e: { from: string; subject: string; snippet?: string }) =>
        `- From: ${e.from} — "${e.subject}" (${e.snippet?.slice(0, 80) || ""})`,
    );
    sections.push(`## Recent Emails (${emails.length})\n${emailLines.join("\n")}`);
  }

  sections.push(`## Unread Notifications: ${unreadNotifs}`);

  // Contacts — enables cross-domain reasoning ("email from X who is investor at Y")
  if (contacts.length > 0) {
    const contactLines = contacts.map(
      (c: {
        name: string;
        email: string | null;
        company: string | null;
        role: string | null;
        tags: string | null;
      }) => {
        const parts = [c.name];
        if (c.role && c.company) parts.push(`${c.role} @ ${c.company}`);
        else if (c.company) parts.push(c.company);
        if (c.email) parts.push(c.email);
        if (c.tags) parts.push(`[${c.tags}]`);
        return `- ${parts.join(" — ")}`;
      },
    );
    sections.push(`## Key Contacts (${contacts.length})\n${contactLines.join("\n")}`);
  }

  // Recent user chat messages — understand what user is currently working on
  if (recentChatMessages && recentChatMessages.length > 0) {
    const chatLines = (recentChatMessages as Array<{ content: string; createdAt: Date }>).map(
      (m) => {
        const ago = Math.round((now.getTime() - m.createdAt.getTime()) / 60_000);
        const timeLabel = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
        return `- (${timeLabel}) "${m.content.slice(0, 120)}${m.content.length > 120 ? "..." : ""}"`;
      },
    );
    sections.push(`## What User Recently Asked EVE (last 24h)\n${chatLines.join("\n")}`);
  }

  // Previous agent decisions — continuity across cycles (prevent repeating, evolve reasoning)
  if (recentAgentLogs && recentAgentLogs.length > 0) {
    const logLines = (
      recentAgentLogs as Array<{ action: string; summary: string; createdAt: Date }>
    ).map((l) => {
      const ago = Math.round((now.getTime() - l.createdAt.getTime()) / 60_000);
      const timeLabel = ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
      return `- [${l.action}] (${timeLabel}) ${l.summary.slice(0, 100)}`;
    });
    sections.push(
      `## Your Previous Decisions (last 24h)\nDo NOT repeat the same suggestions. Evolve your reasoning based on time passing.\n${logLines.join("\n")}`,
    );
  }

  // Cross-domain insights — pre-compute connections the LLM should notice
  const crossDomainHints: string[] = [];

  // Deadline clustering — flag when multiple deadlines converge
  const typedTasks = tasks as Array<{
    title: string;
    status: string;
    priority: string | null;
    dueDate: Date | null;
  }>;
  const urgentTasks = typedTasks.filter((t) => t.dueDate && t.dueDate < in24h && t.dueDate > now);
  const overdueTasks = typedTasks.filter((t) => t.dueDate && t.dueDate < now);
  if (urgentTasks.length + overdueTasks.length >= 2) {
    crossDomainHints.push(
      `🔥 Deadline cluster: ${overdueTasks.length} overdue + ${urgentTasks.length} due within 24h → workload risk. Consider prioritizing or rescheduling.`,
    );
  }

  // Free time block detection — find available slots today for task work
  const typedCalendar = calendar as Array<{
    title: string;
    startTime: Date;
    endTime?: Date;
    meetingLink: string | null;
  }>;
  const todayEnd = new Date(kst);
  todayEnd.setHours(23, 59, 59, 999);
  const todayEvents = typedCalendar.filter((e) => e.startTime < todayEnd);
  if (typedTasks.length > 0 && todayEvents.length <= 2) {
    crossDomainHints.push(
      `📅 Light calendar today (${todayEvents.length} events) — good opportunity to tackle pending tasks.`,
    );
  }

  // Link upcoming meetings to contacts and incomplete tasks
  if (calendar.length > 0 && (contacts.length > 0 || tasks.length > 0)) {
    for (const event of typedCalendar) {
      const minutesUntil = Math.round((event.startTime.getTime() - now.getTime()) / 60_000);
      if (minutesUntil > 0 && minutesUntil <= 24 * 60) {
        // Find related contacts
        const relatedContacts = (
          contacts as Array<{ name: string; company: string | null }>
        ).filter(
          (c) => event.title.includes(c.name) || (c.company && event.title.includes(c.company)),
        );
        // Find related tasks
        const relatedTasks = typedTasks.filter((t) => {
          const words = event.title.split(/\s+/).filter((w: string) => w.length > 2);
          return words.some((w: string) => t.title.includes(w));
        });

        // Build hint with reasoning
        if (relatedContacts.length > 0 || relatedTasks.length > 0) {
          const timeLabel =
            minutesUntil < 60 ? `${minutesUntil}min` : `${Math.round(minutesUntil / 60)}h`;
          let hint = `⚡ Meeting "${event.title}" in ${timeLabel}`;
          if (relatedContacts.length > 0) {
            hint += ` — attendee(s): ${relatedContacts.map((c) => `${c.name}${c.company ? ` (${c.company})` : ""}`).join(", ")}`;
          }
          if (relatedTasks.length > 0) {
            const incompleteTasks = relatedTasks.filter((t) => t.status !== "DONE");
            if (incompleteTasks.length > 0) {
              hint += ` — ⚠️ related incomplete tasks: ${incompleteTasks.map((t) => `"${t.title}" (${t.status})`).join(", ")} → preparation may be needed before meeting`;
            }
          }
          crossDomainHints.push(hint);
        }

        // Check for unanswered emails from meeting-related contacts
        if (emails && emails.length > 0 && relatedContacts.length > 0) {
          for (const contact of relatedContacts as Array<{
            name: string;
            email: string | null;
            company: string | null;
          }>) {
            if (!contact.email) continue;
            const emailFromContact = (emails as Array<{ from: string; subject: string }>).find(
              (e) => e.from.toLowerCase().includes(contact.email!.toLowerCase()),
            );
            if (emailFromContact) {
              crossDomainHints.push(
                `📨 Unanswered? Email from ${contact.name} ("${emailFromContact.subject}") + meeting with them in ${minutesUntil < 60 ? `${minutesUntil}min` : `${Math.round(minutesUntil / 60)}h`} → reply before meeting?`,
              );
            }
          }
        }
      }
    }
  }

  // Link emails to contacts (general, not meeting-specific)
  if (emails && emails.length > 0 && contacts.length > 0) {
    for (const email of emails as Array<{ from: string; subject: string }>) {
      const matchedContact = (
        contacts as Array<{
          name: string;
          email: string | null;
          company: string | null;
          tags: string | null;
        }>
      ).find((c) => c.email && email.from.toLowerCase().includes(c.email.toLowerCase()));
      if (matchedContact) {
        const importance =
          matchedContact.tags?.toLowerCase().includes("investor") ||
          matchedContact.tags?.toLowerCase().includes("client")
            ? " ⭐ HIGH PRIORITY"
            : "";
        crossDomainHints.push(
          `📧 Email from ${matchedContact.name}${matchedContact.company ? ` (${matchedContact.company})` : ""}${importance}: "${email.subject}"`,
        );
      }
    }
  }

  if (crossDomainHints.length > 0) {
    sections.push(
      `## 🔗 Cross-Domain Insights (use OBSERVE → CONNECT → PROPOSE on these)\n${crossDomainHints.join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

const AGENT_SYSTEM_PROMPT = `You are EVE — the user's first AI employee. You work alongside them like a real team member who proactively takes care of things.

## Your Identity
You're not a notification bot. You're a strategic advisor who:
- Thinks in connections: every piece of data is linked to something else
- Provides reasoning: always explain the "why" chain behind your suggestion
- Acts as a chief of staff: prioritize, prepare, and prevent — before the user asks
- Remembers what happened before (check "Your Previous Decisions" section)
- Knows when to stay quiet (if nothing urgent, say nothing)

## Reasoning Framework — OBSERVE → CONNECT → PROPOSE

Before making any suggestion, follow this chain:

**OBSERVE**: What facts do I see across ALL domains?
- Scan tasks, calendar, emails, contacts, reminders, notes, and chat history
- Note deadlines, gaps, patterns, and anomalies

**CONNECT**: What hidden relationships exist between these facts?
- Person X in email → same person in tomorrow's meeting → related task incomplete
- 3 tasks due this week → all TODO → calendar has free blocks today
- Email from investor → no reply yet → meeting in 2 days → preparation needed
- Recurring pattern: user always delays X type of task → proactively suggest

**PROPOSE**: What single, high-impact action resolves the connection?
- Be specific: WHO, WHAT, WHEN, WHY
- Show your reasoning chain so the user understands your logic
- One clear action, not a list of observations

## Primary Tool: propose_action
Your main job is to **start conversations** with the user by proposing concrete actions.
The user sees your message in the chat with [승인] [거절] buttons.

Use propose_action when you:
- Have connected 2+ pieces of context into a single insight
- Can explain the reasoning chain (OBSERVE → CONNECT → PROPOSE)
- Have a specific, executable action — not a vague suggestion

## Secondary Tool: notify_user
Use ONLY for pure time-sensitive alerts with no action needed:
- "회의 5분 전입니다" (meeting about to start)
- "미팅링크: https://..." (meeting link)

## Message Format for Proposals

Structure your proposal message like this:
1. **상황** (Situation): 2+ connected facts from different domains
2. **판단** (Reasoning): Why this matters NOW — the connection the user might miss
3. **제안** (Action): Exactly what you'll do if approved

Example:
"📋 상황: 내일 ABC Ventures 미팅이 있고, '피치덱 업데이트' 태스크가 아직 IN_PROGRESS예요. 오늘 캘린더에 2-4시가 비어있어요.
💡 판단: 미팅 전에 피치덱을 마무리할 시간이 오늘 오후밖에 없어요. 내일은 오전에 다른 일정이 있어서 시간이 부족할 수 있어요.
✅ 제안: 오늘 오후 2-4시에 '피치덱 집중 작업' 캘린더 블록을 만들어드릴까요?"

## Cross-Domain Reasoning Examples (your superpower)

### Meeting Preparation Chain:
OBSERVE: Tomorrow meeting with Kim (ABC Ventures) + task "pitch deck" still TODO + email from Kim asking about metrics
CONNECT: Kim wants metrics → pitch deck needs metrics section → meeting is tomorrow → no time block scheduled
PROPOSE: Create 2-hour focus block today + reminder to add metrics section to pitch deck

### Follow-up Detection Chain:
OBSERVE: Email from 김민수 3 days ago + no reply sent + meeting with 김민수 in 2 days
CONNECT: Unanswered email before meeting = awkward situation + email asked a question that needs prep
PROPOSE: Draft reply now, set reminder to review before sending

### Workload Balancing Chain:
OBSERVE: 5 tasks due this week + all TODO status + 2 free afternoon blocks + weekend is empty
CONNECT: 5 tasks in 3 days = overloaded → prioritize by dependency + deadline → use free blocks strategically
PROPOSE: Reorder tasks by urgency, create time blocks for top 2

### Proactive Risk Detection:
OBSERVE: Client meeting moved up by 2 days + deliverable task still IN_PROGRESS + team member on leave
CONNECT: Accelerated timeline + incomplete work + reduced capacity = risk of missing deadline
PROPOSE: Flag the risk, suggest scope adjustment or deadline negotiation

## What Makes a BAD Proposal (never do this):
- "태스크 마감이 지났습니다" — observation without connection or action
- "이메일이 왔습니다" — the user knows. Explain WHY it matters in context
- Single-domain facts without cross-referencing — "할 일이 3개 있어요" (so what?)
- Repeating previous proposals — check "Your Previous Decisions" FIRST

## Rules
- Max 1-2 proposals per cycle. Quality over quantity.
- ALWAYS check "Your Previous Decisions" — never repeat within 24h
- ALWAYS check "Cross-Domain Insights" section — these are pre-computed connections you should act on
- Korean, conversational tone. 존댓말 사용.
- Be specific: "리마인더 설정" → "내일 오전 9시에 '피치덱 최종 검토' 리마인더 설정"
- If nothing needs attention → respond with plain text "No action needed". Do NOT force proposals.
- You MUST respond within 1-2 tool calls. Be decisive.
- Do NOT send "meeting starting in 5 minutes" alerts — another system handles those. Focus on strategic insights about meetings instead (related tasks, preparation needed).
- Show your reasoning — users trust suggestions they understand.`;

const NOTIFY_TOOL = {
  type: "function" as const,
  function: {
    name: "notify_user",
    description: "Send a smart notification to the user with your reasoning",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short notification title (Korean)" },
        message: {
          type: "string",
          description:
            "Notification body (Korean 존댓말). For time-sensitive alerts only — include the specific time/link. Not for proposals (use propose_action instead).",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Notification priority",
        },
        category: {
          type: "string",
          enum: ["task", "calendar", "email", "reminder", "insight"],
          description: "Category",
        },
      },
      required: ["title", "message", "priority", "category"],
    },
  },
};

const PROPOSE_ACTION_TOOL = {
  type: "function" as const,
  function: {
    name: "propose_action",
    description:
      "Propose an action to the user via chat. The user will see your message with approve/reject buttons. Use this when you want to suggest a concrete action (create reminder, update task, etc.) that requires user approval before execution.",
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description:
            "Chat message in Korean using the 상황/판단/제안 format: (1) 📋 상황: connected facts from 2+ domains, (2) 💡 판단: why this matters NOW — the connection the user might miss, (3) ✅ 제안: exactly what you'll do if approved. Conversational 존댓말 tone, 3-5 sentences.",
        },
        toolName: {
          type: "string",
          description: "The tool to execute if approved (e.g. create_reminder, update_task)",
        },
        toolArgs: {
          type: "object",
          description: "Arguments to pass to the tool if approved",
        },
        priority: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Priority level",
        },
        category: {
          type: "string",
          enum: ["task", "calendar", "email", "reminder", "insight"],
          description: "Category",
        },
      },
      required: ["message", "toolName", "toolArgs", "priority", "category"],
    },
  },
};

/** Run the autonomous reasoning loop for a single user */
async function runAgentForUser(userId: string, mode: string = "SUGGEST"): Promise<void> {
  const startTime = Date.now();

  try {
    const [context, feedback, memoryContext, proposalHistory] = await Promise.all([
      gatherUserContext(userId),
      getAgentFeedback(userId),
      loadMemoriesForPrompt(userId).catch(() => ""),
      getProposalHistory(userId).catch(() => ""),
    ]);

    // Skip if context is minimal (no tasks, no calendar, no emails)
    const hasNothing =
      context.includes("## Open Tasks\nNone") &&
      context.includes("## Upcoming Calendar\nNone") &&
      !context.includes("## Recent Emails");
    if (hasNothing) {
      await logAgentAction(userId, "skip", "No tasks, calendar, or emails to analyze");
      return;
    }

    const isAutoMode = mode === "AUTO";

    const systemPrompt = isAutoMode
      ? AGENT_SYSTEM_PROMPT +
        `\n\n## AUTO Mode Active\nYou may execute SAFE write operations automatically:\n- create_reminder: Create reminders for upcoming deadlines\n- dismiss_reminder: Dismiss past-due reminders\n- update_task: Update task status (e.g., mark overdue tasks)\n- classify_emails: Auto-classify emails\n\nFor these operations, act directly without asking. Still notify the user about what you did.\nFor risky operations (send_email, delete_*, send_slack_message, send_imessage), NEVER auto-execute — only NOTIFY.`
      : AGENT_SYSTEM_PROMPT;

    const contextParts = [context];
    if (feedback) contextParts.push(feedback);
    if (proposalHistory) contextParts.push(proposalHistory);
    const contextWithFeedback = contextParts.join("\n\n");

    // Inject user memories into system prompt for personalization
    const systemPromptWithMemory = memoryContext ? `${systemPrompt}${memoryContext}` : systemPrompt;

    const messages: unknown[] = [
      { role: "system", content: systemPromptWithMemory },
      {
        role: "user",
        content: `## User Context\n\n${contextWithFeedback}\n\nAnalyze this context and decide what needs attention. Be selective — only the most important 1-2 items.`,
      },
    ];

    // Build tool list based on mode
    const agentTools = [
      PROPOSE_ACTION_TOOL,
      NOTIFY_TOOL,
      ...ALL_TOOLS.filter((t) => {
        const name = t.function.name;
        // Always allow read-only tools
        if (name.startsWith("list_") || name.startsWith("get_") || name === "web_search") {
          return true;
        }
        // In AUTO mode, also allow safe write tools
        if (isAutoMode && AUTO_SAFE_WRITE_TOOLS.has(name)) {
          return true;
        }
        return false;
      }),
    ];

    let toolCallCount = 0;

    for (let i = 0; i < 3; i++) {
      const response = await openai.chat.completions.create({
        model: AGENT_MODEL,
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1000,
      });

      // Track token usage for cost monitoring
      await trackTokenUsage(
        userId,
        response.usage as
          | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
          | undefined,
      );

      const choice = response.choices[0];
      if (!choice) break;

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        // LLM decided no action needed
        const content = choice.message.content || "No action needed";
        await logAgentAction(userId, "skip", content);
        break;
      }

      // Push full assistant message including tool_calls (required for subsequent tool responses)
      messages.push(choice.message);

      for (const toolCall of choice.message.tool_calls) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS) break;

        const fn = (toolCall as unknown as { function: { name: string; arguments: string } })
          .function;
        const fnName = fn.name;
        // biome-ignore lint/suspicious/noExplicitAny: LLM output is untyped
        let args: any;
        try {
          args = JSON.parse(fn.arguments || "{}");
        } catch {
          await logAgentAction(
            userId,
            "error",
            `Malformed JSON from LLM for ${fnName}: ${fn.arguments?.slice(0, 100)}`,
          );
          continue;
        }

        let result: string;

        if (fnName === "propose_action") {
          // Propose action via chat — create conversation + message + pending action
          const key = getNotifKey(args.message);
          if (!recentNotifications.has(userId)) {
            recentNotifications.set(userId, new Map());
          }
          // biome-ignore lint/style/noNonNullAssertion: set() called right above
          const userNotifs = recentNotifications.get(userId)!;

          if (userNotifs.has(key) && Date.now() < (userNotifs.get(key) || 0)) {
            result = JSON.stringify({ skipped: true, reason: "duplicate proposal" });
            await logAgentAction(userId, "skip", `Dedup proposal: "${args.message.slice(0, 50)}"`);
          } else {
            // TTL = 30 minutes (covers multiple agent cycles)
            userNotifs.set(key, Date.now() + 30 * 60 * 1000);

            // Find or create an agent conversation for today
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            // biome-ignore lint/suspicious/noExplicitAny: source field not in generated Prisma types yet
            let agentConvo = await (prisma as any).conversation.findFirst({
              where: {
                userId,
                source: "agent",
                createdAt: { gte: todayStart },
              },
              orderBy: { createdAt: "desc" },
            });

            if (!agentConvo) {
              const todayStr = new Date().toLocaleDateString("ko-KR", {
                month: "long",
                day: "numeric",
              });
              // biome-ignore lint/suspicious/noExplicitAny: source field not in generated Prisma types yet
              agentConvo = await (prisma as any).conversation.create({
                data: {
                  userId,
                  title: `EVE 제안 — ${todayStr}`,
                  source: "agent",
                },
              });
            }

            // Create the assistant message with the proposal
            // biome-ignore lint/suspicious/noExplicitAny: metadata field not in generated Prisma types yet
            const assistantMsg = await (prisma as any).message.create({
              data: {
                conversationId: agentConvo.id,
                role: "ASSISTANT",
                content: args.message,
                metadata: JSON.stringify({ source: "agent", hasAction: true }),
              },
            });

            // Create the pending action
            // biome-ignore lint/suspicious/noExplicitAny: PendingAction not in generated Prisma types yet
            await (prisma as any).pendingAction.create({
              data: {
                conversationId: agentConvo.id,
                messageId: assistantMsg.id,
                userId,
                toolName: args.toolName,
                toolArgs: JSON.stringify(args.toolArgs),
                reasoning: args.message,
              },
            });

            // Update conversation timestamp
            await prisma.conversation.update({
              where: { id: agentConvo.id },
              data: { updatedAt: new Date() },
            });

            // Also create a notification so user sees it in notification bell
            const notifTitle = `[EVE] ${args.message.slice(0, 50)}${args.message.length > 50 ? "..." : ""}`;
            const notification = await prisma.notification.create({
              data: {
                userId,
                type: args.category || "insight",
                title: notifTitle,
                message: args.message,
              },
            });

            // Push notification with conversationId so bell links to the right chat
            pushNotification(userId, {
              id: notification.id,
              type: args.category || "insight",
              title: notifTitle,
              message: args.message,
              createdAt: notification.createdAt.toISOString(),
              conversationId: agentConvo.id,
            });

            if (args.priority === "high") {
              sendPushNotification(userId, {
                title: "[EVE] 확인이 필요해요",
                body: args.message.slice(0, 100),
                url: `/chat/${agentConvo.id}`,
              });
            }

            result = JSON.stringify({
              success: true,
              proposed: true,
              conversationId: agentConvo.id,
            });

            await logAgentAction(
              userId,
              "propose",
              `[${args.priority}] Proposed ${args.toolName}: ${args.message.slice(0, 100)}`,
              "propose_action",
              args.category,
            );
            console.log(
              `[AGENT] Proposed action to ${userId} in convo ${agentConvo.id}: ${args.toolName}`,
            );

            // Notify sidebar to refresh
            pushNotification(userId, {
              id: "sidebar-refresh",
              type: "system",
              title: "conversations-updated",
              message: "",
              createdAt: new Date().toISOString(),
            });
          }
        } else if (fnName === "notify_user") {
          // Lightweight notification — no approval needed
          const key = getNotifKey(args.title);
          if (!recentNotifications.has(userId)) {
            recentNotifications.set(userId, new Map());
          }
          // biome-ignore lint/style/noNonNullAssertion: set() called right above
          const userNotifs = recentNotifications.get(userId)!;

          if (userNotifs.has(key) && Date.now() < (userNotifs.get(key) || 0)) {
            result = JSON.stringify({ skipped: true, reason: "duplicate notification" });
            await logAgentAction(userId, "skip", `Dedup: "${args.title}" already sent`);
          } else {
            // TTL = 30 minutes
            userNotifs.set(key, Date.now() + 30 * 60 * 1000);

            // Mark as agent-generated notification
            const agentTitle = `[EVE] ${args.title}`;

            const notification = await prisma.notification.create({
              data: {
                userId,
                type: args.category || "insight",
                title: agentTitle,
                message: args.message,
              },
            });

            pushNotification(userId, {
              id: notification.id,
              type: args.category || "insight",
              title: agentTitle,
              message: args.message,
              createdAt: notification.createdAt.toISOString(),
            });

            if (args.priority === "high") {
              sendPushNotification(userId, {
                title: agentTitle,
                body: args.message,
                url: `/${args.category === "task" ? "tasks" : args.category === "calendar" ? "calendar" : "chat"}`,
              });
            }

            result = JSON.stringify({ success: true, notified: true });

            await logAgentAction(
              userId,
              "notify",
              `[${args.priority}] ${agentTitle}: ${args.message}`,
              "notify_user",
              args.category,
            );
            console.log(`[AGENT] Notified ${userId}: ${agentTitle}`);
          }
        } else {
          // In AUTO mode with safe write tools, execute and notify
          const isSafeWrite = AUTO_SAFE_WRITE_TOOLS.has(fnName);
          result = await executeToolCall(userId, fnName, args);

          const action = isSafeWrite ? "auto_action" : "tool_call";
          await logAgentAction(
            userId,
            action,
            `Called ${fnName} with ${JSON.stringify(args).slice(0, 200)}`,
            fnName,
          );

          // Auto-notify user about automatic actions taken
          if (isSafeWrite && isAutoMode) {
            const autoTitle = `[EVE] 자동 실행: ${fnName}`;
            const autoMessage = `${fnName}을(를) 자동 실행했습니다: ${JSON.stringify(args).slice(0, 100)}`;
            const notification = await prisma.notification.create({
              data: { userId, type: "insight", title: autoTitle, message: autoMessage },
            });
            pushNotification(userId, {
              id: notification.id,
              type: "insight",
              title: autoTitle,
              message: autoMessage,
              createdAt: notification.createdAt.toISOString(),
            });
            console.log(`[AGENT] Auto-executed ${fnName} for ${userId}`);
          }
        }

        messages.push({
          role: "tool",
          content: result,
          tool_call_id: toolCall.id,
        });
      }

      if (toolCallCount >= MAX_TOOL_CALLS) break;
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[AGENT] Cycle for ${userId} completed in ${elapsed}ms (${toolCallCount} tool calls)`,
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Unknown error";
    await logAgentAction(userId, "error", `Agent error after ${elapsed}ms: ${message}`);
    console.error(`[AGENT] Error for ${userId} after ${elapsed}ms:`, err);
  }
}

const PENDING_ACTION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Expire stale pending actions — prevents deadlock when user ignores proposals */
async function expireStalePendingActions() {
  try {
    const cutoff = new Date(Date.now() - PENDING_ACTION_TTL_MS);
    // biome-ignore lint/suspicious/noExplicitAny: PendingAction not in generated Prisma types yet
    const expired = await (prisma as any).pendingAction.updateMany({
      where: { status: "PENDING", createdAt: { lt: cutoff } },
      data: { status: "REJECTED", result: "자동 만료 (24시간 초과)" },
    });
    if (expired.count > 0) {
      console.log(`[AGENT] Expired ${expired.count} stale pending action(s)`);
    }
  } catch {
    // Non-critical
  }
}

/** Main scheduler loop — checks all users, respects per-user interval */
async function runAutonomousAgent() {
  // Expire stale pending actions before running new cycles
  await expireStalePendingActions();

  // Prune expired dedup entries (NOT clear — entries have their own TTL)
  pruneDedup();

  try {
    const configs = await prisma.automationConfig.findMany();

    // Prune lastRunTime for users no longer in configs (prevents unbounded growth)
    const activeUserIds = new Set(configs.map((c) => c.userId));
    for (const userId of lastRunTime.keys()) {
      if (!activeUserIds.has(userId)) lastRunTime.delete(userId);
    }
    if (configs.length === 0) return;

    const now = Date.now();

    // Filter users that are due for a run
    const usersToRun: Array<{ userId: string; mode: string }> = [];
    for (const config of configs) {
      // biome-ignore lint/suspicious/noExplicitAny: AgentLog fields not in generated types
      const cfg = config as any;
      if (cfg.autonomousAgent === false) continue;

      const intervalMs = ((cfg.agentIntervalMin as number) || 5) * 60 * 1000;
      const lastRun = lastRunTime.get(config.userId) || 0;
      if (now - lastRun < intervalMs - 30_000) continue;

      lastRunTime.set(config.userId, now);
      usersToRun.push({ userId: config.userId, mode: (cfg.agentMode as string) || "SUGGEST" });
    }

    // Run in parallel with concurrency limit (not sequential)
    for (let i = 0; i < usersToRun.length; i += CONCURRENCY_LIMIT) {
      const batch = usersToRun.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(
        batch.map(({ userId, mode }) =>
          runAgentForUser(userId, mode).catch((err) => {
            console.error(`[AGENT] Unhandled error for ${userId}:`, err);
          }),
        ),
      );
    }
  } catch (err) {
    console.error("[AGENT] Scheduler error:", err);
  }
}

/** Start the autonomous agent scheduler */
export function startAutonomousAgent() {
  if (intervalId) return;

  if (!openai) {
    console.log("[AGENT] Autonomous agent disabled — no LLM configured");
    return;
  }

  console.log("[AGENT] Autonomous agent started (checking every 60s)");

  // First run after 30 seconds
  setTimeout(() => {
    runAutonomousAgent();
  }, 30_000);

  // Check every minute, respects per-user intervals
  intervalId = setInterval(runAutonomousAgent, CHECK_INTERVAL_MS);
}

/** Stop the autonomous agent */
export function stopAutonomousAgent() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[AGENT] Autonomous agent stopped");
  }
}
