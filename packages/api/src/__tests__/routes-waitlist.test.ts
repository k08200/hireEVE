import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub mail senders — the route fires both non-blocking and swallows errors,
// but we want to assert who gets mailed on which path.
const sendWaitlistAdminAlertSpy = vi.fn(async () => true);
const sendWaitlistConfirmationEmailSpy = vi.fn(async () => true);
vi.mock("../mail/email.js", () => ({
  sendWaitlistAdminAlert: (...args: unknown[]) => sendWaitlistAdminAlertSpy(...args),
  sendWaitlistConfirmationEmail: (...args: unknown[]) => sendWaitlistConfirmationEmailSpy(...args),
}));

// In-memory waitlist store.
type StoredWaitlist = {
  id: string;
  email: string;
  name?: string | null;
  useCase?: string | null;
  source?: string | null;
  attribution?: string | null;
  status: string;
};
const waitlistByEmail = new Map<string, StoredWaitlist>();
let nextId = 1;

vi.mock("../db.js", () => {
  const prisma = {
    waitlist: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string } }) => {
        if (!where.email) return null;
        return waitlistByEmail.get(where.email) ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            email: string;
            name?: string;
            useCase?: string;
            source?: string;
            attribution?: string;
          };
        }) => {
          const entry: StoredWaitlist = {
            id: `wl-${nextId++}`,
            email: data.email,
            name: data.name ?? null,
            useCase: data.useCase ?? null,
            source: data.source ?? null,
            attribution: data.attribution ?? null,
            status: "PENDING",
          };
          waitlistByEmail.set(data.email, entry);
          return entry;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { email: string };
          data: { name?: string; useCase?: string; source?: string; attribution?: string };
        }) => {
          const existing = waitlistByEmail.get(where.email);
          if (!existing) throw new Error("Not found");
          // Match Prisma: an `undefined` field means "leave this column
          // alone", not "write NULL". A naive spread would silently clear
          // fields the route deliberately declined to touch.
          const patch = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined),
          );
          const updated = { ...existing, ...patch };
          waitlistByEmail.set(where.email, updated);
          return updated;
        },
      ),
    },
  };
  return { prisma, db: prisma };
});

async function buildApp() {
  const { waitlistRoutes } = await import("../routes/waitlist.js");
  const app = Fastify();
  await app.register(waitlistRoutes, { prefix: "/api/waitlist" });
  return app;
}

/** Let fire-and-forget promises (and their .catch handlers) settle. */
async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  waitlistByEmail.clear();
  nextId = 1;
  sendWaitlistAdminAlertSpy.mockClear();
  sendWaitlistAdminAlertSpy.mockResolvedValue(true);
  sendWaitlistConfirmationEmailSpy.mockClear();
  sendWaitlistConfirmationEmailSpy.mockResolvedValue(true);
});

describe("POST /api/waitlist", () => {
  it("sends a confirmation email to the applicant on a new signup", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "New.Applicant@Example.com", name: "Yong" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, alreadyOnList: false });
    expect(sendWaitlistConfirmationEmailSpy).toHaveBeenCalledTimes(1);
    expect(sendWaitlistConfirmationEmailSpy).toHaveBeenCalledWith(
      "new.applicant@example.com",
      "Yong",
    );
  });

  it("sends the admin alert alongside the applicant confirmation", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "both@example.com" },
    });

    expect(sendWaitlistAdminAlertSpy).toHaveBeenCalledTimes(1);
    expect(sendWaitlistConfirmationEmailSpy).toHaveBeenCalledTimes(1);
  });

  it("does not re-send the confirmation on a duplicate signup", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "dupe@example.com" },
    });
    sendWaitlistAdminAlertSpy.mockClear();
    sendWaitlistConfirmationEmailSpy.mockClear();

    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "dupe@example.com", useCase: "still interested" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, alreadyOnList: true });
    // Admin still sees the follow-up interest; the applicant is not spammed.
    expect(sendWaitlistAdminAlertSpy).toHaveBeenCalledTimes(1);
    expect(sendWaitlistConfirmationEmailSpy).not.toHaveBeenCalled();
  });

  it("still returns success when the confirmation email fails", async () => {
    sendWaitlistConfirmationEmailSpy.mockRejectedValue(new Error("smtp down"));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "unlucky@example.com" },
    });
    await flushAsync();

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, alreadyOnList: false });
    expect(waitlistByEmail.has("unlucky@example.com")).toBe(true);
  });

  it("confirmation failure does not block the admin alert (and vice versa)", async () => {
    sendWaitlistConfirmationEmailSpy.mockRejectedValue(new Error("smtp down"));
    sendWaitlistAdminAlertSpy.mockRejectedValue(new Error("also down"));
    const app = await buildApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "parallel@example.com" },
    });
    await flushAsync();

    expect(res.statusCode).toBe(200);
    expect(sendWaitlistAdminAlertSpy).toHaveBeenCalledTimes(1);
    expect(sendWaitlistConfirmationEmailSpy).toHaveBeenCalledTimes(1);
  });
});

