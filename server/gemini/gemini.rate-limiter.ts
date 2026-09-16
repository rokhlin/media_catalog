/**
 * Thread-safe sliding-window rate limiter for Gemini API requests.
 * Mirrors GeminiRateLimiter from media_cataloger/src/utils/gemini.py.
 */
export class GeminiRateLimiter {
  private rpmLimit: number;
  private timestamps: number[] = [];
  private waitQueue: Array<() => void> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(rpmLimit: number = 15) {
    this.rpmLimit = Math.max(1, rpmLimit);
  }

  public setLimit(rpmLimit: number) {
    this.rpmLimit = Math.max(1, rpmLimit);
    this.processQueue();
  }

  public getLimit(): number {
    return this.rpmLimit;
  }

  public getActiveSlots(): number {
    this.purgeExpired();
    return this.timestamps.length;
  }

  private purgeExpired() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < 60000);
  }

  private processQueue() {
    this.purgeExpired();
    while (this.waitQueue.length > 0 && this.timestamps.length < this.rpmLimit) {
      const nextResolve = this.waitQueue.shift();
      if (nextResolve) {
        this.timestamps.push(Date.now());
        nextResolve();
      }
      this.purgeExpired();
    }

    if (this.waitQueue.length > 0 && !this.timer) {
      const oldest = this.timestamps[0] || Date.now();
      const delay = Math.max(50, 60000 - (Date.now() - oldest) + 50);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.processQueue();
      }, delay);
    }
  }

  /**
   * Acquire a slot under the RPM rate limit. Resolves when permitted to proceed.
   */
  public async acquire(): Promise<void> {
    this.purgeExpired();
    if (this.timestamps.length < this.rpmLimit) {
      this.timestamps.push(Date.now());
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
      this.processQueue();
    });
  }

  public reset() {
    this.timestamps = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = [...this.waitQueue];
    this.waitQueue = [];
    pending.forEach(r => r());
  }
}
