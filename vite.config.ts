import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 개발용 원본 HTML 은 app/index.html (개발 서버 주소: http://localhost:5173/app/).
// 빌드하면 JS·CSS·예제가 모두 들어간 HTML 한 파일(dist/app/index.html)이 생기고,
// 그것을 저장소 맨 위 index.html 과 aia-checker.html 로 복사한다 (package.json 의 build).
// → 빌드 없이 저장소를 그대로 배포하거나 더블클릭으로 열어도 동작한다.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { open: '/app/' },
  build: { outDir: 'dist', rollupOptions: { input: 'app/index.html' }, chunkSizeWarningLimit: 3000 },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
});
