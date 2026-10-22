import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../src/runtime/interpreter';
import { AppSession } from '../src/runtime/session';
import { BallComp, CanvasComp, ImageSpriteComp } from '../src/runtime/rt/canvas';
import { formatDate } from '../src/runtime/rt/nonvisible';
import { Instant, type Value } from '../src/runtime/values';
import type { AiaProject } from '../src/aia/types';
import { loadFixture } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function run(p: AiaProject, bky?: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const screen = { ...p.screens[0], bky: bky ?? p.screens[0].bky };
  const rt = new AppRuntime({ screen, container, assetUrl: (n) => (p.assets.has(n) ? `asset:${n}` : undefined) });
  rt.start();
  const el = (name: string) => container.querySelector<HTMLElement>(`[data-name="${name}"]`)!;
  return { rt, container, el, text: (n: string) => el(n).textContent };
}

describe('캔버스 · 공 · 이미지 스프라이트', () => {
  it('터치하면 원, 드래그하면 선을 그린다 (이벤트 매개변수 x, y, prevX ...)', async () => {
    const app = run(await loadFixture('ball-paint.aia'));
    const canvas = app.rt.components.get('캔버스1') as CanvasComp;
    app.rt.dispatch('캔버스1', 'Touched', [50, 60, false]);
    app.rt.dispatch('캔버스1', 'Dragged', [10, 10, 10, 10, 30, 40, false]);
    expect(canvas.drawLog).toEqual(['DrawCircle 50 60 6 true', 'DrawLine 10 10 30 40']);
    app.el('지우기').click();
    expect(canvas.drawLog.at(-1)).toBe('Clear');
    expect(app.rt.logs).toEqual([]);
  });

  it('공은 Interval 마다 Heading 방향으로 Speed 만큼 움직인다', async () => {
    const p = await loadFixture('ball-paint.aia');
    vi.useFakeTimers();
    const app = run(p);
    const ball = app.rt.components.get('공1') as BallComp;
    vi.advanceTimersByTime(50);
    // Heading 30도, Speed 6 → x + 6cos30, y - 6sin30 (화면은 아래가 +y)
    expect(Number(ball.props.X)).toBeCloseTo(20 + 6 * Math.cos(Math.PI / 6), 5);
    expect(Number(ball.props.Y)).toBeCloseTo(20 - 6 * Math.sin(Math.PI / 6), 5);
  });

  it('위쪽 가장자리에 닿으면 EdgeReached(1) → 튕기기로 방향이 바뀐다', async () => {
    const p = await loadFixture('ball-paint.aia');
    vi.useFakeTimers();
    const app = run(p);
    const ball = app.rt.components.get('공1') as BallComp;
    vi.advanceTimersByTime(50 * 4); // y: 20 → 17 → 14 → 11 → 8 ... 아직 안 닿음
    expect(Number(ball.props.Heading)).toBe(30);
    vi.advanceTimersByTime(50 * 3); // y 가 0 아래로 → 북쪽 가장자리
    expect(Number(ball.props.Y)).toBeGreaterThanOrEqual(0);
    expect(Number(ball.props.Heading)).toBe(330); // 북쪽 벽: 360 - 30
  });

  it('충돌하면 한 번만 CollidedWith (겹쳐 있는 동안 반복하지 않음)', async () => {
    const p = await loadFixture('ball-paint.aia');
    vi.useFakeTimers();
    const app = run(p);
    const ball = app.rt.components.get('공1') as BallComp;
    ball.setProperty('Speed', 0);
    ball.setProperty('X', 190); // 별(200,150, 48x48)과 겹치게
    ball.setProperty('Y', 150);
    expect(app.text('점수')).toBe('부딪힌 횟수: 1');
    ball.setProperty('X', 195);
    expect(app.text('점수')).toBe('부딪힌 횟수: 1');
    ball.setProperty('X', 20); // 떨어졌다가
    ball.setProperty('X', 190); // 다시 부딪힘
    expect(app.text('점수')).toBe('부딪힌 횟수: 2');
    const star = app.rt.components.get('별') as ImageSpriteComp;
    expect(star.collisions.has(ball)).toBe(true);
  });

  it('튕기기 규칙 (Sprite.BounceAbstract)', async () => {
    const app = run(await loadFixture('ball-paint.aia'));
    const ball = app.rt.components.get('공1') as BallComp;
    const cases: [number, number, number][] = [
      [3, 30, 150], // 동쪽 벽, 오른쪽 위로 가던 공 → 왼쪽 위로
      [-3, 150, 30], // 서쪽 벽
      [1, 30, 330], // 북쪽 벽
      [-1, 300, 60], // 남쪽 벽
      [2, 45, 225], // 북동 모서리
      [3, 150, 150], // 동쪽 벽인데 왼쪽으로 가던 공은 그대로
    ];
    for (const [edge, before, after] of cases) {
      ball.props.Heading = before;
      ball.bounce(edge);
      expect([edge, Number(ball.props.Heading)]).toEqual([edge, after]);
    }
  });
});

