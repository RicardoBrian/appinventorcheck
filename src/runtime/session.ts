/**
 * 앱 하나의 실행 (스크린 여러 개).
 * 앱인벤터처럼 "다른 스크린 열기"는 지금 스크린 위에 새 스크린을 쌓고,
 * "스크린 닫기"는 위의 스크린을 닫고 아래 스크린에 OtherScreenClosed(스크린이름, 결과) 를 보낸다.
 */
import type { ScreenData } from '../aia/types';
import { AppRuntime, type LogEntry } from './interpreter';
import { YailRuntimeError, type Value } from './values';

export interface SessionOptions {
  screens: ScreenData[];
  container: HTMLElement;
  assetUrl: (name: string) => string | undefined;
  random?: () => number;
  storage?: Map<string, Map<string, Value>>;
  onLog?: (e: LogEntry) => void;
  onTitle?: (title: string) => void;
  /** 맨 위 스크린이 바뀔 때 (블록 보기 탭을 맞추는 데 쓴다) */
  onScreenChange?: (name: string) => void;
  /** 앱이 끝났을 때 (Screen1 닫기, 앱 종료) */
  onExit?: () => void;
}

export class AppSession {
  readonly stack: AppRuntime[] = [];
  private exited = false;

  constructor(private opts: SessionOptions) {}

  get top(): AppRuntime | undefined {
    return this.stack[this.stack.length - 1];
  }

  start(screenName?: string) {
    const first = screenName ? this.opts.screens.find((s) => s.name === screenName) : this.opts.screens[0];
    if (first) this.push(first, '');
  }

  private push(screen: ScreenData, startValue: Value) {
    const prev = this.top;
    if (prev?.root) prev.root.hidden = true;
    const rt = new AppRuntime({
      screen,
      container: this.opts.container,
      assetUrl: this.opts.assetUrl,
      random: this.opts.random,
      storage: this.opts.storage,
      startValue,
      onLog: (e) => this.opts.onLog?.({ ...e, message: this.stack.length > 1 || screen.name !== this.opts.screens[0]?.name ? `[${screen.name}] ${e.message}` : e.message }),
      onTitle: (t) => {
        if (this.top === rt) this.opts.onTitle?.(t);
      },
      openScreen: (name, start) => {
        const next = this.opts.screens.find((s) => s.name === name);
        if (!next) throw new YailRuntimeError(`Screen not found: ${name}`, 'Problem with application');
        // 이벤트 실행이 끝난 뒤에 화면을 바꾼다 (앱인벤터도 비동기로 연다)
        setTimeout(() => this.push(next, start), 0);
      },
      closeScreen: (result) => setTimeout(() => this.pop(rt, result), 0),
      closeApplication: () => setTimeout(() => this.exit(), 0),
    });
    this.stack.push(rt);
    this.opts.onScreenChange?.(screen.name);
    rt.start();
    this.opts.onTitle?.(rt.title || screen.form?.props.Title || screen.name);
  }

  private pop(rt: AppRuntime, result: Value) {
    if (this.top !== rt || this.exited) return;
    this.stack.pop();
    rt.dispose();
    const below = this.top;
    if (!below) {
      this.exit();
      return;
    }
    if (below.root) below.root.hidden = false;
    this.opts.onScreenChange?.(below.opts.screen.name);
    this.opts.onTitle?.(below.title);
    below.dispatch(below.opts.screen.name, 'OtherScreenClosed', [rt.opts.screen.name, result]);
  }

  /** 휴대폰 뒤로 버튼 */
  back() {
    const rt = this.top;
    if (!rt || rt.pressBack()) return;
    this.pop(rt, '');
  }

  private exit() {
    if (this.exited) return;
    this.exited = true;
    while (this.stack.length) this.stack.pop()!.dispose();
    this.opts.onExit?.();
  }

  dispose() {
    this.exited = true;
    while (this.stack.length) this.stack.pop()!.dispose();
  }
}
