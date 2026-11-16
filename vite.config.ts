import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works under https://<user>.github.io/HackCode/.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
