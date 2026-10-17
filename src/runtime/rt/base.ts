/**
 * 실행 중인 컴포넌트의 공통 부분.
 * 각 컴포넌트는 자기 HTML 을 만들고, 속성(get/set)·메서드·이벤트를 앱인벤터 컴포넌트(Java 소스)와 같은 이름으로 제공한다.
 * 근거: appinventor/components/src/com/google/appinventor/components/runtime/*.java
 */
import type { ComponentNode } from '../../aia/types';
import { sizeToCss } from '../../ui/preview';
import {
  coerceArgs,
  coerceToNumber,
  coerceToString,
  colorIntToCss,
  designerColorToInt,
  isList,
  typeError,
  YailList,
  type ArgType,
  type ComponentRef,
  type Value,
} from '../values';

/** 속성 값의 종류. 블록에서 값을 넣을 때 이 종류로 바꾸고, 못 바꾸면 앱인벤터와 같은 타입 오류 */
export type PropType = 'boolean' | 'number' | 'color' | 'text' | 'list' | 'any' | 'component';

export interface DialogOptions {
  title?: string;
  message: string;
  buttons: string[];
  input?: 'text' | 'password';
}

/** 컴포넌트가 실행기에 부탁하는 일 */
export interface RtContext {
  assetUrl(name: string): string | undefined;
  fire(component: string, event: string, args?: Value[]): void;
  warn(message: string): void;
  info(message: string): void;
  toast(message: string): void;
  /** 폰 화면 위에 대화상자. 누른 버튼 번호와 입력한 글자를 돌려준다 */
  dialog(opts: DialogOptions, done: (button: number, text: string) => void): void;
  /** 폰 화면 전체를 덮는 화면 (목록 선택 등). 닫는 함수를 돌려준다 */
  overlay(el: HTMLElement): () => void;
  setTitle(title: string): void;
  component(name: string): RtComponent | undefined;
  random(): number;
  /** TinyDB 저장소 (다시 실행해도 유지) */
  storage(namespace: string): Map<string, Value>;
}

export interface MethodDef {
  args: ArgType[] | PropType[];
  /** 값을 돌려주면 값 블록 */
  run(args: Value[]): Value | void;
}


export function componentRef(name: string): ComponentRef {
  return { kind: 'component', name };
}

export abstract class RtComponent {
  props: Record<string, Value> = {};
  el: HTMLElement | null = null;
  /** 자식 컴포넌트가 들어갈 곳 (배치, 캔버스) */
  childHost: HTMLElement | null = null;
  protected cleanups: (() => void)[] = [];

  /** 이 컴포넌트가 처리하는 이벤트 이름 */
  abstract readonly events: string[];
  /** 블록에서 쓸 수 있는 속성과 그 종류 */
  abstract readonly propTypes: Record<string, PropType>;
  /** 디자이너 값이 없을 때의 기본값 (Java 의 @DesignerProperty defaultValue) */
  protected defaults(): Record<string, Value> {
    return {};
  }

  constructor(
    public node: ComponentNode,
    readonly ctx: RtContext,
  ) {}

  get name() {
    return this.node.name;
  }
  get type() {
    return this.node.type;
  }

  /** 디자이너 값으로 속성을 채우고 HTML 을 만든다 */
  init() {
    Object.assign(this.props, this.defaults());
    for (const [k, raw] of Object.entries(this.node.props)) this.props[k] = this.parseDesigner(k, raw);
    this.el = this.createElement();
    if (this.el) {
      this.el.dataset.name = this.name;
      this.el.dataset.type = this.type;
    }
    for (const p of Object.keys(this.props)) this.apply(p);
  }

  protected createElement(): HTMLElement | null {
    return null;
  }

  /** 모든 컴포넌트가 만들어지고 화면에 붙은 뒤 (크기 계산, 타이머 시작 등) */
  start() {}

