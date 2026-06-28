/**
 * Controls a single in-flight workflow run: cancellation, and pause/resume.
 *
 * The engine checks the controller between nodes — it aborts on cancel and
 * suspends on pause (awaiting {@link waitIfPaused}) until resumed. Pause/resume
 * are in-memory only; a cancelled run also releases any pause so it can unwind.
 */
export class RunController {
  private readonly abort = new AbortController();
  private paused = false;
  private resumeWaiters: Array<() => void> = [];

  /** Passed to the execution engine / transport for cooperative cancellation. */
  get signal(): AbortSignal {
    return this.abort.signal;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isCancelled(): boolean {
    return this.abort.signal.aborted;
  }

  pause(): void {
    if (!this.isCancelled) this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }

  cancel(): void {
    this.abort.abort();
    this.resume(); // unblock any pause so the run can finish unwinding
  }

  /** Resolves immediately unless paused, in which case it resolves on resume. */
  waitIfPaused(): Promise<void> {
    if (!this.paused || this.isCancelled) return Promise.resolve();
    return new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
  }
}
