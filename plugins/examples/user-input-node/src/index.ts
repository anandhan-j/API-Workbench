import { definePlugin } from '@api-workbench/plugin-sdk';

/**
 * User Input node — pauses the workflow and prompts the user, exactly like the
 * built-in `user-input` field. The prompt itself is declared in the manifest's
 * `input` block, so the host renders the native modal *before* this executor
 * runs and merges the submitted values into `runtime` (and into the node's
 * variables). This executor then runs plugin code over those values — here it
 * optionally trims them and reports what was collected.
 */

const PROMPTED = ['userName', 'userEmail', 'apiToken'] as const;

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('user-input', {
      async execute({ config, runtime }) {
        const trim = config['trim'] !== false;

        // The manifest `input` fields have already been prompted and merged into
        // runtime by the host; post-process them here.
        const variables: Record<string, string> = {};
        for (const key of PROMPTED) {
          const value = runtime[key];
          if (value === undefined) continue;
          variables[key] = trim ? value.trim() : value;
        }

        const name = variables['userName'] || 'anonymous';
        return {
          variables,
          message: `Collected input for ${name}`,
        };
      },
    });
  },
});
