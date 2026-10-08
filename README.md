# aiachecker

MIT App Inventor 프로젝트 파일(.aia)을 브라우저에서 열어
블록 코드를 앱인벤터 한국어 화면과 같은 모양으로 보고, 앱을 실행해 보고, (예정) 채점 항목을 자동으로 확인하는 정적 웹앱입니다.

- 서버가 없습니다. 학생 파일은 브라우저 메모리 안에서만 처리되고 외부로 전송되지 않습니다.
- 빌드 결과는 JS·CSS·예제가 모두 들어간 HTML 한 파일입니다. 더블클릭으로 열어도 되고, GitHub Pages·Firebase Hosting에 그대로 올려도 됩니다.
- 외부 CDN이나 서버에 접속하지 않습니다.

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | aia 읽기, 컴포넌트 트리, 블록 보기 | ✅ |
| 2 | 실행기 (수업용 블록·컴포넌트) | ✅ |
| 3 | 채점 체크리스트, 학생별 결과표, CSV 내보내기 | 예정 |

## 사용법

### 그냥 쓰기 (설치 없음)

저장소 맨 위의 **`index.html`**(또는 같은 내용의 `aiachecker.html`)이 완성된 프로그램입니다.
내려받아 더블클릭하면 크롬/엣지에서 바로 열립니다. 프로그램·예제가 모두 이 파일 하나에 들어 있고 인터넷 연결도 필요 없습니다.

### 배포

- **빌드 없이 저장소를 그대로 배포** (GitHub Pages 등): 맨 위 `index.html` 이 그대로 동작합니다.
- **빌드해서 배포** (Vercel·Netlify·Cloudflare Pages 등): 빌드 명령 `npm run build`, 출력 폴더 `dist`.
- **Firebase Hosting**: `firebase.json` 이 저장소 맨 위를 배포하도록 되어 있어 `firebase deploy` 만 하면 됩니다.

> 개발용 원본 HTML 은 `app/index.html` 입니다. 코드를 고친 뒤에는 `npm run build` 를 해야 맨 위 `index.html` 이 갱신됩니다.

