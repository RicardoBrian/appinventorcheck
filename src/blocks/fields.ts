import * as Blockly from 'blockly/core';

/**
 * 값 하나만 보여 주는 드롭다운. 읽기 전용 뷰어라 메뉴는 열리지 않지만, 앱인벤터처럼 ▾ 모양이 보인다.
 * XML 에 어떤 값이 들어 있어도 거부하지 않는다 (학생 파일의 오래된/이상한 값도 그대로 표시).
 */
export class FieldFixedDropdown extends Blockly.FieldDropdown {
  private readonly display: (v: string) => string;
  private readonly initial: string;
  /** 값이 바뀔 때마다 호출 (XML 에서 값을 읽은 뒤 같은 블록의 다른 글자를 맞출 때 사용) */
  onValue?: (v: string) => void;

  constructor(value: string, display: (v: string) => string = (v) => v) {
    super([[value || ' ', value]]);
    this.display = display;
    this.initial = value;
    this.setValue(value);
  }

  /** 항상 현재 값 하나만 (Blockly 의 옵션 캐시를 쓰지 않는다) */
  override getOptions(): Blockly.MenuOption[] {
    const v = (this.getValue() as string | null) ?? this.initial;
    return [[this.display ? this.display(v) || ' ' : v || ' ', v]];
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return newValue == null ? null : String(newValue);
  }

  protected override doValueUpdate_(newValue: string) {
    super.doValueUpdate_(newValue);
    this.onValue?.(newValue);
  }
}

/** 고정된 선택지 표를 갖는 드롭다운. 표에 없는 값도 그대로 보여 준다. */
export function mapDropdown(options: [string, string][], initial?: string, onValue?: (v: string) => void): Blockly.Field {
  const map = new Map(options.map(([label, v]) => [v, label]));
  const f = new FieldFixedDropdown(initial ?? options[0]?.[1] ?? '', (v) => map.get(v) ?? v);
  f.onValue = onValue;
  return f as unknown as Blockly.Field;
}

/** FieldFixedDropdown 를 appendField 에 바로 넣을 수 있는 타입으로 */
export function fixedDropdown(value: string, display?: (v: string) => string): Blockly.Field {
  return new FieldFixedDropdown(value, display) as unknown as Blockly.Field;
}

export function swatch(hex: string): Blockly.Field {
  return new FieldSwatch(hex) as unknown as Blockly.Field;
}

/** 색 블록의 색 견본 (FieldColour 는 Blockly v11 코어에서 빠졌으므로 직접 그린다) */
export class FieldSwatch extends Blockly.Field<string> {
  override EDITABLE = false;
  override SERIALIZABLE = true;

  constructor(value: string) {
    super(value);
  }

  protected override doClassValidation_(newValue?: string): string | null {
    return newValue == null ? null : String(newValue);
  }

  protected override initView() {
    this.createBorderRect_();
  }

  protected override getText_() {
    return '';
  }

  protected override render_() {
    this.size_ = new Blockly.utils.Size(26, 18);
    if (this.borderRect_) {
      this.borderRect_.setAttribute('width', '26');
      this.borderRect_.setAttribute('height', '18');
      this.borderRect_.style.fill = toCssColour(this.getValue() ?? '#000000');
      this.borderRect_.style.fillOpacity = '1';
    }
  }
}

/** 앱인벤터 색 값(#RRGGBB 또는 &HAARRGGBB)을 CSS 색으로 */
export function toCssColour(v: string): string {
  const m = v.match(/^&H([0-9A-Fa-f]{2})([0-9A-Fa-f]{6})$/);
  if (m) return `#${m[2]}${m[1]}`;
  return v;
}

/** 이벤트 매개변수 이름 (앱인벤터의 주황색 작은 상자 대신 라벨로 표시) */
export function paramLabel(text: string) {
  return new Blockly.FieldLabel(text, 'aiParamLabel');
}
