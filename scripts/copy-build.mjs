// 빌드된 두 페이지를 배포 위치로 복사한다.
//
//   학생용 (실행만)          → index.html,          dist/index.html
//   교사용 (블록·채점 등)     → teacher/index.html,  dist/teacher/index.html
//   내려받아 더블클릭용       → aiachecker.html (교사용), aiachecker-student.html (학생용)
//
// 저장소를 빌드 없이 그대로 배포해도, 출력 폴더를 dist 로 지정해 배포해도 같은 주소 구조가 된다:
//   https://도메인/          학생용
//   https://도메인/teacher/  교사용
import fs from 'node:fs';
import path from 'node:path';

const student = 'dist/.build-student/app/student/index.html';
const teacher = 'dist/.build-teacher/app/index.html';

const copy = (src, dst) => {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
};
for (const root of ['.', 'dist']) {
  copy(student, path.join(root, 'index.html'));
  copy(teacher, path.join(root, 'teacher/index.html'));
  // 교사용 블록 화면의 마우스 커서 그림 (./blockly-media/)
  fs.cpSync('public/blockly-media', path.join(root, 'teacher/blockly-media'), { recursive: true });
}
copy(teacher, 'aiachecker.html');
copy(student, 'aiachecker-student.html');
fs.rmSync('dist/.build-student', { recursive: true, force: true });
fs.rmSync('dist/.build-teacher', { recursive: true, force: true });
fs.rmSync('dist/blockly-media', { recursive: true, force: true });
console.log('복사 완료: index.html(학생용), teacher/index.html(교사용), aiachecker.html, aiachecker-student.html (+ dist/ 같은 구조)');
