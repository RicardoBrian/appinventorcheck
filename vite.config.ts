import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 상대 경로로 빌드 → GitHub Pages 하위 경로, Firebase Hosting 어디에 올려도 동작
  base: './',
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
