/**
 * 블록 인터프리터.
 * 실행 순서는 앱인벤터와 같다: 전역변수 초기화(위에서부터) → Screen.초기화 → 이후 이벤트.
 * 지원하지 않는 블록/컴포넌트/이벤트는 앱을 멈추지 않고 경고만 남긴다.
 * 값 규칙(비교, 숫자→글자, 오류 메시지)은 values.ts 참고.
 */
import { chain, parseBky, type BlockNode } from '../aia/bky';
import type { ComponentNode, ScreenData } from '../aia/types';
import { renderForm } from '../ui/preview';
import { eventParams } from '../blocks/componentInfo';
import { RtComponent, SUPPORTED_COMPONENTS, isSupportedProperty } from './components';
import {
  coerceArgs,
  coerceToNumber,
  coerceToString,
  displayRep,
  hexToColorInt,
  isList,
  stringToNumber,
  typeError,
  yailEqual,
  YailList,
  YailRuntimeError,
  type ComponentRef,
  type Value,
} from './values';

export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry {
  level: LogLevel;
  message: string;
}

export interface RuntimeOptions {
  screen: ScreenData;
  /** 폰 화면이 그려질 곳 */
  container: HTMLElement;
  assetUrl: (name: string) => string | undefined;
  /** 0 이상 1 미만 난수 (테스트에서 바꿔 끼움) */
  random?: () => number;
  onLog?: (e: LogEntry) => void;
  onTitle?: (title: string) => void;
  /** 이벤트 하나에서 실행할 수 있는 최대 블록 수 (무한 반복 방지) */
  maxSteps?: number;
}

class BreakSignal {}

/** 지역 이름 범위 (이벤트 매개변수, 지역변수, 반복 변수, 함수 인자) */
class Scope {
  vars = new Map<string, Value>();
  constructor(public parent?: Scope) {}
  find(name: string): Scope | undefined {
    for (let s: Scope | undefined = this; s; s = s.parent) if (s.vars.has(name)) return s;
    return undefined;
  }
  child(entries: [string, Value][] = []) {
    const c = new Scope(this);
    for (const [k, v] of entries) c.vars.set(k, v);
    return c;
  }
}

/** 수업용 블록 외에도 흔한 블록은 한국어 이름으로 경고 */
const BLOCK_NAMES: Record<string, string> = {
  text_split: '나누기',
  dictionaries_create_with: '사전 만들기',
  controls_openAnotherScreen: '다른 스크린 열기',
  controls_closeScreen: '스크린 닫기',
  controls_closeApplication: '앱 종료',
};

export class AppRuntime {
  readonly logs: LogEntry[] = [];
  readonly components = new Map<string, RtComponent>();
  readonly globals = new Map<string, Value>();
  private handlers = new Map<string, BlockNode>();
  private procedures = new Map<string, BlockNode>();
  private random: () => number;
  private steps = 0;
  private maxSteps: number;
  private warned = new Set<string>();
  private disposed = false;
  private listeners: (() => void)[] = [];
  private dialog: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  phone: HTMLElement | null = null;

  constructor(private opts: RuntimeOptions) {
    this.random = opts.random ?? Math.random;
    this.maxSteps = opts.maxSteps ?? 2_000_000;
  }

  // ───────────────────────── 시작 / 종료 ─────────────────────────

