/**
 * App Inventor 값 규칙.
 * 근거: appinventor/buildserver/src/com/google/appinventor/buildserver/resources/runtime.scm
 *       appinventor/components/src/com/google/appinventor/components/runtime/util/YailNumberToString.java
 */

/** 리스트는 별도 클래스로 감싸서 문자열/숫자와 구분한다 (yail-list) */
export class YailList {
  constructor(public items: Value[]) {}
}

/** 컴포넌트 블록(component_component_block)의 값 */
export interface ComponentRef {
  kind: 'component';
  name: string;
}

export type Value = number | string | boolean | YailList | ComponentRef | null;

/** App Inventor 의 런타임 오류 (앱인벤터처럼 영어 메시지) */
export class YailRuntimeError extends Error {
  constructor(message: string, public errorType = 'Runtime Error') {
    super(message);
  }
}

export const isList = (v: Value): v is YailList => v instanceof YailList;
const isComponent = (v: Value): v is ComponentRef => typeof v === 'object' && v != null && !(v instanceof YailList) && v.kind === 'component';

/** padded-string->number: 앞뒤 공백을 지우고 Scheme 숫자로 읽을 수 있으면 숫자 */
export function stringToNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  // Scheme string->number 와 비슷하게: 정수, 소수, 지수 표기. ("1." ".5" 도 허용)
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** coerce-to-number. 바꿀 수 없으면 null */
export function coerceToNumber(v: Value): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return stringToNumber(v);
  return null;
}

/** appinventor-number->string (YailNumberToString.format) */
export function numberToString(n: number): string {
  if (n === Infinity) return '+infinity';
  if (n === -Infinity) return '-infinity';
  if (Number.isNaN(n)) return 'NaN';
  if (n === Math.round(n)) return String(Math.trunc(n)).replace(/^-0$/, '0');
  const mag = Math.abs(n);
  if (mag < 1e6 && mag > 1e-6) {
    // DecimalFormat("#####0.0####"): 소수점 아래 최소 1자리, 최대 5자리
    let s = n.toFixed(5).replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
    return s;
  }
  // DecimalFormat("0.####E0")
  const [m, e] = n.toExponential(4).split('e');
  const mant = m.replace(/\.?0+$/, '');
  return `${mant}E${parseInt(e, 10)}`;
}

/** coerce-to-string (ShowListsAsJson = 참 기준: 리스트는 ["a", "b"] 모양) */
export function coerceToString(v: Value): string {
  if (v == null) return '*nothing*';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numberToString(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (isList(v)) return '[' + v.items.map(jsonDisplay).join(', ') + ']';
  if (isComponent(v)) return v.name;
  return String(v);
}

/** get-json-display-representation */
export function jsonDisplay(v: Value): string {
  if (typeof v === 'string') return `"${v}"`;
  if (isList(v)) return '[' + v.items.map(jsonDisplay).join(', ') + ']';
  return coerceToString(v);
}

/** 오류 메시지 안에서 쓰는 표시 (get-display-representation, JSON 모드) */
export const displayRep = jsonDisplay;

/** yail-equal? : "9" 와 9 처럼 둘 다 숫자로 읽히면 숫자로 비교, 리스트는 항목별로 */
export function yailEqual(a: Value, b: Value): boolean {
  if (isList(a) || isList(b)) {
    if (!isList(a) || !isList(b)) return false;
    if (a.items.length !== b.items.length) return false;
    return a.items.every((x, i) => yailEqual(x, b.items[i]));
  }
  if (a === b) return true;
  if (isComponent(a) && isComponent(b)) return a.name === b.name;
  const na = asNumber(a);
  if (na == null) return false;
  const nb = asNumber(b);
  return nb != null && na === nb;
}

function asNumber(v: Value): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return stringToNumber(v);
  return null;
}

/** generate-runtime-type-error : "The operation + cannot accept the arguments: , [a], [1]" */
export function typeError(op: string, args: Value[]): YailRuntimeError {
  const shown = args.map((a) => `[${displayRep(a)}]`);
  let s = '';
  for (const x of shown) s += ', ' + x;
  return new YailRuntimeError(`The operation ${op} cannot accept the argument${args.length === 1 ? '' : 's'}: ${s}`, `Bad arguments to ${op}`);
}

export type ArgType = 'number' | 'text' | 'boolean' | 'list' | 'any';

/** call-yail-primitive 의 인자 변환. 하나라도 바꿀 수 없으면 타입 오류 */
export function coerceArgs(op: string, args: Value[], types: ArgType[]): Value[] {
  const out: Value[] = [];
  for (let i = 0; i < args.length; i++) {
    const t = types[i] ?? types[types.length - 1];
    const a = args[i];
    let c: Value | undefined;
    if (t === 'any') c = a;
    else if (t === 'number') c = coerceToNumber(a) ?? undefined;
    else if (t === 'text') c = a == null ? undefined : coerceToString(a);
    else if (t === 'boolean') c = typeof a === 'boolean' ? a : undefined;
    else if (t === 'list') c = isList(a) ? a : undefined;
    if (c === undefined) throw typeError(op, args);
    out.push(c);
  }
  return out;
}

// ───────── 색 ─────────
// 앱인벤터 색은 ARGB 32비트 정수(부호 있음). 디자이너 속성은 "&HAARRGGBB" 문자열.

export function hexToColorInt(hex: string): number {
  const h = hex.replace(/^#/, '');
  const rgb = parseInt(h.slice(0, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 0xff;
  return ((a << 24) | rgb) | 0;
}

export function designerColorToInt(v: string): number | null {
  const m = v.match(/^&H([0-9A-Fa-f]{8})$/);
  return m ? parseInt(m[1], 16) | 0 : null;
}

export function colorIntToCss(n: number): string {
  const u = n >>> 0;
  const a = (u >>> 24) & 0xff;
  const r = (u >>> 16) & 0xff;
  const g = (u >>> 8) & 0xff;
  const b = u & 0xff;
  return a === 0xff ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}
