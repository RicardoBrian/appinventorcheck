import { parseAia } from '../aia/parse';
import type { AiaProject, ComponentNode, ScreenData } from '../aia/types';
import { createBlocksView, type BlocksView } from '../blocks/workspace';
import { componentTypeName } from '../blocks/msg';
import { AppRuntime, type LogEntry } from '../runtime/interpreter';
import { NON_VISIBLE } from './preview';
import { renderComponentTree } from './tree';
import { setupLayout } from './layout';

// 예제 파일은 빌드할 때 HTML 안에 data: URL 로 들어간다 (file:// 로 열어도 읽힘)
import oxUrl from '../samples/ox-quiz.aia?url';
import rpsUrl from '../samples/rock-paper-scissors.aia?url';
import fortuneUrl from '../samples/fortune.aia?url';

const SAMPLES = [
  ['O/X 퀴즈', oxUrl, 'ox-quiz.aia'],
  ['가위바위보', rpsUrl, 'rock-paper-scissors.aia'],
  ['오늘의 운세', fortuneUrl, 'fortune.aia'],
] as const;

interface Entry {
  id: number;
  fileName: string;
  status: 'loading' | 'ok' | 'error';
  project?: AiaProject;
  error?: string;
}

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
  let runtime: AppRuntime | null = null;
  let logs: LogEntry[] = [];

  const fileList = $('#file-list');
  const treeBox = $('#component-tree');
  const phone = $('#phone-screen');
  const phoneTitle = $('#phone-title');
  const nonVisibleBox = $('#non-visible');
  const screenTabs = $('#screen-tabs');
  const blockInfo = $('#block-info');
  const projectInfo = $('#project-info');
  const currentFile = $('#current-file');
  const runStatus = $('#run-status');
  const logList = $('#log-list');
  const logCount = $('#log-count');

  const layout = setupLayout(() => blocks?.resize());
  // 블록 칸 크기가 바뀌면 (경계선 끌기, 창 크기) Blockly 도 다시 맞춘다
  new ResizeObserver(() => blocks?.resize()).observe($('#blockly'));

  // ───── 파일 입력 ─────
  const drop = $('#dropzone');
  const input = $<HTMLInputElement>('#file-input');
  const openPicker = () => input.click();
  drop.addEventListener('click', openPicker);
  $('#btn-open').addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') openPicker();
  });
  input.addEventListener('change', () => {
    if (input.files) addFiles([...input.files]);
    input.value = '';
  });
  // 창 어디에 떨어뜨려도 받는다
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++dragDepth === 1) document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      document.body.classList.remove('dragging');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    addFiles([...(e.dataTransfer?.files ?? [])]);
  });

  const samplesBox = $('#samples');
  for (const [label, url, fileName] of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'link';
    b.textContent = label;
    b.addEventListener('click', async () => {
      const blob = await (await fetch(url)).blob();
      addFiles([new File([blob], fileName)]);
    });
    samplesBox.appendChild(b);
  }

  function addFiles(files: File[]) {
    const aias = files.filter((f) => /\.aia$/i.test(f.name));
    if (files.length > aias.length) toast(`.aia 가 아닌 파일 ${files.length - aias.length}개는 건너뛰었습니다.`);
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
    for (const e of entries) {
      const li = document.createElement('li');
      li.className = `file-item ${e.status}${e === current ? ' selected' : ''}`;
      const name = document.createElement('button');
      name.type = 'button';
      name.className = 'file-name';
      name.textContent = e.fileName.replace(/\.aia$/i, '');
      name.title = e.error ?? e.fileName;
      name.addEventListener('click', () => select(e));
      const st = document.createElement('span');
      st.className = 'file-status';
      st.textContent = e.status === 'loading' ? '…' : e.status === 'error' ? '오류' : '';
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'file-remove';
      rm.textContent = '×';
      rm.title = '목록에서 빼기';
      rm.addEventListener('click', () => {
        entries.splice(entries.indexOf(e), 1);
        if (current === e) {
          current = null;
          if (entries[0]) select(entries[0]);
          else clearView();
        }
        renderList();
      });
      li.append(name, st, rm);
      fileList.appendChild(li);
    }
    fileList.hidden = entries.length === 0;
  }

  function stopRuntime() {
    runtime?.dispose();
    runtime = null;
  }

  function clearView() {
    stopRuntime();
    assetUrls = new Map();
    assetsOwner = null;
    treeBox.innerHTML = '<p class="muted">파일을 열면 컴포넌트가 나옵니다.</p>';
    phone.innerHTML = '<div class="device-empty">.aia 파일을 열면<br>여기서 앱이 실행됩니다</div>';
    phoneTitle.textContent = '';
    nonVisibleBox.textContent = '';
    screenTabs.innerHTML = '<span class="muted screen-placeholder">블록</span>';
    blockInfo.textContent = '';
    projectInfo.innerHTML = '';
    currentFile.textContent = '';
    setLogs([]);
    blocks?.show(null);
  }

  function select(e: Entry) {
    const changed = current !== e;
    current = e;
    renderList();
    if (e.status !== 'ok') {
      clearView();
      currentFile.textContent = e.fileName;
      if (e.status === 'error') phone.innerHTML = `<div class="device-empty error">열 수 없는 파일입니다<br><small>${escapeHtml(e.error ?? '')}</small></div>`;
      else phone.innerHTML = '<div class="device-empty">읽는 중…</div>';
      return;
    }
    currentFile.textContent = e.fileName;
    const p = e.project!;
    // 읽기가 끝난 뒤 다시 select 될 수도 있으므로 "어느 프로젝트의 assets 인지"로 판단한다
    if (assetsOwner !== p || changed || !currentScreen || !p.screens.some((s) => s.name === currentScreen)) {
      assetsOwner = p;
      // blob: URL 은 file:// 로 연 페이지에서 그림이 안 나오는 경우가 있어 data: URL 을 쓴다
      assetUrls = new Map([...p.assets].map(([name, data]) => [name, `data:${mimeOf(name)};base64,${toBase64(data)}`]));
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
      b.className = 'screen-tab' + (s.name === currentScreen ? ' active' : '');
      b.textContent = s.name;
      b.addEventListener('click', () => {
        if (currentScreen === s.name) return;
        currentScreen = s.name;
        renderScreenTabs(p);
        showScreen(s);
      });
      screenTabs.appendChild(b);
    }
  }

  function showScreen(s: ScreenData) {
    treeBox.innerHTML = '';
    treeBox.appendChild(renderComponentTree(s.form));
    runScreen(s);
    blocks ??= createBlocksView($('#blockly'));
    try {
      const { unknownTypes, blockCount } = blocks.show(s.bky);
      blockInfo.textContent = s.bky ? `${blockCount}개` : '블록 없음';
      blockInfo.title = '';
      if (unknownTypes.length) {
        blockInfo.textContent += ` · 모르는 블록 ${unknownTypes.length}종`;
        blockInfo.title = unknownTypes.join(', ');
      }
    } catch (err) {
      blockInfo.textContent = '블록을 그리지 못했습니다';
      blockInfo.title = (err as Error).message;
      console.error(err);
    }
  }

  function runScreen(s: ScreenData) {
    stopRuntime();
    setLogs([]);
    const nv: string[] = [];
    const walk = (c: ComponentNode) => {
      if (NON_VISIBLE.has(c.type)) nv.push(`${c.name}(${componentTypeName(c.type)})`);
      c.children.forEach(walk);
    };
    if (s.form) walk(s.form);
    nonVisibleBox.textContent = nv.length ? '보이지 않는 컴포넌트: ' + nv.join(', ') : '';
    phoneTitle.textContent = s.form?.props.Title ?? s.name;
    runtime = new AppRuntime({
      screen: s,
      container: phone,
      assetUrl: (n) => assetUrls.get(n),
      onLog: (e) => setLogs([...logs, e]),
      onTitle: (t) => (phoneTitle.textContent = t),
    });
    runtime.start();
  }

  function setLogs(next: LogEntry[]) {
    logs = next;
    logList.innerHTML = '';
    if (!logs.length) logList.innerHTML = '<li class="muted">경고나 오류가 없습니다.</li>';
    for (const l of logs) {
      const li = document.createElement('li');
      li.className = `log ${l.level}`;
      const tag = document.createElement('span');
      tag.className = 'log-tag';
      tag.textContent = l.level === 'error' ? '오류' : l.level === 'warn' ? '경고' : '정보';
      const msg = document.createElement('span');
      msg.textContent = l.message;
      li.append(tag, msg);
      logList.appendChild(li);
    }
    const errors = logs.filter((l) => l.level === 'error').length;
    const warns = logs.filter((l) => l.level === 'warn').length;
    logCount.textContent = logs.length ? String(logs.length) : '';
    logCount.className = 'count' + (errors ? ' error' : warns ? ' warn' : '');
    runStatus.textContent = errors ? `오류 ${errors}` : warns ? `경고 ${warns}` : '';
    runStatus.className = 'run-status' + (errors ? ' error' : warns ? ' warn' : '');
  }

  runStatus.addEventListener('click', () => {
    if (!layout.isVisible('bottom')) layout.toggle('bottom', true);
    showBottomTab('panel-log');
  });

  $('#btn-restart').addEventListener('click', () => {
    const s = current?.project?.screens.find((x) => x.name === currentScreen);
    if (s) runScreen(s);
  });

  function renderProjectInfo(p: AiaProject) {
    const rows: [string, string][] = [
      ['파일', p.fileName],
      ['앱 이름', p.appName],
      ['화면', p.screens.map((s) => s.name).join(', ')],
      ['미디어', p.assets.size ? [...p.assets.keys()].join(', ') : '없음'],
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

  // ───── 아래 탭 ─────
  function showBottomTab(id: string) {
    document.querySelectorAll<HTMLElement>('#bottom-tabs .tab').forEach((x) => x.classList.toggle('active', x.dataset.panel === id));
    document.querySelectorAll<HTMLElement>('.bottom-panel').forEach((p) => (p.hidden = p.id !== id));
  }
  document.querySelectorAll<HTMLButtonElement>('#bottom-tabs .tab').forEach((t) => t.addEventListener('click', () => showBottomTab(t.dataset.panel!)));

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
