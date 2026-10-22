/** 교사용·학생용 화면이 함께 쓰는 작은 도구 */
import type { AiaProject } from '../aia/types';

export function mimeOf(name: string) {
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

export function toBase64(data: Uint8Array) {
  let bin = '';
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function toast(msg: string) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

/** 프로젝트의 미디어 파일 → data: URL (blob: URL 은 file:// 로 연 페이지에서 그림이 안 나오는 경우가 있다) */
export function assetDataUrls(p: AiaProject): Map<string, string> {
  return new Map([...p.assets].map(([name, data]) => [name, `data:${mimeOf(name)};base64,${toBase64(data)}`]));
}
