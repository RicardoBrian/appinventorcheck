/**
 * 화면에 보이지 않는 컴포넌트: Clock, Sound, Player, Notifier, TinyDB, TextToSpeech
 * 근거: components/runtime/Clock.java, Sound.java, Player.java, Notifier.java, TinyDB.java, TextToSpeech.java
 */
import { coerceToNumber, coerceToString, Instant, isList, typeError, YailList, type Value } from '../values';
import { RtComponent, type MethodDef, type PropType } from './base';

// ───────────────────────── Clock ─────────────────────────
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** Java SimpleDateFormat 의 자주 쓰는 패턴 (휴대폰이 한국어 설정일 때 모양) */
export function formatDate(ms: number, pattern: string): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const h12 = d.getHours() % 12 || 12;
  return pattern.replace(/'([^']*)'|y{1,4}|M{1,4}|d{1,2}|H{1,2}|h{1,2}|m{1,2}|s{1,2}|S{1,3}|a|E{1,4}/g, (t, quoted) => {
    if (quoted !== undefined) return quoted;
    switch (t[0]) {
      case 'y':
        return t.length === 2 ? p2(d.getFullYear() % 100) : String(d.getFullYear());
      case 'M':
        return t.length >= 3 ? `${d.getMonth() + 1}월` : t.length === 2 ? p2(d.getMonth() + 1) : String(d.getMonth() + 1);
      case 'd':
        return t.length === 2 ? p2(d.getDate()) : String(d.getDate());
      case 'H':
        return t.length === 2 ? p2(d.getHours()) : String(d.getHours());
      case 'h':
        return t.length === 2 ? p2(h12) : String(h12);
      case 'm':
        return t.length === 2 ? p2(d.getMinutes()) : String(d.getMinutes());
      case 's':
        return t.length === 2 ? p2(d.getSeconds()) : String(d.getSeconds());
      case 'S':
        return String(d.getMilliseconds()).padStart(t.length, '0');
      case 'a':
        return d.getHours() < 12 ? '오전' : '오후';
      case 'E':
        return t.length >= 4 ? `${WEEKDAYS[d.getDay()]}요일` : WEEKDAYS[d.getDay()];
    }
    return t;
  });
}

function instantArg(op: string, v: Value): Date {
  if (!(v instanceof Instant)) throw typeError(op, [v]);
  return new Date(v.ms);
}

