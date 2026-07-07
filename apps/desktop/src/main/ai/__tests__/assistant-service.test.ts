// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { AiChatEvent, AiDataChangedEvent } from '@shared/ai';
import { PersistenceService } from '../../persistence/persistence-service';
import { createSqlJsConnection } from '../../persistence/__tests__/sqljs-connection';
import { NodeEncryptor } from '../../variables/node-encryptor';
import { CollectionExplorer } from '../../collections';
import { VariableService } from '../../variables';
import { AiProviderStore } from '../ai-provider-store';
import { AssistantService, type AssistantSnapshot } from '../assistant-service';
import type {
  AiProvider,
  AssistantTurn,
  NeutralMessage,
  StreamCallbacks,
  StreamTurnParams,
} from '../providers';
import type { WorkflowService } from '../../workflows';

/**
 * A scripted provider: each call to streamTurn dequeues the next prepared turn,
 * streaming any text through the callback. Lets the agent loop be exercised
 * end-to-end with no network.
 */
class ScriptedProvider implements AiProvider {
  constructor(private readonly turns: AssistantTurn[]) {}
  seenToolResults = false;
  /** The neutral history handed to the most recent streamTurn call. */
  lastMessages: NeutralMessage[] = [];

  async streamTurn(params: StreamTurnParams, cb: StreamCallbacks): Promise<AssistantTurn> {
    this.lastMessages = params.messages;
    if (params.messages.some((m) => m.role === 'tool')) this.seenToolResults = true;
    const turn = this.turns.shift();
    if (!turn) throw new Error('ScriptedProvider ran out of turns');
    for (const block of turn.blocks) {
      if (block.kind === 'text' && block.text) cb.onTextDelta(block.text);
    }
    return turn;
  }

