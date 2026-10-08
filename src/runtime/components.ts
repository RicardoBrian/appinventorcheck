/**
 * 실행 중인 컴포넌트. 디자이너 속성으로 시작하고, 블록이 속성을 바꾸면 화면(HTML)도 바꾼다.
 * 지원: Screen(Form), Label, Button, TextBox, PasswordTextBox, Image, Horizontal/VerticalArrangement,
 *       Clock, Sound, Notifier(ShowAlert), CheckBox
 */
import type { ComponentNode } from '../aia/types';
import { sizeToCss } from '../ui/preview';
import { colorIntToCss, designerColorToInt, YailRuntimeError, type Value } from './values';

export const SUPPORTED_COMPONENTS = new Set([
  'Form', 'Label', 'Button', 'TextBox', 'PasswordTextBox', 'Image', 'HorizontalArrangement', 'VerticalArrangement',
  'HorizontalScrollArrangement', 'VerticalScrollArrangement', 'Clock', 'Sound', 'Notifier', 'CheckBox',
]);

const BOOLEAN_PROPS = new Set(['Enabled', 'Visible', 'TimerEnabled', 'TimerAlwaysFires', 'FontBold', 'FontItalic', 'Checked', 'MultiLine', 'ScalePictureToFit', 'HasMargins']);
const NUMBER_PROPS = new Set(['FontSize', 'Width', 'Height', 'TimerInterval', 'MinimumInterval', 'TextAlignment', 'Shape', 'AlignHorizontal', 'AlignVertical']);
const COLOR_PROPS = new Set(['BackgroundColor', 'TextColor']);

/** 디자이너에 값이 없을 때의 기본값 (각 컴포넌트 Java 소스의 @DesignerProperty defaultValue) */
const DEFAULTS: Record<string, Record<string, Value>> = {
  '*': { Visible: true, Enabled: true, Width: -1, Height: -1 },
  Form: { Title: '', BackgroundColor: -1 },
  Label: { Text: '', FontSize: 14, BackgroundColor: 0, TextColor: -16777216 },
  Button: { Text: '', FontSize: 14, Image: '', BackgroundColor: 0, TextColor: -16777216 },
  TextBox: { Text: '', Hint: '', FontSize: 14 },
  PasswordTextBox: { Text: '', Hint: '', FontSize: 14 },
  Image: { Picture: '' },
  Clock: { TimerInterval: 1000, TimerEnabled: true, TimerAlwaysFires: true },
  Sound: { Source: '', MinimumInterval: 500 },
  CheckBox: { Text: '', Checked: false },
};

/** 블록에서 쓸 수 있는 속성 (나머지는 "지원하지 않는 속성" 경고) */
const SUPPORTED_PROPS: Record<string, string[]> = {
  Form: ['Title', 'BackgroundColor', 'Width', 'Height'],
  Label: ['Text', 'Visible', 'BackgroundColor', 'FontSize', 'TextColor', 'Width', 'Height', 'FontBold', 'FontItalic'],
  Button: ['Text', 'Enabled', 'Visible', 'Image', 'BackgroundColor', 'FontSize', 'TextColor', 'Width', 'Height', 'FontBold', 'FontItalic'],
  TextBox: ['Text', 'Enabled', 'Visible', 'Hint', 'BackgroundColor', 'FontSize', 'TextColor', 'Width', 'Height'],
  PasswordTextBox: ['Text', 'Enabled', 'Visible', 'Hint', 'BackgroundColor', 'FontSize', 'TextColor', 'Width', 'Height'],
  Image: ['Picture', 'Visible', 'Width', 'Height'],
  HorizontalArrangement: ['Visible', 'BackgroundColor', 'Width', 'Height'],
  VerticalArrangement: ['Visible', 'BackgroundColor', 'Width', 'Height'],
  HorizontalScrollArrangement: ['Visible', 'BackgroundColor', 'Width', 'Height'],
  VerticalScrollArrangement: ['Visible', 'BackgroundColor', 'Width', 'Height'],
  Clock: ['TimerInterval', 'TimerEnabled', 'TimerAlwaysFires'],
  Sound: ['Source', 'MinimumInterval'],
  CheckBox: ['Text', 'Checked', 'Enabled', 'Visible', 'BackgroundColor', 'FontSize', 'TextColor'],
  Notifier: [],
};

