/**
 * 화면에 보이는 기본 컴포넌트.
 * Form, Label, Button, TextBox, PasswordTextBox, Image, Horizontal/VerticalArrangement(+Scroll),
 * CheckBox, Switch, Slider, ListPicker, Spinner
 */
import { coerceToString, isList, YailList, type Value } from '../values';
import { applyCommon, BLACK, RtComponent, TEXT_PROPS, VISIBLE_PROPS, WHITE, type MethodDef, type PropType } from './base';

const alignH = (v: Value) => ({ 1: 'flex-start', 2: 'flex-end', 3: 'center' } as Record<number, string>)[Number(v)] ?? 'flex-start';
const alignV = (v: Value) => ({ 1: 'flex-start', 2: 'center', 3: 'flex-end' } as Record<number, string>)[Number(v)] ?? 'flex-start';

function setImage(c: RtComponent, name: Value, prop: string) {
  const url = name ? c.ctx.assetUrl(String(name)) : undefined;
  if (name && !url) c.ctx.warn(`그림 파일을 찾을 수 없습니다: ${String(name)} (${c.name}.${prop})`);
  return url;
}

// ───────────────────────── Screen ─────────────────────────
export class FormComp extends RtComponent {
  readonly events = ['Initialize', 'BackPressed', 'OtherScreenClosed'];
  readonly propTypes: Record<string, PropType> = {
    Title: 'text',
    BackgroundColor: 'color',
    BackgroundImage: 'text',
    AlignHorizontal: 'number',
    AlignVertical: 'number',
    Scrollable: 'boolean',
  };
  protected defaults() {
    return { Title: this.name, BackgroundColor: WHITE, AlignHorizontal: 1, AlignVertical: 1 };
  }
  protected createElement() {
    const el = document.createElement('div');
    el.className = 'ai-screen';
    this.childHost = el;
    return el;
  }
  apply(prop: string) {
    const el = this.el!;
    const v = this.props[prop];
    if (prop === 'Title') this.ctx.setTitle(coerceToString(v));
    else if (prop === 'AlignHorizontal') el.style.alignItems = alignH(v);
    else if (prop === 'AlignVertical') el.style.justifyContent = alignV(v);
    else if (prop === 'BackgroundImage') {
      const url = setImage(this, v, prop);
      el.style.backgroundImage = url ? `url("${url}")` : '';
      el.style.backgroundSize = 'cover';
    } else applyCommon(this, prop);
  }
}

// ───────────────────────── Label ─────────────────────────
export class LabelComp extends RtComponent {
  readonly events: string[] = [];
  readonly propTypes: Record<string, PropType> = { ...TEXT_PROPS, ...VISIBLE_PROPS, HasMargins: 'boolean', HTMLFormat: 'boolean' };
  protected defaults() {
    return { Text: '', FontSize: 14, TextColor: BLACK, BackgroundColor: 0, HasMargins: true, TextAlignment: 0 };
  }
  protected createElement() {
    const el = document.createElement('div');
    el.className = 'ai-label';
    return el;
  }
  apply(prop: string) {
    const v = this.props[prop];
    if (prop === 'Text') this.el!.textContent = coerceToString(v);
    else if (prop === 'HasMargins') this.el!.style.padding = v === false ? '0' : '';
    else applyCommon(this, prop);
  }
}

