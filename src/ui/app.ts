import { parseAia } from '../aia/parse';
import type { AiaProject, ScreenData } from '../aia/types';
import { createBlocksView, type BlocksView } from '../blocks/workspace';
import { renderForm } from './preview';
import { renderComponentTree } from './tree';
import { componentTypeName } from '../blocks/msg';

interface Entry {
  id: number;
  fileName: string;
  status: 'loading' | 'ok' | 'error';
  project?: AiaProject;
  error?: string;
}

// 예제 파일은 빌드할 때 HTML 안에 data: URL 로 들어간다 (file:// 로 열어도 읽힘)
import oxUrl from '../samples/ox-quiz.aia?url';
import rpsUrl from '../samples/rock-paper-scissors.aia?url';
import fortuneUrl from '../samples/fortune.aia?url';

const SAMPLES = [
  ['O/X 퀴즈', oxUrl, 'ox-quiz.aia'],
  ['가위바위보', rpsUrl, 'rock-paper-scissors.aia'],
  ['오늘의 운세', fortuneUrl, 'fortune.aia'],
] as const;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function startApp() {
  document.documentElement.classList.add('app-ready');
  const entries: Entry[] = [];
  let seq = 0;
  let current: Entry | null = null;
  let currentScreen: string | null = null;
  let assetUrls = new Map<string, string>();
  let assetsOwner: AiaProject | null = null;
  let blocks: BlocksView | null = null;

  const fileList = $('#file-list');
  const treeBox = $('#component-tree');
  const phone = $('#phone-screen');
  const phoneTitle = $('#phone-title');
  const nonVisibleBox = $('#non-visible');
  const screenTabs = $('#screen-tabs');
  const blockInfo = $('#block-info');
  const projectInfo = $('#project-info');

  // ───── 파일 입력 ─────
  const drop = $('#dropzone');
  const input = $<HTMLInputElement>('#file-input');
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') input.click();
  });
  input.addEventListener('change', () => {
    if (input.files) addFiles([...input.files]);
    input.value = '';
  });
  for (const ev of ['dragenter', 'dragover'] as const)
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
  for (const ev of ['dragleave', 'drop'] as const) drop.addEventListener(ev, () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    addFiles(files);
  });
  // 창 아무 곳에 떨어뜨려도 브라우저가 파일을 열어 버리지 않게
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  const samplesBox = $('#samples');
  for (const [label, url, fileName] of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link-button';
    b.textContent = label;
    b.addEventListener('click', async () => {
      const res = await fetch(url);
      const blob = await res.blob();
      addFiles([new File([blob], fileName)]);
    });
    samplesBox.appendChild(b);
  }

  function addFiles(files: File[]) {
    const aias = files.filter((f) => /\.aia$/i.test(f.name) || f.type === 'application/zip');
    const skipped = files.length - aias.length;
    if (skipped) toast(`.aia 파일이 아닌 ${skipped}개는 건너뛰었습니다.`);
    let first: Entry | null = null;
    for (const f of aias) {
      const e: Entry = { id: ++seq, fileName: f.name, status: 'loading' };
      entries.push(e);
      first ??= e;
      f.arrayBuffer()
        .then((buf) => parseAia(buf, f.name))
        .then((p) => {
          e.status = 'ok';
          e.project = p;
        })
        .catch((err: Error) => {
          e.status = 'error';
          e.error = err.message;
        })
        .finally(() => {
          renderList();
          if (current === e) select(e);
        });
    }
    renderList();
    if (first) select(first);
  }

  function renderList() {
    fileList.innerHTML = '';
    if (!entries.length) {
      fileList.innerHTML = '<li class="empty">아직 연 파일이 없습니다.</li>';
      return;
    }
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = `file-item ${e.status}${e === current ? ' selected' : ''}`;
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'file-name';
      name.textContent = e.fileName;
      name.title = e.error ?? e.fileName;
      name.addEventListener('click', () => select(e));
      const st = document.createElement('span');
      st.className = 'file-status';
      st.textContent = e.status === 'loading' ? '읽는 중…' : e.status === 'error' ? '오류' : `${e.project!.screens.length}화면`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'file-remove';
      rm.textContent = '×';
      rm.title = '목록에서 빼기';
      rm.addEventListener('click', () => {
        entries.splice(entries.indexOf(e), 1);
        if (current === e) {
          current = null;
          const next = entries[0];
          if (next) select(next);
          else clearView();
        }
        renderList();
      });
      li.append(name, st, rm);
      fileList.appendChild(li);
    }
  }

  function clearView() {
    revokeAssets();
    treeBox.innerHTML = '<p class="hint">파일을 열면 컴포넌트 목록이 나옵니다.</p>';
    phone.innerHTML = '';
    phoneTitle.textContent = '';
    nonVisibleBox.textContent = '';
    screenTabs.innerHTML = '';
    blockInfo.textContent = '';
    projectInfo.innerHTML = '';
    blocks?.show(null);
  }

  function revokeAssets() {
    assetUrls = new Map();
    assetsOwner = null;
  }

  function select(e: Entry) {
    const changed = current !== e;
    current = e;
    renderList();
    if (e.status !== 'ok') {
      clearView();
      if (e.status === 'error') phone.innerHTML = `<div class="phone-message error">이 파일을 열 수 없습니다.<br>${escapeHtml(e.error ?? '')}</div>`;
      else phone.innerHTML = '<div class="phone-message">읽는 중…</div>';
      return;
    }
    const p = e.project!;
    // 읽기가 끝난 뒤 다시 select 될 수도 있으므로 "어느 프로젝트의 assets 인지"로 판단한다
    if (assetsOwner !== p || changed || !currentScreen || !p.screens.some((s) => s.name === currentScreen)) {
      assetsOwner = p;
      revokeAssets();
      // blob: URL 은 file:// 로 연 페이지에서 그림이 안 나오는 경우가 있어 data: URL 을 쓴다
      for (const [name, data] of p.assets) assetUrls.set(name, `data:${mimeOf(name)};base64,${toBase64(data)}`);
      currentScreen = p.screens[0]?.name ?? null;
    }
    renderScreenTabs(p);
    renderProjectInfo(p);
    const s = p.screens.find((x) => x.name === currentScreen);
    if (s) showScreen(s);
  }

  function renderScreenTabs(p: AiaProject) {
    screenTabs.innerHTML = '';
    for (const s of p.screens) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'tab';
      b.className = 'tab' + (s.name === currentScreen ? ' active' : '');
      b.textContent = s.name;
      b.addEventListener('click', () => {
        currentScreen = s.name;
        renderScreenTabs(p);
        showScreen(s);
      });
      screenTabs.appendChild(b);
    }
  }

  function showScreen(s: ScreenData) {
    // 컴포넌트 트리
    treeBox.innerHTML = '';
    treeBox.appendChild(renderComponentTree(s.form));
    // 폰 미리보기
    phone.innerHTML = '';
    nonVisibleBox.textContent = '';
    if (s.form) {
      phoneTitle.textContent = s.form.props.Title ?? s.name;
      const r = renderForm(s.form, (n) => assetUrls.get(n));
      phone.appendChild(r.root);
      if (r.nonVisible.length)
        nonVisibleBox.textContent = '보이지 않는 컴포넌트: ' + r.nonVisible.map((c) => `${c.name}(${componentTypeName(c.type)})`).join(', ');
    } else {
      phoneTitle.textContent = s.name;
      phone.innerHTML = `<div class="phone-message error">${escapeHtml(s.scmError ?? '디자이너 정보를 읽지 못했습니다.')}</div>`;
    }
    // 블록
    blocks ??= createBlocksView($('#blockly'));
    try {
      const { unknownTypes, blockCount } = blocks.show(s.bky);
      blockInfo.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = s.bky ? `블록 ${blockCount}개` : '이 화면에는 블록이 없습니다.';
      blockInfo.appendChild(span);
      if (unknownTypes.length) {
        const w = document.createElement('span');
        w.className = 'warn';
        w.textContent = ` ⚠ 모양을 모르는 블록(회색으로 표시): ${unknownTypes.join(', ')}`;
        blockInfo.appendChild(w);
      }
    } catch (err) {
      blockInfo.innerHTML = `<span class="warn">블록을 그리지 못했습니다: ${escapeHtml((err as Error).message)}</span>`;
      console.error(err);
    }
  }

  function renderProjectInfo(p: AiaProject) {
    const rows: [string, string][] = [
      ['파일', p.fileName],
      ['앱 이름', p.appName],
      ['화면', p.screens.map((s) => s.name).join(', ')],
      ['미디어(assets)', p.assets.size ? [...p.assets.keys()].join(', ') : '없음'],
      ['소스 경로', p.packagePath],
    ];
    projectInfo.innerHTML = '';
    const dl = document.createElement('dl');
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    projectInfo.appendChild(dl);
  }

  // ───── 블록 도구 ─────
  $('#btn-zoom-in').addEventListener('click', () => blocks?.zoom(1));
  $('#btn-zoom-out').addEventListener('click', () => blocks?.zoom(-1));
  $('#btn-fit').addEventListener('click', () => blocks?.zoomToFit());
  $('#btn-cleanup').addEventListener('click', () => blocks?.cleanUp());
  window.addEventListener('resize', () => blocks?.resize());

  // ───── 아래쪽 탭 ─────
  document.querySelectorAll<HTMLButtonElement>('#bottom-tabs .tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('#bottom-tabs .tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll<HTMLElement>('.bottom-panel').forEach((p) => (p.hidden = p.id !== t.dataset.panel));
    }),
  );

  renderList();
  clearView();
}

function mimeOf(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  return (
    {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
    } as Record<string, string>
  )[ext ?? ''] ?? 'application/octet-stream';
}

function toBase64(data: Uint8Array) {
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}
