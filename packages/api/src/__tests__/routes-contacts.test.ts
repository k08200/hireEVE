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

type StoredContact = {
  id: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  tags: string | null;
};
const contactStore = new Map<string, StoredContact>();
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    contact: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const results: StoredContact[] = [];
        for (const c of contactStore.values()) {
          if (c.userId === where.userId) results.push(c);
        }
        return results;
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) => contactStore.get(where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Omit<StoredContact, "id"> }) => {
        const id = `contact-${nextId++}`;
        const contact: StoredContact = { ...data, id };
        contactStore.set(id, contact);
        return contact;
      }),
      update: vi.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const contact = contactStore.get(where.id);
          if (!contact) throw new Error("Not found");
          const updated = { ...contact, ...data };
          contactStore.set(where.id, updated as StoredContact);
          return updated;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        contactStore.delete(where.id);
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
  const { contactRoutes } = await import("../routes/contacts.js");
  const app = Fastify();
  await app.register(contactRoutes, { prefix: "/api/contacts" });
  return app;
}

function resetStores() {
  contactStore.clear();
  nextId = 1;
}

// ── Tests ────────────────────────────────────────────────────────

describe("contacts routes", () => {
  beforeEach(resetStores);

  it("rejects unauthenticated requests with 401", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/api/contacts" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("lists contacts for authenticated user", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: { name: "Alice" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/contacts",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().contacts).toHaveLength(1);
    await app.close();
  });

  it("creates a contact", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: {
        name: "Bob",
        email: "bob@example.com",
        company: "Acme",
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().name).toBe("Bob");
    expect(res.json().company).toBe("Acme");
    await app.close();
  });

  it("updates own contact", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: { name: "Old Name" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/contacts/${id}`,
      headers: auth(),
      payload: { name: "New Name" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("New Name");
    await app.close();
  });

  it("returns 404 for non-existent contact", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/contacts/non-existent",
      headers: auth(),
      payload: { name: "X" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 403 when updating another user's contact", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: { name: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "PATCH",
      url: `/api/contacts/${id}`,
      headers: auth(OTHER_TOKEN),
      payload: { name: "Hijack" },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("deletes own contact", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: { name: "Del" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/contacts/${id}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("returns 403 when deleting another user's contact", async () => {
    const app = await buildApp();
    const create = await app.inject({
      method: "POST",
      url: "/api/contacts",
      headers: auth(),
      payload: { name: "Mine" },
    });
    const id = create.json().id;

    const res = await app.inject({
      method: "DELETE",
      url: `/api/contacts/${id}`,
      headers: auth(OTHER_TOKEN),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
