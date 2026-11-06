import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@eo/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
    },
  },
});
