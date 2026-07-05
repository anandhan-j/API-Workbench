import { definePlugin } from '@api-workbench/plugin-sdk';

/**
 * An interactive request type (Phase 7). Instead of a one-shot `execute`, it
 * implements `openConnection`: the host opens a live session, the plugin emits
 * frames and lifecycle changes, and each message the user sends is echoed back.
 */
export default definePlugin({
  activate(ctx) {
    ctx.registerRequestType('chat', {
      // Kept for hosts that call execute; interactive types are driven by
      // openConnection below.
      async execute() {
        return {
          ok: false,
          summary: { label: 'Use interactive mode', tone: 'error' },
          body: '',
          bodyKind: 'empty',
          error: 'This request type is interactive — connect instead of sending.',
        };
      },
      openConnection({ payload, artifacts, emit, setState }) {
        const room = String(payload['room'] ?? 'general');
        setState('open');
        emit({ direction: 'info', kind: 'open', data: `joined ${room}` });
        emit({ direction: 'received', kind: 'text', data: String(payload['greeting'] ?? 'welcome') });
        // Auth headers, if any, are observable so signing can be verified.
        for (const [name, value] of Object.entries(artifacts?.headers ?? {})) {
          emit({ direction: 'info', kind: 'auth', data: `${name}: ${value}` });
        }
        return {
          send(data: string) {
            emit({ direction: 'received', kind: 'text', data: `echo:${data}` });
          },
          close() {
            setState('closed', { code: 1000, reason: 'client closed' });
          },
        };
      },
    });
  },
});
