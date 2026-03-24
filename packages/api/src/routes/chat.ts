import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { CALENDAR_TOOLS, createEvent, deleteEvent, listEvents } from "../calendar.js";
import { GMAIL_TOOLS, listEmails, readEmail, sendEmail } from "../gmail.js";
import { EVE_SYSTEM_PROMPT, MODEL, openai } from "../openai.js";
import { TASK_TOOLS, createTask, deleteTask, listTasks, updateTask } from "../tasks.js";

const GOOGLE_TOOLS = [...GMAIL_TOOLS, ...CALENDAR_TOOLS];
const ALL_TOOLS = [...TASK_TOOLS, ...GOOGLE_TOOLS];

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
    const { userId } = request.body as { userId: string };

    const conversation = await prisma.conversation.create({
      data: { userId },
    });

    return reply.code(201).send(conversation);
  });

  // GET /api/chat/conversations — List conversations
  app.get("/conversations", async (request) => {
    const { userId } = request.query as { userId?: string };

    const where = userId ? { userId } : {};
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

  // DELETE /api/chat/conversations/:id
  app.delete("/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.conversation.delete({ where: { id } });
    return reply.code(204).send();
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

    // Save user message
    await prisma.message.create({
      data: { conversationId: id, role: "USER", content },
    });

    // Auto-generate title from first message
    if (!conversation.title && conversation.messages.length === 0) {
      const title = content.length > 50 ? `${content.slice(0, 50)}...` : content;
      await prisma.conversation.update({
        where: { id },
        data: { title },
      });
    }

    // Check if Gmail is connected (MVP: any google token)
    const token = await prisma.userToken.findFirst({
      where: { provider: "google" },
    });
    const tools = token ? ALL_TOOLS : [...TASK_TOOLS];

    // Build message history
    const history = [
      { role: "system" as const, content: EVE_SYSTEM_PROMPT },
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
