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
import { MODEL, openai } from "./openai.js";
import { sendPushNotification } from "./push.js";
import { ALL_TOOLS, executeToolCall } from "./tool-executor.js";
import { pushNotification } from "./websocket.js";

const CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute (respects per-user intervals)
const MAX_TOOL_CALLS = 5;
const MAX_CONTEXT_ITEMS = 10;

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

// Dedup: track recent notification titles to avoid repeating the same insight
// Map<userId, Set<titleHash>> — cleared each cycle
const recentNotifications = new Map<string, Set<string>>();

function getNotifKey(title: string): string {
  // Simple hash: lowercase, strip whitespace, take first 50 chars
  return title.toLowerCase().replace(/\s+/g, "").slice(0, 50);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const read = recentAgentNotifs.filter((n) => n.isRead).length;
    const ignored = total - read;
    const readRate = Math.round((read / total) * 100);

    // Collect categories of ignored notifications
    const ignoredCategories = recentAgentNotifs
      .filter((n) => !n.isRead)
      .map((n) => n.type);
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

  const [tasks, calendar, reminders, notes, unreadNotifs, emails] = await Promise.all([
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
  ]);

  const sections: string[] = [];

  sections.push(
    `## Current Time\nKST: ${kst.toISOString().replace("Z", "+09:00")}\nUTC: ${now.toISOString()}`,
  );

  if (tasks.length > 0) {
    const taskLines = tasks.map((t) => {
      const due = t.dueDate ? t.dueDate.toISOString().split("T")[0] : "no due date";
      const overdue = t.dueDate && t.dueDate < now ? " ⚠️ OVERDUE" : "";
      const dueSoon = t.dueDate && t.dueDate < in24h && !overdue ? " ⏰ DUE SOON" : "";
      return `- [${t.priority || "MEDIUM"}] ${t.title} (due: ${due}${overdue}${dueSoon}) — status: ${t.status}`;
    });
    sections.push(`## Open Tasks (${tasks.length})\n${taskLines.join("\n")}`);
  } else {
    sections.push("## Open Tasks\nNone");
  }

  if (calendar.length > 0) {
    const calLines = calendar.map((e) => {
      const start = e.startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const minutesUntil = Math.round((e.startTime.getTime() - now.getTime()) / 60_000);
      const soon = minutesUntil <= 30 && minutesUntil > 0 ? " 🔴 STARTING SOON" : "";
      const meeting = e.meetingLink ? ` [meeting: ${e.meetingLink}]` : "";
      return `- ${e.title} @ ${start}${soon}${meeting}`;
    });
    sections.push(`## Upcoming Calendar (next 7 days)\n${calLines.join("\n")}`);
  } else {
    sections.push("## Upcoming Calendar\nNone");
  }

  if (reminders.length > 0) {
    const remLines = reminders.map((r) => {
      const at = r.remindAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
      const overdue = r.remindAt < now ? " ⚠️ PAST DUE" : "";
      return `- ${r.title} @ ${at}${overdue}`;
    });
    sections.push(`## Pending Reminders\n${remLines.join("\n")}`);
  }

  if (notes.length > 0) {
    const noteLines = notes.map(
      (n) => `- ${n.title} (updated: ${n.updatedAt.toISOString().split("T")[0]})`,
    );
    sections.push(`## Recent Notes\n${noteLines.join("\n")}`);
  }

  if (emails && emails.length > 0) {
    const emailLines = emails.map(
      (e) => `- From: ${e.from} — "${e.subject}" (${e.snippet?.slice(0, 80) || ""})`,
    );
    sections.push(`## Recent Emails (${emails.length})\n${emailLines.join("\n")}`);
  }

  sections.push(`## Unread Notifications: ${unreadNotifs}`);

  return sections.join("\n\n");
}

