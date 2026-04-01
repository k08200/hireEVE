import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { BRIEFING_TOOLS } from "../briefing.js";
import {
  CALENDAR_TOOLS,
  checkConflicts,
  createEvent,
  deleteEvent,
  listEvents,
} from "../calendar.js";
import {
  CONTACT_TOOLS,
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "../contacts.js";
import { prisma } from "../db.js";
import {
  FILE_TOOLS,
  listRecentDownloads,
  organizeDownloads,
  readAndSummarize,
  searchFiles,
} from "../files.js";
import { classifyEmails, GMAIL_TOOLS, listEmails, readEmail, sendEmail } from "../gmail.js";
import {
  IMESSAGE_TOOLS,
  isIMessageAvailable,
  listRecentChats as listIMessageChats,
  readIMessages,
  sendIMessage,
} from "../imessage.js";
import {
  getClipboard,
  getRunningApps,
  getSystemInfo,
  isMacOS,
  MACOS_TOOLS,
  openItem,
  setClipboard,
  takeScreenshot,
} from "../macos.js";
import { getUpcomingMeetings, joinMeeting, MEETING_TOOLS, summarizeMeeting } from "../meeting.js";
import { getNews, NEWS_TOOLS } from "../news.js";
import { createNote, deleteNote, listNotes, NOTE_TOOLS, updateNote } from "../notes.js";
import {
  createNotionPage,
  listNotionDatabases,
  NOTION_CONFIGURED,
  NOTION_TOOLS,
  searchNotion,
} from "../notion.js";
import { EVE_SYSTEM_PROMPT, MODEL, openai } from "../openai.js";
import {
  createReminder,
  deleteReminder,
  dismissReminder,
  listReminders,
  REMINDER_TOOLS,
} from "../reminders.js";
import { SEARCH_TOOLS, webSearch } from "../search.js";
import { listSlackChannels, readSlackMessages, SLACK_TOOLS, sendSlackMessage } from "../slack.js";
import { PLANS } from "../stripe.js";
import { createTask, deleteTask, listTasks, TASK_TOOLS, updateTask } from "../tasks.js";
import {
  calculate,
  convertCurrency,
  generatePassword,
  shortenUrl,
  translate,
  UTILITY_TOOLS,
} from "../utilities.js";
import { getWeather, WEATHER_TOOLS } from "../weather.js";
import { WRITER_TOOLS, writeDocument } from "../writer.js";

const GOOGLE_TOOLS = [...GMAIL_TOOLS, ...CALENDAR_TOOLS];
const SLACK_CONFIGURED = !!(process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL);
const TIME_TOOL = {
  type: "function" as const,
  function: {
    name: "get_current_time",
    description:
      "Get current date and time in KST (Korean Standard Time) and UTC. Use when user asks about today's date, current time, or when you need to calculate relative dates like 'tomorrow' or 'next week'.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const ALWAYS_TOOLS = [
  ...TASK_TOOLS,
  ...NOTE_TOOLS,
  ...REMINDER_TOOLS,
  ...CONTACT_TOOLS,
  ...SEARCH_TOOLS,
  ...WRITER_TOOLS,
  ...BRIEFING_TOOLS,
  ...MEETING_TOOLS,
  ...FILE_TOOLS,
  ...WEATHER_TOOLS,
  ...NEWS_TOOLS,
  ...UTILITY_TOOLS,
  TIME_TOOL,
  ...(SLACK_CONFIGURED ? SLACK_TOOLS : []),
  ...(NOTION_CONFIGURED ? NOTION_TOOLS : []),
  ...(isMacOS() ? MACOS_TOOLS : []),
  ...(isIMessageAvailable() ? IMESSAGE_TOOLS : []),
];
const ALL_TOOLS = [...ALWAYS_TOOLS, ...GOOGLE_TOOLS];

async function executeToolCall(
  userId: string,
  functionName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (functionName) {
      case "list_emails":
        return JSON.stringify(await listEmails(userId, (args.max_results as number) || 10));
      case "read_email":
        return JSON.stringify(await readEmail(userId, args.email_id as string));
      case "send_email":
        return JSON.stringify(
          await sendEmail(userId, args.to as string, args.subject as string, args.body as string),
        );
      case "classify_emails":
        return JSON.stringify(await classifyEmails(userId, (args.max_results as number) || 10));
      case "list_events":
        return JSON.stringify(await listEvents(userId, (args.max_results as number) || 10));
      case "create_event":
        return JSON.stringify(
          await createEvent(
            userId,
            args.summary as string,
            args.start_time as string,
            args.end_time as string,
            args.description as string | undefined,
            args.location as string | undefined,
          ),
        );
      case "delete_event":
        return JSON.stringify(await deleteEvent(userId, args.event_id as string));
      case "check_calendar_conflicts":
        return JSON.stringify(
          await checkConflicts(userId, args.start_time as string, args.end_time as string),
        );
      case "list_tasks":
        return JSON.stringify(await listTasks(userId, args.status as string | undefined));
      case "create_task":
        return JSON.stringify(
          await createTask(
            userId,
            args.title as string,
            args.description as string | undefined,
            args.priority as string | undefined,
            args.due_date as string | undefined,
          ),
        );
      case "update_task": {
        const { task_id, ...rest } = args;
        return JSON.stringify(await updateTask(task_id as string, rest));
      }
      case "delete_task":
        return JSON.stringify(await deleteTask(args.task_id as string));
      case "list_notes":
        return JSON.stringify(await listNotes(userId, args.search as string | undefined));
      case "create_note":
        return JSON.stringify(
          await createNote(userId, args.title as string, args.content as string),
        );
      case "update_note": {
        const { note_id, ...noteRest } = args;
        return JSON.stringify(await updateNote(note_id as string, noteRest));
      }
      case "delete_note":
        return JSON.stringify(await deleteNote(args.note_id as string));
      case "send_slack_message":
        return JSON.stringify(
          await sendSlackMessage({
            channel: args.channel as string,
            text: args.text as string,
            thread_ts: args.thread_ts as string | undefined,
          }),
        );
      case "list_slack_channels":
        return JSON.stringify(await listSlackChannels());
      case "read_slack_messages":
        return JSON.stringify(
          await readSlackMessages(args.channel as string, (args.limit as number) || 10),
        );
      case "generate_briefing": {
        const { default: generateBriefingForChat } = await import("../briefing.js");
        return JSON.stringify(await generateBriefingForChat(userId));
      }
      // Reminders
      case "list_reminders":
        return JSON.stringify(
          await listReminders(userId, (args.include_completed as boolean) || false),
        );
      case "create_reminder":
        return JSON.stringify(
          await createReminder(
            userId,
            args.title as string,
            args.remind_at as string,
            args.description as string | undefined,
          ),
        );
      case "dismiss_reminder":
        return JSON.stringify(await dismissReminder(args.reminder_id as string));
      case "delete_reminder":
        return JSON.stringify(await deleteReminder(args.reminder_id as string));
      // Contacts
      case "list_contacts":
        return JSON.stringify(await listContacts(userId, args.search as string | undefined));
      case "create_contact":
        return JSON.stringify(
          await createContact(userId, {
            name: args.name as string,
            email: args.email as string | undefined,
            phone: args.phone as string | undefined,
            company: args.company as string | undefined,
            role: args.role as string | undefined,
            notes: args.notes as string | undefined,
            tags: args.tags as string | undefined,
          }),
        );
      case "update_contact": {
        const { contact_id, ...contactRest } = args;
        return JSON.stringify(await updateContact(contact_id as string, contactRest));
      }
      case "delete_contact":
        return JSON.stringify(await deleteContact(args.contact_id as string));
      // Web Search
      case "web_search":
        return JSON.stringify(
          await webSearch(args.query as string, (args.max_results as number) || 5),
        );
      // Document Writer
      case "write_document":
        return JSON.stringify(
          await writeDocument(
            userId,
            args.type as string,
            args.topic as string,
            args.details as string | undefined,
          ),
        );
      // Utility
      case "get_current_time": {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return JSON.stringify({
          utc: now.toISOString(),
          kst: kst.toISOString().replace("Z", "+09:00"),
          formatted_kst: now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          formatted_utc: now.toLocaleString("en-US", { timeZone: "UTC" }),
          day_of_week: now.toLocaleDateString("ko-KR", { weekday: "long", timeZone: "Asia/Seoul" }),
        });
      }
      // Notion
      case "search_notion":
        return JSON.stringify(await searchNotion(args.query as string));
      case "create_notion_page":
        return JSON.stringify(
          await createNotionPage(
            args.parent_id as string,
            args.title as string,
            args.content as string,
          ),
        );
      case "list_notion_databases":
        return JSON.stringify(await listNotionDatabases());
      // iMessage
      case "send_imessage":
        return JSON.stringify(await sendIMessage(args.to as string, args.text as string));
      case "read_imessages":
        return JSON.stringify(
          await readIMessages(args.from as string, (args.count as number) || 10),
        );
      case "list_imessage_chats":
        return JSON.stringify(await listIMessageChats((args.count as number) || 20));
      // macOS
      case "get_clipboard":
        return JSON.stringify(await getClipboard());
      case "set_clipboard":
        return JSON.stringify(await setClipboard(args.text as string));
      case "get_running_apps":
        return JSON.stringify(await getRunningApps());
      case "open_item":
        return JSON.stringify(await openItem(args.path as string));
      case "get_system_info":
        return JSON.stringify(await getSystemInfo());
      case "take_screenshot":
        return JSON.stringify(await takeScreenshot());
      // Meeting
      case "get_upcoming_meetings":
        return JSON.stringify(await getUpcomingMeetings(userId));
      case "join_meeting":
        return JSON.stringify(await joinMeeting(args.meeting_link as string));
      case "summarize_meeting":
        return JSON.stringify(
          await summarizeMeeting(
            args.title as string,
            args.notes as string,
            (args.attendees as string[]) || [],
          ),
        );
      // Files
      case "search_files":
        return JSON.stringify(
          await searchFiles(args.query as string, args.folder as string | undefined),
        );
      case "read_and_summarize_file":
        return JSON.stringify(await readAndSummarize(args.file_path as string));
      case "organize_downloads":
        return JSON.stringify(await organizeDownloads());
      case "list_recent_downloads":
        return JSON.stringify(await listRecentDownloads((args.count as number) || 10));
      // Weather
      case "get_weather":
        return JSON.stringify(await getWeather(args.location as string));
      // News
      case "get_news":
        return JSON.stringify(
          await getNews(args.topic as string | undefined, args.sources as string[] | undefined),
        );
      // Utilities
      case "translate_text":
        return JSON.stringify(
          await translate(args.text as string, args.from as string, args.to as string),
        );
      case "shorten_url":
        return JSON.stringify(await shortenUrl(args.url as string));
      case "calculate":
        return JSON.stringify(calculate(args.expression as string));
      case "convert_currency":
        return JSON.stringify(
          await convertCurrency(args.amount as number, args.from as string, args.to as string),
        );
      case "generate_password":
        return JSON.stringify(generatePassword(Math.min((args.length as number) || 16, 64)));
      default:
        return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: message });
  }
}