// ───────────────────────── Button (+ ListPicker 의 바탕) ─────────────────────────
export class ButtonComp extends RtComponent {
  readonly events: string[] = ['Click', 'LongClick', 'TouchDown', 'TouchUp', 'GotFocus', 'LostFocus'];
  readonly propTypes: Record<string, PropType> = { ...TEXT_PROPS, ...VISIBLE_PROPS, Enabled: 'boolean', Image: 'text', Shape: 'number' };
  protected defaults(): Record<string, Value> {
    return { Text: '', FontSize: 14, BackgroundColor: 0, TextColor: 0, Enabled: true, TextAlignment: 1, Image: '' };
  }
  protected createElement() {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ai-button';
    return b;
  }
  apply(prop: string) {
    const el = this.el!;
    const v = this.props[prop];
    if (prop === 'Text') el.textContent = coerceToString(v);
    else if (prop === 'Image') {
      const url = setImage(this, v, prop);
      el.style.backgroundImage = url ? `url("${url}")` : '';
      el.style.backgroundSize = url ? '100% 100%' : '';
      el.classList.toggle('has-image', !!url);
    } else if (prop === 'Shape') el.style.borderRadius = ({ 1: '12px', 2: '0', 3: '50%' } as Record<number, string>)[Number(v)] ?? '';
    else applyCommon(this, prop);
  }
  start() {
    const el = this.el!;
    this.on(el, 'click', () => this.onClick());
    this.on(el, 'focus', () => this.ctx.fire(this.name, 'GotFocus'));
    this.on(el, 'blur', () => this.ctx.fire(this.name, 'LostFocus'));
    let long: ReturnType<typeof setTimeout> | null = null;
    this.on(el, 'pointerdown', () => {
      this.ctx.fire(this.name, 'TouchDown');
      long = setTimeout(() => this.ctx.fire(this.name, 'LongClick'), 600);
    });
    this.on(el, 'pointerup', () => {
      if (long) clearTimeout(long);
      this.ctx.fire(this.name, 'TouchUp');
    });
  }
  protected onClick() {
    this.ctx.fire(this.name, 'Click');
  }
}

// ───────────────────────── ListPicker (목록 선택) ─────────────────────────
export class ListPickerComp extends ButtonComp {
  readonly events = ['BeforePicking', 'AfterPicking', 'TouchDown', 'TouchUp', 'GotFocus', 'LostFocus'];
  readonly propTypes: Record<string, PropType> = {
    ...TEXT_PROPS,
    ...VISIBLE_PROPS,
    Enabled: 'boolean',
    Image: 'text',
    Shape: 'number',
    Elements: 'list',
    ElementsFromString: 'text',
    Selection: 'text',
    SelectionIndex: 'number',
    Title: 'text',
    ShowFilterBar: 'boolean',
  };
  protected defaults(): Record<string, Value> {
    return { ...super.defaults(), Elements: new YailList([]), ElementsFromString: '', Selection: '', SelectionIndex: 0, Title: '' };
  }
  setProperty(prop: string, value: Value) {
    super.setProperty(prop, value);
    syncSelection(this, prop);
  }
  init() {
    super.init();
    syncSelection(this, 'ElementsFromString');
    syncSelection(this, 'Selection');
  }
  methods(): Record<string, MethodDef> {
    return { Open: { args: [], run: () => this.open() } };
  }
  protected onClick() {
    this.ctx.fire(this.name, 'BeforePicking');
    this.open();
  }
  private open() {
    const items = (this.props.Elements as YailList).items.map(coerceToString);
    const box = document.createElement('div');
    box.className = 'rt-picker';
    const title = document.createElement('div');
    title.className = 'rt-picker-title';
    title.textContent = coerceToString(this.props.Title ?? '') || this.name;
    const list = document.createElement('ul');
    let close = () => {};
    items.forEach((t, i) => {
      const li = document.createElement('li');
      li.textContent = t;
      li.addEventListener('click', () => {
        close();
        this.props.SelectionIndex = i + 1;
        this.props.Selection = (this.props.Elements as YailList).items[i] ?? t;
        this.ctx.fire(this.name, 'AfterPicking');
      });
      list.appendChild(li);
    });
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '취소';
    cancel.addEventListener('click', () => close());
    box.append(title, list, cancel);
    close = this.ctx.overlay(box);
  }
}