const AGENT_SYSTEM_PROMPT = `You are EVE's autonomous reasoning engine — the proactive brain that runs in the background.

Your job: Analyze the user's current state and decide what needs attention RIGHT NOW.

You are NOT having a conversation with the user. You are an autonomous agent that:
1. Reads the user's current context (tasks, calendar, emails, reminders)
2. Identifies important things that need attention
3. Takes action or creates smart notifications

## Decision Framework

For each observation, decide:
- **NOTIFY**: Send a smart notification with your reasoning (default, safe)
- **ACT**: Use a tool to take action (only for low-risk operations)
- **SKIP**: Not important enough to act on right now

## What to Look For
- Overdue tasks that need escalation or rescheduling
- Upcoming meetings that need preparation
- Task patterns (too many tasks? nothing getting done?)
- Calendar conflicts or gaps
- Reminders that are past due
- Cross-cutting insights (e.g., "meeting about X in 2 hours, but task Y related to X is incomplete")

## Rules
- Be selective — only notify about truly important things (max 2-3 per cycle)
- Never spam the user with obvious or low-value notifications
- Prefer quality reasoning over quantity of notifications
- When using tools, prefer read-only operations (list, read, search)
- For write operations (create, update, send), only do this if it's clearly beneficial and low-risk
- Respond in Korean by default (matching the user's preference)
- Keep notifications concise but insightful

## Output Format
After analyzing, call the notify_user tool for each important finding. If no action needed, respond with "No action needed."

Important: You MUST respond within 1-2 tool calls. Do not overthink.`;

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
          description: "Notification body with reasoning (Korean, 1-3 sentences)",
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

/** Run the autonomous reasoning loop for a single user */
async function runAgentForUser(userId: string, mode: string = "SUGGEST"): Promise<void> {
  const startTime = Date.now();

  try {
    const [context, feedback] = await Promise.all([
      gatherUserContext(userId),
      getAgentFeedback(userId),
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

    const contextWithFeedback = feedback
      ? `${context}\n\n${feedback}`
      : context;

    const messages: unknown[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `## User Context\n\n${contextWithFeedback}\n\nAnalyze this context and decide what needs attention. Be selective — only the most important 1-2 items.`,
      },
    ];

    // Build tool list based on mode
    const agentTools = [
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
        model: MODEL,
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: agentTools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1000,
      });

      const choice = response.choices[0];
      if (!choice) break;

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        // LLM decided no action needed
        const content = choice.message.content || "No action needed";
        await logAgentAction(userId, "skip", content);
        break;
      }

      messages.push({
        role: "assistant",
        content: choice.message.content || "",
      });

      for (const toolCall of choice.message.tool_calls) {
        toolCallCount++;
        if (toolCallCount > MAX_TOOL_CALLS) break;

        const fn = (toolCall as unknown as { function: { name: string; arguments: string } })
          .function;
        const fnName = fn.name;
        const args = JSON.parse(fn.arguments || "{}");

        let result: string;

        if (fnName === "notify_user") {
          // Dedup: skip if we sent a similar notification recently
          const key = getNotifKey(args.title);
          if (!recentNotifications.has(userId)) {
            recentNotifications.set(userId, new Set());
          }
          const userNotifs = recentNotifications.get(userId)!;

          if (userNotifs.has(key)) {
            result = JSON.stringify({ skipped: true, reason: "duplicate notification" });
            await logAgentAction(userId, "skip", `Dedup: "${args.title}" already sent`);
          } else {
            userNotifs.add(key);

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

/** Main scheduler loop — checks all users, respects per-user interval */
async function runAutonomousAgent() {
  // Clear dedup cache each scheduler cycle (1 min)
  // This allows the same insight to re-notify after the user's interval passes
  recentNotifications.clear();

  try {
    const configs = await prisma.automationConfig.findMany();
    if (configs.length === 0) return;

    const now = Date.now();

    for (const config of configs) {
      // Skip if autonomous agent is disabled for this user
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = config as any;
      if (cfg.autonomousAgent === false) continue;

      // Respect per-user interval (default 5 min)
      const intervalMs = ((cfg.agentIntervalMin as number) || 5) * 60 * 1000;
      const lastRun = lastRunTime.get(config.userId) || 0;
      if (now - lastRun < intervalMs - 30_000) continue;

      lastRunTime.set(config.userId, now);

      // Run async — don't block other users
      const agentMode = (cfg.agentMode as string) || "SUGGEST";
      runAgentForUser(config.userId, agentMode).catch((err) => {
        console.error(`[AGENT] Unhandled error for ${config.userId}:`, err);
      });
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
