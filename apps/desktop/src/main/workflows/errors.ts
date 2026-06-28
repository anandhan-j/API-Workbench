/** Raised when a workflow graph is structurally invalid or unrunnable. */
export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}
