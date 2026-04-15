/**
 * Counting semaphore for limiting concurrent async operations.
 *
 * Used by tool batch execution to cap parallel tool calls,
 * preventing resource exhaustion when multiple tools run at once.
 */

export class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  /** Run an async function with semaphore-controlled concurrency */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** Run multiple async functions with bounded concurrency, returns results in order */
  async all<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(fns.map((fn) => this.run(fn)));
  }
}
