import type { ComponentNode } from '../aia/types';
import { componentTypeName } from '../blocks/msg';
import { NON_VISIBLE } from './preview';

/** 컴포넌트 트리 (예: Screen1 > 문제, 수평배치1 > O, X, 점수) */
export function renderComponentTree(root: ComponentNode | null): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'component-tree';
  if (!root) {
    wrap.textContent = '디자이너 정보를 읽지 못했습니다.';
    return wrap;
  }
  const ul = document.createElement('ul');
  ul.appendChild(node(root));
  wrap.appendChild(ul);
  return wrap;
}

function node(c: ComponentNode): HTMLLIElement {
  const li = document.createElement('li');
  const row = document.createElement('span');
  row.className = 'tree-row';
  const name = document.createElement('strong');
  name.textContent = c.name;
  const type = document.createElement('span');
  type.className = 'tree-type';
  type.textContent = componentTypeName(c.type);
  type.title = c.type;
  row.append(name, type);
  if (NON_VISIBLE.has(c.type)) {
    const nv = document.createElement('span');
    nv.className = 'tree-badge';
    nv.textContent = '보이지 않음';
    row.append(nv);
  } else if (c.props.Visible === 'False') {
    const nv = document.createElement('span');
    nv.className = 'tree-badge';
    nv.textContent = '숨김';
    row.append(nv);
  }
  const shown = Object.entries(c.props).filter(([k]) => ['Text', 'Picture', 'Image', 'TimerInterval', 'TimerEnabled', 'Enabled', 'Title'].includes(k));
  if (shown.length) row.title = shown.map(([k, v]) => `${k}: ${v}`).join('\n');
  li.appendChild(row);
  if (c.children.length) {
    const ul = document.createElement('ul');
    c.children.forEach((k) => ul.appendChild(node(k)));
    li.appendChild(ul);
  }
  return li;
}
