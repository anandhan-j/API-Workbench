import { definePlugin } from '@api-workbench/plugin-sdk';
import { randomUUID } from 'node:crypto';

export default definePlugin({
  activate(ctx) {
    ctx.registerNodeExecutor('uuid', {
      async execute({ config }) {
        const variable = String(config['variable'] ?? 'uuid');
        const value = config['uppercase'] ? randomUUID().toUpperCase() : randomUUID();
        return { variables: { [variable]: value }, message: `${variable} = ${value}` };
      },
    });
  },
});
