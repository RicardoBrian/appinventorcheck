/**
 * 가운데 작업 영역: 파일 | 실행 | 블록 세 칸 + 아래 패널.
 * 각 칸은 끄고 켤 수 있고, 칸 사이 경계선을 끌어서 너비(아래 패널은 높이)를 바꾼다.
 * 설정은 이 브라우저의 localStorage 에 저장한다.
 */
export type PaneId = 'files' | 'run' | 'blocks' | 'bottom';
const ORDER: Exclude<PaneId, 'bottom'>[] = ['files', 'run', 'blocks'];

interface LayoutState {
  visible: Record<PaneId, boolean>;
  /** 고정 너비(px). 블록 칸은 남는 공간을 차지 */
  width: { files: number; run: number };
  bottom: number;
}

const KEY = 'aiachecker.layout.v1';
const DEFAULT: LayoutState = {
  visible: { files: true, run: true, blocks: true, bottom: true },
  width: { files: 240, run: 380 },
  bottom: 170,
};
const MIN_W = 160;
const MIN_BLOCKS = 240;
const MIN_H = 80;

function load(): LayoutState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && s.visible && s.width) return { ...DEFAULT, ...s, visible: { ...DEFAULT.visible, ...s.visible }, width: { ...DEFAULT.width, ...s.width } };
  } catch {
    /* 저장된 값이 없거나 깨짐 */
  }
  return structuredClone(DEFAULT);
}

export function setupLayout(onChange: () => void) {
  let state = load();
  const panes = document.getElementById('panes')!;
  const paneEl = (id: PaneId) => document.querySelector<HTMLElement>(`[data-pane="${id}"]`)!;
  const gutters = [...document.querySelectorAll<HTMLElement>('#panes > .gutter')];
  const gutterBottom = document.getElementById('gutter-bottom')!;
  const toggles = [...document.querySelectorAll<HTMLButtonElement>('[data-toggle]')];

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* 저장 불가(사생활 보호 모드 등) */
    }
  };

  /** 남는 공간을 차지할 칸: 블록이 보이면 블록, 아니면 마지막으로 보이는 칸 */
  const flexPane = () => {
    const vis = ORDER.filter((p) => state.visible[p]);
    return vis.includes('blocks') ? 'blocks' : vis[vis.length - 1];
  };

  function apply() {
    const vis = ORDER.filter((p) => state.visible[p]);
    const flex = flexPane();
    for (const p of ORDER) {
      const el = paneEl(p);
      el.hidden = !state.visible[p];
      if (p === flex) {
        el.style.flex = '1 1 0';
        el.style.width = '';
      } else if (p !== 'blocks') {
        el.style.flex = '0 0 auto';
        el.style.width = `${state.width[p]}px`;
      }
    }
    // 경계선: 보이는 칸 a, b 가 이웃하면 a 바로 뒤의 경계선만 보인다
    const shown = new Set(vis.slice(0, -1).map((a) => ORDER.indexOf(a)));
    gutters.forEach((g, i) => (g.hidden = !shown.has(i)));
    panes.classList.toggle('empty', vis.length === 0);
    const bottom = paneEl('bottom');
    bottom.hidden = !state.visible.bottom;
    gutterBottom.hidden = !state.visible.bottom;
    bottom.style.height = `${state.bottom}px`;
    for (const t of toggles) t.setAttribute('aria-pressed', String(state.visible[t.dataset.toggle as PaneId]));
    onChange();
  }

  function toggle(id: PaneId, force?: boolean) {
    const next = force ?? !state.visible[id];
    // 위쪽 세 칸이 모두 꺼지지는 않게
    if (!next && id !== 'bottom' && ORDER.filter((p) => state.visible[p] && p !== id).length === 0) return;
    state.visible[id] = next;
    save();
    apply();
  }

  for (const t of toggles) t.addEventListener('click', () => toggle(t.dataset.toggle as PaneId));
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const id = (['files', 'run', 'blocks', 'bottom'] as PaneId[])[Number(e.key) - 1];
    if (id) {
      e.preventDefault();
      toggle(id);
    }
  });
  document.getElementById('btn-reset-layout')!.addEventListener('click', () => {
    state = structuredClone(DEFAULT);
    save();
    apply();
  });

  // ── 세로 경계선 끌기 ──
  for (const g of gutters) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const i = Number(g.dataset.gutter);
      // 이 경계선의 왼쪽/오른쪽에서 가장 가까운 보이는 칸
      const left = [...ORDER.slice(0, i + 1)].reverse().find((p) => state.visible[p]);
      const right = ORDER.slice(i + 1).find((p) => state.visible[p]);
      if (!left || !right) return;
      const flex = flexPane();
      // 고정 너비 칸을 조절한다 (왼쪽이 고정이면 왼쪽, 아니면 오른쪽)
      const target = left !== flex ? left : right;
      if (target === 'blocks') return;
      const sign = target === left ? 1 : -1;
      const startX = e.clientX;
      const startW = state.width[target as 'files' | 'run'];
      const total = panes.clientWidth;
      const others = ORDER.filter((p) => state.visible[p] && p !== target && p !== flex).reduce((a, p) => a + state.width[p as 'files' | 'run'], 0);
      const max = total - others - MIN_BLOCKS;
      g.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing-x');
      const move = (ev: PointerEvent) => {
        const w = Math.round(startW + sign * (ev.clientX - startX));
        state.width[target as 'files' | 'run'] = Math.max(MIN_W, Math.min(max, w));
        apply();
      };
      const up = () => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        document.body.classList.remove('resizing-x');
        save();
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
    g.addEventListener('dblclick', () => {
      state.width = { ...DEFAULT.width };
      save();
      apply();
    });
  }

  // ── 아래 패널 높이 ──
  gutterBottom.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = state.bottom;
    const max = document.getElementById('workspace')!.clientHeight - 200;
    gutterBottom.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing-y');
    const move = (ev: PointerEvent) => {
      state.bottom = Math.max(MIN_H, Math.min(max, Math.round(startH - (ev.clientY - startY))));
      apply();
    };
    const up = () => {
      gutterBottom.removeEventListener('pointermove', move);
      gutterBottom.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing-y');
      save();
    };
    gutterBottom.addEventListener('pointermove', move);
    gutterBottom.addEventListener('pointerup', up);
  });

  apply();
  return { toggle, isVisible: (id: PaneId) => state.visible[id] };
}