/** Elements / ElementsFromString / Selection / SelectionIndex 를 서로 맞춘다 (Picker, Spinner) */
function syncSelection(c: RtComponent, prop: string) {
  const p = c.props;
  if (prop === 'ElementsFromString') {
    const s = coerceToString(p.ElementsFromString ?? '');
    p.Elements = new YailList(s ? s.split(',').map((x) => x.trim()) : []);
  }
  const items = isList(p.Elements) ? p.Elements.items : [];
  if (prop === 'SelectionIndex') {
    const i = Math.floor(Number(p.SelectionIndex));
    if (i >= 1 && i <= items.length) p.Selection = items[i - 1];
    else {
      p.SelectionIndex = 0;
      p.Selection = '';
    }
  } else if (prop === 'Selection' || prop === 'Elements' || prop === 'ElementsFromString') {
    const i = items.findIndex((x) => coerceToString(x) === coerceToString(p.Selection ?? ''));
    p.SelectionIndex = i + 1;
  }
}

// ───────────────────────── Spinner (드롭다운) ─────────────────────────
export class SpinnerComp extends RtComponent {
  readonly events = ['AfterSelecting'];
  readonly propTypes: Record<string, PropType> = {
    ...VISIBLE_PROPS,
    Elements: 'list',
    ElementsFromString: 'text',
    Selection: 'text',
    SelectionIndex: 'number',
    Prompt: 'text',
    Enabled: 'boolean',
  };
  protected defaults() {
    return { Elements: new YailList([]), ElementsFromString: '', Selection: '', SelectionIndex: 0, Prompt: '', Enabled: true };
  }
  protected createElement() {
    const s = document.createElement('select');
    s.className = 'ai-spinner';
    return s;
  }
  init() {
    super.init();
    syncSelection(this, 'ElementsFromString');
    syncSelection(this, 'Selection');
    this.render();
  }
  setProperty(prop: string, value: Value) {
    super.setProperty(prop, value);
    syncSelection(this, prop);
    this.render();
  }
  private render() {
    const s = this.el as HTMLSelectElement | null;
    if (!s) return;
    const items = isList(this.props.Elements) ? this.props.Elements.items.map(coerceToString) : [];
    s.innerHTML = '';
    items.forEach((t, i) => s.add(new Option(t, String(i + 1))));
    s.value = String(this.props.SelectionIndex ?? 0);
  }
  apply(prop: string) {
    applyCommon(this, prop);
  }
  start() {
    this.on(this.el!, 'change', () => {
      const s = this.el as HTMLSelectElement;
      this.props.SelectionIndex = Number(s.value);
      syncSelection(this, 'SelectionIndex');
      this.ctx.fire(this.name, 'AfterSelecting', [this.props.Selection]);
    });
  }
  methods(): Record<string, MethodDef> {
    return { DisplayDropdown: { args: [], run: () => (this.el as HTMLSelectElement).focus() } };
  }
}

// ───────────────────────── TextBox / PasswordTextBox ─────────────────────────
export class TextBoxComp extends RtComponent {
  readonly events = ['GotFocus', 'LostFocus', 'TextChanged'];
  readonly propTypes: Record<string, PropType> = {
    ...TEXT_PROPS,
    ...VISIBLE_PROPS,
    Enabled: 'boolean',
    Hint: 'text',
    MultiLine: 'boolean',
    NumbersOnly: 'boolean',
    ReadOnly: 'boolean',
  };
  protected defaults() {
    return { Text: '', Hint: '', FontSize: 14, Enabled: true, TextAlignment: 0 };
  }
  protected createElement() {
    const multi = this.node.props.MultiLine === 'True';
    const t = document.createElement(multi ? 'textarea' : 'input') as HTMLInputElement;
    if (!multi) t.type = this.type === 'PasswordTextBox' ? 'password' : 'text';
    t.className = 'ai-textbox';
    return t;
  }
  getProperty(prop: string): Value {
    if (prop === 'Text') return (this.el as HTMLInputElement).value;
    return super.getProperty(prop);
  }
  apply(prop: string) {
    const t = this.el as HTMLInputElement;
    const v = this.props[prop];
    if (prop === 'Text') t.value = coerceToString(v);
    else if (prop === 'Hint') t.placeholder = coerceToString(v);
    else if (prop === 'ReadOnly') t.readOnly = v === true;
    else if (prop === 'NumbersOnly' && t.type !== 'password') t.inputMode = v ? 'decimal' : 'text';
    else applyCommon(this, prop);
  }
  start() {
    this.on(this.el!, 'focus', () => this.ctx.fire(this.name, 'GotFocus'));
    this.on(this.el!, 'blur', () => this.ctx.fire(this.name, 'LostFocus'));
    this.on(this.el!, 'input', () => this.ctx.fire(this.name, 'TextChanged'));
  }
  methods(): Record<string, MethodDef> {
    return {
      HideKeyboard: { args: [], run: () => (this.el as HTMLInputElement).blur() },
      RequestFocus: { args: [], run: () => (this.el as HTMLInputElement).focus() },
    };
  }
}

