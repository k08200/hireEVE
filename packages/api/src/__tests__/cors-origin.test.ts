import { describe, expect, it } from "vitest";
import { makeCorsOriginCallback } from "../cors-origin.js";

// A denied Origin must be a quiet denial (no CORS headers), never a thrown
// error: @fastify/cors turns a callback error into an HTTP 500, and a DAST
// scanner that stamps a hostile Origin on every request then fills its report
// with server errors (observed live 2026-08-04: GET + OPTIONS with
// `Origin: https://evil.example` → 500). CASA pre-scan hardening.
describe("makeCorsOriginCallback", () => {
  const allowed = ["https://app.klorn.ai"];
  const noDevOrigins = () => false;

  it("allows a listed origin", () => {
    const cb = makeCorsOriginCallback(allowed, noDevOrigins);
    let result: unknown;
    cb("https://app.klorn.ai", (err, allow) => {
      expect(err).toBeNull();
      result = allow;
    });
    expect(result).toBe(true);
  });

  it("allows a request with no origin (curl, mobile, server-to-server)", () => {
    const cb = makeCorsOriginCallback(allowed, noDevOrigins);
    let result: unknown;
    cb(undefined, (err, allow) => {
      expect(err).toBeNull();
      result = allow;
    });
    expect(result).toBe(true);
  });

  it("denies an unlisted origin WITHOUT an error — a 500 here is scanner bait", () => {
    const cb = makeCorsOriginCallback(allowed, noDevOrigins);
    let result: unknown = "not called";
    cb("https://evil.example", (err, allow) => {
      expect(err).toBeNull();
      result = allow;
    });
    expect(result).toBe(false);
  });

  it("consults the dev-origin predicate for unlisted origins", () => {
    const cb = makeCorsOriginCallback(allowed, (o) => o === "http://localhost:3000");
    let result: unknown;
    cb("http://localhost:3000", (err, allow) => {
      expect(err).toBeNull();
      result = allow;
    });
    expect(result).toBe(true);
  });
});
