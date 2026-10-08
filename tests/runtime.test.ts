import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRuntime } from '../src/runtime/interpreter';
import { coerceToString, numberToString, yailEqual, YailList } from '../src/runtime/values';
import { loadFixture } from './helpers';
import type { AiaProject } from '../src/aia/types';

/** 정해진 순서로 난수를 돌려준다 */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

function run(p: AiaProject, random?: () => number, bky?: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const screen = { ...p.screens[0], bky: bky ?? p.screens[0].bky };
  const rt = new AppRuntime({ screen, container, assetUrl: (n) => (p.assets.has(n) ? `asset:${n}` : undefined), random });
  rt.start();
  const el = (name: string) => container.querySelector<HTMLElement>(`[data-name="${name}"]`)!;
  const click = (name: string) => (el(name) as HTMLButtonElement).click();
  return { rt, container, el, click, text: (n: string) => el(n).textContent };
}

const xml = (body: string) => `<xml xmlns="https://developers.google.com/blockly/xml">${body}</xml>`;
const init = (stmts: string) =>
  `<block type="component_event"><mutation component_type="Form" is_generic="false" instance_name="Screen1" event_name="Initialize"></mutation><field name="COMPONENT_SELECTOR">Screen1</field><statement name="DO">${stmts}</statement></block>`;
const setText = (value: string) =>
  `<block type="component_set_get"><mutation component_type="Label" set_or_get="set" property_name="Text" is_generic="false" instance_name="문제"></mutation><field name="COMPONENT_SELECTOR">문제</field><field name="PROP">Text</field><value name="VALUE">${value}</value></block>`;

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('값 규칙 (runtime.scm 과 같게)', () => {
  it('= 비교: 숫자로 읽히는 글자는 숫자와 같다', () => {
    expect(yailEqual('9', 9)).toBe(true);
    expect(yailEqual('09', 9)).toBe(true);
    expect(yailEqual(' 9 ', 9)).toBe(true);
    expect(yailEqual('9.0', '9')).toBe(true);
    expect(yailEqual('O', 'O')).toBe(true);
    expect(yailEqual('O', 'o')).toBe(false);
    expect(yailEqual('a', 0)).toBe(false);
    expect(yailEqual(true, 'true')).toBe(false);
    expect(yailEqual(new YailList([1, '2']), new YailList(['1', 2]))).toBe(true);
  });
  it('숫자 → 글자', () => {
    expect(numberToString(4 / 2)).toBe('2');
    expect(numberToString(0.1 + 0.2)).toBe('0.3');
    expect(numberToString(1 / 3)).toBe('0.33333');
    expect(numberToString(2.5)).toBe('2.5');
    expect(numberToString(1e7 + 0.5)).toBe('1E7'); // DecimalFormat("0.####E0")
    expect(numberToString(12345678.9)).toBe('1.2346E7');
    expect(coerceToString(new YailList(['a', 1, true]))).toBe('["a", 1, true]');
  });
});

describe('가위바위보', () => {
  const cases: [number, number, string][] = [
    [1, 1, '비겼습니다'], [1, 2, '플레이어2 승리!'], [1, 3, '플레이어1 승리!'],
    [2, 1, '플레이어1 승리!'], [2, 2, '비겼습니다'], [2, 3, '플레이어2 승리!'],
    [3, 1, '플레이어2 승리!'], [3, 2, '플레이어1 승리!'], [3, 3, '비겼습니다'],
  ];
  const r = (k: number) => (k - 1) / 3 + 0.01; // 임의의 정수 1~3 이 k 가 되는 난수
  const pics = ['scissors.png', 'rock.png', 'paper.png'];
  for (const [a, b, result] of cases) {
    it(`플레이어1=${pics[a - 1]}, 플레이어2=${pics[b - 1]} → ${result}`, async () => {
      const p = await loadFixture('rock-paper-scissors.aia');
      const app = run(p, seq(r(a), r(b)));
      expect(app.text('결과')).toBe('버튼을 누르세요');
      app.click('대결');
      expect((app.el('플레이어1') as HTMLImageElement).getAttribute('src')).toBe(`asset:${pics[a - 1]}`);
      expect((app.el('플레이어2') as HTMLImageElement).getAttribute('src')).toBe(`asset:${pics[b - 1]}`);
      expect(app.text('결과')).toBe(result);
      expect(app.rt.logs).toEqual([]);
    });
  }
});

