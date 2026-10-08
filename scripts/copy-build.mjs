// 빌드된 한 파일(dist/app/index.html)을 배포·더블클릭용 위치에 복사한다.
//  - dist/index.html   : 출력 폴더를 dist 로 지정한 호스팅용
//  - index.html        : 빌드 없이 저장소를 그대로 배포하는 경우용
//  - aiachecker.html   : 내려받아 더블클릭하는 용도
import fs from 'node:fs';
const src = 'dist/app/index.html';
for (const dst of ['dist/index.html', 'index.html', 'aiachecker.html']) fs.copyFileSync(src, dst);
fs.rmSync('dist/app', { recursive: true });
console.log('복사 완료: dist/index.html, index.html, aiachecker.html');
