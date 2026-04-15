import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signToken } from "../auth.js";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("../email.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
vi.mock("../gmail.js", () => ({
  getAuthUrl: vi.fn(),
  getLoginAuthUrl: vi.fn(),
  getAuthedClient: vi.fn(),
  getGoogleUserInfo: vi.fn(),
  getOAuth2Client: vi.fn(),
}));

type StoredNote = {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: string;
  updatedAt: Date;
};
const noteStore = new Map<string, StoredNote>();
let nextNoteId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    note: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const results: StoredNote[] = [];
        for (const n of noteStore.values()) {
          if (n.userId === where.userId) results.push(n);
        }
        return results;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => noteStore.get(where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<StoredNote, "id" | "updatedAt"> }) => {
        const id = `note-${nextNoteId++}`;
        const note: StoredNote = {
          ...data,
          id,
          updatedAt: new Date(),
        };
        noteStore.set(id, note);
        return note;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const note = noteStore.get(where.id);
          if (!note) throw new Error("Not found");
          const updated = { ...note, ...data, updatedAt: new Date() };
          noteStore.set(where.id, updated as StoredNote);
          return updated;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        noteStore.delete(where.id);
      }),
    },
    user: {
      findUnique: vi.fn(async () => ({
        id: "user-1",
        plan: "FREE",
        role: "USER",
      })),
    },
    device: {
      findUnique: vi.fn(async () => ({ id: "device-1" })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 1),
      update: vi.fn(async () => ({})),
    },
  };
  return { prisma, db: prisma };
});

// ── Helpers ──────────────────────────────────────────────────────

const TOKEN = signToken({ userId: "user-1", email: "test@example.com" });
const OTHER_TOKEN = signToken({
  userId: "user-2",
  email: "other@example.com",
});

function auth(token = TOKEN) {
  return { authorization: `Bearer ${token}` };
}

async function buildApp() {
  const { noteRoutes } = await import("../routes/notes.js");
  const app = Fastify();
  await app.register(noteRoutes, { prefix: "/api/notes" });
  return app;
}

function resetStores() {
  noteStore.clear();
  nextNoteId = 1;
}

// ── Tests ────────────────────────────────────────────────────────

describe("notes routes", () => {
  beforeEach(resetStores);

  // Auth
  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/notes" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // GET /api/notes
  it("lists notes for authenticated user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "N1", content: "C1" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/notes",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().notes).toHaveLength(1);
    await app.close();
  });

  // POST /api/notes
  it("creates a note with default category", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "My Note", content: "Body text" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().title).toBe("My Note");
    expect(res.json().category).toBe("general");
    await app.close();
  });

  // PATCH /api/notes/:id
  it("updates own note", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "Old", content: "Old" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/notes/${id}`,
      headers: auth(),
      payload: { title: "New" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("New");
    await app.close();
  });

  it("returns 404 for non-existent note", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/notes/non-existent",
      headers: auth(),
      payload: { title: "X" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 403 when updating another user's note", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "Mine", content: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/notes/${id}`,
      headers: auth(OTHER_TOKEN),
      payload: { title: "Hijack" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // DELETE /api/notes/:id
  it("deletes own note", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "Del", content: "Del" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/notes/${id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting another user's note", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/notes",
      headers: auth(),
      payload: { title: "Mine", content: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/notes/${id}`,
      headers: auth(OTHER_TOKEN),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