// ───────────────────────── Image ─────────────────────────
export class ImageComp extends RtComponent {
  readonly events = ['Click'];
  readonly propTypes: Record<string, PropType> = {
    ...VISIBLE_PROPS,
    Picture: 'text',
    ScalePictureToFit: 'boolean',
    Clickable: 'boolean',
    RotationAngle: 'number',
  };
  protected defaults() {
    return { Picture: '', Clickable: false, RotationAngle: 0 };
  }
  protected createElement() {
    const img = document.createElement('img');
    img.className = 'ai-image';
    img.alt = this.name;
    return img;
  }
  apply(prop: string) {
    const img = this.el as HTMLImageElement;
    const v = this.props[prop];
    if (prop === 'Picture') {
      const url = setImage(this, v, '사진');
      if (url) img.src = url;
      else img.removeAttribute('src');
      img.classList.toggle('empty', !url);
    } else if (prop === 'ScalePictureToFit') img.style.objectFit = v ? 'contain' : '';
    else if (prop === 'RotationAngle') img.style.transform = Number(v) ? `rotate(${-Number(v)}deg)` : '';
    else if (prop === 'Clickable') img.style.cursor = v ? 'pointer' : '';
    else applyCommon(this, prop);
  }
  start() {
    this.on(this.el!, 'click', () => {
      if (this.props.Clickable === true) this.ctx.fire(this.name, 'Click');
    });
  }
}

// ───────────────────────── 배치 ─────────────────────────
export class ArrangementComp extends RtComponent {
  readonly events: string[] = [];
  readonly propTypes: Record<string, PropType> = {
    ...VISIBLE_PROPS,
    AlignHorizontal: 'number',
    AlignVertical: 'number',
    BackgroundColor: 'color',
    Image: 'text',
  };
  protected defaults() {
    return { AlignHorizontal: 1, AlignVertical: 1, BackgroundColor: 0 };
  }
  private get horizontal() {
    return this.type.startsWith('Horizontal');
  }
  protected createElement() {
    const el = document.createElement('div');
    el.className = `ai-arrangement ${this.horizontal ? 'horizontal' : 'vertical'}${this.type.includes('Scroll') ? ' scroll' : ''}`;
    this.childHost = el;
    return el;
  }
  apply(prop: string) {
    const el = this.el!;
    const v = this.props[prop];
    if (prop === 'AlignHorizontal') el.style[this.horizontal ? 'justifyContent' : 'alignItems'] = alignH(v);
    else if (prop === 'AlignVertical') el.style[this.horizontal ? 'alignItems' : 'justifyContent'] = alignV(v);
    else if (prop === 'Image') {
      const url = setImage(this, v, prop);
      el.style.backgroundImage = url ? `url("${url}")` : '';
      el.style.backgroundSize = 'cover';
    } else applyCommon(this, prop);
  }
}

