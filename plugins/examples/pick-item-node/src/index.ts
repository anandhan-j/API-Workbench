import { definePlugin } from '@api-workbench/plugin-sdk';

/**
 * Pick From List node — demonstrates the `list` form field (growable string
 * items) combined with a `select` field (the selection strategy). The host has
 * already validated the config against the manifest's schema and substituted
 * `{{variables}}` inside every list item before this executor runs.
 */

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('pick-item', {
      async execute({ config }) {
        const items = Array.isArray(config['items'])
          ? config['items'].filter((i): i is string => typeof i === 'string')
          : [];
        if (items.length === 0) {
          throw new Error('Pick From List: the Items list is empty.');
        }

        const strategy = String(config['strategy'] ?? 'first');
        let picked: string;
        switch (strategy) {
          case 'last':
            picked = items[items.length - 1]!;
            break;
          case 'random':
            picked = items[Math.floor(Math.random() * items.length)]!;
            break;
          case 'index': {
            const index = Number(config['index'] ?? 0);
            if (!Number.isInteger(index) || index < 0 || index >= items.length) {
              throw new Error(
                `Pick From List: index ${index} is out of range (0–${items.length - 1}).`,
              );
            }
            picked = items[index]!;
            break;
          }
          case 'first':
          default:
            picked = items[0]!;
            break;
        }

        const variable = String(config['variable'] ?? 'pickedItem');
        const variables: Record<string, string> = { [variable]: picked };

        // Optionally expose the full list too, as a JSON array so later steps
        // can consume it (e.g. as a request-body value via {{listVariable}}).
        const listVariable = String(config['listVariable'] ?? '').trim();
        if (listVariable) {
          variables[listVariable] = JSON.stringify(items);
        }

        return {
          variables,
          message: `${variable} = ${picked} (${strategy} of ${items.length} item${items.length === 1 ? '' : 's'})`,
        };
      },
    });
  },
});
