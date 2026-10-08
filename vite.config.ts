import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  // JS·CSS·예제 파일을 모두 HTML 한 파일 안에 넣는다.
  // → dist/index.html 을 더블클릭(file://)해도 동작하고, 어느 웹 호스팅에 올려도 그대로 동작한다.
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 3000 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
