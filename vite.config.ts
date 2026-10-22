import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 페이지 두 개를 각각 HTML 한 파일로 빌드한다 (JS·CSS·예제가 모두 안에 들어감).
//   학생용  app/student/index.html  →  vite build --mode student
//   교사용  app/index.html          →  vite build --mode teacher
// 개발 서버: http://localhost:5173/app/ (교사용), http://localhost:5173/app/student/ (학생용)
// 빌드 결과를 배포 위치로 옮기는 것은 scripts/copy-build.mjs.
export default defineConfig(({ mode }) => {
  const page = mode === 'student' ? 'student' : 'teacher';
  return {
    base: './',
    plugins: [viteSingleFile()],
    server: { open: '/app/' },
    build: {
      outDir: `dist/.build-${page}`,
      emptyOutDir: true,
      rollupOptions: { input: page === 'student' ? 'app/student/index.html' : 'app/index.html' },
      chunkSizeWarningLimit: 3000,
    },
    test: { environment: 'jsdom', include: ['tests/**/*.test.ts'], setupFiles: ['tests/setup.ts'] },
  };
});