describe('오늘의 운세', () => {
  it('0.3초마다 6번 바뀌고 7번째에 멈춘다', async () => {
    const p = await loadFixture('fortune.aia');
    vi.useFakeTimers();
    const app = run(p, seq(0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6));
    const fortunes = ['대박 나는 날!', '친구에게 좋은 일이 생겨요', '조심조심 하루', '공부가 잘 되는 날', '맛있는 것을 먹게 돼요', '뜻밖의 선물이 와요'];
    expect(app.text('운세')).toBe('버튼을 눌러 보세요');
    // 디자이너에서 타이머 꺼짐 → 누르기 전에는 안 바뀜
    vi.advanceTimersByTime(3000);
    expect(app.text('운세')).toBe('버튼을 눌러 보세요');

    app.click('운세보기');
    expect((app.el('운세보기') as HTMLButtonElement).disabled).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(299);
      expect(app.text('운세')).toBe(seen.at(-1) ?? '버튼을 눌러 보세요'); // 0.3초가 되기 전에는 그대로
      vi.advanceTimersByTime(1);
      seen.push(app.text('운세')!);
    }
    expect(seen).toEqual(fortunes);
    // 7번째: 멈추고 버튼 다시 켜짐, 글자는 그대로
    vi.advanceTimersByTime(300);
    expect(app.text('운세')).toBe(fortunes[5]);
    expect((app.el('운세보기') as HTMLButtonElement).disabled).toBe(false);
    expect(app.rt.components.get('시계1')!.getProperty('TimerEnabled')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(app.text('운세')).toBe(fortunes[5]);
    expect(app.rt.globals.get('횟수')).toBe(7);
  });
});

describe('O/X 퀴즈', () => {
  it('초기화: 첫 문제와 점수:0', async () => {
    const app = run(await loadFixture('ox-quiz.aia'));
    expect(app.text('문제')).toBe('고양이는 포유류이다');
    expect(app.text('점수')).toBe('점수:0');
  });

  it('모두 맞히면 5점, 끝나면 "끝!" 과 버튼 비활성화', async () => {
    const app = run(await loadFixture('ox-quiz.aia'));
    const answers = ['O', 'O', 'X', 'O', 'X'];
    answers.forEach((a, i) => {
      app.click(a);
      expect(app.text('점수')).toBe(`점수:${i + 1}`);
    });
    expect(app.text('문제')).toBe('끝!');
    expect((app.el('O') as HTMLButtonElement).disabled).toBe(true);
    expect((app.el('X') as HTMLButtonElement).disabled).toBe(true);
    app.click('O'); // 비활성화된 버튼은 눌러도 반응 없음
    expect(app.text('점수')).toBe('점수:5');
    expect(app.rt.logs).toEqual([]);
  });

  it('틀리면 점수는 그대로, 다음 문제로', async () => {
    const app = run(await loadFixture('ox-quiz.aia'));
    app.click('X');
    expect(app.text('점수')).toBe('점수:0');
    expect(app.text('문제')).toBe('지구는 태양 주위를 돈다');
    app.click('O');
    expect(app.text('점수')).toBe('점수:1');
  });

  it('리스트 범위를 벗어나면 앱인벤터와 같은 오류 메시지를 띄운다', async () => {
    const p = await loadFixture('ox-quiz.aia');
    // "끝!" 판정이 없는 학생 코드처럼: 5개짜리 리스트에서 6번째 항목 선택하기
    const list = `<block type="lists_create_with"><mutation items="5"></mutation>${['a', 'b', 'c', 'd', 'e']
      .map((t, i) => `<value name="ADD${i}"><block type="text"><field name="TEXT">${t}</field></block></value>`)
      .join('')}</block>`;
    const select = `<block type="lists_select_item"><value name="LIST">${list}</value><value name="NUM"><block type="math_number"><field name="NUM">6</field></block></value></block>`;
    const app = run(p, undefined, xml(init(setText(select))));
    const dialog = app.container.querySelector('.rt-dialog');
    expect(dialog?.textContent).toContain('Select list item: Attempt to get item number 6 of a list of length 5: ["a", "b", "c", "d", "e"]');
    expect(app.rt.logs.map((l) => l.level)).toEqual(['error']);
    // 오류가 나도 앱은 계속 동작한다
    app.click('O');
  });
});

describe('지원하지 않는 블록', () => {
  it('앱을 멈추지 않고 경고만 남긴다', async () => {
    const p = await loadFixture('ox-quiz.aia');
    const unknown = `<block type="dictionaries_create_with"><mutation items="0"></mutation><next>${setText('<block type="text"><field name="TEXT">계속 실행됨</field></block>')}</next></block>`;
    const app = run(p, undefined, xml(init(unknown)));
    expect(app.text('문제')).toBe('계속 실행됨');
    expect(app.rt.logs.map((l) => l.message)).toEqual(['지원하지 않는 블록: 사전 만들기 (dictionaries_create_with)']);
  });

  it('타입이 맞지 않으면 앱인벤터와 같은 오류', async () => {
    const p = await loadFixture('ox-quiz.aia');
    const add = `<block type="math_add"><mutation items="2"></mutation><value name="NUM0"><block type="text"><field name="TEXT">a</field></block></value><value name="NUM1"><block type="math_number"><field name="NUM">1</field></block></value></block>`;
    const app = run(p, undefined, xml(init(setText(add))));
    expect(app.rt.logs).toEqual([{ level: 'error', message: 'The operation + cannot accept the arguments: , ["a"], [1]' }]);
    expect(app.container.querySelector('.rt-dialog')?.textContent).toContain('Runtime Error');
  });
});
