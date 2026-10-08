/**
 * 디자이너(.scm) 내용을 폰 화면 모양의 HTML 로 그린다.
 * 단계 1 에서는 정적인 미리보기, 단계 2 에서 실행기가 이 요소들을 조작한다.
 */
import type { ComponentNode } from '../aia/types';
import { toCssColour } from '../blocks/fields';

export const NON_VISIBLE = new Set([
  'Clock', 'Sound', 'Player', 'TinyDB', 'TinyWebDB', 'Notifier', 'TextToSpeech', 'SpeechRecognizer', 'AccelerometerSensor',
  'OrientationSensor', 'LocationSensor', 'Web', 'File', 'CloudDB', 'Camera', 'BarcodeScanner', 'ActivityStarter', 'Texting',
  'PhoneCall', 'Sharing', 'BluetoothClient', 'BluetoothServer', 'SoundRecorder', 'VideoPlayer_', 'GyroscopeSensor',
  'ProximitySensor', 'LightSensor', 'Pedometer', 'Spreadsheet', 'Translator', 'YandexTranslate', 'ImagePicker_',
]);

export interface RenderedForm {
  root: HTMLElement;
  /** 컴포넌트 이름 → HTML 요소 (Screen 은 root) */
  elements: Map<string, HTMLElement>;
  nonVisible: ComponentNode[];
}

/** 앱인벤터 크기 값: -1 자동, -2 부모 채우기, -1000-p 는 p%, 0 이상은 픽셀 */
export function sizeToCss(v: string | undefined, axis: 'w' | 'h'): string | undefined {
  if (v == null || v === '') return undefined;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n === -1) return undefined;
  if (n === -2) return axis === 'w' ? '100%' : undefined;
  if (n <= -1000) return `${-1000 - n}%`;
  if (n >= 0) return `${n}px`;
  return undefined;
}

const alignH = (v?: string) => ({ '1': 'flex-start', '2': 'flex-end', '3': 'center' })[v ?? '1'] ?? 'flex-start';
const alignV = (v?: string) => ({ '1': 'flex-start', '2': 'center', '3': 'flex-end' })[v ?? '1'] ?? 'flex-start';

export function renderForm(form: ComponentNode, assetUrl: (name: string) => string | undefined): RenderedForm {
  const elements = new Map<string, HTMLElement>();
  const nonVisible: ComponentNode[] = [];

  const root = document.createElement('div');
  root.className = 'ai-screen';
  root.dataset.name = form.name;
  elements.set(form.name, root);
  applyBox(root, form.props, assetUrl, 'BackgroundImage');
  root.style.alignItems = alignH(form.props.AlignHorizontal);
  root.style.justifyContent = alignV(form.props.AlignVertical);

  const build = (c: ComponentNode, parent: HTMLElement) => {
    if (NON_VISIBLE.has(c.type)) {
      nonVisible.push(c);
      return;
    }
    const el = createComponent(c, assetUrl);
    el.dataset.name = c.name;
    el.dataset.type = c.type;
    elements.set(c.name, el);
    parent.appendChild(el);
    for (const k of c.children) build(k, el);
  };
  for (const c of form.children) build(c, root);
  return { root, elements, nonVisible };
}

function applyBox(el: HTMLElement, p: Record<string, string>, assetUrl: (n: string) => string | undefined, bgImageProp?: string) {
  const w = sizeToCss(p.Width, 'w');
  const h = sizeToCss(p.Height, 'h');
  if (w) el.style.width = w;
  if (h) el.style.height = h;
  if (p.Height === '-2') el.style.flex = '1 1 auto';
  if (p.BackgroundColor && p.BackgroundColor !== '&H00000000') el.style.backgroundColor = toCssColour(p.BackgroundColor);
  if (bgImageProp && p[bgImageProp]) {
    const url = assetUrl(p[bgImageProp]);
    if (url) {
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = 'cover';
    }
  }
  if (p.Visible === 'False') el.style.display = 'none';
}

