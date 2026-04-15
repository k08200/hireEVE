import { describe, expect, it } from "vitest";
import { Semaphore } from "../semaphore.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Semaphore", () => {
  it("allows up to maxConcurrency tasks to run at once", async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = () =>
      sem.run(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await delay(50);
        running--;
      });

    await Promise.all([task(), task(), task(), task()]);

    expect(maxRunning).toBe(2);
  });

  it("returns results in order from all()", async () => {
    const sem = new Semaphore(3);

    const results = await sem.all([
      async () => {
        await delay(30);
        return "a";
      },
      async () => {
        await delay(10);
        return "b";
      },
      async () => "c",
    ]);

    expect(results).toEqual(["a", "b", "c"]);
  });

  it("handles single task without semaphore overhead", async () => {
    const sem = new Semaphore(1);
    const result = await sem.run(async () => 42);
    expect(result).toBe(42);
  });

  it("propagates errors without deadlocking", async () => {
    const sem = new Semaphore(2);

    const results = await Promise.allSettled([
      sem.run(async () => "ok"),
      sem.run(async () => {
        throw new Error("fail");
      }),
      sem.run(async () => "also ok"),
    ]);

    expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
    expect(results[1]).toMatchObject({ status: "rejected" });
    expect(results[2]).toEqual({ status: "fulfilled", value: "also ok" });
  });

  it("handles empty all() gracefully", async () => {
    const sem = new Semaphore(3);
    const results = await sem.all([]);
    expect(results).toEqual([]);
  });

  it("respects concurrency=1 as sequential execution", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    await sem.all([
      async () => {
        order.push(1);
        await delay(20);
      },
      async () => {
        order.push(2);
        await delay(10);
      },
      async () => {
        order.push(3);
      },
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});