export class ClockComp extends RtComponent {
  readonly events = ['Timer'];
  readonly propTypes: Record<string, PropType> = { TimerInterval: 'number', TimerEnabled: 'boolean', TimerAlwaysFires: 'boolean' };
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  protected defaults() {
    return { TimerInterval: 1000, TimerEnabled: true, TimerAlwaysFires: true };
  }
  start() {
    this.started = true;
    this.update();
  }
  apply(prop: string) {
    if (prop === 'TimerEnabled' || prop === 'TimerInterval') this.update();
  }
  private update() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.started) return;
    const iv = Number(this.props.TimerInterval);
    if (this.props.TimerEnabled === true && iv > 0) this.timer = setInterval(() => this.ctx.fire(this.name, 'Timer'), iv);
  }
  methods(): Record<string, MethodDef> {
    const I = 'any' as const;
    const n = 'number' as const;
    const part = (name: string, f: (d: Date) => Value): MethodDef => ({ args: [I], run: ([v]) => f(instantArg(name, v)) });
    const add = (name: string, f: (d: Date, k: number) => void): MethodDef => ({
      args: [I, n],
      run: ([v, k]) => {
        const d = instantArg(name, v);
        f(d, Number(k));
        return new Instant(d.getTime());
      },
    });
    return {
      Now: { args: [], run: () => new Instant(Date.now()) },
      SystemTime: { args: [], run: () => Date.now() },
      GetMillis: part('GetMillis', (d) => d.getTime()),
      Year: part('Year', (d) => d.getFullYear()),
      Month: part('Month', (d) => d.getMonth() + 1),
      MonthName: part('MonthName', (d) => `${d.getMonth() + 1}월`),
      DayOfMonth: part('DayOfMonth', (d) => d.getDate()),
      Weekday: part('Weekday', (d) => d.getDay() + 1),
      WeekdayName: part('WeekdayName', (d) => `${WEEKDAYS[d.getDay()]}요일`),
      Hour: part('Hour', (d) => d.getHours()),
      Minute: part('Minute', (d) => d.getMinutes()),
      Second: part('Second', (d) => d.getSeconds()),
      FormatTime: part('FormatTime', (d) => formatDate(d.getTime(), 'a h:mm:ss')),
      FormatDate: {
        args: [I, 'text'],
        run: ([v, p]) => formatDate(instantArg('FormatDate', v).getTime(), String(p) || 'yyyy. M. d.'),
      },
      FormatDateTime: {
        args: [I, 'text'],
        run: ([v, p]) => formatDate(instantArg('FormatDateTime', v).getTime(), String(p) || 'yyyy. M. d. a h:mm:ss'),
      },
      AddMillis: add('AddMillis', (d, k) => d.setTime(d.getTime() + k)),
      AddDuration: add('AddDuration', (d, k) => d.setTime(d.getTime() + k)),
      AddSeconds: add('AddSeconds', (d, k) => d.setSeconds(d.getSeconds() + k)),
      AddMinutes: add('AddMinutes', (d, k) => d.setMinutes(d.getMinutes() + k)),
      AddHours: add('AddHours', (d, k) => d.setHours(d.getHours() + k)),
      AddDays: add('AddDays', (d, k) => d.setDate(d.getDate() + k)),
      AddWeeks: add('AddWeeks', (d, k) => d.setDate(d.getDate() + 7 * k)),
      AddMonths: add('AddMonths', (d, k) => d.setMonth(d.getMonth() + k)),
      AddYears: add('AddYears', (d, k) => d.setFullYear(d.getFullYear() + k)),
      Duration: { args: [I, I], run: ([a, b]) => instantArg('Duration', b).getTime() - instantArg('Duration', a).getTime() },
      DurationToSeconds: { args: [n], run: ([ms]) => Math.floor(Number(ms) / 1000) },
      DurationToMinutes: { args: [n], run: ([ms]) => Math.floor(Number(ms) / 60000) },
      DurationToHours: { args: [n], run: ([ms]) => Math.floor(Number(ms) / 3600000) },
      DurationToDays: { args: [n], run: ([ms]) => Math.floor(Number(ms) / 86400000) },
      MakeInstantFromMillis: { args: [n], run: ([ms]) => new Instant(Number(ms)) },
      MakeDate: { args: [n, n, n], run: ([y, m, d]) => new Instant(new Date(Number(y), Number(m) - 1, Number(d)).getTime()) },
      MakeTime: {
        args: [n, n, n],
        run: ([h, m, s]) => {
          const d = new Date();
          d.setHours(Number(h), Number(m), Number(s), 0);
          return new Instant(d.getTime());
        },
      },
      MakeInstantFromParts: {
        args: [n, n, n, n, n, n],
        run: ([y, mo, d, h, mi, s]) => new Instant(new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime()),
      },
      MakeInstant: {
        args: ['text'],
        run: ([t]) => {
          const ms = Date.parse(String(t).replace(/\//g, '-'));
          if (Number.isNaN(ms)) throw typeError('MakeInstant', [t]);
          return new Instant(ms);
        },
      },
    };
  }
  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    super.dispose();
  }
}