### 개발

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173/app/)
npm test           # 자동 테스트
npm run build      # 한 파일로 빌드 → dist/index.html, index.html, aiachecker.html
```

화면 왼쪽에 .aia 파일을 끌어다 놓거나 "예제" 링크(O/X 퀴즈, 가위바위보, 오늘의 운세)를 누르세요.

## 구조

| 경로 | 설명 |
|---|---|
| `src/aia/parse.ts` | .aia(zip) → 화면 목록, 컴포넌트 트리(.scm), 블록 XML(.bky), assets |
| `src/aia/bky.ts` | .bky → 다루기 쉬운 블록 트리 (실행기·채점기용) |
| `src/blocks/defs.ts` | App Inventor 블록 정의 (읽기 전용 렌더링) |
| `src/blocks/prepare.ts` | Blockly에 넣기 전 XML 보정, 모르는 블록은 회색 대체 블록으로 표시 |
| `src/i18n/ai-ko.json` | App Inventor 한국어 메시지 (스크립트로 추출) |
| `src/runtime/values.ts` | 앱인벤터 값 규칙 (= 비교, 숫자→글자, 타입 오류 메시지) |
| `src/runtime/components.ts` | 실행 중인 컴포넌트 (속성 반영, 시계 타이머, 소리) |
| `src/runtime/interpreter.ts` | 블록 인터프리터 |
| `src/ui/` | 화면 (칸 나누기·크기 조절, 파일 목록, 폰 화면, 컴포넌트 트리) |
| `scripts/build-fixtures.mjs` | 테스트용 .aia 3개 생성 → `tests/fixtures/`, `src/samples/` |
| `scripts/extract-i18n.mjs` | appinventor-sources에서 한국어 메시지 추출 |

## 화면

- 위 막대의 **파일 / 실행 / 블록 / 기록·채점** 버튼으로 각 칸을 끄고 켭니다 (단축키 Alt+1~4).
- 칸 사이 경계선을 끌어서 너비를, 아래 패널 위 경계선을 끌어서 높이를 바꿉니다. 경계선을 더블클릭하면 기본 너비로.
- 설정은 브라우저에 저장됩니다. **초기화**를 누르면 처음 상태로.

## 실행기

- 실행 순서: 전역변수 초기화(위에서부터) → Screen.초기화 → 이벤트. **다시 실행**으로 처음부터.
- 컴포넌트: 스크린, 레이블, 버튼, 텍스트박스, 이미지, 수평/수직배치, 시계, 소리, 알림(경고창), 체크박스
- 블록: 변수(전역·지역), 이벤트, 컴포넌트 속성 지정/가져오기, 만약/아니고 만약/아니면, 반복, 논리, 수학(비교·임의의 정수 등), 텍스트(합치기·비교 등), 리스트(만들기·항목 선택·길이·임의의 항목 등), 함수, 색
- 지원하지 않는 블록·컴포넌트·이벤트를 만나면 앱을 멈추지 않고 아래 **실행 기록**에 "지원하지 않는 블록: ○○" 처럼 남깁니다.
- 값 규칙은 앱인벤터 런타임(`runtime.scm`)과 같게 맞췄습니다.
  - `=` 비교: 둘 다 숫자로 읽히면 숫자로 비교 (`"9"` = `9`, `"09"` = `9` 는 참). 리스트는 항목별 비교.
  - 숫자→글자: `4/2` → `2`, `1/3` → `0.33333` (YailNumberToString)
  - 리스트 위치는 1부터. 범위를 벗어나면 앱인벤터와 같은 영어 오류를 폰 화면에 띄움
    (예: `Select list item: Attempt to get item number 6 of a list of length 5: [...]`)
  - 타입이 맞지 않으면 `The operation + cannot accept the arguments: , ["a"], [1]`
- 자동 테스트: 가위바위보 9가지 경우, 오늘의 운세(0.3초마다 6번 바뀌고 7번째에 멈춤), O/X 퀴즈 진행·점수·끝 처리.

## 앱인벤터와 맞춘 부분 (근거)

모두 [mit-cml/appinventor-sources](https://github.com/mit-cml/appinventor-sources) 의 실제 코드를 보고 맞췄습니다.

- **블록 type·입력 이름·mutation**: `appinventor/blocklyeditor/src/blocks/*.js`
  (예: `component_event` 의 `component_type / instance_name / event_name`, `component_set_get` 의 `set_or_get / property_name`,
  `controls_if` 의 `elseif / else`, `text_join`·`lists_create_with` 의 `items`, 전역변수 참조 `"global 이름"`)
- **블록 색**: `blocklyeditor/src/blockColors.js`, `blocks/components.js`
- **블록 글자**: `blocklyeditor/src/msg/ai_blockly/messages_ko.json` (+ 영어 대체), 
  컴포넌트 이벤트·속성·메서드 이름: `appengine/.../components/i18n/Component*Translations_ko_KR.properties`,
  컴포넌트 종류 이름: `OdeMessages_ko_KR.properties`
- `%1` 이 들어간 메시지 처리는 `blocklyeditor/src/block.js` 의 `interpolateMsg` 와 같은 규칙입니다.

다시 추출하려면:

```bash
git clone --depth 1 https://github.com/mit-cml/appinventor-sources.git /tmp/ais
npm run extract:i18n -- /tmp/ais
```

### 알려진 차이

- `만약` 블록의 "아니면": 원본 코드는 Blockly 기본 메시지 `CONTROLS_IF_MSG_ELSE` 를 쓰는데, 저장소에는 이 키의 한국어 번역이 없습니다(영어 "else"만 있음).
  앱인벤터 한국어 메시지의 `LANG_CONTROLS_IF_MSG_ELSE`("아니면")로 표시합니다.
- 이벤트·메서드 매개변수 이름은 .aia 안에 없는 컴포넌트 DB에서 오기 때문에, 자주 쓰는 컴포넌트만 `src/blocks/componentInfo.ts` 에 적어 두었습니다.
  표에 없는 경우 블록은 그대로 그려지고 매개변수 이름만 비어 보입니다.
- 앱인벤터 전용 렌더러(geras2)와 플라이아웃 변수 필드는 Blockly 기본 `geras` 렌더러와 드롭다운 모양으로 대신합니다.
- 이 뷰어가 모르는 블록은 회색 "⚠ type이름" 블록으로 그리고, 블록 영역 아래에 목록을 보여 줍니다.

## 라이선스 / 출처

- `src/i18n/ai-ko.json` 은 MIT App Inventor 소스의 메시지 파일에서 추출한 데이터입니다.
  MIT App Inventor: Copyright © MIT, [Apache License 2.0](https://github.com/mit-cml/appinventor-sources/blob/master/LICENSE).
  블록 정의(`src/blocks/defs.ts`)는 원본 코드를 복사하지 않고, 원본의 구조(type, 입력·필드 이름, 메시지 키, 색)를 따라 새로 작성했습니다.
- [Blockly](https://github.com/google/blockly) (Apache License 2.0), `public/blockly-media/` 는 Blockly 패키지의 media 파일(마우스 커서 등) 복사본입니다.
- [JSZip](https://github.com/Stuk/jszip) (MIT 또는 GPLv3 중 선택, 여기서는 MIT).
- [BlockLens](https://github.com/TechHamara/BlockLens) 와 Kodular ai-unchive 는 접근 방식을 참고만 했고, 코드는 가져오지 않았습니다.
