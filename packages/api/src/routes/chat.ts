import type { FastifyInstance } from "fastify";
import type OpenAI from "openai";
import { getUserId, requireAuth } from "../auth.js";
import { compactHistory, forceCompact, isTokenLimitError } from "../context-compressor.js";
import { db, prisma } from "../db.js";
import { extractSnippet } from "../extract-snippet.js";
import { loadMemoriesForPrompt } from "../memory.js";
import {
  createCompletion,
  EVE_SYSTEM_PROMPT,
  MODEL,
  openai,
  resolveUserChatModel,
} from "../openai.js";
import { Semaphore } from "../semaphore.js";
import { getEffectivePlan } from "../stripe.js";
import { executeToolCall, getToolsForPlan } from "../tool-executor.js";

/** Shared semaphore for chat tool execution — limits concurrent tool calls per request */
const chatToolSemaphore = new Semaphore(5);

import { pushNotification } from "../websocket.js";
import { withRetry } from "../with-retry.js";

/** Auto-generate conversation title from the first user message (fire-and-forget) */
async function autoGenerateTitle(conversationId: string, userMessage: string) {
  try {
    const convo = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    // Only generate if title is null/empty (never been set)
    if (convo?.title) return;

    const response = await createCompletion({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate a short conversation title (max 30 chars) from the user message. Reply with ONLY the title, no quotes or extra text. Use the same language as the user message.",
        },
        { role: "user", content: userMessage },
      ],
      max_tokens: 50,
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (title) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { title: title.slice(0, 60) },
      });
    }
  } catch {
    // Title generation is non-critical, silently fail
  }
}

const idParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string", minLength: 1 },
  },
} as const;

const messageIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["msgId"],
  properties: {
    msgId: { type: "string", minLength: 1 },
  },
} as const;

const actionIdParamSchema = {
  type: "object",
  additionalProperties: false,
  required: ["actionId"],
  properties: {
    actionId: { type: "string", minLength: 1 },
  },
} as const;

const createConversationBodySchema = {
  anyOf: [
    {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 1, maxLength: 120 },
        initialMessage: { type: "string", minLength: 1, maxLength: 10000 },
      },
    },
    { type: "null" },
  ],
} as const;

const updateConversationBodySchema = {
  type: "object",
  additionalProperties: false,
  minProperties: 1,
  properties: {
    title: { type: "string", minLength: 1, maxLength: 120 },
    pinned: { type: "boolean" },
  },
} as const;

const searchQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    q: { type: "string", maxLength: 200 },
  },
} as const;

const sendMessageBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["content"],
  properties: {
    content: { type: "string", minLength: 1, maxLength: 20000 },
  },
} as const;

const rejectActionBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reason: { type: "string", minLength: 1, maxLength: 500 },
  },
} as const;

