import ko from '../i18n/ai-ko.json';

const blockly = ko.blockly as Record<string, string>;
const components = ko.components as Record<string, string>;
const events = ko.events as Record<string, string>;
const methods = ko.methods as Record<string, string>;
const params = ko.params as Record<string, string>;
const properties = ko.properties as Record<string, string>;

/** 사용했지만 메시지 파일에 없던 키 (테스트에서 확인) */
export const missingKeys = new Set<string>();

/** Blockly.Msg.<key> 의 한국어 값 (없으면 영어, 그것도 없으면 키) */
export function M(key: string): string {
  const v = blockly[key];
  if (v == null) {
    missingKeys.add(key);
    return key;
  }
  return v;
}

/** 컴포넌트 타입의 한국어 이름 (예: Button → 버튼). Form 은 스크린으로 표시. */
export function componentTypeName(type: string): string {
  if (type === 'Form' || type === 'Screen') return '스크린';
  return components[type] ?? type;
}
export const eventName = (n: string) => events[n] ?? n;
export const methodName = (n: string) => methods[n] ?? n;
export const propertyName = (n: string) => properties[n] ?? n;
export const paramName = (n: string) => params[n] ?? n;

/** appinventor/blocklyeditor/src/blockColors.js, blocks/components.js 의 색 */
export const COLOUR = {
  CONTROL: '#B18E35',
  LOGIC: '#77AB41',
  MATH: '#3F71B5',
  TEXT: '#B32D5E',
  LIST: '#49A6D4',
  COLOR: '#7D7D7D',
  VARIABLE: '#D05F2D',
  PROCEDURE: '#7C5385',
  DICTIONARY: '#2D1799',
  MATRIX: '#008B8B',
  EVENT: '#B18E35',
  METHOD: '#7C5385',
  GET: '#439970',
  SET: '#266643',
  COMPONENT: '#439970',
  UNKNOWN: '#9E9E9E',
} as const;

/** lexical_variable_get/set 의 VAR 값 "global 이름" → "전역변수 이름" */
export function displayVarName(v: string): string {
  const m = v.match(/^global (.*)$/);
  return m ? `${M('LANG_VARIABLES_GLOBAL_PREFIX')} ${m[1]}` : v;
}
