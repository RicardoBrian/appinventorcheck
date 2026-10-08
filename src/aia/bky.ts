/**
 * .bky (Blockly XML) 를 다루기 쉬운 트리로 바꾼다. 실행기와 채점기가 사용한다.
 * 블록 렌더링은 Blockly 가 직접 XML 을 읽으므로 이 모듈을 거치지 않는다.
 */
export interface BlockNode {
  type: string;
  id: string;
  disabled: boolean;
  fields: Record<string, string>;
  /** <mutation> 의 속성 */
  mutation: Record<string, string>;
  /** <mutation> 안의 자식 요소 (예: <arg name="x"/>, <localname name="y"/>, <eventparam name="z"/>) */
  mutationChildren: { tag: string; attrs: Record<string, string> }[];
  values: Record<string, BlockNode>;
  statements: Record<string, BlockNode | null>;
  next: BlockNode | null;
}

export interface BkyDoc {
  topBlocks: BlockNode[];
  yaVersion?: string;
  languageVersion?: string;
}

export function parseBky(xml: string | null): BkyDoc {
  if (!xml) return { topBlocks: [] };
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error('블록(.bky) XML 을 읽을 수 없습니다.');
  const root = doc.documentElement;
  const topBlocks: BlockNode[] = [];
  let yaVersion: string | undefined;
  let languageVersion: string | undefined;
  for (const el of childElements(root)) {
    const tag = localName(el);
    if (tag === 'block') topBlocks.push(toNode(el));
    else if (tag === 'yacodeblocks') {
      yaVersion = el.getAttribute('ya-version') ?? undefined;
      languageVersion = el.getAttribute('language-version') ?? undefined;
    }
  }
  return { topBlocks, yaVersion, languageVersion };
}

function localName(el: Element) {
  return (el.localName || el.nodeName).toLowerCase();
}

function childElements(el: Element): Element[] {
  const out: Element[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n as Element);
  return out;
}

function firstBlock(el: Element): Element | null {
  for (const c of childElements(el)) {
    const t = localName(c);
    if (t === 'block') return c;
  }
  // shadow 만 있는 경우
  for (const c of childElements(el)) if (localName(c) === 'shadow') return c;
  return null;
}

function attrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) out[a.name] = a.value;
  return out;
}

function toNode(el: Element): BlockNode {
  const node: BlockNode = {
    type: el.getAttribute('type') ?? '',
    id: el.getAttribute('id') ?? '',
    disabled: el.getAttribute('disabled') === 'true' || el.getAttribute('enabled') === 'false',
    fields: {},
    mutation: {},
    mutationChildren: [],
    values: {},
    statements: {},
    next: null,
  };
  for (const c of childElements(el)) {
    const tag = localName(c);
    const name = c.getAttribute('name') ?? '';
    if (tag === 'field') node.fields[name] = c.textContent ?? '';
    else if (tag === 'mutation') {
      node.mutation = attrs(c);
      node.mutationChildren = childElements(c).map((m) => ({ tag: localName(m), attrs: attrs(m) }));
    } else if (tag === 'value') {
      const b = firstBlock(c);
      if (b) node.values[name] = toNode(b);
    } else if (tag === 'statement') {
      const b = firstBlock(c);
      node.statements[name] = b ? toNode(b) : null;
    } else if (tag === 'next') {
      const b = firstBlock(c);
      node.next = b ? toNode(b) : null;
    }
  }
  return node;
}

/** 문장 블록 체인을 배열로 */
export function chain(first: BlockNode | null | undefined): BlockNode[] {
  const out: BlockNode[] = [];
  for (let b = first ?? null; b; b = b.next) out.push(b);
  return out;
}

/** 하위 블록 전체를 깊이 우선으로 순회 */
export function walkBlocks(node: BlockNode, fn: (b: BlockNode) => void) {
  fn(node);
  for (const v of Object.values(node.values)) walkBlocks(v, fn);
  for (const s of Object.values(node.statements)) if (s) walkBlocks(s, fn);
  if (node.next) walkBlocks(node.next, fn);
}
