/**
 * Blockly 에 넣기 전에 .bky XML 을 손본다.
 *  - component_method: 인자 개수와 모양(값/문장)을 XML 에서 알아내 mutation 에 적어 둔다
 *    (앱인벤터는 컴포넌트 DB 로 알지만, .aia 에는 그 DB 가 없다).
 *  - 정의가 없는 블록 type: 그 블록의 XML 모양 그대로 회색 "대체 블록"을 만들어 그린다.
 *    (Blockly 는 모르는 type 을 만나면 전체 로딩이 실패하므로)
 */
import * as Blockly from 'blockly/core';
import { COLOUR } from './msg';

export interface PreparedXml {
  dom: Element;
  /** 정의가 없어 대체 블록으로 그린 원래 type 들 */
  unknownTypes: string[];
}

let fallbackSeq = 0;

export function prepareBkyXml(xml: string): PreparedXml {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('블록(.bky) XML 을 읽을 수 없습니다.');
  const root = doc.documentElement;
  const unknown = new Set<string>();

  const all = [...Array.from(root.getElementsByTagName('block')), ...Array.from(root.getElementsByTagName('shadow'))];
  for (const el of all) {
    const type = el.getAttribute('type') ?? '';
    const parentTag = el.parentElement?.nodeName.toLowerCase();
    if (type === 'component_method') {
      const mut = ensureMutation(el);
      let argc = 0;
      for (const c of children(el)) {
        const m = c.nodeName.toLowerCase() === 'value' && (c.getAttribute('name') ?? '').match(/^ARG(\d+)$/);
        if (m) argc = Math.max(argc, parseInt(m[1], 10) + 1);
      }
      mut.setAttribute('data-argc', String(argc));
      mut.setAttribute('data-shape', parentTag === 'value' ? 'out' : 'stmt');
    } else if (!Blockly.Blocks[type]) {
      unknown.add(type);
      el.setAttribute('data-orig-type', type);
      el.setAttribute('type', defineFallback(el, type, parentTag));
    }
  }
  return { dom: root, unknownTypes: [...unknown] };
}

function children(el: Element): Element[] {
  return Array.from(el.children);
}

function ensureMutation(el: Element): Element {
  let m = children(el).find((c) => c.nodeName.toLowerCase() === 'mutation');
  if (!m) {
    m = el.ownerDocument.createElementNS(el.namespaceURI, 'mutation');
    el.insertBefore(m, el.firstChild);
  }
  return m;
}

/** XML 모양을 그대로 따라 그리는 대체 블록 */
function defineFallback(el: Element, origType: string, parentTag: string | undefined): string {
  const type = `ai_unknown_${++fallbackSeq}`;
  const parts = children(el).map((c) => ({ tag: c.nodeName.toLowerCase(), name: c.getAttribute('name') ?? '' }));
  const hasNext = parts.some((p) => p.tag === 'next');
  const isValue = parentTag === 'value';
  const isStmt = !isValue && (parentTag === 'statement' || parentTag === 'next' || hasNext);
  Blockly.Blocks[type] = {
    init(this: Blockly.Block) {
      this.setColour(COLOUR.UNKNOWN);
      this.setTooltip(`이 뷰어가 아직 모르는 블록입니다: ${origType}`);
      const head = this.appendDummyInput().appendField(`⚠ ${origType}`);
      for (const p of parts) {
        if (p.tag === 'field') head.appendField(new Blockly.FieldTextInput(''), p.name);
      }
      for (const p of parts) {
        if (p.tag === 'value') this.appendValueInput(p.name).appendField(p.name).setAlign(Blockly.inputs.Align.RIGHT);
        else if (p.tag === 'statement') this.appendStatementInput(p.name).appendField(p.name);
      }
      if (isValue) this.setOutput(true);
      else if (isStmt) {
        this.setPreviousStatement(true);
        this.setNextStatement(true);
      }
    },
  };
  return type;
}
