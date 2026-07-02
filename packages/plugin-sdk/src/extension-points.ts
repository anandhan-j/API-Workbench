/**
 * The behavioral contracts a plugin registers during `activate()` — one
 * implementation per contribution declared in the manifest. All plugin code
 * runs in the host's isolated plugin process; inputs arrive validated against
 * the contribution's declared form schema, and returned values are validated
 * by the host before use (ADR-0007).
 */

/** The result chip a request produces ('200 OK', 'DELIVERED', 'ERROR'). */
export interface ProtocolSummary {
  label: string;
  tone: 'success' | 'error' | 'info';
  /** Machine-readable code; what status-based extraction and tests read. */
  code?: string;
}

/** What a request-type provider returns; rendered by the generic response viewer. */
export interface ProtocolResult {
  ok: boolean;
  summary: ProtocolSummary;
  /** Header-like display map (shown as the response's metadata table). */
  metadata?: Record<string, string>;
  /** Text body, or base64 when `bodyKind` is 'binary'. */
  body: string;
  bodyKind?: 'json' | 'xml' | 'html' | 'text' | 'binary' | 'empty';
  contentType?: string;
  /** Set when the request failed before producing a response. */
  error?: string;
  /** Type-specific extras, carried through to scripts/extraction untouched. */
  protocol?: unknown;
}

/** Auth artifacts applied to a request. Providers with no concept of one of
 *  these maps may return it empty; request-type providers MUST apply `headers`
 *  wherever their protocol has a header/metadata concept. */
export interface AuthArtifacts {
  headers: Record<string, string>;
  query: Record<string, string>;
  cookies: Record<string, string>;
}

/** What auth signing sees. Non-HTTP request types may omit `method`/`body`. */
export interface ApplyContext {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface NodeExecuteInput {
  /** Validated values of the node's declared config form. */
  config: Record<string, unknown>;
  /** The run's variable map (read-only snapshot). */
  runtime: Record<string, string>;
  signal: AbortSignal;
}

export interface NodeExecuteResult {
  /** Human-readable outcome shown in the run panel. */
  message?: string;
  /** Variables to merge into the run's runtime map. */
  variables?: Record<string, string>;
  /** Branch handle to route along (branching nodes only). */
  branch?: string;
}

/** A custom workflow node's runtime. */
export interface NodeExecutor {
  execute(input: NodeExecuteInput): Promise<NodeExecuteResult>;
}

export interface RequestExecuteInput {
  /** Validated, variable-substituted values of the declared payload form. */
  payload: Record<string, unknown>;
  /** Artifacts produced by the request's auth config, if any. */
  artifacts?: AuthArtifacts;
  options: { timeoutMs: number };
  signal: AbortSignal;
}

/** A custom request type's runtime. */
export interface RequestTypeProvider {
  execute(input: RequestExecuteInput): Promise<ProtocolResult>;
}

export interface AuthApplyInput {
  /** Validated, variable-substituted values of the declared config form. */
  config: Record<string, unknown>;
  ctx: ApplyContext;
}

/** A custom auth provider's runtime. */
export interface AuthProvider {
  apply(input: AuthApplyInput): Promise<AuthArtifacts>;
}

/** One request operation produced by an importer. */
export interface ImportedOperation {
  /** Display badge (HTTP method for http requests, e.g. "GET"). */
  method: string;
  /** Path shown in the tree, e.g. "/users/{id}". */
  path: string;
  /** Full request target. */
  url: string;
  name: string;
  /** Folder grouping; null for the collection root. */
  tag: string | null;
}

/** What an importer produces; the host generates the collection from it. */
export interface ImportedCollection {
  title: string;
  version: string;
  baseUrl: string;
  operations: ImportedOperation[];
}

export interface ImporterParseInput {
  content: string;
  /** File name when the source was a file, for extension-based decisions. */
  sourceName?: string;
  signal: AbortSignal;
}

/** A custom importer's runtime. */
export interface Importer {
  /** Cheap sniff: whether this importer recognises the content. Must not throw. */
  detect(content: string): boolean;
  parse(input: ImporterParseInput): Promise<ImportedCollection>;
}
