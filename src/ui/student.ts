/**
 * 학생용 실행 화면: .aia 를 끌어다 놓으면 바로 실행. 블록 보기·예제·채점은 없다.
 */
import { parseAia } from '../aia/parse';
import type { AiaProject } from '../aia/types';
import type { LogEntry } from '../runtime/interpreter';
import { AppSession } from '../runtime/session';
import type { Value } from '../runtime/values';
import { assetDataUrls, escapeHtml, toast } from './util';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function startStudent() {
  document.documentElement.classList.add('app-ready');

  const phone = $('#phone-screen');
  const phoneTitle = $('#phone-title');
  const currentFile = $('#current-file');
  const logList = $('#log-list');
  const restart = $<HTMLButtonElement>('#btn-restart');
  const input = $<HTMLInputElement>('#file-input');
  const drop = $('#dropzone');

  let project: AiaProject | null = null;
  let session: AppSession | null = null;
  let assetUrls = new Map<string, string>();
  let storage = new Map<string, Map<string, Value>>();
  let logs: LogEntry[] = [];

  const empty = (html: string) => {
    phone.innerHTML = `<div class="device-empty">${html}</div>`;
  };
  empty('.aia 파일을 끌어다 놓으면<br>여기서 앱이 실행됩니다');
  renderLogs();

  // ── 파일 받기 ──
  const pick = () => input.click();
  drop.addEventListener('click', pick);
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') pick();
  });
  $('#btn-open').addEventListener('click', pick);
  input.addEventListener('change', () => {
    if (input.files?.[0]) open(input.files[0]);
    input.value = '';
  });
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++depth === 1) document.body.classList.add('dragging');
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      document.body.classList.remove('dragging');
    }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    const files = [...(e.dataTransfer?.files ?? [])];
    const aia = files.find((f) => /\.aia$/i.test(f.name));
    if (aia) open(aia);
    else if (files.length) toast('.aia 파일만 열 수 있습니다.');
  });

  async function open(file: File) {
    stop();
    currentFile.textContent = file.name;
    empty('읽는 중…');
    try {
      project = await parseAia(await file.arrayBuffer(), file.name);
    } catch (err) {
      project = null;
      restart.disabled = true;
      phoneTitle.textContent = '';
      empty(`<span class="error">열 수 없는 파일입니다</span><br><small>${escapeHtml((err as Error).message)}</small>`);
      return;
    }
    assetUrls = assetDataUrls(project);
    storage = new Map(); // 새 파일은 TinyDB 를 비운 상태로 시작
    restart.disabled = false;
    run();
  }

  function stop() {
    session?.dispose();
    session = null;
    phone.innerHTML = '';
  }

  function run() {
    if (!project) return;
    stop();
    logs = [];
    renderLogs();
    const first = project.screens[0];
    phoneTitle.textContent = first?.form?.props.Title ?? first?.name ?? '';
    session = new AppSession({
      screens: project.screens,
      container: phone,
      assetUrl: (n) => assetUrls.get(n),
      storage,
      onLog: (e) => {
        logs.push(e);
        renderLogs();
      },
      onTitle: (t) => (phoneTitle.textContent = t),
      onExit: () => {
        phoneTitle.textContent = '';
        empty('앱이 종료되었습니다<br><small>처음부터 다시 실행을 누르세요</small>');
      },
    });
    session.start();
  }

  restart.addEventListener('click', run);
  $('#btn-back').addEventListener('click', () => session?.back());

  function renderLogs() {
    logList.innerHTML = '';
    if (!logs.length) {
      logList.innerHTML = `<li class="muted">${project ? '문제없이 실행 중입니다.' : '아직 연 파일이 없습니다.'}</li>`;
      return;
    }
    for (const l of logs) {
      const li = document.createElement('li');
      li.className = `log ${l.level}`;
      const tag = document.createElement('span');
      tag.className = 'log-tag';
      tag.textContent = l.level === 'error' ? '오류' : l.level === 'warn' ? '확인 필요' : '정보';
      const msg = document.createElement('span');
      msg.textContent = l.message;
      li.append(tag, msg);
      logList.appendChild(li);
    }
  }
}