// Attribution: the only place a stranger tells us where they came from.
// GitHub restricted the stargazers API on 2026-06-30, so third-party referral
// reconstruction is gone — if we don't capture it here, it is unrecoverable.
describe("POST /api/waitlist — automatic inflow attribution", () => {
  it("persists the funnel-captured attribution on a new signup", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: {
        email: "attr@example.com",
        attribution: "utm_source=hn utm_campaign=show ref=news.ycombinator.com lp=/",
      },
    });
    expect(res.statusCode).toBe(200);
    expect(waitlistByEmail.get("attr@example.com")?.attribution).toBe(
      "utm_source=hn utm_campaign=show ref=news.ycombinator.com lp=/",
    );
  });

  it("attribution is first-touch: a resubmission never overwrites it", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "ft@example.com", attribution: "utm_source=hn" },
    });
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "ft@example.com", attribution: "utm_source=x" },
    });
    expect(waitlistByEmail.get("ft@example.com")?.attribution).toBe("utm_source=hn");
  });

  it("truncates an over-long attribution instead of rejecting the signup", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "attr-long@example.com", attribution: "u".repeat(600) },
    });
    expect(res.statusCode).toBe(200);
    expect(waitlistByEmail.get("attr-long@example.com")?.attribution).toHaveLength(300);
  });
});

describe("POST /api/waitlist — source attribution", () => {
  it("persists the reported source on a new signup", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "from-hn@example.com", source: "Hacker News" },
    });

    expect(res.statusCode).toBe(200);
    expect(waitlistByEmail.get("from-hn@example.com")?.source).toBe("Hacker News");
  });

  it("stores no source when the field is omitted", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "quiet@example.com" },
    });

    expect(waitlistByEmail.get("quiet@example.com")?.source ?? null).toBeNull();
  });

  it("truncates an over-long source instead of rejecting the signup", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "verbose@example.com", source: "x".repeat(200) },
    });

    // A chatty answer must never cost us the signup.
    expect(res.statusCode).toBe(200);
    expect(waitlistByEmail.get("verbose@example.com")?.source).toHaveLength(80);
  });

  it("never splits a surrogate pair at the truncation boundary", async () => {
    const app = await buildApp();
    // 79 ASCII chars + one emoji (2 UTF-16 code units): a code-unit slice(0, 80)
    // would cut the pair in half and store a lone surrogate — invalid UTF-8 at
    // the Postgres boundary, failing the exact signup we promised never to lose.
    const source = `${"x".repeat(79)}😀`;
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "emoji@example.com", source },
    });

    expect(res.statusCode).toBe(200);
    const stored = waitlistByEmail.get("emoji@example.com")?.source ?? "";
    expect(stored).toBe(source); // 80 code points — kept whole
    expect(stored.endsWith("😀")).toBe(true); // .at(-1) would return a half-pair by design
    // No lone surrogates anywhere in what we store.
    expect(stored.isWellFormed()).toBe(true);
  });

  it("accepts a source far beyond any schema cap and still just truncates", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "essay@example.com", source: "y".repeat(5000) },
    });

    // The signup must survive ANY answer length — schema-level rejection of a
    // long source would contradict the truncate-not-reject contract.
    expect(res.statusCode).toBe(200);
    expect(waitlistByEmail.get("essay@example.com")?.source).toHaveLength(80);
  });

  it("forwards the source to the admin alert", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "attributed@example.com", source: "selfh.st newsletter" },
    });

    expect(sendWaitlistAdminAlertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ source: "selfh.st newsletter" }),
    );
  });

  it("treats a blank source as absent", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "blank@example.com", source: "   " },
    });

    expect(waitlistByEmail.get("blank@example.com")?.source ?? null).toBeNull();
  });

  it("keeps the original source when a resubmission omits it", async () => {
    const app = await buildApp();
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "repeat@example.com", source: "Reddit" },
    });
    await app.inject({
      method: "POST",
      url: "/api/waitlist",
      payload: { email: "repeat@example.com", useCase: "still keen" },
    });

    // First touch is the one worth attributing — don't let a later blank erase it.
    expect(waitlistByEmail.get("repeat@example.com")?.source).toBe("Reddit");
  });
});