export async function chatRoutes(app: FastifyInstance) {
  // POST /api/chat/conversations — Create new conversation
  app.post("/conversations", async (request, reply) => {
    const userId = getUserId(request);

    const conversation = await prisma.conversation.create({
      data: { userId },
    });

    return reply.code(201).send(conversation);
  });

  // GET /api/chat/conversations — List conversations
  app.get("/conversations", async (request) => {
    const userId = getUserId(request);

    const where = { userId };
    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
    });

    return { conversations };
  });

  // GET /api/chat/conversations/:id — Get conversation with messages
  app.get("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    return conversation;
  });

  // PATCH /api/chat/conversations/:id — Update conversation title
  app.patch("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { title } = request.body as { title: string };

    const conversation = await prisma.conversation.update({
      where: { id },
      data: { title },
    });

    return reply.send(conversation);
  });

  // DELETE /api/chat/conversations/:id
  app.delete("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.conversation.delete({ where: { id } });
    return reply.code(204).send();
  });

  // GET /api/chat/conversations/:id/export — Export conversation as markdown
  app.get("/conversations/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const convo = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!convo) return reply.code(404).send({ error: "Conversation not found" });

    const title = convo.title || "Untitled Conversation";
    const date = convo.createdAt.toISOString().split("T")[0];
    let md = `# ${title}\n\n_Exported: ${date}_\n\n---\n\n`;

    for (const msg of convo.messages) {
      const role = msg.role === "USER" ? "You" : "EVE";
      md += `**${role}** _(${new Date(msg.createdAt).toLocaleString("ko-KR")})_\n\n${msg.content}\n\n---\n\n`;
    }

    return reply
      .header("Content-Type", "text/markdown; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="eve-chat-${date}.md"`)
      .send(md);
  });

  // DELETE /api/chat/messages/:msgId — Delete a single message
  app.delete("/messages/:msgId", async (request, reply) => {
    const { msgId } = request.params as { msgId: string };
    try {
      await prisma.message.delete({ where: { id: msgId } });
      return reply.code(204).send();
    } catch {
      return reply.code(404).send({ error: "Message not found" });
    }
  });

  // POST /api/chat/conversations/:id/retry — Regenerate last assistant response
  app.post("/conversations/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    // Find last user message
    const lastUserMsg = [...conversation.messages].reverse().find((m) => m.role === "USER");
    if (!lastUserMsg) return reply.code(400).send({ error: "No user message to retry" });

    // Delete the last assistant message if it exists
    const lastMsg = conversation.messages[conversation.messages.length - 1];
    if (lastMsg && lastMsg.role === "ASSISTANT") {
      await prisma.message.delete({ where: { id: lastMsg.id } });
    }

    // Build history up to (not including) the deleted assistant message
    const historyMessages = conversation.messages.filter(
      (m: { id: string; role: string }) =>
        !(lastMsg && lastMsg.role === "ASSISTANT" && m.id === lastMsg.id),
    );

    const token = await prisma.userToken.findFirst({ where: { userId: conversation.userId, provider: "google" } });
    const tools = token ? ALL_TOOLS : [...ALWAYS_TOOLS];

    // Build dynamic context for retry
    const retryContextParts: string[] = [];
    try {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      retryContextParts.push(`현재 시각: ${kst.toISOString().replace("T", " ").slice(0, 16)} KST`);
      const pendingTasks = await prisma.task.findMany({
        where: { userId: conversation.userId, status: { not: "DONE" } },
        orderBy: { dueDate: "asc" },
        take: 5,
      });
      if (pendingTasks.length > 0) {
        const taskList = pendingTasks
          .map((t) => `- ${t.title}${t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""}${t.priority === "URGENT" || t.priority === "HIGH" ? ` [${t.priority}]` : ""}`)
          .join("\n");
        retryContextParts.push(`진행 중인 태스크:\n${taskList}`);
      }
    } catch {
      // optional
    }
    const retryDynamicContext = retryContextParts.length > 0
      ? `\n\n[현재 상황]\n${retryContextParts.join("\n\n")}`
      : "";

    const history = [
      { role: "system" as const, content: EVE_SYSTEM_PROMPT + retryDynamicContext },
      ...historyMessages.map((m: { role: string; content: string }) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
      })),
    ];

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let fullResponse = "";

    try {
      if (tools.length > 0) {
        const messages: unknown[] = [...history];
        let maxIterations = 5;

        while (maxIterations-- > 0) {
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
            tools,
          });

          const choice = response.choices[0];
          const toolCalls = choice.message.tool_calls;

          if (choice.finish_reason === "tool_calls" || (toolCalls && toolCalls.length > 0)) {
            messages.push(choice.message);
            for (const toolCall of toolCalls || []) {
              const fn = (toolCall as unknown as { function: { name: string; arguments: string } })
                .function;
              const args = JSON.parse(fn.arguments);
              reply.raw.write(
                `data: ${JSON.stringify({ type: "tool_call", name: fn.name, args })}\n\n`,
              );
              const result = await executeToolCall(conversation.userId, fn.name, args);
              messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
              reply.raw.write(
                `data: ${JSON.stringify({ type: "tool_result", name: fn.name })}\n\n`,
              );
            }
          } else {
            fullResponse = choice.message.content || "";
            reply.raw.write(
              `data: ${JSON.stringify({ type: "token", content: fullResponse })}\n\n`,
            );
            break;
          }
        }
      } else {
        const stream = await openai.chat.completions.create({
          model: MODEL,
          messages: history as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          stream: true,
        });
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            reply.raw.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
          }
        }
      }

      if (fullResponse) {
        await prisma.message.create({
          data: { conversationId: id, role: "ASSISTANT", content: fullResponse },
        });
      }

      await prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
    }

    reply.raw.end();
  });

  // POST /api/chat/conversations/:id/messages — Send message + SSE streaming response
  app.post("/conversations/:id/messages", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };

    // Verify conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });

    // Check billing plan message limit
    const user = await prisma.user.findUnique({ where: { id: conversation.userId } });
    if (user) {
      const planConfig = PLANS[user.plan as keyof typeof PLANS];
      if (planConfig.messageLimit !== Infinity) {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyCount = await prisma.message.count({
          where: {
            conversation: { userId: user.id },
            role: "USER",
            createdAt: { gte: periodStart },
          },
        });
        if (monthlyCount >= planConfig.messageLimit) {
          return reply.code(402).send({
            error: "Message limit reached",
            plan: user.plan,
            messageLimit: planConfig.messageLimit,
            messageCount: monthlyCount,
          });
        }
      }
    }

    // Save user message
    await prisma.message.create({
      data: { conversationId: id, role: "USER", content },
    });

    // Auto-generate title from first message (LLM-powered, async)
    if (!conversation.title && conversation.messages.length === 0) {
      // Set a quick fallback title immediately
      const fallback = content.length > 50 ? `${content.slice(0, 50)}...` : content;
      await prisma.conversation.update({
        where: { id },
        data: { title: fallback },
      });

      // Generate a smarter title in the background (non-blocking)
      openai.chat.completions
        .create({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "Generate a short conversation title (max 40 chars) for this message. Reply with ONLY the title, no quotes or explanation. Use the same language as the user.",
            },
            { role: "user", content },
          ],
        })
        .then((res) => {
          const smartTitle = res.choices[0]?.message?.content?.trim();
          if (smartTitle && smartTitle.length <= 60) {
            return prisma.conversation.update({
              where: { id },
              data: { title: smartTitle },
            });
          }
        })
        .catch(() => {
          // Keep fallback title on failure
        });
    }

    // Check if Gmail is connected for this user
    const token = await prisma.userToken.findFirst({
      where: { userId: conversation.userId, provider: "google" },
    });
    const tools = token ? ALL_TOOLS : [...ALWAYS_TOOLS];

    // Build dynamic context so EVE knows the current situation
    const contextParts: string[] = [];
    try {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      contextParts.push(`현재 시각: ${kst.toISOString().replace("T", " ").slice(0, 16)} KST`);

      // Pending tasks
      const pendingTasks = await prisma.task.findMany({
        where: { userId: conversation.userId, status: { not: "DONE" } },
        orderBy: { dueDate: "asc" },
        take: 5,
      });
      if (pendingTasks.length > 0) {
        const taskList = pendingTasks
          .map((t) => `- ${t.title}${t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""}${t.priority === "URGENT" || t.priority === "HIGH" ? ` [${t.priority}]` : ""}`)
          .join("\n");
        contextParts.push(`진행 중인 태스크:\n${taskList}`);
      }

      // Today's upcoming reminders
      const todayEnd = new Date(kst.getFullYear(), kst.getMonth(), kst.getDate() + 1);
      const upcomingReminders = await prisma.reminder.findMany({
        where: {
          userId: conversation.userId,
          status: "PENDING",
          remindAt: { lte: todayEnd },
        },
        take: 3,
      });
      if (upcomingReminders.length > 0) {
        const reminderList = upcomingReminders.map((r) => `- ${r.title}`).join("\n");
        contextParts.push(`오늘 리마인더:\n${reminderList}`);
      }
    } catch {
      // Context loading is optional — don't break chat if it fails
    }

    const dynamicContext = contextParts.length > 0
      ? `\n\n[현재 상황]\n${contextParts.join("\n\n")}`
      : "";

    // Build message history
    const history = [
      { role: "system" as const, content: EVE_SYSTEM_PROMPT + dynamicContext },
      ...conversation.messages.map((m: { role: string; content: string }) => ({
        role: m.role.toLowerCase() as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content },
    ];

    // SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let fullResponse = "";

    try {
      if (tools.length > 0) {
        // Function calling loop (non-streaming to handle tool calls)
        const messages: unknown[] = [...history];
        let maxIterations = 5;

        console.log("[CHAT] Tools enabled, starting function calling loop");

        while (maxIterations-- > 0) {
          const response = await openai.chat.completions.create({
            model: MODEL,
            messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
            tools,
          });

          const choice = response.choices[0];
          const toolCalls = choice.message.tool_calls;

          console.log(
            "[CHAT] finish_reason:",
            choice.finish_reason,
            "tool_calls:",
            toolCalls?.length || 0,
          );

          if (choice.finish_reason === "tool_calls" || (toolCalls && toolCalls.length > 0)) {
            messages.push(choice.message);

            for (const toolCall of toolCalls || []) {
              const fn = (toolCall as unknown as { function: { name: string; arguments: string } })
                .function;
              const args = JSON.parse(fn.arguments);

              console.log("[CHAT] Calling tool:", fn.name, "args:", JSON.stringify(args));

              reply.raw.write(
                `data: ${JSON.stringify({ type: "tool_call", name: fn.name, args })}\n\n`,
              );

              const result = await executeToolCall(conversation.userId, fn.name, args);

              console.log("[CHAT] Tool result:", result.substring(0, 200));

              messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
              });

              reply.raw.write(
                `data: ${JSON.stringify({ type: "tool_result", name: fn.name })}\n\n`,
              );
            }
          } else {
            fullResponse = choice.message.content || "";
            console.log("[CHAT] Final response length:", fullResponse.length);
            reply.raw.write(
              `data: ${JSON.stringify({ type: "token", content: fullResponse })}\n\n`,
            );
            break;
          }
        }
      } else {
        // Regular streaming (no tools available)
        const stream = await openai.chat.completions.create({
          model: MODEL,
          messages: history as Parameters<typeof openai.chat.completions.create>[0]["messages"],
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            reply.raw.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
          }
        }
      }

      // Save assistant message
      if (fullResponse) {
        await prisma.message.create({
          data: { conversationId: id, role: "ASSISTANT", content: fullResponse },
        });
      }

      // Update conversation timestamp
      await prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      });

      reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
    }

    reply.raw.end();
  });
}
