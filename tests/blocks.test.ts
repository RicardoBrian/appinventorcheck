import { beforeAll, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly/core';
import { registerAiBlocks } from '../src/blocks/defs';
import { prepareBkyXml } from '../src/blocks/prepare';
import { missingKeys } from '../src/blocks/msg';
import { loadFixture } from './helpers';

/** 헤드리스 작업공간에 .bky 를 올리고 블록 텍스트(필드 표시값)를 얻는다 */
function load(bky: string) {
  const ws = new Blockly.Workspace();
  const { dom, unknownTypes } = prepareBkyXml(bky);
  Blockly.Xml.domToWorkspace(dom, ws);
  return { ws, unknownTypes };
}
/** 블록 하나의 글자 (자식 블록 제외) */
function ownText(b: Blockly.Block) {
  const parts: string[] = [];
  for (const input of b.inputList) for (const f of input.fieldRow) parts.push(f.getText());
  return parts.map((s) => s.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/ \. /g, '.').replace(/ \./g, '.');
}

beforeAll(() => registerAiBlocks());

describe('블록 렌더링 (한국어)', () => {
  for (const f of ['ox-quiz.aia', 'rock-paper-scissors.aia', 'fortune.aia']) {
    it(`${f}: 모든 블록 type 이 정의되어 있고 로딩 오류가 없다`, async () => {
      const p = await loadFixture(f);
      const { ws, unknownTypes } = load(p.screens[0].bky!);
      expect(unknownTypes).toEqual([]);
      expect(ws.getAllBlocks(false).length).toBeGreaterThan(10);
    });
  }

  it('앱인벤터 한국어 화면과 같은 글자', async () => {
    const p = await loadFixture('ox-quiz.aia');
    const { ws } = load(p.screens[0].bky!);
    const texts = ws.getAllBlocks(false).map(ownText);
    expect(texts).toContain('언제 O.클릭했을때 실행');
    expect(texts).toContain('언제 Screen1.초기화되었을때 실행');
    expect(texts).toContain('지정하기 문제.텍스트 값');
    expect(texts).toContain('지정하기 O.활성화 값');
    expect(texts).toContain('항목 선택하기 리스트 위치');
    expect(texts).toContain('전역변수 만들기 문제번호 초기값');
    expect(texts).toContain('가져오기 전역변수 총점');
    expect(texts).toContain('지정하기 전역변수 총점 값');
    expect(texts).toContain('합치기');
    expect(texts).toContain('텍스트 비교하기 =');
    expect(texts).toContain('길이 구하기 리스트');
    expect(texts).toContain('리스트 만들기');
    expect(texts).toContain('<');
    expect(texts).toContain('거짓');
    expect(texts.some((t) => t.startsWith('만약 이라면 실행 아니면'))).toBe(true);
  });

  it('가위바위보/운세 블록 글자', async () => {
    const rps = load((await loadFixture('rock-paper-scissors.aia')).screens[0].bky!).ws.getAllBlocks(false).map(ownText);
    expect(rps).toContain('임의의 정수 시작 끝');
    expect(rps).toContain('지정하기 플레이어1.사진 값');
    expect(rps.some((t) => t.includes('아니고 만약'))).toBe(true);
    expect(rps).toContain('또는 또는');
    const fortune = load((await loadFixture('fortune.aia')).screens[0].bky!).ws.getAllBlocks(false).map(ownText);
    expect(fortune).toContain('언제 시계1.타이머가작동할때 실행');
    expect(fortune).toContain('지정하기 시계1.타이머활성화여부 값');
    expect(fortune).toContain('임의의 항목 선택하기 리스트');
  });

  it('사용한 메시지 키가 모두 메시지 파일에 있다', () => {
    expect([...missingKeys]).toEqual([]);
  });

  it('모르는 블록은 대체 블록으로 그리고 목록을 알려 준다', () => {
    const xml = `<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="component_event" x="0" y="0">
        <mutation component_type="Button" is_generic="false" instance_name="B" event_name="Click"></mutation>
        <field name="COMPONENT_SELECTOR">B</field>
        <statement name="DO">
          <block type="some_new_block"><field name="X">1</field><value name="V"><block type="math_number"><field name="NUM">3</field></block></value>
            <next><block type="component_method"><mutation component_type="Notifier" method_name="ShowAlert" is_generic="false" instance_name="알림1"></mutation><field name="COMPONENT_SELECTOR">알림1</field>
              <value name="ARG0"><block type="text"><field name="TEXT">안녕</field></block></value></block></next>
          </block>
        </statement>
      </block></xml>`;
    const { ws, unknownTypes } = load(xml);
    expect(unknownTypes).toEqual(['some_new_block']);
    const texts = ws.getAllBlocks(false).map(ownText);
    expect(texts).toContain('⚠ some_new_block 1 V');
    expect(texts).toContain('호출 알림1.경고창보이기 알림');
  });

  it('반환값이 있는 메서드는 값 블록 모양', () => {
    const xml = `<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="lexical_variable_set"><field name="VAR">global t</field>
        <value name="VALUE"><block type="component_method"><mutation component_type="Clock" method_name="Now" is_generic="false" instance_name="시계1"></mutation><field name="COMPONENT_SELECTOR">시계1</field></block></value>
      </block></xml>`;
    const { ws } = load(xml);
    const m = ws.getAllBlocks(false).find((b) => b.type === 'component_method')!;
    expect(m.outputConnection).toBeTruthy();
    expect(m.previousConnection).toBeFalsy();
  });
});