function applyText(el: HTMLElement, p: Record<string, string>) {
  if (p.FontSize) el.style.fontSize = `${parseFloat(p.FontSize)}px`;
  if (p.FontBold === 'True') el.style.fontWeight = 'bold';
  if (p.FontItalic === 'True') el.style.fontStyle = 'italic';
  if (p.TextColor && p.TextColor !== '&H00000000') el.style.color = toCssColour(p.TextColor);
  const ta = { '0': 'left', '1': 'center', '2': 'right' }[p.TextAlignment ?? ''];
  if (ta) el.style.textAlign = ta;
}

function createComponent(c: ComponentNode, assetUrl: (n: string) => string | undefined): HTMLElement {
  const p = c.props;
  let el: HTMLElement;
  switch (c.type) {
    case 'Label': {
      el = document.createElement('div');
      el.className = 'ai-label';
      el.textContent = p.Text ?? '';
      if (p.HasMargins === 'False') el.style.margin = '0';
      applyText(el, p);
      applyBox(el, p, assetUrl);
      break;
    }
    case 'Button':
    case 'ListPicker':
    case 'DatePicker':
    case 'TimePicker': {
      const b = document.createElement('button');
      b.className = 'ai-button';
      b.type = 'button';
      b.textContent = p.Text ?? (c.type === 'Button' ? '' : c.name);
      if (p.Enabled === 'False') b.disabled = true;
      applyText(b, p);
      applyBox(b, p, assetUrl);
      if (p.Image) {
        const url = assetUrl(p.Image);
        if (url) {
          b.style.backgroundImage = `url("${url}")`;
          b.style.backgroundSize = '100% 100%';
          b.classList.add('has-image');
        }
      }
      if (p.Shape === '1') b.style.borderRadius = '12px';
      if (p.Shape === '2') b.style.borderRadius = '0';
      if (p.Shape === '3') b.style.borderRadius = '50%';
      el = b;
      break;
    }
    case 'TextBox':
    case 'PasswordTextBox': {
      const multi = p.MultiLine === 'True';
      const t = document.createElement(multi ? 'textarea' : 'input') as HTMLInputElement;
      t.className = 'ai-textbox';
      if (!multi) t.type = c.type === 'PasswordTextBox' ? 'password' : 'text';
      t.value = p.Text ?? '';
      t.placeholder = p.Hint ?? '';
      if (p.Enabled === 'False') t.disabled = true;
      applyText(t, p);
      applyBox(t, p, assetUrl);
      el = t;
      break;
    }
    case 'Image': {
      const img = document.createElement('img');
      img.className = 'ai-image';
      img.alt = c.name;
      const url = p.Picture ? assetUrl(p.Picture) : undefined;
      if (url) img.src = url;
      else img.classList.add('empty');
      applyBox(img, p, assetUrl);
      if (p.ScalePictureToFit === 'True') img.style.objectFit = 'contain';
      el = img;
      break;
    }
    case 'HorizontalArrangement':
    case 'HorizontalScrollArrangement':
    case 'VerticalArrangement':
    case 'VerticalScrollArrangement': {
      el = document.createElement('div');
      const horiz = c.type.startsWith('Horizontal');
      el.className = `ai-arrangement ${horiz ? 'horizontal' : 'vertical'}`;
      if (horiz) {
        el.style.justifyContent = alignH(p.AlignHorizontal);
        el.style.alignItems = alignV(p.AlignVertical);
      } else {
        el.style.alignItems = alignH(p.AlignHorizontal);
        el.style.justifyContent = alignV(p.AlignVertical);
      }
      applyBox(el, p, assetUrl, 'Image');
      break;
    }
    case 'CheckBox':
    case 'Switch': {
      const lab = document.createElement('label');
      lab.className = 'ai-checkbox';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = (p.Checked ?? p.On) === 'True';
      lab.append(cb, document.createTextNode(' ' + (p.Text ?? '')));
      applyText(lab, p);
      applyBox(lab, p, assetUrl);
      el = lab;
      break;
    }
    default: {
      el = document.createElement('div');
      el.className = 'ai-unsupported';
      el.textContent = `[${c.type}] ${c.name}`;
      el.title = '이 컴포넌트는 미리보기를 지원하지 않습니다';
      applyBox(el, p, assetUrl);
    }
  }
  return el;
}