// ───────────────────────── Sound / Player ─────────────────────────
class AudioBase extends RtComponent {
  readonly events: string[] = [];
  readonly propTypes: Record<string, PropType> = { Source: 'text', MinimumInterval: 'number', Loop: 'boolean', Volume: 'number' };
  protected audio: HTMLAudioElement | null = null;
  protected defaults(): Record<string, Value> {
    return { Source: '', MinimumInterval: 500, Loop: false, Volume: 50 };
  }
  apply(prop: string) {
    if (prop === 'Source') {
      try {
        this.audio?.pause();
      } catch {
        /* 무시 */
      }
      this.audio = null;
    }
    if (this.audio && (prop === 'Loop' || prop === 'Volume')) this.configure(this.audio);
  }
  protected configure(a: HTMLAudioElement) {
    a.loop = this.props.Loop === true;
    a.volume = Math.min(1, Math.max(0, Number(this.props.Volume) / 100));
  }
  protected getAudio(): HTMLAudioElement | null {
    const src = coerceToString(this.props.Source ?? '');
    if (!src) return null;
    const url = this.ctx.assetUrl(src);
    if (!url) {
      this.ctx.warn(`소리 파일을 찾을 수 없습니다: ${src} (${this.name})`);
      return null;
    }
    if (!this.audio) {
      try {
        this.audio = new Audio(url);
        this.configure(this.audio);
        this.audio.addEventListener('ended', () => this.ctx.fire(this.name, 'Completed'));
      } catch {
        return null;
      }
    }
    return this.audio;
  }
  protected play(restart: boolean) {
    const a = this.getAudio();
    if (!a) return;
    try {
      if (restart) a.currentTime = 0;
      void a.play()?.catch(() => {});
    } catch {
      /* 브라우저가 소리를 못 내는 환경 */
    }
  }
  protected pause(reset: boolean) {
    try {
      this.audio?.pause();
      if (reset && this.audio) this.audio.currentTime = 0;
    } catch {
      /* 무시 */
    }
  }
  dispose() {
    this.pause(true);
    super.dispose();
  }
}

export class SoundComp extends AudioBase {
  private last = -Infinity;
  methods(): Record<string, MethodDef> {
    return {
      Play: {
        args: [],
        run: () => {
          const now = Date.now();
          if (now - this.last < Number(this.props.MinimumInterval)) return;
          this.last = now;
          this.play(true);
        },
      },
      Pause: { args: [], run: () => this.pause(false) },
      Resume: { args: [], run: () => this.play(false) },
      Stop: { args: [], run: () => this.pause(true) },
      Vibrate: { args: ['number'], run: () => navigator.vibrate?.(0) },
    };
  }
}

export class PlayerComp extends AudioBase {
  readonly events = ['Completed', 'PlayerError'];
  methods(): Record<string, MethodDef> {
    return {
      Start: { args: [], run: () => this.play(false) },
      Pause: { args: [], run: () => this.pause(false) },
      Stop: { args: [], run: () => this.pause(true) },
      Vibrate: { args: ['number'], run: () => undefined },
    };
  }
}

// ───────────────────────── Notifier ─────────────────────────
export class NotifierComp extends RtComponent {
  readonly events = ['AfterChoosing', 'ChoosingCanceled', 'AfterTextInput', 'TextInputCanceled'];
  readonly propTypes: Record<string, PropType> = { NotifierLength: 'number', BackgroundColor: 'color', TextColor: 'color' };
  methods(): Record<string, MethodDef> {
    const t = 'text' as const;
    return {
      ShowAlert: { args: [t], run: ([m]) => this.ctx.toast(String(m)) },
      ShowMessageDialog: {
        args: [t, t, t],
        run: ([m, title, btn]) => this.ctx.dialog({ title: String(title), message: String(m), buttons: [String(btn)] }, () => {}),
      },
      ShowChooseDialog: {
        args: [t, t, t, t, 'boolean'],
        run: ([m, title, b1, b2, cancelable]) => {
          const buttons = [String(b1), String(b2)];
          if (cancelable) buttons.push('Cancel');
          this.ctx.dialog({ title: String(title), message: String(m), buttons }, (i) => {
            this.ctx.fire(this.name, 'AfterChoosing', [buttons[i]]);
            if (i === 2) this.ctx.fire(this.name, 'ChoosingCanceled');
          });
        },
      },
      ShowTextDialog: {
        args: [t, t, 'boolean'],
        run: ([m, title, cancelable]) => this.textDialog(String(m), String(title), cancelable === true, 'text'),
      },
      ShowPasswordDialog: {
        args: [t, t, 'boolean'],
        run: ([m, title, cancelable]) => this.textDialog(String(m), String(title), cancelable === true, 'password'),
      },
      ShowProgressDialog: { args: [t, t], run: ([m]) => this.ctx.toast(String(m)) },
      DismissProgressDialog: { args: [], run: () => undefined },
      LogInfo: { args: [t], run: ([m]) => this.ctx.info(`${this.name}: ${String(m)}`) },
      LogWarning: { args: [t], run: ([m]) => this.ctx.info(`${this.name}: ${String(m)}`) },
      LogError: { args: [t], run: ([m]) => this.ctx.info(`${this.name}: ${String(m)}`) },
    };
  }
  private textDialog(message: string, title: string, cancelable: boolean, input: 'text' | 'password') {
    const buttons = ['OK'];
    if (cancelable) buttons.push('Cancel');
    this.ctx.dialog({ title, message, buttons, input }, (i, text) => {
      if (i === 1) {
        this.ctx.fire(this.name, 'AfterTextInput', ['Cancel']);
        this.ctx.fire(this.name, 'TextInputCanceled');
      } else this.ctx.fire(this.name, 'AfterTextInput', [text]);
    });
  }
}

