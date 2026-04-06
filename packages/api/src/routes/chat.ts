import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { compactHistory } from "../context-compressor.js";
import { prisma } from "../db.js";
import { loadMemoriesForPrompt } from "../memory.js";
import { EVE_SYSTEM_PROMPT, MODEL, openai } from "../openai.js";
import { sendPushNotification } from "../push.js";
import { PLANS } from "../stripe.js";
import { ALL_TOOLS, ALWAYS_TOOLS, executeToolCall } from "../tool-executor.js";
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

    const response = await openai.chat.completions.create({
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
export async function chatRoutes(app: FastifyInstance) {
  // POST /api/chat/conversations — Create new conversation
  // Optional body: { title?: string, initialMessage?: string }
  app.post("/conversations", async (request, reply) => {
    const userId = getUserId(request);
    const body = (request.body || {}) as { title?: string; initialMessage?: string };

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        ...(body.title ? { title: body.title } : {}),
      },
    });

    // If initialMessage provided, create a user message and trigger auto-title
    if (body.initialMessage) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "USER",
          content: body.initialMessage,
        },
      });
      if (!body.title) {
        autoGenerateTitle(conversation.id, body.initialMessage);
      }
    }

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

    // Attach pending action counts for agent-initiated conversations
    const agentConvIds = (conversations as any[])
      .filter((c) => c.source === "agent")
      .map((c) => c.id as string);

    let pendingCounts: Record<string, number> = {};
    if (agentConvIds.length > 0) {
      const counts = await (prisma as any).pendingAction.groupBy({
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

    const enriched = (conversations as any[]).map((c) => ({
      ...c,
      pendingActionCount: pendingCounts[c.id] || 0,
    }));

    return { conversations: enriched };
  });

  // GET /api/chat/conversations/:id — Get conversation with messages
  app.get("/conversations/:id", async (request, reply) => {
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
  app.patch("/conversations/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const body = request.body as { title?: string; pinned?: boolean };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const data: { title?: string; pinned?: boolean } = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.pinned !== undefined) data.pinned = body.pinned;

    const updated = await prisma.conversation.update({ where: { id }, data });
    return reply.send(updated);
  });

  // DELETE /api/chat/conversations/:id
  app.delete("/conversations/:id", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    await prisma.conversation.delete({ where: { id } });
    return reply.code(204).send();
  });

  // GET /api/chat/conversations/:id/export — Export conversation as markdown
  app.get("/conversations/:id/export", async (request, reply) => {
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
  });

  // DELETE /api/chat/messages/:msgId — Delete a single message
  app.delete("/messages/:msgId", async (request, reply) => {
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
  });

  // POST /api/chat/conversations/:id/retry — Regenerate last assistant response
  app.post("/conversations/:id/retry", async (request, reply) => {
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

    const token = await prisma.userToken.findFirst({
      where: { userId: conversation.userId, provider: "google" },
    });
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

  // GET /api/chat/search?q=keyword — Search across all conversations
  app.get("/search", async (request) => {
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
      results: messages.map((m: (typeof messages)[number]) => ({
        messageId: m.id,
        conversationId: m.conversation.id,
        conversationTitle: m.conversation.title || "Untitled",
        role: m.role,
        content: m.content.length > 200 ? `${m.content.slice(0, 200)}...` : m.content,
        createdAt: m.createdAt,
      })),
    };
  });

  // POST /api/chat/conversations/:id/messages — Send message + SSE streaming response
  app.post("/conversations/:id/messages", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };

    // Verify conversation exists and belongs to user
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

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
          .map(
            (t: (typeof pendingTasks)[number]) =>
              `- ${t.title}${t.dueDate ? ` (마감: ${t.dueDate.toLocaleDateString("ko-KR")})` : ""}${t.priority === "URGENT" || t.priority === "HIGH" ? ` [${t.priority}]` : ""}`,
          )
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

    // Build message history with auto-compaction (Claude Code compact/ pattern)
    const compactedMessages = await compactHistory(
      id,
      conversation.messages as { id: string; role: string; content: string; createdAt: Date }[],
    );
    const history = [
      { role: "system" as const, content: EVE_SYSTEM_PROMPT + dynamicContext + memoryContext },
      ...compactedMessages,
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
        // Function calling loop with auto-retry (Claude Code withRetry pattern)
        const messages: unknown[] = [...history];
        let maxIterations = 5;

        console.log("[CHAT] Tools enabled, starting function calling loop");

        while (maxIterations-- > 0) {
          const response = await withRetry(
            () =>
              openai.chat.completions.create({
                model: MODEL,
                messages: messages as Parameters<
                  typeof openai.chat.completions.create
                >[0]["messages"],
                tools,
              }),
            {
              maxRetries: 2,
              onRetry: (attempt, _err, delay) =>
                console.log(`[CHAT] LLM retry #${attempt}, waiting ${delay}ms`),
            },
          );

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
            // Final response after tools — stream via SSE for better UX
            fullResponse = choice.message.content || "";
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
        const stream = await withRetry(
          () =>
            openai.chat.completions.create({
              model: MODEL,
              messages: history as Parameters<typeof openai.chat.completions.create>[0]["messages"],
              stream: true,
            }),
          {
            maxRetries: 2,
            onRetry: (attempt, _err, delay) =>
              console.log(`[CHAT] Stream retry #${attempt}, waiting ${delay}ms`),
          },
        );

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

      // Track token usage (Claude Code cost-tracker pattern)
      // Estimate tokens: ~4 chars per token for English, ~2 for Korean
      const promptChars = history.reduce((sum, m) => sum + m.content.length, 0) + content.length;
      const completionChars = fullResponse.length;
      const estimatedPromptTokens = Math.ceil(promptChars / 3);
      const estimatedCompletionTokens = Math.ceil(completionChars / 3);
      (prisma as any).tokenUsage
        .create({
          data: {
            userId: conversation.userId,
            conversationId: id,
            model: MODEL,
            promptTokens: estimatedPromptTokens,
            completionTokens: estimatedCompletionTokens,
            totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
            estimatedCost:
              (estimatedPromptTokens * 0.00015 + estimatedCompletionTokens * 0.0006) / 1000,
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
        autoGenerateTitle(id, content);
      }

      reply.raw.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      reply.raw.write(`data: ${JSON.stringify({ type: "error", content: message })}\n\n`);
    }

    reply.raw.end();
  });

  // GET /api/chat/conversations/:id/pending-actions — Get pending actions for a conversation
  app.get("/conversations/:id/pending-actions", async (request, reply) => {
    const userId = getUserId(request);
    const { id } = request.params as { id: string };

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) return reply.code(404).send({ error: "Conversation not found" });
    if (conversation.userId !== userId) return reply.code(403).send({ error: "Forbidden" });

    const actions = await (prisma as any).pendingAction.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "desc" },
    });
    return { actions };
  });

  // POST /api/chat/pending-actions/:id/approve — Approve and execute a pending action
  app.post("/pending-actions/:actionId/approve", async (request, reply) => {
    const userId = getUserId(request);
    const { actionId } = request.params as { actionId: string };

    const action = await (prisma as any).pendingAction.findUnique({
      where: { id: actionId },
    });

    if (!action) return reply.code(404).send({ error: "Action not found" });
    if (action.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    if (action.status !== "PENDING") {
      return reply.code(400).send({ error: `Action already ${action.status.toLowerCase()}` });
    }

    // Atomic status claim — prevents race condition with concurrent approve/reject
    // Uses updateMany with status condition so only one request can claim
    const claimed = await (prisma as any).pendingAction.updateMany({
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

      await (prisma as any).pendingAction.update({
        where: { id: actionId },
        data: { result: toolResult },
      });

      // Add a follow-up message in the conversation
      await (prisma as any).message.create({
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

      return { success: true, result: toolResult };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Execution failed";

      await (prisma as any).pendingAction.update({
        where: { id: actionId },
        data: { status: "FAILED", result: message },
      });

      await (prisma as any).message.create({
        data: {
          conversationId: action.conversationId,
          role: "ASSISTANT",
          content: `실행 실패: ${message}`,
          metadata: JSON.stringify({ source: "agent", actionFailed: true }),
        },
      });

      return reply.code(500).send({ error: message });
    }
  });

  // POST /api/chat/pending-actions/:id/reject — Reject a pending action
  app.post("/pending-actions/:actionId/reject", async (request, reply) => {
    const userId = getUserId(request);
    const { actionId } = request.params as { actionId: string };
    const { reason } = (request.body as { reason?: string }) || {};

    const action = await (prisma as any).pendingAction.findUnique({
      where: { id: actionId },
    });

    if (!action) return reply.code(404).send({ error: "Action not found" });
    if (action.userId !== userId) return reply.code(403).send({ error: "Forbidden" });
    if (action.status !== "PENDING") {
      return reply.code(400).send({ error: `Action already ${action.status.toLowerCase()}` });
    }

    // Atomic status claim — prevents race condition with concurrent approve/reject
    const claimed = await (prisma as any).pendingAction.updateMany({
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

    await (prisma as any).message.create({
      data: {
        conversationId: action.conversationId,
        role: "ASSISTANT",
        content: rejectMsg,
        metadata: JSON.stringify({ source: "agent", actionRejected: true }),
      },
    });

    return { success: true };
  });
}
