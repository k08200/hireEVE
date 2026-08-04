import { beforeEach, describe, expect, it, vi } from "vitest";

interface RawCall {
  strings: string[];
  values: unknown[];
}

const { rawCalls, fakeTx, prismaMock, probe } = vi.hoisted(() => {
  const calls: RawCall[] = [];
  // A fake interactive-transaction client: records $executeRaw tagged-template
  // calls so we can assert the exact set_config issued, and lets us prove the
  // same tx handle is passed through to the callback.
  const tx = {
    $executeRaw: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ strings: [...strings], values });
      return Promise.resolve(1);
    }),
    __brand: "tx" as const,
  };
  // Controls what the role probe sees. `rows` mimics the pg_roles answer.
  const probeState = { rows: [] as { bypasses: boolean }[], throws: false };
  return {
    rawCalls: calls,
    fakeTx: tx,
    probe: probeState,
    prismaMock: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      $queryRaw: vi.fn(async () => {
        if (probeState.throws) throw new Error("probe failed");
        return probeState.rows;
      }),
      __brand: "global" as const,
    },
  };
});

vi.mock("../db.js", () => ({
  prisma: prismaMock,
  INTERACTIVE_TX_OPTIONS: { maxWait: 10_000, timeout: 15_000 },
}));

type TenantModule = typeof import("../db-tenant.js");

/**
 * Fresh module per test: the detected RLS mode is memoized for the process
 * lifetime (it must not cost a round trip per query), so each scenario needs a
 * module instance that has not resolved it yet.
 */
async function load(env: Record<string, string | undefined> = {}): Promise<TenantModule> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("../db-tenant.js");
}

/** The app's own role today: `postgres`, which carries BYPASSRLS. */
function roleBypassesRls(): void {
  probe.rows = [{ bypasses: true }];
  probe.throws = false;
}

/** The role the rollout switches to: `klorn_app`, which RLS constrains. */
function roleConstrainedByRls(): void {
  probe.rows = [{ bypasses: false }];
  probe.throws = false;
}

function lastSetConfig(): RawCall {
  const call = rawCalls.find((c) => c.strings.join("").includes("set_config"));
  if (!call) throw new Error("no set_config call recorded");
  return call;
}

