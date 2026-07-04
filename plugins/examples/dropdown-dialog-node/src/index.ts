import { definePlugin } from '@api-workbench/plugin-sdk';

/**
 * Dropdown Picker node — an extensibility exercise built ONLY on the public
 * SDK surface (no host or SDK changes):
 *
 * 1. The node's config declares a `keyvalue` grid (label → value pairs) and an
 *    optional `list` field (plain items) — both variable-substituted by the
 *    host before the executor runs.
 * 2. The executor builds ONE dialog form *dynamically* — a dropdown per
 *    configured source — and shows it via `ctx.ui.showDialog` (`ui:dialog`
 *    capability); the host renders it, no plugin code runs in the UI.
 * 3. The user's selections are returned as runtime variables for later steps.
 */

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('dropdown-picker', {
      async execute({ config }) {
        if (!ctx.ui) {
          throw new Error('Dropdown Picker requires the ui:dialog capability.');
        }

        const items =
          config['items'] && typeof config['items'] === 'object' && !Array.isArray(config['items'])
            ? (config['items'] as Record<string, string>)
            : {};
        const labels = Object.keys(items);
        if (labels.length === 0) {
          throw new Error('Dropdown Picker: configure at least one item.');
        }
        const listItems = Array.isArray(config['listItems'])
          ? config['listItems'].filter((i): i is string => typeof i === 'string')
          : [];

        // One dialog, one dropdown per configured source: the keyvalue grid
        // (option value = grid key, mapped back to the stored value after
        // submission) and, when present, the plain list (stored as-is).
        const fields = [
          {
            kind: 'select' as const,
            key: 'choice',
            label: 'Item',
            required: true,
            options: labels.map((label) => ({ value: label, label })),
          },
          ...(listItems.length > 0
            ? [
                {
                  kind: 'select' as const,
                  key: 'listChoice',
                  label: 'List item',
                  required: true,
                  options: listItems.map((item) => ({ value: item, label: item })),
                },
              ]
            : []),
        ];
        const { cancelled, values } = await ctx.ui.showDialog({
          title: 'Dropdown Picker',
          message: String(config['prompt'] ?? 'Pick an item to continue'),
          okLabel: 'Select',
          form: { fields },
        });
        if (cancelled) throw new Error('Dropdown Picker: selection was cancelled.');

        const chosenLabel = String(values['choice'] ?? labels[0]);
        const chosenValue = items[chosenLabel] ?? '';

        const variable = String(config['variable'] ?? 'selectedValue');
        const labelVariable = String(config['labelVariable'] ?? '').trim();
        const listVariable = String(config['listVariable'] ?? '').trim();
        const out: Record<string, string> = { [variable]: chosenValue };
        if (labelVariable) out[labelVariable] = chosenLabel;
        if (listItems.length > 0 && listVariable) {
          out[listVariable] = String(values['listChoice'] ?? listItems[0]);
        }

        return {
          variables: out,
          message: `${variable} = ${chosenValue} (picked "${chosenLabel}")`,
        };
      },
    });
  },
});
