import { definePlugin } from '@api-workbench/plugin-sdk';

export default definePlugin({
  activate(ctx) {
    ctx.registerAuthProvider('header-token', {
      async apply({ config }) {
        const header = String(config['header'] ?? 'X-Api-Token');
        const value = `${String(config['prefix'] ?? '')}${String(config['token'] ?? '')}`;
        return { headers: { [header]: value }, query: {}, cookies: {} };
      },
    });
  },
});