function hasMeaningfulText(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function chatRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireAuth);

  // POST /api/chat/conversations — Create new conversation
  // Optional body: { title?: string, initialMessage?: string }
  app.post(
    "/conversations",
    { schema: { body: createConversationBodySchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const body = (request.body || {}) as {
        title?: string;
        initialMessage?: string;
      };

      if (body.title !== undefined && !hasMeaningfulText(body.title)) {
        return reply.code(400).send({ error: "Title cannot be empty" });
      }
      if (body.initialMessage !== undefined && !hasMeaningfulText(body.initialMessage)) {
        return reply.code(400).send({ error: "Initial message cannot be empty" });
      }

      const conversation = await prisma.conversation.create({
        data: {
          userId,
          ...(body.title ? { title: body.title.trim() } : {}),
        },
      });

      // If initialMessage provided, create a user message and trigger auto-title
      if (body.initialMessage) {
        const initialMessage = body.initialMessage.trim();
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "USER",
            content: initialMessage,
          },
        });
        if (!body.title) {
          autoGenerateTitle(conversation.id, initialMessage);
        }
      }

      return reply.code(201).send(conversation);
    },
  );

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

    // Attach pending action counts for agent-initiated conversations
    const agentConvIds = (conversations as Array<Record<string, unknown>>)
      .filter((c) => c.source === "agent")
      .map((c) => c.id as string);

    let pendingCounts: Record<string, number> = {};
    if (agentConvIds.length > 0) {
      const counts = await db.pendingAction.groupBy({
        by: ["conversationId"],
        where: { conversationId: { in: agentConvIds }, status: "PENDING" },
        _count: { id: true },
      });
      pendingCounts = Object.fromEntries(
        counts.map((c: { conversationId: string; _count: { id: number } }) => [
          c.conversationId,
          c._count.id,
        ]),
      );
    }

    const enriched = (conversations as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      pendingActionCount: pendingCounts[c.id as string] || 0,
    }));

    return { conversations: enriched };
  });

  // GET /api/chat/conversations/:id — Get conversation with messages
  app.get("/conversations/:id", { schema: { params: idParamSchema } }, async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    return conversation;
  });

  // PATCH /api/chat/conversations/:id — Update conversation (title, pinned)
  app.patch(
    "/conversations/:id",
    { schema: { params: idParamSchema, body: updateConversationBodySchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };
      const body = request.body as { title?: string; pinned?: boolean };

      const conversation = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
      if (body.title !== undefined && !hasMeaningfulText(body.title)) {
        return reply.code(400).send({ error: "Title cannot be empty" });
      }

      const data: { title?: string; pinned?: boolean } = {};
      if (body.title !== undefined) data.title = body.title.trim();
      if (body.pinned !== undefined) data.pinned = body.pinned;

      const updated = await prisma.conversation.update({ where: { id }, data });
      return reply.send(updated);
    },
  );

  // DELETE /api/chat/conversations/:id
  app.delete(
    "/conversations/:id",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      // Explicit ordered deletion to avoid FK constraint violations
      // PendingAction has dual FK (conversationId + messageId) — must delete first
      await db.pendingAction.deleteMany({ where: { conversationId: id } });
      await db.conversationSummary.deleteMany({
        where: { conversationId: id },
      });
      await db.tokenUsage.updateMany({
        where: { conversationId: id },
        data: { conversationId: null },
      });
      await prisma.message.deleteMany({ where: { conversationId: id } });
      await prisma.conversation.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // GET /api/chat/conversations/:id/export — Export conversation as markdown
  app.get(
    "/conversations/:id/export",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };
      const convo = await prisma.conversation.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      if (!convo) return reply.code(404).send({ error: "Conversation not found" });
      if (convo.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

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
    },
  );

  // DELETE /api/chat/messages/:msgId — Delete a single message
  app.delete(
    "/messages/:msgId",
    { schema: { params: messageIdParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { msgId } = request.params as { msgId: string };
      try {
        const msg = await prisma.message.findUnique({
          where: { id: msgId },
          include: { conversation: { select: { userId: true } } },
        });
        if (!msg) return reply.code(404).send({ error: "Message not found" });
        if (msg.conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

        await prisma.message.delete({ where: { id: msgId } });
        return reply.code(204).send();
      } catch {
        return reply.code(404).send({ error: "Message not found" });
      }
    },
  );

  // POST /api/chat/conversations/:id/retry — Regenerate last assistant response
  app.post(
    "/conversations/:id/retry",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

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

      const [token, retryUser] = await Promise.all([
        prisma.userToken.findFirst({
          where: { userId: conversation.userId, provider: "google" },
        }),
        prisma.user.findUnique({ where: { id: conversation.userId } }),
      ]);
      const retryPlan = retryUser?.plan || "FREE";
      const tools = getToolsForPlan(!!token, retryPlan);
      const retryChatModel = resolveUserChatModel(
        (retryUser as unknown as { chatModel?: string })?.chatModel || null,
        retryPlan,
      );

      // Build dynamic context for retry
      const retryContextParts: string[] = [];
      try {
        const now = new Date();
        const kstTime = now.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
        retryContextParts.push(`현재 시각: ${kstTime} KST`);
        const pendingTasks = await prisma.task.findMany({
          where: { userId: conversation.userId, status: { not: "DONE" } },
          orderBy: { dueDate: "asc" },
          take: 5,
        });
        if (pendingTasks.length > 0) {
          const taskList = pendingTasks
            .map(
              (t: (typeof pendingTasks)[number]) =>
                `- ${t.title}${t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""}${t.priority === "URGENT" || t.priority === "HIGH" ? ` [${t.priority}]` : ""}`,
            )
            .join("\n");
          retryContextParts.push(`진행 중인 태스크:\n${taskList}`);
        }
      } catch {
        // optional
      }
      const retryDynamicContext =
        retryContextParts.length > 0 ? `\n\n[현재 상황]\n${retryContextParts.join("\n\n")}` : "";

      // Load user memories for retry too
      let retryMemoryContext = "";
      try {
        retryMemoryContext = await loadMemoriesForPrompt(conversation.userId);
      } catch {
        // optional
      }

      const history = [
        {
          role: "system" as const,
          content: EVE_SYSTEM_PROMPT + retryDynamicContext + retryMemoryContext,
        },
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
      let retryClientDisconnected = false;

      request.raw.on("close", () => {
        retryClientDisconnected = true;
      });

      try {
        if (tools.length > 0) {
          const messages: unknown[] = [...history];
          let maxIterations = 5;

          while (maxIterations-- > 0) {
            if (retryClientDisconnected) break;
            const response = await createCompletion({
              model: retryChatModel,
              messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
              tools,
            });

            const choice = response.choices[0];
            const toolCalls = choice.message.tool_calls;

            if (choice.finish_reason === "tool_calls" || (toolCalls && toolCalls.length > 0)) {
              messages.push(choice.message);
              const results = await Promise.all(
                (toolCalls || []).map(async (toolCall) =>
                  chatToolSemaphore.run(async () => {
                    const fn = (
                      toolCall as unknown as {
                        function: { name: string; arguments: string };
                      }
                    ).function;
                    const args = JSON.parse(fn.arguments);
                    reply.raw.write(
                      `data: ${JSON.stringify({ type: "tool_call", name: fn.name, args })}\n\n`,
                    );
                    const result = await executeToolCall(conversation.userId, fn.name, args);
                    reply.raw.write(
                      `data: ${JSON.stringify({ type: "tool_result", name: fn.name })}\n\n`,
                    );
                    return { tool_call_id: toolCall.id, content: result };
                  }),
                ),
              );
              for (const r of results) {
                messages.push({
                  role: "tool",
                  tool_call_id: r.tool_call_id,
                  content: r.content,
                });
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
          const stream = await createCompletion({
            model: retryChatModel,
            messages: history as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
            stream: true,
          });
          for await (const chunk of stream) {
            if (retryClientDisconnected) break;
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              try {
                reply.raw.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
              } catch {
                retryClientDisconnected = true;
                break;
              }
            }
          }
        }

        if (fullResponse) {
          await prisma.message.create({
            data: {
              conversationId: id,
              role: "ASSISTANT",
              content: fullResponse,
            },
          });
        }

        await prisma.conversation.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      } catch (err) {
        // Save partial response even if client disconnected
        if (fullResponse) {
          try {
            await prisma.message.create({
              data: {
                conversationId: id,
                role: "ASSISTANT",
                content: fullResponse,
              },
            });
          } catch {
            // DB save failed
          }
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        try {
          reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
        } catch {
          // Client already disconnected
        }
      }

      try {
        reply.raw.end();
      } catch {
        // Client already disconnected
      }
    },
  );

  // GET /api/chat/search?q=keyword — Search across all conversations
  app.get("/search", { schema: { querystring: searchQuerySchema } }, async (request) => {
    const userId = getUserId(request);
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return { results: [] };
    }

    const messages = await prisma.message.findMany({
      where: {
        conversation: { userId },
        content: { contains: q, mode: "insensitive" },
      },
      include: {
        conversation: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return {
      results: messages.map((m: (typeof messages)[number]) => {
        const snippet = extractSnippet(m.content, q, 200);
        return {
          messageId: m.id,
          conversationId: m.conversation.id,
          conversationTitle: m.conversation.title || "Untitled",
          role: m.role,
          content: snippet.text,
          highlights: snippet.highlights,
          createdAt: m.createdAt,
        };
      }),
    };
  });

  // POST /api/chat/conversations/:id/messages — Send message + SSE streaming response
  app.post(
    "/conversations/:id/messages",
    { schema: { params: idParamSchema, body: sendMessageBodySchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };
      if (!hasMeaningfulText(content)) {
        return reply.code(400).send({ error: "Message content cannot be empty" });
      }
      const trimmedContent = content.trim();

      // Verify conversation exists and belongs to user
      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });

      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      // Check billing plan message limit (skip for demo-user)
      const user = await prisma.user.findUnique({
        where: { id: conversation.userId },
      });
      if (user && user.id !== "demo-user") {
        const planConfig = getEffectivePlan(user.plan, user.role);
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

        // Check token limit
        if (planConfig.tokenLimit !== Infinity) {
          const now = new Date();
          const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const tokenAgg = await db.tokenUsage.aggregate({
            where: { userId: user.id, createdAt: { gte: periodStart } },
            _sum: { totalTokens: true },
          });
          const monthlyTokens = tokenAgg._sum.totalTokens || 0;
          if (monthlyTokens >= planConfig.tokenLimit) {
            return reply.code(402).send({
              error: "Token limit reached",
              plan: user.plan,
              tokenLimit: planConfig.tokenLimit,
              tokenUsage: monthlyTokens,
            });
          }
        }
      }

      // Resolve per-user chat model (chatModel field added in migration, cast for type safety)
      const userChatModel = resolveUserChatModel(
        (user as unknown as { chatModel?: string })?.chatModel || null,
        user?.plan || "FREE",
      );

      // Save user message
      await prisma.message.create({
        data: { conversationId: id, role: "USER", content: trimmedContent },
      });

      // Auto-generate title from first message (LLM-powered, async)
      if (!conversation.title && conversation.messages.length === 0) {
        // Set a quick fallback title immediately
        const fallback =
          trimmedContent.length > 50 ? `${trimmedContent.slice(0, 50)}...` : trimmedContent;
        await prisma.conversation.update({
          where: { id },
          data: { title: fallback },
        });

        // Generate a smarter title in the background (non-blocking)
        createCompletion({
          model: userChatModel,
          messages: [
            {
              role: "system",
              content:
                "Generate a short conversation title (max 40 chars) for this message. Reply with ONLY the title, no quotes or explanation. Use the same language as the user.",
            },
            { role: "user", content: trimmedContent },
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
      const tools = getToolsForPlan(!!token, user?.plan || "FREE");

      // Build dynamic context so EVE knows the current situation
      const contextParts: string[] = [];
      try {
        const now = new Date();
        const kstTime2 = now.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16);
        contextParts.push(`현재 시각: ${kstTime2} KST`);

        // Pending tasks
        const pendingTasks = await prisma.task.findMany({
          where: { userId: conversation.userId, status: { not: "DONE" } },
          orderBy: { dueDate: "asc" },
          take: 5,
        });
        if (pendingTasks.length > 0) {
          const taskList = pendingTasks
            .map(
              (t: (typeof pendingTasks)[number]) =>
                `- ${t.title}${t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""}${t.priority === "URGENT" || t.priority === "HIGH" ? ` [${t.priority}]` : ""}`,
            )
            .join("\n");
          contextParts.push(`진행 중인 태스크:\n${taskList}`);
        }

        // Today's upcoming reminders
        // Get end of today in KST
        const kstNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        const todayEnd = new Date(kstNow.getFullYear(), kstNow.getMonth(), kstNow.getDate() + 1);
        const upcomingReminders = await prisma.reminder.findMany({
          where: {
            userId: conversation.userId,
            status: "PENDING",
            remindAt: { lte: todayEnd },
          },
          take: 3,
        });
        if (upcomingReminders.length > 0) {
          const reminderList = upcomingReminders
            .map((r: (typeof upcomingReminders)[number]) => `- ${r.title}`)
            .join("\n");
          contextParts.push(`오늘 리마인더:\n${reminderList}`);
        }
      } catch {
        // Context loading is optional — don't break chat if it fails
      }

      const dynamicContext =
        contextParts.length > 0 ? `\n\n[현재 상황]\n${contextParts.join("\n\n")}` : "";

      // Load user memories for personalization (Claude Code memdir/ pattern)
      let memoryContext = "";
      try {
        memoryContext = await loadMemoriesForPrompt(conversation.userId);
      } catch {
        // Memory loading is optional
      }

      // Build message history with auto-compaction (Claude Code compact/ pattern).
      // On token-limit errors we rebuild with forceCompact and retry once, so
      // history is mutable.
      const rawMessages = conversation.messages as {
        id: string;
        role: string;
        content: string;
        createdAt: Date;
      }[];
      const buildHistory = async (force: boolean) => {
        const compacted = force
          ? await forceCompact(id, rawMessages)
          : await compactHistory(id, rawMessages);
        return [
          {
            role: "system" as const,
            content: EVE_SYSTEM_PROMPT + dynamicContext + memoryContext,
          },
          ...compacted,
          { role: "user" as const, content },
        ];
      };
      let history = await buildHistory(false);
      let compactionRetryUsed = false;

      // SSE headers
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      let fullResponse = "";
      let clientDisconnected = false;

      // Detect client disconnect — stop LLM generation early
      request.raw.on("close", () => {
        clientDisconnected = true;
      });

      try {
        let apiUsage:
          | {
              prompt_tokens?: number;
              completion_tokens?: number;
              total_tokens?: number;
            }
          | undefined;

        if (tools.length > 0) {
          // Function calling loop with auto-retry (Claude Code withRetry pattern)
          let messages: unknown[] = [...history];
          let maxIterations = 5;

          console.log("[CHAT] Tools enabled, starting function calling loop");

          while (maxIterations-- > 0) {
            if (clientDisconnected) break;
            let response: OpenAI.Chat.Completions.ChatCompletion;
            try {
              response = await withRetry(
                () =>
                  createCompletion({
                    model: userChatModel,
                    messages: messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                    tools,
                  }),
                {
                  maxRetries: 2,
                  onRetry: (attempt, _err, delay) =>
                    console.log(`[CHAT] LLM retry #${attempt}, waiting ${delay}ms`),
                },
              );
            } catch (err) {
              // Context overflow on the first iteration — aggressively compact
              // the base history and restart the loop once. Later iterations
              // accumulate tool call/result state we can't safely drop, so we
              // only recover when messages still match the initial history.
              if (
                isTokenLimitError(err) &&
                !compactionRetryUsed &&
                messages.length === history.length
              ) {
                compactionRetryUsed = true;
                console.warn("[CHAT] token-limit error — forcing compaction and retrying once");
                history = await buildHistory(true);
                messages = [...history];
                maxIterations++;
                continue;
              }
              throw err;
            }

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

              const results = await Promise.all(
                (toolCalls || []).map(async (toolCall) =>
                  chatToolSemaphore.run(async () => {
                    const fn = (
                      toolCall as unknown as {
                        function: { name: string; arguments: string };
                      }
                    ).function;
                    const args = JSON.parse(fn.arguments);

                    // Intentionally no debug log here — every value derived from the
                    // tool call (name, args, result) is user-controlled and CodeQL
                    // flags it as clear-text logging. The SSE event below already
                    // gives the client visibility into which tool ran.
                    reply.raw.write(
                      `data: ${JSON.stringify({ type: "tool_call", name: fn.name, args })}\n\n`,
                    );

                    const result = await executeToolCall(conversation.userId, fn.name, args);

                    reply.raw.write(
                      `data: ${JSON.stringify({ type: "tool_result", name: fn.name })}\n\n`,
                    );

                    return { tool_call_id: toolCall.id, content: result };
                  }),
                ),
              );

              for (const r of results) {
                messages.push({
                  role: "tool",
                  tool_call_id: r.tool_call_id,
                  content: r.content,
                });
              }
            } else {
              // Final response after tools — stream via SSE for better UX
              fullResponse = choice.message.content || "";
              if (response.usage) apiUsage = response.usage;
              console.log("[CHAT] Final response length:", fullResponse.length);

              // Stream final response in chunks for smoother rendering
              const chunkSize = 20;
              for (let i = 0; i < fullResponse.length; i += chunkSize) {
                const chunk = fullResponse.slice(i, i + chunkSize);
                reply.raw.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
              }
              break;
            }
          }
        } else {
          // Regular streaming with auto-retry (no tools available)
          const openStream = () =>
            withRetry(
              () =>
                createCompletion({
                  model: userChatModel,
                  messages: history as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
                  stream: true,
                }),
              {
                maxRetries: 2,
                onRetry: (attempt, _err, delay) =>
                  console.log(`[CHAT] Stream retry #${attempt}, waiting ${delay}ms`),
              },
            );
          let stream: Awaited<ReturnType<typeof openStream>>;
          try {
            stream = await openStream();
          } catch (err) {
            if (isTokenLimitError(err) && !compactionRetryUsed) {
              compactionRetryUsed = true;
              console.warn(
                "[CHAT] stream token-limit error — forcing compaction and retrying once",
              );
              history = await buildHistory(true);
              stream = await openStream();
            } else {
              throw err;
            }
          }

          for await (const chunk of stream) {
            if (clientDisconnected) {
              console.log(
                `[CHAT] Client disconnected mid-stream, saving partial response (${fullResponse.length} chars)`,
              );
              break;
            }
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              fullResponse += delta;
              try {
                reply.raw.write(`data: ${JSON.stringify({ type: "token", content: delta })}\n\n`);
              } catch {
                clientDisconnected = true;
                break;
              }
            }
          }
        }

        // Save assistant message
        if (fullResponse) {
          await prisma.message.create({
            data: {
              conversationId: id,
              role: "ASSISTANT",
              content: fullResponse,
            },
          });
        }

        // Track token usage — use actual API usage when available, estimate for streaming
        const promptTokens =
          apiUsage?.prompt_tokens ??
          Math.ceil((history.reduce((sum, m) => sum + m.content.length, 0) + content.length) / 3);
        const completionTokens = apiUsage?.completion_tokens ?? Math.ceil(fullResponse.length / 3);
        const totalTokens = apiUsage?.total_tokens ?? promptTokens + completionTokens;
        db.tokenUsage
          .create({
            data: {
              userId: conversation.userId,
              conversationId: id,
              model: userChatModel,
              promptTokens,
              completionTokens,
              totalTokens,
              estimatedCost: (promptTokens * 0.00015 + completionTokens * 0.0006) / 1000,
            },
          })
          .catch(() => {
            // Token tracking is non-critical
          });

        // Update conversation timestamp
        await prisma.conversation.update({
          where: { id },
          data: { updatedAt: new Date() },
        });

        // Auto-generate title after first message (fire-and-forget)
        if (conversation.messages.length === 0) {
          autoGenerateTitle(id, trimmedContent);
        }

        reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      } catch (err) {
        // Save partial response even if client disconnected mid-stream
        if (fullResponse) {
          try {
            await prisma.message.create({
              data: {
                conversationId: id,
                role: "ASSISTANT",
                content: fullResponse,
              },
            });
            await prisma.conversation.update({
              where: { id },
              data: { updatedAt: new Date() },
            });
          } catch {
            // DB save failed — nothing we can do
          }
        }

        const message = err instanceof Error ? err.message : "Unknown error";
        try {
          reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
        } catch {
          // Client already disconnected — ignore write error
        }
      }

      try {
        reply.raw.end();
      } catch {
        // Client already disconnected
      }
    },
  );

  // GET /api/chat/conversations/:id/pending-actions — Get pending actions for a conversation
  app.get(
    "/conversations/:id/pending-actions",
    { schema: { params: idParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { id } = request.params as { id: string };

      const conversation = await prisma.conversation.findUnique({
        where: { id },
      });
      if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
      if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

      const actions = await db.pendingAction.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: "desc" },
      });
      return { actions };
    },
  );

  // POST /api/chat/pending-actions/:id/approve — Approve and execute a pending action
  app.post(
    "/pending-actions/:actionId/approve",
    { schema: { params: actionIdParamSchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { actionId } = request.params as { actionId: string };

      const action = await db.pendingAction.findUnique({
        where: { id: actionId },
      });

      if (!action) return reply.code(404).send({ error: "Action not found" });
      if (action.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
      if (action.status !== "PENDING") {
        return reply.code(400).send({ error: `Action already ${action.status.toLowerCase()}` });
      }

      // Atomic status claim — prevents race condition with concurrent approve/reject
      // Uses updateMany with status condition so only one request can claim
      const claimed = await db.pendingAction.updateMany({
        where: { id: actionId, status: "PENDING" },
        data: { status: "EXECUTED", updatedAt: new Date() },
      });
      if (claimed.count === 0) {
        return reply.code(409).send({ error: "Action already processed by another request" });
      }

      // Execute the tool — if it fails, rollback to FAILED
      try {
        const toolArgs = JSON.parse(action.toolArgs);
        const toolResult = await executeToolCall(userId, action.toolName, toolArgs);

        await db.pendingAction.update({
          where: { id: actionId },
          data: { result: toolResult },
        });

        // Add a follow-up message in the conversation
        await db.message.create({
          data: {
            conversationId: action.conversationId,
            role: "ASSISTANT",
            content: `${action.toolName.replace(/_/g, " ")} 실행 완료했어요.`,
            metadata: JSON.stringify({ source: "agent", actionResult: true }),
          },
        });

        // Push notification about execution
        pushNotification(userId, {
          id: "action-executed",
          type: "system",
          title: "conversations-updated",
          message: "",
          createdAt: new Date().toISOString(),
        });

        // Learn from approval for pattern detection
        import("../pattern-learner.js")
          .then(({ learnFromApproval }) => learnFromApproval(userId, action.toolName, toolArgs))
          .catch(() => {});

        // Auto-allow this tool type for future actions if requested
        const { autoAllow } = (request.body as { autoAllow?: boolean }) || {};
        if (autoAllow && action.toolName) {
          const config = await prisma.automationConfig.findUnique({
            where: { userId },
          });
          const existing: string[] =
            (config as unknown as { alwaysAllowedTools?: string[] })?.alwaysAllowedTools || [];
          if (!existing.includes(action.toolName)) {
            await prisma.automationConfig.upsert({
              where: { userId },
              update: { alwaysAllowedTools: [...existing, action.toolName] },
              create: { userId, alwaysAllowedTools: [action.toolName] },
            });
          }
        }

        return { success: true, result: toolResult, autoAllowed: !!autoAllow };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Execution failed";

        await db.pendingAction.update({
          where: { id: actionId },
          data: { status: "FAILED", result: message },
        });

        await db.message.create({
          data: {
            conversationId: action.conversationId,
            role: "ASSISTANT",
            content: `실행 실패: ${message}`,
            metadata: JSON.stringify({ source: "agent", actionFailed: true }),
          },
        });

        return reply.code(500).send({ error: message });
      }
    },
  );

  // POST /api/chat/pending-actions/:id/reject — Reject a pending action
  app.post(
    "/pending-actions/:actionId/reject",
    { schema: { params: actionIdParamSchema, body: rejectActionBodySchema } },
    async (request, reply) => {
      const userId = getUserId(request);
      const { actionId } = request.params as { actionId: string };
      const { reason } = (request.body as { reason?: string }) || {};
      if (reason !== undefined && !hasMeaningfulText(reason)) {
        return reply.code(400).send({ error: "Rejection reason cannot be empty" });
      }

      const action = await db.pendingAction.findUnique({
        where: { id: actionId },
      });

      if (!action) return reply.code(404).send({ error: "Action not found" });
      if (action.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
      if (action.status !== "PENDING") {
        return reply.code(400).send({ error: `Action already ${action.status.toLowerCase()}` });
      }

      // Atomic status claim — prevents race condition with concurrent approve/reject
      const claimed = await db.pendingAction.updateMany({
        where: { id: actionId, status: "PENDING" },
        data: {
          status: "REJECTED",
          result: reason ? `거절 사유: ${reason}` : "User rejected without reason",
        },
      });
      if (claimed.count === 0) {
        return reply.code(409).send({ error: "Action already processed by another request" });
      }

      // Add a follow-up message (include reason if provided)
      const rejectMsg = reason
        ? `알겠어요, "${reason}" — 이 제안은 취소할게요. 다음엔 참고할게요.`
        : "알겠어요, 이 제안은 취소할게요.";

      await db.message.create({
        data: {
          conversationId: action.conversationId,
          role: "ASSISTANT",
          content: rejectMsg,
          metadata: JSON.stringify({ source: "agent", actionRejected: true }),
        },
      });

      // Learn from rejection for pattern detection
      import("../pattern-learner.js")
        .then(({ learnFromRejection }) =>
          learnFromRejection(userId, action.toolName, action.reasoning || "", reason?.trim() || ""),
        )
        .catch(() => {});

      // Never suggest this tool type again if requested
      const { neverSuggest } = (request.body as { neverSuggest?: boolean }) || {};
      if (neverSuggest && action.toolName) {
        import("../memory.js")
          .then(({ remember }) =>
            remember(
              userId,
              "FEEDBACK",
              `never_suggest_${action.toolName}`,
              `User explicitly asked EVE to never propose ${action.toolName} actions.`,
              "user",
            ),
          )
          .catch(() => {});
      }

      return { success: true, neverSuggested: !!neverSuggest };
    },
  );
}
