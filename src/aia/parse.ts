import JSZip from 'jszip';
import type { AiaProject, ComponentNode, ScreenData } from './types';

export type AiaInput = ArrayBuffer | Uint8Array | Blob;

/** .aia(zip) 파일을 읽어 화면·컴포넌트·블록·assets 를 꺼낸다. 모든 처리는 메모리 안에서만 한다. */
export async function parseAia(data: AiaInput, fileName = 'project.aia'): Promise<AiaProject> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (e) {
    throw new Error(`zip 파일을 열 수 없습니다 (${fileName}). .aia 파일이 맞는지 확인하세요.`);
  }

  const propsFile = findFile(zip, (p) => /(^|\/)youngandroidproject\/project\.properties$/.test(p));
  const properties = propsFile ? parseProperties(await propsFile.async('string')) : {};

  // src/appinventor/ai_<계정>/<프로젝트>/<Screen>.scm|.bky
  const scm = new Map<string, string>();
  const bky = new Map<string, string>();
  let packagePath = '';
  const assets = new Map<string, Uint8Array>();
  const jobs: Promise<void>[] = [];

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const p = relPath.replace(/\\/g, '/');
    const m = p.match(/^(?:.*\/)?(src\/.+)\/([^/]+)\.(scm|bky)$/);
    if (m) {
      packagePath ||= m[1];
      const target = m[3] === 'scm' ? scm : bky;
      jobs.push(entry.async('string').then((s) => void target.set(m[2], s)));
      return;
    }
    const a = p.match(/^(?:.*\/)?assets\/(.+)$/);
    if (a && !a[1].startsWith('external_comps/')) {
      jobs.push(entry.async('uint8array').then((u) => void assets.set(a[1], u)));
    }
  });
  await Promise.all(jobs);

  if (scm.size === 0) {
    throw new Error(`화면(.scm) 파일이 없습니다 (${fileName}). App Inventor 프로젝트(.aia)가 아닌 것 같습니다.`);
  }

  const mainScreen = (properties.main ?? '').split('.').pop() || 'Screen1';
  const names = [...scm.keys()].sort((a, b) => {
    if (a === mainScreen) return -1;
    if (b === mainScreen) return 1;
    return a.localeCompare(b, undefined, { numeric: true });
  });

  const screens: ScreenData[] = names.map((name) => {
    const s: ScreenData = { name, form: null, bky: normalizeBky(bky.get(name)) };
    try {
      s.form = parseScm(scm.get(name)!);
    } catch (e) {
      s.scmError = (e as Error).message;
    }
    return s;
  });

  const appName = properties.aname || properties.name || fileName.replace(/\.aia$/i, '');
  return { fileName, properties, appName, packagePath, screens, assets };
}

function findFile(zip: JSZip, pred: (p: string) => boolean) {
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((p, e) => {
    if (!found && !e.dir && pred(p.replace(/\\/g, '/'))) found = e;
  });
  return found as JSZip.JSZipObject | null;
}

/** Java .properties 형식 (project.properties) */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || /^\s*[#!]/.test(line)) continue;
    const m = line.match(/^\s*([^=:\s]+)\s*[=:]\s?(.*)$/);
    if (m) out[m[1]] = m[2].replace(/\\(.)/g, '$1').trim();
  }
  return out;
}

/**
 * .scm 파싱. 형식:
 *   #|
 *   $JSON
 *   {"authURL":[...],"YaVersion":"...","Source":"Form","Properties":{ "$Name":"Screen1","$Type":"Form", ..., "$Components":[...] }}
 *   |#
 */
export function parseScm(text: string): ComponentNode {
  let body = text.trim();
  const start = body.indexOf('$JSON');
  if (start >= 0) body = body.slice(start + '$JSON'.length);
  body = body.replace(/^\s*#\|/, '').replace(/\|#\s*$/, '').trim();
  let json: { Properties?: Record<string, unknown> };
  try {
    json = JSON.parse(body);
  } catch {
    throw new Error('디자이너(.scm) JSON 을 읽을 수 없습니다.');
  }
  if (!json.Properties) throw new Error('디자이너(.scm)에 Properties 가 없습니다.');
  return toComponent(json.Properties);
}

function toComponent(raw: Record<string, unknown>): ComponentNode {
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('$') || k === 'Uuid') continue;
    props[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  const kids = Array.isArray(raw.$Components) ? (raw.$Components as Record<string, unknown>[]) : [];
  return {
    name: String(raw.$Name ?? ''),
    type: String(raw.$Type ?? ''),
    version: raw.$Version != null ? String(raw.$Version) : undefined,
    uuid: raw.Uuid != null ? String(raw.Uuid) : undefined,
    props,
    children: kids.map(toComponent),
  };
}

function normalizeBky(s: string | undefined): string | null {
  if (!s || !s.trim()) return null;
  return s;
}

/** 컴포넌트 트리를 깊이 우선으로 펼친다 (Screen 포함). */
export function flattenComponents(root: ComponentNode | null): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (c: ComponentNode) => {
    out.push(c);
    c.children.forEach(walk);
  };
  if (root) walk(root);
  return out;
}