  protected parseDesigner(prop: string, raw: string): Value {
    const t = this.propTypes[prop];
    if (t === 'boolean') return raw === 'True';
    if (t === 'color') return designerColorToInt(raw) ?? 0;
    if (t === 'number') {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    if (t === 'list') return new YailList(raw ? raw.split(',').map((s) => s.trim()) : []);
    return raw;
  }

  supports(prop: string) {
    return prop in this.propTypes;
  }

  getProperty(prop: string): Value {
    return this.props[prop] ?? null;
  }

  setProperty(prop: string, value: Value) {
    this.props[prop] = coerceProp(prop, this.propTypes[prop] ?? 'any', value);
    this.apply(prop);
  }

  /** 속성 값을 HTML 에 반영 */
  apply(prop: string) {
    applyCommon(this, prop);
  }

  methods(): Record<string, MethodDef> {
    return {};
  }

  /** 메서드 호출. 지원하지 않는 메서드면 ok=false */
  callMethod(name: string, args: Value[]): { ok: boolean; value?: Value } {
    const m = this.methods()[name];
    if (!m) return { ok: false };
    const types = m.args.map((t) => (t === 'color' ? 'number' : t === 'component' ? 'any' : t)) as ArgType[];
    const coerced = types.length ? coerceArgs(name, args.slice(0, types.length), types) : [];
    const v = m.run(coerced);
    return { ok: true, value: v === undefined ? null : v };
  }

  /** DOM 이벤트를 붙이고, dispose 때 떼어 낸다 */
  protected on(target: EventTarget, ev: string, fn: (e: Event) => void) {
    target.addEventListener(ev, fn);
    this.cleanups.push(() => target.removeEventListener(ev, fn));
  }

  dispose() {
    for (const c of this.cleanups) c();
    this.cleanups = [];
  }
}

/** set-and-coerce-property! 와 같은 변환. 못 바꾸면 "The operation Enabled cannot accept the argument: , [3]" */
export function coerceProp(prop: string, type: PropType, v: Value): Value {
  switch (type) {
    case 'boolean':
      if (typeof v !== 'boolean') throw typeError(prop, [v]);
      return v;
    case 'number':
    case 'color': {
      const n = coerceToNumber(v);
      if (n == null) throw typeError(prop, [v]);
      return n;
    }
    case 'text':
      if (v == null) throw typeError(prop, [v]);
      return coerceToString(v);
    case 'list':
      if (!isList(v)) throw typeError(prop, [v]);
      return v;
    default:
      return v;
  }
}

/** 여러 컴포넌트가 함께 쓰는 속성 (보이기, 크기, 색, 글꼴) */
export function applyCommon(c: RtComponent, prop: string) {
  const el = c.el;
  if (!el) return;
  const v = c.props[prop];
  switch (prop) {
    case 'Visible':
      el.style.display = v === false ? 'none' : '';
      break;
    case 'Width':
    case 'Height': {
      const css = sizeToCss(String(v), prop === 'Width' ? 'w' : 'h');
      el.style[prop === 'Width' ? 'width' : 'height'] = css ?? '';
      if (prop === 'Height') el.style.flex = v === -2 ? '1 1 auto' : '';
      break;
    }
    case 'BackgroundColor':
      if (typeof v === 'number') el.style.backgroundColor = v === 0 ? '' : colorIntToCss(v);
      break;
    case 'TextColor':
      if (typeof v === 'number' && v !== 0) el.style.color = colorIntToCss(v);
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
    case 'TextAlignment':
      el.style.textAlign = ({ 0: 'left', 1: 'center', 2: 'right' } as Record<number, string>)[Number(v)] ?? '';
      break;
    case 'Enabled':
      if ('disabled' in el) (el as HTMLButtonElement).disabled = v === false;
      break;
  }
}

/** 화면 크기 단위의 공통 속성 종류 */
export const VISIBLE_PROPS: Record<string, PropType> = { Visible: 'boolean', Width: 'number', Height: 'number' };
export const TEXT_PROPS: Record<string, PropType> = {
  Text: 'text',
  FontSize: 'number',
  FontBold: 'boolean',
  FontItalic: 'boolean',
  TextColor: 'color',
  TextAlignment: 'number',
  BackgroundColor: 'color',
};

export const BLACK = -16777216;
export const WHITE = -1;