describe('목록 선택 · 알림 · TinyDB · 스크린 두 개', () => {
  it('목록에서 고르면 AfterPicking, 대화상자에서 "예" 를 누르면 저장', async () => {
    const p = await loadFixture('fruit-memo.aia');
    const storage = new Map<string, Map<string, Value>>();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const rt = new AppRuntime({ screen: p.screens[0], container, assetUrl: () => undefined, storage });
    rt.start();
    const q = (s: string) => container.querySelector<HTMLElement>(s)!;
    q('[data-name="과일선택"]').click();
    const items = [...container.querySelectorAll('.rt-picker li')].map((li) => li.textContent);
    expect(items).toEqual(['사과', '바나나', '포도']);
    (container.querySelectorAll('.rt-picker li')[1] as HTMLElement).click();
    expect(container.querySelector('.rt-picker')).toBeNull();
    expect(q('[data-name="선택결과"]').textContent).toBe('바나나');
    expect(rt.components.get('과일선택')!.getProperty('SelectionIndex')).toBe(2);

    q('[data-name="저장"]').click();
    expect(q('.rt-dialog-msg').textContent).toBe('저장할까요?');
    const buttons = [...container.querySelectorAll('.rt-dialog-buttons button')] as HTMLElement[];
    expect(buttons.map((b) => b.textContent)).toEqual(['예', '아니오']);
    buttons[0].click();
    expect(storage.get('TinyDB1')!.get('과일')).toBe('바나나');
    expect(q('.rt-toast').textContent).toBe('저장했습니다');
    expect(rt.logs).toEqual([]);
  });

  it('다른 스크린 열기(시작값) → TinyDB 읽기 → 닫기(결과) → OtherScreenClosed', async () => {
    const p = await loadFixture('fruit-memo.aia');
    vi.useFakeTimers();
    const storage = new Map([['TinyDB1', new Map<string, Value>([['과일', '포도']])]]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const changes: string[] = [];
    const s = new AppSession({ screens: p.screens, container, assetUrl: () => undefined, storage, onScreenChange: (n) => changes.push(n) });
    s.start();
    const q = (sel: string) => container.querySelector<HTMLElement>(sel)!;
    s.top!.components.get('과일선택')!.setProperty('Selection', '사과');
    q('[data-name="다음"]').click();
    vi.runAllTimers();
    expect(changes).toEqual(['Screen1', 'Screen2']);
    expect(q('[data-name="기록"]').textContent).toBe('저장된 과일: 포도');
    expect(q('[data-name="시작값"]').textContent).toBe('받은 값: 사과');
    // Screen1 은 숨겨진 채로 남아 있다
    expect(s.stack.length).toBe(2);
    q('[data-name="닫기"]').click();
    vi.runAllTimers();
    expect(s.stack.length).toBe(1);
    expect(q('[data-name="선택결과"]').textContent).toBe('돌아옴: 좋아요');
    expect(changes.at(-1)).toBe('Screen1');
  });

  it('TinyDB 는 다시 실행해도 남아 있다 (같은 저장소를 넘기면)', async () => {
    const p = await loadFixture('fruit-memo.aia');
    const storage = new Map<string, Map<string, Value>>();
    for (let i = 0; i < 2; i++) {
      const container = document.createElement('div');
      const rt = new AppRuntime({ screen: p.screens[1], container, assetUrl: () => undefined, storage });
      rt.start();
      const label = container.querySelector('[data-name="기록"]')!.textContent;
      expect(label).toBe(i === 0 ? '저장된 과일: 없음' : '저장된 과일: 수박');
      storage.set('TinyDB1', new Map([['과일', '수박']]));
      rt.dispose();
    }
  });

  it('뒤로 버튼: BackPressed 가 없으면 스크린을 닫는다', async () => {
    const p = await loadFixture('fruit-memo.aia');
    vi.useFakeTimers();
    const container = document.createElement('div');
    const s = new AppSession({ screens: p.screens, container, assetUrl: () => undefined });
    s.start();
    container.querySelector<HTMLElement>('[data-name="다음"]')!.click();
    vi.runAllTimers();
    expect(s.stack.length).toBe(2);
    s.back();
    expect(s.stack.length).toBe(1);
    expect(container.querySelector('[data-name="선택결과"]')!.textContent).toBe('돌아옴: ');
  });
});

describe('시계 · 슬라이더 · 스위치', () => {
  const xml = (body: string) => `<xml xmlns="https://developers.google.com/blockly/xml">${body}</xml>`;
  const scm = (components: object[]) =>
    `#|\n$JSON\n${JSON.stringify({ Properties: { $Name: 'Screen1', $Type: 'Form', Uuid: '0', $Components: components } })}\n|#`;

  it('날짜 형식 (한국어 휴대폰 기준)', () => {
    const t = new Date(2026, 9, 17, 14, 5, 9).getTime();
    expect(formatDate(t, 'yyyy/MM/dd HH:mm:ss')).toBe('2026/10/17 14:05:09');
    expect(formatDate(t, 'a h:mm')).toBe('오후 2:05');
    expect(formatDate(t, 'MMM d일 EEEE')).toBe('10월 17일 토요일');
  });

  it('슬라이더를 움직이면 PositionChanged(thumbPosition), 시계 메서드 값', async () => {
    const { parseScm } = await import('../src/aia/parse');
    const form = parseScm(scm([{ $Name: '슬라이더1', $Type: 'Slider' }, { $Name: '값', $Type: 'Label' }, { $Name: '시계1', $Type: 'Clock', TimerEnabled: 'False' }]));
    const ev = `<block type="component_event"><mutation component_type="Slider" is_generic="false" instance_name="슬라이더1" event_name="PositionChanged"></mutation><field name="COMPONENT_SELECTOR">슬라이더1</field>
      <statement name="DO"><block type="component_set_get"><mutation component_type="Label" set_or_get="set" property_name="Text" is_generic="false" instance_name="값"></mutation><field name="COMPONENT_SELECTOR">값</field><field name="PROP">Text</field>
      <value name="VALUE"><block type="lexical_variable_get"><mutation><eventparam name="thumbPosition"></eventparam></mutation><field name="VAR">thumbPosition</field></block></value></block></statement></block>`;
    const container = document.createElement('div');
    const rt = new AppRuntime({ screen: { name: 'Screen1', form, bky: xml(ev) }, container, assetUrl: () => undefined });
    rt.start();
    const slider = container.querySelector<HTMLInputElement>('[data-name="슬라이더1"]')!;
    expect(slider.value).toBe('30'); // 기본값: 최소 10, 최대 50, 위치 30
    slider.value = '42';
    slider.dispatchEvent(new Event('input'));
    expect(container.querySelector('[data-name="값"]')!.textContent).toBe('42');
    const clock = rt.components.get('시계1')!;
    const now = clock.callMethod('Now', []).value as Instant;
    expect(now).toBeInstanceOf(Instant);
    expect(clock.callMethod('Year', [now]).value).toBe(new Date().getFullYear());
    expect(() => clock.callMethod('Year', ['abc'])).toThrow('The operation Year cannot accept the argument: , ["abc"]');
  });

  it('속성 타입이 틀리면 앱인벤터와 같은 오류', async () => {
    const app = run(await loadFixture('ox-quiz.aia'));
    const o = app.rt.components.get('O')!;
    expect(() => o.setProperty('Enabled', 3)).toThrow('The operation Enabled cannot accept the argument: , [3]');
    o.setProperty('FontSize', '20'); // 숫자로 읽히는 글자는 숫자로
    expect(o.getProperty('FontSize')).toBe(20);
  });

  it('미디어 파일 블록으로 그림 바꾸기, 방향 선택지 블록으로 튕기기', async () => {
    const p = await loadFixture('ball-paint.aia');
    const set = (comp: string, type: string, prop: string, value: string) =>
      `<block type="component_set_get"><mutation component_type="${type}" set_or_get="set" property_name="${prop}" is_generic="false" instance_name="${comp}"></mutation><field name="COMPONENT_SELECTOR">${comp}</field><field name="PROP">${prop}</field><value name="VALUE">${value}</value></block>`;
    const bounce = `<block type="component_method"><mutation component_type="Ball" method_name="Bounce" is_generic="false" instance_name="공1"></mutation><field name="COMPONENT_SELECTOR">공1</field><value name="ARG0"><block type="helpers_dropdown"><mutation key="Direction"></mutation><field name="OPTION">North</field></block></value></block>`;
    // 문장 블록들을 <next> 로 잇는다 (각 블록의 마지막 </block> 앞에 다음 블록을 넣음)
    const chainOf = (...blocks: string[]): string =>
      blocks.reduceRight((rest, b) => (rest ? b.slice(0, -'</block>'.length) + `<next>${rest}</next></block>` : b), '');
    const init = `<block type="component_event"><mutation component_type="Form" is_generic="false" instance_name="Screen1" event_name="Initialize"></mutation><field name="COMPONENT_SELECTOR">Screen1</field><statement name="DO">${chainOf(
      set('별', 'ImageSprite', 'Picture', '<block type="helpers_assets"><field name="ASSET">star.png</field></block>'),
      set('공1', 'Ball', 'Heading', '<block type="math_number"><field name="NUM">30</field></block>'),
      bounce,
    )}</statement></block>`;
    const app = run(p, `<xml xmlns="https://developers.google.com/blockly/xml">${init}</xml>`);
    expect(app.rt.logs).toEqual([]);
    expect(app.el('별').getAttribute('src')).toBe('asset:star.png');
    expect(Number(app.rt.components.get('공1')!.props.Heading)).toBe(330); // 북쪽(1) 벽에 튕김: 360 - 30
  });
});