// ───────────────────────── CheckBox / Switch ─────────────────────────
export class ToggleComp extends RtComponent {
  readonly events = ['Changed', 'GotFocus', 'LostFocus'];
  get stateProp() {
    return this.type === 'Switch' ? 'On' : 'Checked';
  }
  readonly propTypes: Record<string, PropType> = { ...TEXT_PROPS, ...VISIBLE_PROPS, Enabled: 'boolean', Checked: 'boolean', On: 'boolean' };
  private input!: HTMLInputElement;
  private label!: HTMLSpanElement;
  protected defaults() {
    return { Text: '', FontSize: 14, Enabled: true, Checked: false, On: false, BackgroundColor: 0 };
  }
  protected createElement() {
    const lab = document.createElement('label');
    lab.className = this.type === 'Switch' ? 'ai-switch' : 'ai-checkbox';
    this.input = document.createElement('input');
    this.input.type = 'checkbox';
    this.label = document.createElement('span');
    if (this.type === 'Switch') lab.append(this.label, this.input);
    else lab.append(this.input, this.label);
    return lab;
  }
  getProperty(prop: string): Value {
    if (prop === this.stateProp) return this.input.checked;
    return super.getProperty(prop);
  }
  apply(prop: string) {
    const v = this.props[prop];
    if (prop === 'Text') this.label.textContent = coerceToString(v);
    else if (prop === this.stateProp) this.input.checked = v === true;
    else if (prop === 'Enabled') this.input.disabled = v === false;
    else if (prop !== 'Checked' && prop !== 'On') applyCommon(this, prop);
  }
  start() {
    this.on(this.input, 'change', () => {
      this.props[this.stateProp] = this.input.checked;
      this.ctx.fire(this.name, 'Changed');
    });
  }
}

// ───────────────────────── Slider ─────────────────────────
export class SliderComp extends RtComponent {
  readonly events = ['PositionChanged', 'TouchDown', 'TouchUp'];
  readonly propTypes: Record<string, PropType> = {
    ...VISIBLE_PROPS,
    MinValue: 'number',
    MaxValue: 'number',
    ThumbPosition: 'number',
    ThumbEnabled: 'boolean',
  };
  protected defaults() {
    // Component.SLIDER_MIN_VALUE = 10, SLIDER_MAX_VALUE = 50, SLIDER_THUMB_VALUE = 30
    return { MinValue: 10, MaxValue: 50, ThumbPosition: 30, ThumbEnabled: true };
  }
  protected createElement() {
    const r = document.createElement('input');
    r.type = 'range';
    r.className = 'ai-slider';
    r.step = 'any';
    return r;
  }
  apply(prop: string) {
    const r = this.el as HTMLInputElement;
    const v = this.props[prop];
    if (prop === 'MinValue' || prop === 'MaxValue' || prop === 'ThumbPosition') {
      const min = Number(this.props.MinValue);
      const max = Number(this.props.MaxValue);
      r.min = String(min);
      r.max = String(max);
      const pos = Math.min(Math.max(Number(this.props.ThumbPosition), Math.min(min, max)), Math.max(min, max));
      this.props.ThumbPosition = pos;
      r.value = String(pos);
    } else if (prop === 'ThumbEnabled') r.disabled = v === false;
    else applyCommon(this, prop);
  }
  setProperty(prop: string, value: Value) {
    const before = this.props.ThumbPosition;
    super.setProperty(prop, value);
    if (this.props.ThumbPosition !== before) this.ctx.fire(this.name, 'PositionChanged', [this.props.ThumbPosition]);
  }
  start() {
    const r = this.el as HTMLInputElement;
    this.on(r, 'input', () => {
      this.props.ThumbPosition = Number(r.value);
      this.ctx.fire(this.name, 'PositionChanged', [this.props.ThumbPosition]);
    });
    this.on(r, 'pointerdown', () => this.ctx.fire(this.name, 'TouchDown'));
    this.on(r, 'pointerup', () => this.ctx.fire(this.name, 'TouchUp'));
  }
}
