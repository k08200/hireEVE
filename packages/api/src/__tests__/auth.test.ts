import { describe, expect, it } from "vitest";
import { comparePassword, hashPassword, signToken, verifyToken } from "../auth.js";

describe("signToken / verifyToken", () => {
  it("round-trips a payload through sign/verify", () => {
    const token = signToken({ userId: "u-1", email: "a@b.com" });
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe("u-1");
    expect(decoded.email).toBe("a@b.com");
  });

  it("rejects a tampered token", () => {
    const token = signToken({ userId: "u-1", email: "a@b.com" });
    const parts = token.split(".");
    const badSig = `${"A".repeat(parts[2].length)}`;
    const tampered = `${parts[0]}.${parts[1]}.${badSig}`;
    expect(() => verifyToken(tampered)).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => verifyToken("not-a-jwt")).toThrow();
  });
});

describe("hashPassword / comparePassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("hunter2");
    expect(hash).not.toBe("hunter2");
    expect(await comparePassword("hunter2", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("hunter2");
    expect(await comparePassword("hunter3", hash)).toBe(false);
  });

  it("uses a random salt — the same input hashes to different values", async () => {
    const a = await hashPassword("hunter2");
    const b = await hashPassword("hunter2");
    expect(a).not.toBe(b);
  });
});