  async verify(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async listModels(): Promise<{ ok: boolean; models: Array<{ id: string }> }> {
    return { ok: true, models: [] };
  }
}

const usage = { inputTokens: 1, outputTokens: 1 };

interface Harness {
  service: AssistantService;
  events: AiChatEvent[];
  dataChanges: AiDataChangedEvent[];
  providerId: string;
  provider: ScriptedProvider;
  persistence: PersistenceService;
  collections: CollectionExplorer;
  /** A seeded collection id, and the active project, for write-tool tests. */
  collectionId: string;
  projectId: string;
}

async function harness(turns: AssistantTurn[], snapshot?: AssistantSnapshot): Promise<Harness> {
  const connection = await createSqlJsConnection();
  const persistence = new PersistenceService(connection, { backupDir: '/tmp/awb-test-assistant' });
  const providers = new AiProviderStore(persistence, new NodeEncryptor());
  const provider = new ScriptedProvider(turns);
  const events: AiChatEvent[] = [];
  const dataChanges: AiDataChangedEvent[] = [];

  // Seed a workspace → project → collection so write tools have somewhere to act.
  const workspace = persistence.workspaces.create({ name: 'W', settings: {} });
  const project = persistence.projects.create({ workspaceId: workspace.id, name: 'P' });
  const collection = persistence.collections.create({ projectId: project.id, name: 'C' });

  const collections = new CollectionExplorer(persistence);
  const toolDeps = {
    collections,
    variables: new VariableService(persistence, new NodeEncryptor()),
    workflows: { list: () => [], get: () => undefined } as unknown as WorkflowService,
    activeSelection: () => ({ workspaceId: workspace.id, projectId: project.id }),
  };

  const service = new AssistantService(
    persistence,
    providers,
    toolDeps,
    (event) => events.push(event),
    () => provider,
    snapshot,
    (event) => dataChanges.push(event),
  );

  const saved = providers.save({
    kind: 'anthropic',
    label: 'Claude',
    defaultModel: 'claude-opus-4-8',
    apiKey: 'sk-test',
  });
  return {
    service,
    events,
    dataChanges,
    providerId: saved.id,
    provider,
    persistence,
    collections,
    collectionId: collection.id,
    projectId: project.id,
  };
}

/** Polls until a predicate over the event log holds (or times out). */
async function waitFor(events: AiChatEvent[], pred: (events: AiChatEvent[]) => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (pred(events)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('waitFor timed out');
}

/** How many requests live in a collection's tree (for asserting writes landed). */
function requestCount(collections: CollectionExplorer, collectionId: string): number {
  return collections.getTree(collectionId).filter((node) => node.type === 'request').length;
}

/** Waits for the background loop to emit a terminal event. */
async function waitForTerminal(events: AiChatEvent[]): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (events.some((e) => e.type === 'done' || e.type === 'error')) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('AssistantService', () => {
  it('runs a tool then streams a final answer, persisting the transcript', async () => {
    const { service, events, providerId, provider } = await harness([
      {
        blocks: [{ kind: 'tool_use', toolUse: { id: 'call-1', name: 'get_active_context', input: {} } }],
        usage,
        stopReason: 'tool_use',
      },
      { blocks: [{ kind: 'text', text: 'Your active project is p1.' }], usage, stopReason: 'end' },
    ]);

    const { conversationId, userMessage } = await service.send({ providerId, content: 'What project am I in?' });
    expect(userMessage.content).toBe('What project am I in?');
    await waitForTerminal(events);

    const types = events.map((e) => e.type);
    expect(types).toContain('start');
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
    expect(types).toContain('delta');
    expect(types).toContain('done');

    // The tool result was fed back into the second turn.
    expect(provider.seenToolResults).toBe(true);

    const toolResult = events.find((e) => e.type === 'tool-result');
    expect(toolResult).toMatchObject({ ok: true });

    // The final assistant text is persisted alongside the user turn.
    const detail = service.getConversation(conversationId);
    expect(detail.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(detail.messages[1]?.content).toBe('Your active project is p1.');
  });

  it('threads the prior turn as context when continuing a conversation', async () => {
    const { service, events, providerId, provider } = await harness([
      { blocks: [{ kind: 'text', text: 'First reply.' }], usage, stopReason: 'end' },
      { blocks: [{ kind: 'text', text: 'Second reply.' }], usage, stopReason: 'end' },
    ]);

    const first = await service.send({ providerId, content: 'Hello' });
    await waitForTerminal(events);

    // Second turn reuses the same conversation id.
    events.length = 0;
    await service.send({ providerId, conversationId: first.conversationId, content: 'Follow up' });
    await waitForTerminal(events);

    // The provider saw the full history on the second turn: the first exchange plus the new message.
    const roles = provider.lastMessages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    const texts = provider.lastMessages.map((m) => {
      if (m.role === 'assistant') return m.blocks.map((b) => b.text ?? '').join('');
      if (m.role === 'user') return m.text;
      return '';
    });
    expect(texts).toEqual(['Hello', 'First reply.', 'Follow up']);

    // And the transcript now holds both exchanges.
    const detail = service.getConversation(first.conversationId);
    expect(detail.messages.map((m) => m.content)).toEqual([
      'Hello',
      'First reply.',
      'Follow up',
      'Second reply.',
    ]);
  });

  it('surfaces a provider error as an error event without persisting a reply', async () => {
    const { service, events, providerId } = await harness([
      { blocks: [], usage, stopReason: 'error', errorMessage: 'API 401: bad key' },
    ]);

    const { conversationId } = await service.send({ providerId, content: 'hi' });
    await waitForTerminal(events);

    const error = events.find((e) => e.type === 'error');
    expect(error).toMatchObject({ message: 'API 401: bad key' });
    expect(events.some((e) => e.type === 'done')).toBe(false);

    // Only the user turn is stored; no assistant reply on error.
    const detail = service.getConversation(conversationId);
    expect(detail.messages.map((m) => m.role)).toEqual(['user']);
  });

  it('rejects sending when the provider has no key', async () => {
    const connection = await createSqlJsConnection();
    const persistence = new PersistenceService(connection, { backupDir: '/tmp/awb-test-assistant2' });
    const providers = new AiProviderStore(persistence, new NodeEncryptor());
    const service = new AssistantService(
      persistence,
      providers,
      {
        collections: new CollectionExplorer(persistence),
        variables: new VariableService(persistence, new NodeEncryptor()),
        workflows: { list: () => [], get: () => undefined } as unknown as WorkflowService,
        activeSelection: () => ({ workspaceId: null, projectId: null }),
      },
      vi.fn(),
      () => new ScriptedProvider([]),
    );
    const keyless = providers.save({ kind: 'anthropic', label: 'Claude', defaultModel: 'claude-opus-4-8' });

    await expect(service.send({ providerId: keyless.id, content: 'hi' })).rejects.toThrow(/no API key/i);
  });

  it('gates a write tool behind confirmation, snapshots, then executes on approve', async () => {
    const snapshot = vi.fn();
    const h = await harness(
      [
        {
          blocks: [
            {
              kind: 'tool_use',
              toolUse: {
                id: 'call-1',
                name: 'create_request',
                input: {
                  collectionId: '__CID__',
                  name: 'Ping',
                  method: 'GET',
                  url: 'https://example.com/ping',
                },
              },
            },
          ],
          usage,
          stopReason: 'tool_use',
        },
        { blocks: [{ kind: 'text', text: 'Created the request.' }], usage, stopReason: 'end' },
      ],
      snapshot,
    );
    // Patch the collection id into the scripted tool input now that it's known.
    (h.provider as unknown as { turns: AssistantTurn[] }).turns[0].blocks[0].toolUse!.input.collectionId =
      h.collectionId;

    const { conversationId } = await h.service.send({ providerId: h.providerId, content: 'add a ping request' });

    // The write pauses for confirmation and nothing is created yet.
    await waitFor(h.events, (e) => e.some((ev) => ev.type === 'tool-confirm'));
    expect(requestCount(h.collections, h.collectionId)).toBe(0);
    expect(snapshot).not.toHaveBeenCalled();

    h.service.confirmTool(conversationId, 'call-1', 'approve');
    await waitForTerminal(h.events);

    // Snapshot happened before the write, and the request now exists.
    expect(snapshot).toHaveBeenCalledWith(h.collectionId, 'Before AI edit');
    expect(requestCount(h.collections, h.collectionId)).toBe(1);
    expect(h.events.find((e) => e.type === 'tool-result')).toMatchObject({ ok: true });

    // The renderer is told to refetch the collections views.
    expect(h.dataChanges).toContainEqual({ kinds: ['collections'] });
  });

  it('does not execute a denied write', async () => {
    const h = await harness([
      {
        blocks: [
          {
            kind: 'tool_use',
            toolUse: {
              id: 'call-1',
              name: 'create_folder',
              input: { collectionId: '__CID__', name: 'Should not exist' },
            },
          },
        ],
        usage,
        stopReason: 'tool_use',
      },
      { blocks: [{ kind: 'text', text: 'Okay, leaving it as is.' }], usage, stopReason: 'end' },
    ]);
    (h.provider as unknown as { turns: AssistantTurn[] }).turns[0].blocks[0].toolUse!.input.collectionId =
      h.collectionId;

    const { conversationId } = await h.service.send({ providerId: h.providerId, content: 'make a folder' });
    await waitFor(h.events, (e) => e.some((ev) => ev.type === 'tool-confirm'));
    h.service.confirmTool(conversationId, 'call-1', 'deny');
    await waitForTerminal(h.events);

    expect(h.persistence.folders.listByCollection(h.collectionId)).toHaveLength(0);
    expect(h.events.find((e) => e.type === 'tool-result')).toMatchObject({ ok: false });
    // The model still gets to finish its turn after the denial.
    expect(h.events.some((e) => e.type === 'done')).toBe(true);
    // A denied write makes no change, so no refresh is requested.
    expect(h.dataChanges).toHaveLength(0);
  });

  it('auto-approves later writes after "approve for this chat"', async () => {
    const h = await harness([
      {
        blocks: [
          {
            kind: 'tool_use',
            toolUse: { id: 'call-1', name: 'create_folder', input: { collectionId: '__CID__', name: 'One' } },
          },
        ],
        usage,
        stopReason: 'tool_use',
      },
      {
        blocks: [
          {
            kind: 'tool_use',
            toolUse: { id: 'call-2', name: 'create_folder', input: { collectionId: '__CID__', name: 'Two' } },
          },
        ],
        usage,
        stopReason: 'tool_use',
      },
      { blocks: [{ kind: 'text', text: 'Both folders created.' }], usage, stopReason: 'end' },
    ]);
    const turns = (h.provider as unknown as { turns: AssistantTurn[] }).turns;
    turns[0].blocks[0].toolUse!.input.collectionId = h.collectionId;
    turns[1].blocks[0].toolUse!.input.collectionId = h.collectionId;

    const { conversationId } = await h.service.send({ providerId: h.providerId, content: 'make two folders' });
    await waitFor(h.events, (e) => e.some((ev) => ev.type === 'tool-confirm'));
    h.service.confirmTool(conversationId, 'call-1', 'approve-always');
    await waitForTerminal(h.events);

    // Only the first write asked for confirmation; the second ran automatically.
    expect(h.events.filter((e) => e.type === 'tool-confirm')).toHaveLength(1);
    expect(h.persistence.folders.listByCollection(h.collectionId)).toHaveLength(2);
  });
});