export function isSupportedProperty(type: string, prop: string) {
  return SUPPORTED_PROPS[type]?.includes(prop) ?? false;
}

export function parseDesignerValue(prop: string, raw: string): Value {
  if (BOOLEAN_PROPS.has(prop)) return raw === 'True';
  if (COLOR_PROPS.has(prop)) return designerColorToInt(raw) ?? raw;
  if (NUMBER_PROPS.has(prop)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

export interface RuntimeHooks {
  assetUrl(name: string): string | undefined;
  /** Clock 타이머가 울릴 때 */
  fireEvent(component: string, event: string, args?: Value[]): void;
  alert(message: string): void;
  warn(message: string): void;
  setTitle(title: string): void;
}

export class RtComponent {
  props: Record<string, Value> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private audio: HTMLAudioElement | null = null;
  private lastPlay = 0;

  constructor(
    public node: ComponentNode,
    public el: HTMLElement | null,
    private hooks: RuntimeHooks,
  ) {
    Object.assign(this.props, DEFAULTS['*'], DEFAULTS[node.type] ?? {});
    for (const [k, v] of Object.entries(node.props)) this.props[k] = parseDesignerValue(k, v);
    if (node.type === 'Clock') this.updateTimer();
  }

  get name() {
    return this.node.name;
  }
  get type() {
    return this.node.type;
  }

  getProperty(prop: string): Value {
    if ((this.type === 'TextBox' || this.type === 'PasswordTextBox') && prop === 'Text' && this.el) return (this.el as HTMLInputElement).value;
    if (this.type === 'CheckBox' && prop === 'Checked' && this.el) return !!this.el.querySelector('input')?.checked;
    return this.props[prop] ?? null;
  }

  setProperty(prop: string, value: Value) {
    if (BOOLEAN_PROPS.has(prop) && typeof value !== 'boolean') {
      throw new YailRuntimeError(`Property setter was expecting a boolean value for ${this.name}.${prop} but got: ${String(value)}`, 'Bad property value');
    }
    if ((NUMBER_PROPS.has(prop) || COLOR_PROPS.has(prop)) && typeof value === 'string') {
      const n = Number(value.trim());
      if (value.trim() === '' || !Number.isFinite(n)) {
        throw new YailRuntimeError(`Property setter was expecting a number value for ${this.name}.${prop} but got: ${value}`, 'Bad property value');
      }
      value = n;
    }
    this.props[prop] = value;
    this.apply(prop);
  }

  /** 속성 값을 HTML 에 반영 */
  apply(prop: string) {
    const v = this.props[prop];
    const el = this.el;
    if (this.type === 'Clock') {
      if (prop === 'TimerEnabled' || prop === 'TimerInterval') this.updateTimer();
      return;
    }
    if (this.type === 'Sound') {
      if (prop === 'Source') this.audio = null;
      return;
    }
    if (!el) return;
    switch (prop) {
      case 'Text':
        if (this.type === 'TextBox' || this.type === 'PasswordTextBox') (el as HTMLInputElement).value = String(v ?? '');
        else if (this.type === 'CheckBox') {
          const t = el.lastChild;
          if (t && t.nodeType === 3) t.textContent = ' ' + String(v ?? '');
        } else el.textContent = String(v ?? '');
        break;
      case 'Hint':
        (el as HTMLInputElement).placeholder = String(v ?? '');
        break;
      case 'Enabled':
        if ('disabled' in el) (el as HTMLButtonElement).disabled = v === false;
        else el.querySelector('input')?.toggleAttribute('disabled', v === false);
        break;
      case 'Checked': {
        const cb = el.querySelector('input');
        if (cb) cb.checked = v === true;
        break;
      }
      case 'Visible':
        el.style.display = v === false ? 'none' : '';
        break;
      case 'BackgroundColor':
        if (typeof v === 'number') el.style.backgroundColor = v === 0 ? '' : colorIntToCss(v);
        break;
      case 'TextColor':
        if (typeof v === 'number') el.style.color = colorIntToCss(v);
        break;
      case 'FontSize':
        if (typeof v === 'number') el.style.fontSize = `${v}px`;
        break;
      case 'FontBold':
        el.style.fontWeight = v ? 'bold' : '';
        break;
      case 'FontItalic':
        el.style.fontStyle = v ? 'italic' : '';
        break;
      case 'Width':
      case 'Height': {
        const css = sizeToCss(String(v), prop === 'Width' ? 'w' : 'h');
        el.style[prop === 'Width' ? 'width' : 'height'] = css ?? '';
        break;
      }
      case 'Picture': {
        const img = el as HTMLImageElement;
        const url = v ? this.hooks.assetUrl(String(v)) : undefined;
        if (url) {
          img.src = url;
          img.classList.remove('empty');
        } else {
          img.removeAttribute('src');
          img.classList.add('empty');
          if (v) this.hooks.warn(`이미지 파일을 찾을 수 없습니다: ${String(v)} (${this.name}.사진)`);
        }
        break;
      }
      case 'Image': {
        const url = v ? this.hooks.assetUrl(String(v)) : undefined;
        el.style.backgroundImage = url ? `url("${url}")` : '';
        el.style.backgroundSize = url ? '100% 100%' : '';
        el.classList.toggle('has-image', !!url);
        break;
      }
      case 'Title': {
        this.hooks.setTitle(String(v ?? ''));
        break;
      }
    }
  }

  private updateTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const interval = Number(this.props.TimerInterval);
    if (this.props.TimerEnabled === true && interval > 0) {
      this.timer = setInterval(() => this.hooks.fireEvent(this.name, 'Timer'), interval);
    }
  }

  /** 메서드 호출. 지원하지 않으면 undefined 를 돌려준다 */
  callMethod(method: string, args: Value[]): { ok: boolean; value?: Value } {
    if (this.type === 'Sound') {
      if (method === 'Play') {
        const now = Date.now();
        if (now - this.lastPlay < Number(this.props.MinimumInterval ?? 500)) return { ok: true };
        this.lastPlay = now;
        const src = String(this.props.Source ?? '');
        const url = src ? this.hooks.assetUrl(src) : undefined;
        if (!url) {
          if (src) this.hooks.warn(`소리 파일을 찾을 수 없습니다: ${src}`);
          return { ok: true };
        }
        try {
          this.audio ??= new Audio(url);
          this.audio.currentTime = 0;
          void this.audio.play()?.catch(() => {});
        } catch {
          /* 브라우저가 소리를 못 내는 환경 */
        }
        return { ok: true };
      }
      if (method === 'Stop' || method === 'Pause') {
        try {
          this.audio?.pause();
          if (method === 'Stop' && this.audio) this.audio.currentTime = 0;
        } catch {
          /* 무시 */
        }
        return { ok: true };
      }
      if (method === 'Resume') {
        try {
          void this.audio?.play()?.catch(() => {});
        } catch {
          /* 무시 */
        }
        return { ok: true };
      }
      if (method === 'Vibrate') return { ok: true };
    }
    if (this.type === 'Notifier' && (method === 'ShowAlert' || method === 'LogInfo')) {
      if (method === 'ShowAlert') this.hooks.alert(String(args[0] ?? ''));
      return { ok: true };
    }
    if ((this.type === 'TextBox' || this.type === 'PasswordTextBox') && (method === 'HideKeyboard' || method === 'RequestFocus')) {
      if (method === 'RequestFocus') this.el?.focus();
      return { ok: true };
    }
    return { ok: false };
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.audio?.pause();
    } catch {
      /* 무시 */
    }
  }
}
