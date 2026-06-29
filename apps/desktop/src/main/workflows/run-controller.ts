/**
 * Controls a single in-flight workflow run: cancellation, pause/resume, and
 * step-by-step execution.
 *
 * The engine checks the controller between nodes (via {@link waitIfPaused}): it
 * aborts on cancel and suspends on pause until resumed. Step mode runs the first
 * node, then suspends before each subsequent node until {@link step} is called —
 * a "step budget" of pending nodes the engine may run. Pause/resume/step are
 * in-memory only; a cancelled run also releases any wait so it can unwind.
 */
export class RunController {
  private readonly abort = new AbortController();
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private stepping = false;
  /** In step mode, how many more nodes the engine may run before suspending. */
  private budget = 0;

  /** Passed to the execution engine / transport for cooperative cancellation. */
  get signal(): AbortSignal {
    return this.abort.signal;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isStepping(): boolean {
    return this.stepping;
  }

  get isCancelled(): boolean {
    return this.abort.signal.aborted;
  }

  pause(): void {
    if (!this.isCancelled) this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.stepping = false; // resume = run the rest to completion
    this.budget = 0;
    this.releaseAll();
  }

  /**
   * Begin step-by-step execution: the run executes the first node (the start
   * node), then suspends before each subsequent node until {@link step}.
   */
  startStepping(): void {
    if (this.isCancelled) return;
    this.stepping = true;
    this.budget = 1; // let the first node run
  }

  cancel(): void {
    this.abort.abort();
    this.resume(); // unblock any wait so the run can finish unwinding
  }

  /** Advances a stepping run by exactly one node. */
  step(): void {
    if (this.isCancelled) return;
    this.stepping = true;
    const next = this.resumeWaiters.shift();
    if (next) next();
    else this.budget += 1; // no checkpoint waiting yet — grant the next one
  }

  /**
   * Resolves immediately unless the run must suspend: explicitly paused, or in
   * step mode with no remaining budget. Otherwise resolves on the next
   * resume/step (or cancel).
   */
  waitIfPaused(): Promise<void> {
    if (this.isCancelled) return Promise.resolve();
    if (this.paused) return new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    if (this.stepping) {
      if (this.budget > 0) {
        this.budget -= 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => this.resumeWaiters.push(resolve));
    }
    return Promise.resolve();
  }

  private releaseAll(): void {
    const waiters = this.resumeWaiters;
    this.resumeWaiters = [];
    for (const w of waiters) w();
  }
}