describe("db-tenant", () => {
  beforeEach(() => {
    rawCalls.length = 0;
    prismaMock.$transaction.mockClear();
    prismaMock.$queryRaw.mockClear();
    fakeTx.$executeRaw.mockClear();
    delete process.env.RLS_ENFORCEMENT;
    roleConstrainedByRls();
  });

  describe("when RLS constrains the connected role", () => {
    it("withTenant runs inside one interactive transaction", async () => {
      const { withTenant } = await load();
      await withTenant("user-123", async () => "ok");
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("withTenant and withSystem pass pool-sized $transaction options (#845 P2028 class)", async () => {
      const { withSystem, withTenant } = await load();
      await withTenant("user-123", async () => "ok");
      await withSystem(async () => "ok");
      for (const call of prismaMock.$transaction.mock.calls) {
        const opts = call[1] as { maxWait?: number; timeout?: number } | undefined;
        expect(opts?.maxWait).toBeGreaterThanOrEqual(10_000);
        expect(opts?.timeout).toBeGreaterThanOrEqual(15_000);
      }
    });

    it("withTenant sets app.current_user_id to the userId, transaction-local", async () => {
      const { withTenant } = await load();
      await withTenant("user-123", async () => undefined);
      const call = lastSetConfig();
      // set_config(name, value, is_local) — is_local=true means SET LOCAL so the
      // GUC is scoped to this transaction, never leaking to a pooled connection.
      // Both name and value are function args, so both travel as bound params.
      const sql = call.strings.join("?");
      expect(sql).toContain("set_config");
      expect(sql).toContain("true"); // is_local literal in the template
      expect(call.values).toEqual(["app.current_user_id", "user-123"]);
    });

    it("withTenant passes the same tx handle to the callback (queries must use it)", async () => {
      const { withTenant } = await load();
      let received: unknown;
      await withTenant("u", async (tx) => {
        received = tx;
      });
      expect(received).toBe(fakeTx);
    });

    it("withTenant returns the callback's value", async () => {
      const { withTenant } = await load();
      const out = await withTenant("u", async () => ({ n: 42 }));
      expect(out).toEqual({ n: 42 });
    });

    it("withTenant parameterizes the userId (no string interpolation → injection-safe)", async () => {
      const { withTenant } = await load();
      const evil = '\'; DROP TABLE "User"; --';
      await withTenant(evil, async () => undefined);
      const call = lastSetConfig();
      // The userId travels as a bound value, never spliced into the SQL text.
      expect(call.values).toContain(evil);
      expect(call.strings.join("")).not.toContain("DROP TABLE");
    });

    it("withSystem sets app.bypass_rls=on transaction-local", async () => {
      const { withSystem } = await load();
      await withSystem(async () => undefined);
      const call = lastSetConfig();
      const sql = call.strings.join("?");
      expect(sql).toContain("set_config");
      expect(call.values).toEqual(["app.bypass_rls", "on"]);
    });

    it("withSystem passes the tx handle and returns the callback value", async () => {
      const { withSystem } = await load();
      let received: unknown;
      const out = await withSystem(async (tx) => {
        received = tx;
        return "done";
      });
      expect(received).toBe(fakeTx);
      expect(out).toBe("done");
    });
  });

  describe("when the connected role bypasses RLS (today's production)", () => {
    beforeEach(roleBypassesRls);

    it("withTenant opens no transaction — the GUC no policy reads costs 3 round trips", async () => {
      const { withTenant } = await load();
      await withTenant("user-123", async () => "ok");
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(rawCalls).toHaveLength(0);
    });

    it("withSystem opens no transaction either", async () => {
      const { withSystem } = await load();
      await withSystem(async () => "ok");
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(rawCalls).toHaveLength(0);
    });

    it("hands the callback the global client so routed call sites still run", async () => {
      const { withTenant } = await load();
      let received: unknown;
      const out = await withTenant("u", async (tx) => {
        received = tx;
        return "value";
      });
      expect(received).toBe(prismaMock);
      expect(out).toBe("value");
    });

    it("still opens a transaction when the caller declares it needs atomicity", async () => {
      const { withTenant } = await load();
      await withTenant("user-123", async () => "ok", { atomic: true });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      // The context is bound even then: an atomic block must not become the one
      // unrouted path on the day the role switches.
      expect(lastSetConfig().values).toEqual(["app.current_user_id", "user-123"]);
    });

    it("withSystem honours atomic too", async () => {
      const { withSystem } = await load();
      await withSystem(async () => "ok", { atomic: true });
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(lastSetConfig().values).toEqual(["app.bypass_rls", "on"]);
    });
  });

  describe("mode detection", () => {
    it("probes pg_roles for the role actually connected", async () => {
      const { withTenant } = await load();
      await withTenant("u", async () => undefined);
      const sql = (prismaMock.$queryRaw.mock.calls[0]?.[0] as string[] | undefined)?.join("") ?? "";
      expect(sql).toContain("pg_roles");
      expect(sql).toContain("current_user");
      expect(sql).toContain("rolbypassrls");
      expect(sql).toContain("rolsuper"); // a superuser bypasses RLS as well
    });

    it("probes once and memoizes — detection must not cost a round trip per query", async () => {
      const { withSystem, withTenant } = await load();
      await withTenant("u", async () => undefined);
      await withTenant("u", async () => undefined);
      await withSystem(async () => undefined);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    // The check-then-set in resolveRlsMode never yields, so callers that start
    // before the first probe resolves share its promise. Pin that rather than
    // leave it as reasoning: under load the first callers are always concurrent.
    it("collapses concurrent first callers onto a single probe", async () => {
      const { withSystem, withTenant } = await load();
      await Promise.all([
        withTenant("u", async () => undefined),
        withTenant("u", async () => undefined),
        withSystem(async () => undefined),
      ]);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it("assumes enforcement when the probe fails — slow beats silently unisolated", async () => {
      probe.throws = true;
      const { withTenant } = await load();
      await withTenant("u", async () => undefined);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("assumes enforcement when the role is not found", async () => {
      probe.rows = [];
      const { withTenant } = await load();
      await withTenant("u", async () => undefined);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("a failed probe is not cached — the next call retries", async () => {
      probe.throws = true;
      const { withTenant } = await load();
      await withTenant("u", async () => undefined);
      roleBypassesRls();
      await withTenant("u", async () => undefined);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(2);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1); // only the first
    });

    it("RLS_ENFORCEMENT=on forces the wrapper on without probing", async () => {
      roleBypassesRls();
      const { withTenant } = await load({ RLS_ENFORCEMENT: "on" });
      await withTenant("u", async () => undefined);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });

    it("RLS_ENFORCEMENT=off forces the wrapper off without probing", async () => {
      roleConstrainedByRls();
      const { withTenant } = await load({ RLS_ENFORCEMENT: "off" });
      await withTenant("u", async () => undefined);
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    // An override left set across the role switch denies every row on every
    // table. The probed path logs its conclusion; the override path has to as
    // well, or the one deploy where it matters is the one with a silent log.
    it("announces an override once, not once per query", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        const { withTenant } = await load({ RLS_ENFORCEMENT: "off" });
        await withTenant("u", async () => undefined);
        await withTenant("u", async () => undefined);
        const notices = warn.mock.calls.filter((c) => String(c[0]).includes("RLS_ENFORCEMENT=off"));
        expect(notices).toHaveLength(1);
      } finally {
        warn.mockRestore();
      }
    });

    it("an unrecognised RLS_ENFORCEMENT value falls back to probing, not to off", async () => {
      roleConstrainedByRls();
      const { withTenant } = await load({ RLS_ENFORCEMENT: "yes-please" });
      await withTenant("u", async () => undefined);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