  start() {
    const { screen, container } = this.opts;
    container.innerHTML = '';
    if (!screen.form) {
      this.log('error', screen.scmError ?? '디자이너 정보를 읽지 못했습니다.');
      return;
    }
    const rendered = renderForm(screen.form, this.opts.assetUrl);
    container.appendChild(rendered.root);
    this.phone = container;
    this.opts.onTitle?.(screen.form.props.Title ?? screen.name);

    const hooks = {
      assetUrl: this.opts.assetUrl,
      fireEvent: (c: string, e: string, args?: Value[]) => this.dispatch(c, e, args ?? []),
      alert: (m: string) => this.toast(m),
      warn: (m: string) => this.warnOnce(m),
      setTitle: (t: string) => this.opts.onTitle?.(t),
    };
    const walk = (n: ComponentNode) => {
      if (!SUPPORTED_COMPONENTS.has(n.type)) this.warnOnce(`지원하지 않는 컴포넌트: ${n.name} (${n.type})`);
      this.components.set(n.name, new RtComponent(n, rendered.elements.get(n.name) ?? null, hooks));
      n.children.forEach(walk);
    };
    walk(screen.form);

    let doc;
    try {
      doc = parseBky(screen.bky);
    } catch (e) {
      this.log('error', (e as Error).message);
      return;
    }
    const tops = doc.topBlocks.filter((b) => !b.disabled);
    const globalsDecl: BlockNode[] = [];
    for (const b of tops) {
      if (b.type === 'global_declaration') globalsDecl.push(b);
      else if (b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn') this.procedures.set(b.fields.NAME, b);
      else if (b.type === 'component_event') this.registerHandler(b);
      // 어디에도 연결되지 않은 블록은 앱인벤터에서도 실행되지 않는다
    }

    // 1) 전역변수 초기화
    this.guard(() => {
      for (const g of globalsDecl) this.globals.set(g.fields.NAME, this.evalInput(g, 'VALUE', new Scope(), 'any'));
    });
    // 2) 화면 이벤트 연결
    this.bindDomEvents();
    // 3) Screen.초기화
    this.dispatch(screen.name, 'Initialize', []);
  }

  dispose() {
    this.disposed = true;
    for (const c of this.components.values()) c.dispose();
    for (const off of this.listeners) off();
    this.listeners = [];
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private registerHandler(b: BlockNode) {
    const m = b.mutation;
    const key = m.is_generic === 'true' ? `*${m.component_type}.${m.event_name}` : `${m.instance_name}.${m.event_name}`;
    if (this.handlers.has(key)) {
      this.warnOnce(`같은 이벤트 블록이 두 개 있습니다 (앱인벤터에서는 오류): ${key}`);
      return;
    }
    this.handlers.set(key, b);
    const type = m.component_type === 'Form' ? 'Form' : m.component_type;
    const supported: Record<string, string[]> = {
      Form: ['Initialize'],
      Button: ['Click', 'GotFocus', 'LostFocus', 'TouchDown', 'TouchUp', 'LongClick'],
      Clock: ['Timer'],
      TextBox: ['GotFocus', 'LostFocus'],
      PasswordTextBox: ['GotFocus', 'LostFocus'],
      CheckBox: ['Changed'],
    };
    if (!supported[type]?.includes(m.event_name)) this.warnOnce(`지원하지 않는 이벤트: ${m.is_generic === 'true' ? '모든 ' + type : m.instance_name}.${m.event_name}`);
  }

  private bindDomEvents() {
    for (const c of this.components.values()) {
      const el = c.el;
      if (!el) continue;
      const on = (ev: string, fn: (e: Event) => void) => {
        el.addEventListener(ev, fn);
        this.listeners.push(() => el.removeEventListener(ev, fn));
      };
      if (c.type === 'Button') {
        on('click', () => this.dispatch(c.name, 'Click', []));
        on('pointerdown', () => this.dispatch(c.name, 'TouchDown', []));
        on('pointerup', () => this.dispatch(c.name, 'TouchUp', []));
        on('focus', () => this.dispatch(c.name, 'GotFocus', []));
        on('blur', () => this.dispatch(c.name, 'LostFocus', []));
        let timer: ReturnType<typeof setTimeout> | null = null;
        on('pointerdown', () => (timer = setTimeout(() => this.dispatch(c.name, 'LongClick', []), 600)));
        on('pointerup', () => timer && clearTimeout(timer));
      } else if (c.type === 'TextBox' || c.type === 'PasswordTextBox') {
        on('focus', () => this.dispatch(c.name, 'GotFocus', []));
        on('blur', () => this.dispatch(c.name, 'LostFocus', []));
      } else if (c.type === 'CheckBox') {
        on('change', () => this.dispatch(c.name, 'Changed', []));
      }
    }
  }

  // ───────────────────────── 이벤트 실행 ─────────────────────────

  /** 이벤트 실행. 테스트·UI 에서도 직접 부를 수 있다 */
  dispatch(component: string, event: string, args: Value[]) {
    if (this.disposed) return;
    const comp = this.components.get(component);
    let handler = this.handlers.get(`${component}.${event}`);
    let scopeArgs = args;
    if (!handler && comp) {
      handler = this.handlers.get(`*${comp.type}.${event}`);
      if (handler) scopeArgs = [{ kind: 'component', name: component }, true, ...args];
    }
    if (!handler) return;
    const names = this.eventParamNames(handler);
    const scope = new Scope().child(names.map((n, i) => [n, scopeArgs[i] ?? null]));
    this.guard(() => this.execChain(handler.statements.DO ?? null, scope));
  }

  private eventParamNames(h: BlockNode): string[] {
    const type = h.mutation.component_type;
    const defaults = eventParams(type, h.mutation.event_name) ?? [];
    const out = defaults.map((d, i) => h.mutation['param_name' + i] ?? d);
    for (let i = out.length; h.mutation['param_name' + i]; i++) out.push(h.mutation['param_name' + i]);
    if (h.mutation.is_generic === 'true') out.unshift('component', 'notAlreadyHandled');
    return out;
  }

  /** 오류가 나면 앱인벤터처럼 대화상자를 띄우고 이벤트만 중단 */
  private guard(fn: () => void) {
    this.steps = 0;
    try {
      fn();
    } catch (e) {
      if (e instanceof BreakSignal) return;
      const msg = e instanceof YailRuntimeError ? e.message : `실행 중 오류: ${(e as Error).message}`;
      this.log('error', msg);
      this.showError(msg);
      if (!(e instanceof YailRuntimeError)) console.error(e);
    }
  }

  // ───────────────────────── 문장 ─────────────────────────

  private execChain(first: BlockNode | null, scope: Scope) {
    for (const b of chain(first)) {
      if (b.disabled) continue;
      this.exec(b, scope);
    }
  }

  private tick() {
    if (++this.steps > this.maxSteps) {
      throw new YailRuntimeError('블록을 너무 많이 실행했습니다. 끝나지 않는 반복이 있는지 확인하세요.');
    }
  }

  private exec(b: BlockNode, scope: Scope) {
    this.tick();
    switch (b.type) {
      case 'controls_if': {
        const elseifs = parseInt(b.mutation.elseif ?? '0', 10) || 0;
        for (let i = 0; i <= elseifs; i++) {
          if (this.evalInput(b, 'IF' + i, scope, 'boolean', 'if') === true) {
            this.execChain(b.statements['DO' + i] ?? null, scope);
            return;
          }
        }
        if (b.mutation.else) this.execChain(b.statements.ELSE ?? null, scope);
        return;
      }
      case 'controls_forRange': {
        const [from, to, step] = coerceArgs('for range', [this.evalInput(b, 'START', scope), this.evalInput(b, 'END', scope), this.evalInput(b, 'STEP', scope)], ['number']) as number[];
        if (step === 0) return;
        const v = b.fields.VAR;
        try {
          for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
            this.tick();
            this.execChain(b.statements.DO ?? null, scope.child([[v, i]]));
          }
        } catch (e) {
          if (!(e instanceof BreakSignal)) throw e;
        }
        return;
      }
      case 'controls_forEach': {
        const list = this.evalInput(b, 'LIST', scope);
        if (!isList(list)) throw typeError('for each', [list]);
        try {
          for (const item of [...list.items]) {
            this.tick();
            this.execChain(b.statements.DO ?? null, scope.child([[b.fields.VAR, item]]));
          }
        } catch (e) {
          if (!(e instanceof BreakSignal)) throw e;
        }
        return;
      }
      case 'controls_while': {
        try {
          while (this.evalInput(b, 'TEST', scope, 'boolean', 'while') === true) {
            this.tick();
            this.execChain(b.statements.DO ?? null, scope);
          }
        } catch (e) {
          if (!(e instanceof BreakSignal)) throw e;
        }
        return;
      }
      case 'controls_break':
        throw new BreakSignal();
      case 'controls_eval_but_ignore':
        this.evalInput(b, 'VALUE', scope);
        return;
      case 'lexical_variable_set':
        this.setVar(b, this.evalInput(b, 'VALUE', scope), scope);
        return;
      case 'local_declaration_statement': {
        const s = this.declareLocals(b, scope);
        this.execChain(b.statements.STACK ?? null, s);
        return;
      }
      case 'component_set_get':
        if (b.mutation.set_or_get === 'set') {
          this.setProperty(b, scope);
          return;
        }
        break;
      case 'component_method':
        this.callMethod(b, scope);
        return;
      case 'procedures_callnoreturn':
        this.callProcedure(b, scope);
        return;
      case 'lists_add_items': {
        const list = this.listArg(b, 'LIST', scope, 'add items to list');
        const n = parseInt(b.mutation.items ?? '1', 10) || 0;
        for (let i = 0; i < n; i++) list.items.push(this.evalInput(b, 'ITEM' + i, scope));
        return;
      }
      case 'lists_insert_item': {
        const list = this.listArg(b, 'LIST', scope, 'insert list item');
        const idx = this.numArg(b, 'INDEX', scope, 'insert list item');
        const item = this.evalInput(b, 'ITEM', scope);
        if (idx < 1 || idx > list.items.length + 1)
          throw new YailRuntimeError(`Insert list item: Attempt to insert item ${idx} into the list ${displayRep(list)}.  The minimum valid item number is 1.`);
        list.items.splice(idx - 1, 0, item);
        return;
      }
      case 'lists_replace_item': {
        const list = this.listArg(b, 'LIST', scope, 'replace list item');
        const idx = this.numArg(b, 'NUM', scope, 'replace list item');
        const item = this.evalInput(b, 'ITEM', scope);
        if (idx < 1) throw new YailRuntimeError(`Replace list item: Attempt to replace item number ${idx} of the list ${displayRep(list)}.  The minimum valid item number is 1.`);
        if (idx > list.items.length)
          throw new YailRuntimeError(`Replace list item: Attempt to replace item number ${idx} of a list of length ${list.items.length}: ${displayRep(list)}`);
        list.items[idx - 1] = item;
        return;
      }
      case 'lists_remove_item': {
        const list = this.listArg(b, 'LIST', scope, 'remove list item');
        const idx = this.numArg(b, 'INDEX', scope, 'remove list item');
        if (idx < 1) throw new YailRuntimeError(`Remove list item: Attempt to remove item ${idx} of the list ${displayRep(list)}.  The minimum valid item number is 1.`);
        if (idx > list.items.length)
          throw new YailRuntimeError(`Remove list item: Attempt to remove item ${idx} of a list of length ${list.items.length}: ${displayRep(list)}`);
        list.items.splice(idx - 1, 1);
        return;
      }
      case 'lists_append_list': {
        const a = this.listArg(b, 'LIST0', scope, 'append to list');
        const c = this.listArg(b, 'LIST1', scope, 'append to list');
        a.items.push(...c.items);
        return;
      }
    }
    // 값 블록이 문장 자리에 있거나 모르는 블록
    if (this.isKnownExpression(b.type)) {
      this.eval(b, scope);
      return;
    }
    this.unsupported(b);
  }

  // ───────────────────────── 값 ─────────────────────────

  /** 입력 소켓의 값. 비어 있으면 앱인벤터 코드 생성기의 기본값(숫자 0, 글자 "", 거짓, 빈 리스트) */
  private evalInput(b: BlockNode, name: string, scope: Scope, expect: 'any' | 'boolean' = 'any', op?: string): Value {
    const child = b.values[name];
    if (!child || child.disabled) {
      if (expect === 'boolean') return false;
      return defaultFor(b.type, name);
    }
    const v = this.eval(child, scope);
    if (expect === 'boolean' && typeof v !== 'boolean') throw typeError(op ?? b.type, [v]);
    return v;
  }

  private numArg(b: BlockNode, name: string, scope: Scope, op: string): number {
    return coerceArgs(op, [this.evalInput(b, name, scope)], ['number'])[0] as number;
  }
  private listArg(b: BlockNode, name: string, scope: Scope, op: string): YailList {
    const v = this.evalInput(b, name, scope);
    if (!isList(v)) throw typeError(op, [v]);
    return v;
  }
  /** items 개수만큼의 입력 값 (math_add 의 NUM0.., text_join 의 ADD0..) */
  private itemValues(b: BlockNode, prefix: string, def: number, scope: Scope): Value[] {
    const n = parseInt(b.mutation.items ?? String(def), 10);
    return Array.from({ length: Number.isFinite(n) ? n : def }, (_, i) => this.evalInput(b, prefix + i, scope));
  }

  private isKnownExpression(type: string) {
    return EXPRESSIONS.has(type);
  }

  eval(b: BlockNode, scope: Scope): Value {
    this.tick();
    const f = b.fields;
    switch (b.type) {
      // 논리
      case 'logic_boolean':
      case 'logic_false':
        return f.BOOL === 'TRUE';
      case 'logic_negate':
        return !this.evalInput(b, 'BOOL', scope, 'boolean', 'not');
      case 'logic_compare': {
        const eq = yailEqual(this.evalInput(b, 'A', scope), this.evalInput(b, 'B', scope));
        return f.OP === 'NEQ' ? !eq : eq;
      }
      case 'logic_operation':
      case 'logic_or': {
        const op = f.OP ?? (b.type === 'logic_or' ? 'OR' : 'AND');
        const n = parseInt(b.mutation.items ?? '2', 10);
        const count = Number.isFinite(n) ? n : 2;
        const name = op === 'AND' ? 'and' : 'or';
        for (let i = 0; i < count; i++) {
          const v = this.evalInput(b, i > 1 ? 'BOOL' + i : ['A', 'B'][i], scope);
          if (typeof v !== 'boolean') throw typeError(name, [v]);
          if (op === 'AND' && !v) return false;
          if (op === 'OR' && v) return true;
        }
        return op === 'AND';
      }

      // 수학
      case 'math_number': {
        const n = stringToNumber(f.NUM ?? '0');
        return n ?? 0;
      }
      case 'math_add':
      case 'math_multiply': {
        const add = b.type === 'math_add';
        const args = this.itemValues(b, 'NUM', 2, scope);
        const nums = coerceArgs(add ? '+' : '*', args, ['number']) as number[];
        return nums.reduce((a, c) => (add ? a + c : a * c), add ? 0 : 1);
      }
      case 'math_subtract':
      case 'math_division':
      case 'math_power': {
        const op = { math_subtract: '-', math_division: '/', math_power: 'expt' }[b.type]!;
        const [x, y] = coerceArgs(op, [this.evalInput(b, 'A', scope), this.evalInput(b, 'B', scope)], ['number']) as number[];
        if (b.type === 'math_subtract') return x - y;
        if (b.type === 'math_power') return Math.pow(x, y);
        if (y === 0 && x === 0) throw new YailRuntimeError('Trying to divide 0 by 0.  The result is not defined.', 'Division by zero');
        return x / y;
      }
      case 'math_compare': {
        const a = this.evalInput(b, 'A', scope);
        const c = this.evalInput(b, 'B', scope);
        if (f.OP === 'EQ') return yailEqual(a, c);
        if (f.OP === 'NEQ') return !yailEqual(a, c);
        const label = { LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[f.OP] ?? f.OP;
        const [x, y] = coerceArgs(label, [a, c], ['number']) as number[];
        return f.OP === 'LT' ? x < y : f.OP === 'LTE' ? x <= y : f.OP === 'GT' ? x > y : x >= y;
      }
      case 'math_random_int': {
        let [lo, hi] = coerceArgs('random integer', [this.evalInput(b, 'FROM', scope), this.evalInput(b, 'TO', scope)], ['number']) as number[];
        lo = Math.ceil(lo);
        hi = Math.floor(hi);
        if (lo > hi) [lo, hi] = [hi, lo];
        return lo + Math.floor(this.random() * (hi - lo + 1));
      }
      case 'math_random_float':
        return this.random();
      case 'math_single':
      case 'math_abs':
      case 'math_neg':
      case 'math_round':
      case 'math_ceiling':
      case 'math_floor': {
        const op = f.OP ?? { math_abs: 'ABS', math_neg: 'NEG', math_round: 'ROUND', math_ceiling: 'CEILING', math_floor: 'FLOOR' }[b.type as 'math_abs'];
        const name = { ROOT: 'sqrt', ABS: 'abs', NEG: 'negate', LN: 'log', EXP: 'exp', ROUND: 'round', CEILING: 'ceiling', FLOOR: 'floor' }[op as 'ROOT'] ?? op;
        const [x] = coerceArgs(name, [this.evalInput(b, 'NUM', scope)], ['number']) as number[];
        switch (op) {
          case 'ROOT':
            return Math.sqrt(x);
          case 'ABS':
            return Math.abs(x);
          case 'NEG':
            return -x;
          case 'LN':
            return Math.log(x);
          case 'EXP':
            return Math.exp(x);
          case 'ROUND': {
            // Scheme round: 0.5 는 짝수 쪽으로
            const r = Math.round(x);
            return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
          }
          case 'CEILING':
            return Math.ceil(x);
          case 'FLOOR':
            return Math.floor(x);
        }
        return this.unsupported(b);
      }
      case 'math_divide': {
        const name = { MODULO: 'modulo', REMAINDER: 'remainder', QUOTIENT: 'quotient' }[f.OP as 'MODULO'] ?? 'modulo';
        const [x, y] = coerceArgs(name, [this.evalInput(b, 'DIVIDEND', scope), this.evalInput(b, 'DIVISOR', scope)], ['number']) as number[];
        if (y === 0) throw new YailRuntimeError(`Trying to divide ${x} by 0.  The result is not defined.`, 'Division by zero');
        if (f.OP === 'REMAINDER') return x % y;
        if (f.OP === 'QUOTIENT') return Math.trunc(x / y);
        return ((x % y) + y) % y;
      }
      case 'math_on_list': {
        const args = this.itemValues(b, 'NUM', 2, scope);
        const nums = coerceArgs(f.OP === 'MAX' ? 'max' : 'min', args, ['number']) as number[];
        return f.OP === 'MAX' ? Math.max(...nums) : Math.min(...nums);
      }
      case 'math_is_a_number': {
        const v = this.evalInput(b, 'NUM', scope);
        if ((f.OP ?? 'NUMBER') === 'NUMBER') return coerceToNumber(v) != null;
        return this.unsupported(b);
      }

      // 텍스트
      case 'text':
        return f.TEXT ?? '';
      case 'text_join': {
        const args = this.itemValues(b, 'ADD', 2, scope);
        return (coerceArgs('join', args, ['text']) as string[]).join('');
      }
      case 'text_length':
        return (coerceArgs('length', [this.evalInput(b, 'VALUE', scope)], ['text'])[0] as string).length;
      case 'text_isEmpty':
        return (coerceArgs('is text empty?', [this.evalInput(b, 'VALUE', scope)], ['text'])[0] as string).length === 0;
      case 'text_compare': {
        const label = { LT: 'text<', GT: 'text>', EQUAL: 'text=', NEQ: 'not =' }[f.OP] ?? 'text=';
        const [x, y] = coerceArgs(label, [this.evalInput(b, 'TEXT1', scope), this.evalInput(b, 'TEXT2', scope)], ['text']) as string[];
        if (f.OP === 'LT') return x < y;
        if (f.OP === 'GT') return x > y;
        if (f.OP === 'NEQ') return x !== y;
        return x === y;
      }
      case 'text_trim':
        return (coerceArgs('trim', [this.evalInput(b, 'TEXT', scope)], ['text'])[0] as string).trim();
      case 'text_changeCase': {
        const s = coerceArgs(f.OP === 'DOWNCASE' ? 'downcase' : 'upcase', [this.evalInput(b, 'TEXT', scope)], ['text'])[0] as string;
        return f.OP === 'DOWNCASE' ? s.toLowerCase() : s.toUpperCase();
      }
      case 'text_starts_at': {
        const [t, p] = coerceArgs('starts at', [this.evalInput(b, 'TEXT', scope), this.evalInput(b, 'PIECE', scope)], ['text']) as string[];
        return t.indexOf(p) + 1;
      }
      case 'text_contains': {
        const mode = b.mutation.mode ?? f.OP ?? 'CONTAINS';
        if (mode !== 'CONTAINS') return this.unsupported(b);
        const [t, p] = coerceArgs('contains', [this.evalInput(b, 'TEXT', scope), this.evalInput(b, 'PIECE', scope)], ['text']) as string[];
        return t.includes(p);
      }
      case 'text_segment': {
        const [t, start, len] = coerceArgs('segment', [this.evalInput(b, 'TEXT', scope), this.evalInput(b, 'START', scope), this.evalInput(b, 'LENGTH', scope)], ['text', 'number', 'number']) as [string, number, number];
        if (start < 1 || start - 1 + len > t.length || len < 0)
          throw new YailRuntimeError(`Segment: Start is ${start} and length is ${len} but the text "${t}" has length ${t.length}`);
        return t.substr(start - 1, len);
      }
      case 'text_replace_all': {
        const [t, seg, rep] = coerceArgs('replace all', [this.evalInput(b, 'TEXT', scope), this.evalInput(b, 'SEGMENT', scope), this.evalInput(b, 'REPLACEMENT', scope)], ['text']) as string[];
        return seg === '' ? t : t.split(seg).join(rep);
      }
      case 'text_split_at_spaces': {
        const t = coerceArgs('split at spaces', [this.evalInput(b, 'TEXT', scope)], ['text'])[0] as string;
        return new YailList(t.trim() ? t.trim().split(/\s+/) : []);
      }
      case 'text_split': {
        if ((f.OP ?? 'SPLIT') !== 'SPLIT') return this.unsupported(b);
        const [t, at] = coerceArgs('split', [this.evalInput(b, 'TEXT', scope), this.evalInput(b, 'AT', scope)], ['text']) as string[];
        return new YailList(at === '' ? [...t] : t.split(at));
      }
      case 'text_reverse':
        return [...(coerceArgs('reverse', [this.evalInput(b, 'VALUE', scope)], ['text'])[0] as string)].reverse().join('');
      case 'text_is_string':
        return typeof this.evalInput(b, 'ITEM', scope) === 'string';

      // 리스트
      case 'lists_create_with': {
        return new YailList(this.itemValues(b, 'ADD', 2, scope));
      }
      case 'lists_select_item': {
        const list = this.listArg(b, 'LIST', scope, 'select list item');
        const raw = this.evalInput(b, 'NUM', scope);
        const idx = coerceToNumber(raw);
        if (idx == null) throw typeError('select list item', [list, raw]);
        if (idx < 1)
          throw new YailRuntimeError(`Select list item: Attempt to get item number ${coerceToString(idx)}, of the list ${displayRep(list)}.  The minimum valid item number is 1.`, 'List index smaller than 1');
        if (idx > list.items.length)
          throw new YailRuntimeError(`Select list item: Attempt to get item number ${coerceToString(idx)} of a list of length ${list.items.length}: ${displayRep(list)}`, 'Select list item: List index too large');
        return list.items[Math.floor(idx) - 1];
      }
      case 'lists_length':
        return this.listArg(b, 'LIST', scope, 'length of list').items.length;
      case 'lists_is_empty':
        return this.listArg(b, 'LIST', scope, 'is list empty?').items.length === 0;
      case 'lists_pick_random_item': {
        const list = this.listArg(b, 'LIST', scope, 'pick random item');
        if (!list.items.length) throw new YailRuntimeError('Pick random item: Attempt to pick a random element from an empty list', 'Invalid list operation');
        return list.items[Math.floor(this.random() * list.items.length)];
      }
      case 'lists_is_in': {
        const item = this.evalInput(b, 'ITEM', scope);
        return this.listArg(b, 'LIST', scope, 'is in list?').items.some((x) => yailEqual(x, item));
      }
      case 'lists_position_in': {
        const item = this.evalInput(b, 'ITEM', scope);
        return this.listArg(b, 'LIST', scope, 'index in list').items.findIndex((x) => yailEqual(x, item)) + 1;
      }
      case 'lists_copy': {
        const deep = (v: Value): Value => (isList(v) ? new YailList(v.items.map(deep)) : v);
        return deep(this.listArg(b, 'LIST', scope, 'copy list'));
      }
      case 'lists_is_list':
        return isList(this.evalInput(b, 'ITEM', scope));
      case 'lists_reverse':
        return new YailList([...this.listArg(b, 'LIST', scope, 'reverse list').items].reverse());
      case 'lists_join_with_separator': {
        const sep = coerceToString(this.evalInput(b, 'SEPARATOR', scope));
        return this.listArg(b, 'LIST', scope, 'join with separator').items.map(coerceToString).join(sep);
      }

      // 색
      case 'color_black':
      case 'color_white':
      case 'color_red':
      case 'color_pink':
      case 'color_orange':
      case 'color_yellow':
      case 'color_green':
      case 'color_cyan':
      case 'color_blue':
      case 'color_magenta':
      case 'color_light_gray':
      case 'color_gray':
      case 'color_dark_gray':
        return hexToColorInt(f.COLOR ?? '#000000');
      case 'color_make_color': {
        const list = this.listArg(b, 'COLORLIST', scope, 'make color');
        const [r, g, bl, a] = coerceArgs('make color', list.items, ['number']) as number[];
        return (((a ?? 255) & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (bl & 0xff);
      }

      // 변수
      case 'lexical_variable_get':
        return this.getVar(b, scope);
      case 'local_declaration_expression':
        return this.evalInput(b, 'RETURN', this.declareLocals(b, scope));

      // 제어
      case 'controls_choose':
        return this.evalInput(b, 'TEST', scope, 'boolean', 'if') ? this.evalInput(b, 'THENRETURN', scope) : this.evalInput(b, 'ELSERETURN', scope);
      case 'controls_do_then_return':
        this.execChain(b.statements.STM ?? null, scope);
        return this.evalInput(b, 'VALUE', scope);

      // 컴포넌트
      case 'component_set_get':
        return this.getProperty(b, scope);
      case 'component_component_block':
        return { kind: 'component', name: b.mutation.instance_name } satisfies ComponentRef;
      case 'component_method':
        return this.callMethod(b, scope) ?? null;
      case 'procedures_callreturn':
        return this.callProcedure(b, scope);
    }
    return this.unsupported(b);
  }

  // ───────────────────────── 변수 ─────────────────────────

  private getVar(b: BlockNode, scope: Scope): Value {
    const name = b.fields.VAR ?? '';
    const g = name.match(/^global (.*)$/);
    if (g) {
      if (!this.globals.has(g[1])) throw new YailRuntimeError(`The variable ${g[1]} is not bound in the current context`, 'Unbound Variable');
      return this.globals.get(g[1]) ?? null;
    }
    const ev = b.mutationChildren.find((m) => m.tag === 'eventparam')?.attrs.name;
    for (const n of [name, ev]) {
      const s = n != null ? scope.find(n) : undefined;
      if (s) return s.vars.get(n!) ?? null;
    }
    throw new YailRuntimeError(`The variable ${name} is not bound in the current context`, 'Unbound Variable');
  }

  private setVar(b: BlockNode, v: Value, scope: Scope) {
    const name = b.fields.VAR ?? '';
    const g = name.match(/^global (.*)$/);
    if (g) {
      this.globals.set(g[1], v);
      return;
    }
    const ev = b.mutationChildren.find((m) => m.tag === 'eventparam')?.attrs.name;
    for (const n of [name, ev]) {
      const s = n != null ? scope.find(n) : undefined;
      if (s) {
        s.vars.set(n!, v);
        return;
      }
    }
    throw new YailRuntimeError(`The variable ${name} is not bound in the current context`, 'Unbound Variable');
  }

  private declareLocals(b: BlockNode, scope: Scope): Scope {
    const names = b.mutationChildren.filter((m) => m.tag === 'localname').map((m) => m.attrs.name);
    // 초기값은 바깥 범위에서 계산 (앱인벤터의 let 과 같음)
    return scope.child(names.map((n, i) => [b.fields['VAR' + i] ?? n, this.evalInput(b, 'DECL' + i, scope)]));
  }

  // ───────────────────────── 컴포넌트 ─────────────────────────

  private target(b: BlockNode, scope: Scope): RtComponent {
    let name = b.mutation.instance_name;
    if (b.mutation.is_generic === 'true') {
      const ref = this.evalInput(b, 'COMPONENT', scope) as ComponentRef | null;
      if (!ref || typeof ref !== 'object' || (ref as ComponentRef).kind !== 'component') throw typeError(b.mutation.property_name ?? b.mutation.method_name ?? 'component', [ref as Value]);
      name = ref.name;
    }
    const c = this.components.get(name);
    if (!c) throw new YailRuntimeError(`컴포넌트를 찾을 수 없습니다: ${name}`);
    return c;
  }

  private getProperty(b: BlockNode, scope: Scope): Value {
    const c = this.target(b, scope);
    const prop = b.mutation.property_name;
    if (!isSupportedProperty(c.type, prop)) this.warnOnce(`지원하지 않는 속성: ${c.name}.${prop}`);
    return c.getProperty(prop);
  }

  private setProperty(b: BlockNode, scope: Scope) {
    const c = this.target(b, scope);
    const prop = b.mutation.property_name;
    const v = this.evalInput(b, 'VALUE', scope);
    if (!isSupportedProperty(c.type, prop)) this.warnOnce(`지원하지 않는 속성: ${c.name}.${prop} (값은 저장되지만 화면에는 반영되지 않습니다)`);
    c.setProperty(prop, v);
  }

  private callMethod(b: BlockNode, scope: Scope): Value | undefined {
    const c = this.target(b, scope);
    const args: Value[] = [];
    for (let i = 0; b.values['ARG' + i] || i < parseInt(b.mutation['data-argc'] ?? '0', 10); i++) args.push(this.evalInput(b, 'ARG' + i, scope));
    const r = c.callMethod(b.mutation.method_name, args);
    if (!r.ok) {
      this.warnOnce(`지원하지 않는 메서드: ${c.name}.${b.mutation.method_name}`);
      return null;
    }
    return r.value;
  }

  private callProcedure(b: BlockNode, scope: Scope): Value {
    const name = b.mutation.name ?? b.fields.PROCNAME;
    const def = this.procedures.get(name);
    if (!def) throw new YailRuntimeError(`함수를 찾을 수 없습니다: ${name}`);
    const params = def.mutationChildren.filter((m) => m.tag === 'arg').map((m) => m.attrs.name);
    const s = new Scope().child(params.map((p, i) => [p, this.evalInput(b, 'ARG' + i, scope)]));
    if (def.type === 'procedures_defreturn') return this.evalInput(def, 'RETURN', s);
    this.execChain(def.statements.STACK ?? null, s);
    return null;
  }

  // ───────────────────────── 경고 / 오류 표시 ─────────────────────────

  private unsupported(b: BlockNode): Value {
    const label = BLOCK_NAMES[b.type] ? `${BLOCK_NAMES[b.type]} (${b.type})` : b.type;
    this.warnOnce(`지원하지 않는 블록: ${label}`);
    return null;
  }

  private log(level: LogLevel, message: string) {
    const e = { level, message };
    this.logs.push(e);
    this.opts.onLog?.(e);
  }

  private warnOnce(message: string) {
    if (this.warned.has(message)) return;
    this.warned.add(message);
    this.log('warn', message);
  }

  /** 앱인벤터의 런타임 오류 대화상자와 비슷한 모양 */
  private showError(message: string) {
    const host = this.phone;
    if (!host) return;
    this.dialog?.remove();
    const d = document.createElement('div');
    d.className = 'rt-dialog';
    d.setAttribute('role', 'alertdialog');
    const box = document.createElement('div');
    box.className = 'rt-dialog-box';
    const t = document.createElement('div');
    t.className = 'rt-dialog-title';
    t.textContent = 'Runtime Error';
    const m = document.createElement('div');
    m.className = 'rt-dialog-msg';
    m.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Dismiss';
    btn.addEventListener('click', () => {
      d.remove();
      this.dialog = null;
    });
    box.append(t, m, btn);
    d.appendChild(box);
    host.appendChild(d);
    this.dialog = d;
  }

  /** Notifier.경고창보이기 */
  private toast(message: string) {
    const host = this.phone;
    if (!host) return;
    host.querySelector('.rt-toast')?.remove();
    const t = document.createElement('div');
    t.className = 'rt-toast';
    t.textContent = message;
    host.appendChild(t);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.remove(), 2500);
  }
}

/** 비어 있는 소켓의 기본값 (코드 생성기의 `|| 0`, `|| ""`, 빈 리스트) */
function defaultFor(type: string, input: string): Value {
  if (type.startsWith('math_') || input === 'NUM' || input === 'INDEX' || input === 'FROM' || input === 'TO' || input === 'START' || input === 'END' || input === 'STEP') return 0;
  if (type.startsWith('text') || input === 'TEXT' || input === 'SEPARATOR') return '';
  if (input === 'LIST' || input.startsWith('LIST')) return new YailList([]);
  return '';
}

const EXPRESSIONS = new Set([
  'logic_boolean', 'logic_false', 'logic_negate', 'logic_compare', 'logic_operation', 'logic_or',
  'math_number', 'math_add', 'math_multiply', 'math_subtract', 'math_division', 'math_power', 'math_compare',
  'math_random_int', 'math_random_float', 'math_single', 'math_abs', 'math_neg', 'math_round', 'math_ceiling', 'math_floor',
  'math_divide', 'math_on_list', 'math_is_a_number',
  'text', 'text_join', 'text_length', 'text_isEmpty', 'text_compare', 'text_trim', 'text_changeCase', 'text_starts_at',
  'text_contains', 'text_segment', 'text_replace_all', 'text_split_at_spaces', 'text_split', 'text_reverse', 'text_is_string',
  'lists_create_with', 'lists_select_item', 'lists_length', 'lists_is_empty', 'lists_pick_random_item', 'lists_is_in',
  'lists_position_in', 'lists_copy', 'lists_is_list', 'lists_reverse', 'lists_join_with_separator',
  'lexical_variable_get', 'local_declaration_expression', 'controls_choose', 'controls_do_then_return',
  'component_component_block', 'procedures_callreturn', 'color_make_color',
]);
