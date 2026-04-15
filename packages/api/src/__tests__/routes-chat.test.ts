import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

vi.mock("../email.js", () => ({ sendVerificationEmail: vi.fn(), sendPasswordResetEmail: vi.fn() }));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));
vi.mock("../openai.js", () => ({
  EVE_SYSTEM_PROMPT: "You are EVE",
  MODEL: "gpt-4o-mini",
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => ({ choices: [{ message: { content: "Title" } }] })),
      },
    },
  },
  resolveUserChatModel: vi.fn(() => "gpt-4o-mini"),
}));
vi.mock("../context-compressor.js", () => ({
  compactHistory: vi.fn(async (_id: string, msgs: unknown[]) => msgs),
  forceCompact: vi.fn(async () => []),
  isTokenLimitError: vi.fn(() => false),
}));
vi.mock("../memory.js", () => ({ loadMemoriesForPrompt: vi.fn(async () => "") }));
vi.mock("../push.js", () => ({ sendPushNotification: vi.fn() }));
vi.mock("../websocket.js", () => ({ pushNotification: vi.fn() }));
vi.mock("../tool-executor.js", () => ({
  getToolsForPlan: vi.fn(() => []),
  isToolAllowedForPlan: vi.fn(() => true),
  executeToolCall: vi.fn(async () => "done"),
}));
vi.mock("../with-retry.js", () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

type Conv = {
  id: string;
  userId: string;
  title: string | null;
  pinned: boolean;
  updatedAt: Date;
  createdAt: Date;
  messages: Msg[];
};
type Msg = {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
  conversation?: { userId: string };
};
const convStore = new Map<string, Conv>();
const msgStore = new Map<string, Msg>();
let nextConvId = 1;
let nextMsgId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    conversation: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const id = `conv-${nextConvId++}`;
        const conv: Conv = {
          id,
          userId: data.userId as string,
          title: (data.title as string) || null,
          pinned: false,
          updatedAt: new Date(),
          createdAt: new Date(),
          messages: [],
        };
        convStore.set(id, conv);
        return conv;
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const r: Conv[] = [];
        for (const c of convStore.values())
          if (c.userId === where.userId) r.push({ ...c, _count: { messages: c.messages.length } });
        return r;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => convStore.get(where.id) ?? null,
      ),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const c = convStore.get(where.id);
          if (!c) throw new Error("Not found");
          const u = { ...c, ...data };
          convStore.set(where.id, u as Conv);
          return u;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => convStore.delete(where.id)),
    },
    message: {
      create: vi.fn(
        async ({ data }: { data: { conversationId: string; role: string; content: string } }) => {
          const id = `msg-${nextMsgId++}`;
          const msg: Msg = { id, ...data, createdAt: new Date() };
          msgStore.set(id, msg);
          const conv = convStore.get(data.conversationId);
          if (conv) conv.messages.push(msg);
          return msg;
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const msg = msgStore.get(where.id);
        if (!msg) return null;
        const conv = convStore.get(msg.conversationId);
        return { ...msg, conversation: { userId: conv?.userId || "" } };
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => msgStore.delete(where.id)),
      deleteMany: vi.fn(async () => ({})),
    },
    userToken: { findFirst: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", plan: "FREE", role: "USER" })) },
    device: {
      findUnique: vi.fn(async () => ({ id: "d1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  const db = {
    ...prisma,
    pendingAction: {
      groupBy: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({})),
    },
    conversationSummary: { deleteMany: vi.fn(async () => ({})) },
    tokenUsage: { updateMany: vi.fn(async () => ({})) },
  };
  return { prisma, db };
});

vi.mock("../stripe.js", () => ({
  getEffectivePlan: vi.fn(() => ({
    name: "FREE",
    messageLimit: 50,
    tokenLimit: 100000,
    deviceLimit: 3,
  })),
}));

const TOKEN = signToken({ userId: "user-1", email: "t@e.com" });
const OTHER = signToken({ userId: "user-2", email: "o@e.com" });
const auth = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

async function buildApp() {
  const { chatRoutes } = await import("../routes/chat.js");
  const app = Fastify();
  await app.register(chatRoutes, { prefix: "/api/chat" });
  return app;
}

function resetStores() {
  convStore.clear();
  msgStore.clear();
  nextConvId = 1;
  nextMsgId = 1;
}

describe("chat routes (conversation CRUD)", () => {
  beforeEach(resetStores);

  it("rejects unauthenticated with 401", async () => {
    const app = await buildApp();
    expect((await app.inject({ method: "GET", url: "/api/chat/conversations" })).statusCode).toBe(
      401,
    );
    await app.close();
  });

  // POST /conversations
  it("creates a conversation", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: "My Chat" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe("My Chat");
    await app.close();
  });

  it("creates conversation with initial message", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { initialMessage: "Hello EVE" },
    });
    expect(res.statusCode).toBe(201);
    const conv = convStore.get(res.json().id);
    expect(conv?.messages).toHaveLength(1);
    expect(conv?.messages[0].content).toBe("Hello EVE");
    await app.close();
  });

  it("rejects conversation creation with empty title", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: "   " },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects conversation creation with invalid title type", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: { bad: true } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // GET /conversations
  it("lists conversations", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: "C1" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().conversations).toHaveLength(1);
    await app.close();
  });

  // GET /conversations/:id
  it("gets conversation by id", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: "Mine" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 403 for other user's conversation", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { title: "Mine" },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 404 for non-existent conversation", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/chat/conversations/non-existent",
      headers: auth(),
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // PATCH /conversations/:id
  it("updates conversation title", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(),
      payload: { title: "New Title" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("New Title");
    await app.close();
  });

  it("rejects updating conversation with empty title", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(),
      payload: { title: "   " },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects updating conversation with invalid pinned type", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "PATCH",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(),
      payload: { pinned: "yes" },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // DELETE /conversations/:id
  it("deletes own conversation", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting other user's conversation", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "DELETE",
      url: `/api/chat/conversations/${c.json().id}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // DELETE /messages/:msgId
  it("deletes own message", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { initialMessage: "Test msg" },
    });
    const conv = convStore.get(c.json().id)!;
    const msgId = conv.messages[0].id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/chat/messages/${msgId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting other user's message", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
      payload: { initialMessage: "My msg" },
    });
    const conv = convStore.get(c.json().id)!;
    const msgId = conv.messages[0].id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/chat/messages/${msgId}`,
      headers: auth(OTHER),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("rejects sending an empty chat message", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/chat/conversations/${c.json().id}/messages`,
      headers: auth(),
      payload: { content: "   " },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects sending a chat message with invalid content type", async () => {
    const app = await buildApp();
    const c = await app.inject({
      method: "POST",
      url: "/api/chat/conversations",
      headers: auth(),
    });
    const res = await app.inject({
      method: "POST",
      url: `/api/chat/conversations/${c.json().id}/messages`,
      headers: auth(),
      payload: { content: { bad: true } },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