// ───────────────────────── TinyDB ─────────────────────────
function deepCopy(v: Value): Value {
  return isList(v) ? new YailList(v.items.map(deepCopy)) : v;
}

export class TinyDBComp extends RtComponent {
  readonly events: string[] = [];
  readonly propTypes: Record<string, PropType> = { Namespace: 'text' };
  protected defaults() {
    return { Namespace: 'TinyDB1' };
  }
  private get store() {
    return this.ctx.storage(coerceToString(this.props.Namespace ?? 'TinyDB1'));
  }
  methods(): Record<string, MethodDef> {
    return {
      StoreValue: { args: ['text', 'any'], run: ([tag, v]) => void this.store.set(String(tag), deepCopy(v)) },
      GetValue: {
        args: ['text', 'any'],
        run: ([tag, def]) => (this.store.has(String(tag)) ? deepCopy(this.store.get(String(tag)) ?? null) : def),
      },
      GetTags: { args: [], run: () => new YailList([...this.store.keys()]) },
      ClearTag: { args: ['text'], run: ([tag]) => void this.store.delete(String(tag)) },
      ClearAll: { args: [], run: () => this.store.clear() },
    };
  }
}

// ───────────────────────── TextToSpeech ─────────────────────────
export class TextToSpeechComp extends RtComponent {
  readonly events = ['BeforeSpeaking', 'AfterSpeaking'];
  readonly propTypes: Record<string, PropType> = { Language: 'text', Country: 'text', Pitch: 'number', SpeechRate: 'number' };
  protected defaults() {
    return { Language: '', Country: '', Pitch: 1, SpeechRate: 1 };
  }
  methods(): Record<string, MethodDef> {
    return {
      Speak: {
        args: ['text'],
        run: ([m]) => {
          this.ctx.fire(this.name, 'BeforeSpeaking');
          const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
          if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
            this.ctx.toast(`(소리) ${String(m)}`);
            setTimeout(() => this.ctx.fire(this.name, 'AfterSpeaking', [true]), 0);
            return;
          }
          const u = new SpeechSynthesisUtterance(String(m));
          u.lang = coerceToString(this.props.Language ?? '') || 'ko-KR';
          u.pitch = coerceToNumber(this.props.Pitch) ?? 1;
          u.rate = coerceToNumber(this.props.SpeechRate) ?? 1;
          u.onend = () => this.ctx.fire(this.name, 'AfterSpeaking', [true]);
          u.onerror = () => this.ctx.fire(this.name, 'AfterSpeaking', [false]);
          synth.speak(u);
        },
      },
      Stop: { args: [], run: () => (typeof speechSynthesis !== 'undefined' ? speechSynthesis.cancel() : undefined) },
    };
  }
  dispose() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    super.dispose();
  }
}
