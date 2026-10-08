# 앱인벤터 aia 채점 도우미

MIT App Inventor 프로젝트 파일(.aia)을 브라우저에서 열어
**블록 코드를 앱인벤터 한국어 화면과 같은 모양으로 보고**, (단계 2) 앱을 실행해 보고, (단계 3) 채점 항목을 자동으로 확인하는 정적 웹앱입니다.

- 서버가 없습니다. 학생 파일은 브라우저 메모리 안에서만 처리되고 외부로 전송되지 않습니다.
- 빌드 결과(`dist/`)는 정적 파일이라 GitHub Pages, Firebase Hosting 어디에나 올릴 수 있습니다 (상대 경로로 빌드).
- Blockly 아이콘(확대/축소 등)도 `public/blockly-media/`에 포함되어 있어 외부 CDN에 접속하지 않습니다.

## 진행 상황

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | aia 읽기, 컴포넌트 트리, 블록 보기 | ✅ |
| 2 | 실행기 (수업용 블록·컴포넌트) | 예정 |
| 3 | 채점 체크리스트, 학생별 결과표, CSV 내보내기 | 예정 |

## 사용법

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm test           # 자동 테스트
npm run build      # dist/ 에 정적 파일 생성
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
| `src/ui/` | 화면 (파일 목록, 폰 미리보기, 컴포넌트 트리) |
| `scripts/build-fixtures.mjs` | 테스트용 .aia 3개 생성 → `tests/fixtures/`, `public/samples/` |
| `scripts/extract-i18n.mjs` | appinventor-sources에서 한국어 메시지 추출 |

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
- [Blockly](https://github.com/google/blockly) (Apache License 2.0), `public/blockly-media/` 는 Blockly 패키지의 media 파일 복사본입니다.
- [JSZip](https://github.com/Stuk/jszip) (MIT 또는 GPLv3 중 선택, 여기서는 MIT).
- [BlockLens](https://github.com/TechHamara/BlockLens) 와 Kodular ai-unchive 는 접근 방식을 참고만 했고, 코드는 가져오지 않았습니다.
