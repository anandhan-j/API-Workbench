import { definePlugin } from '@api-workbench/plugin-sdk';

const HEADER = 'name,method,url';

export default definePlugin({
  activate(ctx) {
    ctx.registerImporter('csv', {
      detect: (content) => content.trimStart().toLowerCase().startsWith(HEADER),
      async parse({ content }) {
        const lines = content.trim().split(/\r?\n/);
        const operations = lines.slice(1).map((line, index) => {
          const [name, method, url, folder] = line.split(',').map((cell) => cell.trim());
          if (!url) throw new Error(`Row ${index + 2}: missing url`);
          let path: string;
          try {
            path = new URL(url).pathname;
          } catch {
            throw new Error(`Row ${index + 2}: invalid url "${url}"`);
          }
          return {
            name: name || url,
            method: (method || 'GET').toUpperCase(),
            url,
            path,
            tag: folder || null,
          };
        });
        if (operations.length === 0) throw new Error('The CSV contains no endpoint rows');
        return { title: 'CSV import', version: '1.0', baseUrl: '', operations };
      },
    });
  },
});
