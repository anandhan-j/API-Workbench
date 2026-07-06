import { definePlugin } from '@api-workbench/plugin-sdk';

/**
 * Approval Gate node — demonstrates plugin-requested dialogs (the `ui:dialog`
 * capability). The executor calls `ctx.ui.showDialog` with a declarative form;
 * the HOST renders the modal (always naming this plugin) and returns the
 * submitted values. Plugin code never draws UI itself (ADR-0010).
 *
 * Headless runs have no window: showDialog resolves cancelled, so the gate
 * fails closed rather than silently approving.
 */

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('approval-gate', {
      async execute({ config }) {
        if (!ctx.ui) {
          throw new Error('Approval Gate requires the ui:dialog capability.');
        }

        const question = String(config['question'] ?? 'Approve this run?');
        const { cancelled, values } = await ctx.ui.showDialog({
          title: 'Approval required',
          message: question,
          okLabel: 'Submit',
          form: {
            fields: [
              {
                kind: 'select',
                key: 'decision',
                label: 'Decision',
                options: [
                  { value: 'approve', label: 'Approve' },
                  { value: 'reject', label: 'Reject' },
                ],
                default: 'approve',
              },
              {
                kind: 'string',
                key: 'comment',
                label: 'Comment',
                placeholder: 'Optional note for the run log',
              },
            ],
          },
        });

        if (cancelled) throw new Error('Approval dialog was cancelled.');
        if (values['decision'] !== 'approve') {
          throw new Error(`Run rejected${values['comment'] ? `: ${String(values['comment'])}` : ''}`);
        }

        const variable = String(config['variable'] ?? '').trim();
        const comment = String(values['comment'] ?? '');
        return {
          variables: variable ? { [variable]: comment } : {},
          message: `Approved${comment ? `: ${comment}` : ''}`,
        };
      },
    });
  },
});
