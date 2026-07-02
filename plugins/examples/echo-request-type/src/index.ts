import { definePlugin } from '@api-workbench/plugin-sdk';

export default definePlugin({
  activate(ctx) {
    ctx.registerRequestType('echo', {
      async execute({ payload, artifacts }) {
        if (payload['fail']) {
          return {
            ok: false,
            summary: { label: 'Echo failed', tone: 'error', code: '1' },
            body: '',
            bodyKind: 'empty',
            error: 'Simulated failure requested by the payload',
          };
        }
        const body = String(payload['message'] ?? '');
        return {
          ok: true,
          summary: { label: 'ECHOED', tone: 'success', code: '0' },
          // Echo any auth headers back so signing is observable end-to-end.
          metadata: { 'x-echo-target': String(payload['target'] ?? ''), ...(artifacts?.headers ?? {}) },
          body,
          bodyKind: 'json',
          contentType: 'application/json',
          protocol: { echoed: true },
        };
      },
    });
  },
});
