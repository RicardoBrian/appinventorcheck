/**
 * 캔버스, 이미지 스프라이트, 공.
 * 근거: components/runtime/Canvas.java, Sprite.java, ImageSprite.java, Ball.java, common/Direction.java
 *  - 스프라이트는 Interval(ms)마다 Speed 만큼 Heading 방향으로 움직인다 (Heading 0 = 오른쪽, 90 = 위쪽)
 *  - 캔버스 가장자리를 넘으면 안으로 되돌리고 EdgeReached(방향) 이벤트
 *    방향 값: 북 1, 북동 2, 동 3, 남동 4, 남 -1, 남서 -2, 서 -3, 북서 -4
 *  - 두 스프라이트가 겹치기 시작하면 CollidedWith, 떨어지면 NoLongerCollidingWith (한 번씩만)
 */
import { coerceToNumber, colorIntToCss, isComponent, isList, typeError, type Value } from '../values';
import { applyCommon, BLACK, componentRef, RtComponent, VISIBLE_PROPS, WHITE, type MethodDef, type PropType } from './base';

const DIR = { North: 1, Northeast: 2, East: 3, Southeast: 4, South: -1, Southwest: -2, West: -3, Northwest: -4 } as const;

// ───────────────────────── Canvas ─────────────────────────
export class CanvasComp extends RtComponent {
  readonly events = ['Touched', 'TouchDown', 'TouchUp', 'Dragged'];
  readonly propTypes: Record<string, PropType> = {
    ...VISIBLE_PROPS,
    BackgroundColor: 'color',
    BackgroundImage: 'text',
    PaintColor: 'color',
    LineWidth: 'number',
    FontSize: 'number',
    TextAlignment: 'number',
    ExtendMovesOutsideCanvas: 'boolean',
  };
  sprites: SpriteComp[] = [];
  private canvas!: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null = null;
  /** 그리기 명령 기록 (테스트·디버그용) */
  readonly drawLog: string[] = [];

  protected defaults() {
    return { BackgroundColor: WHITE, BackgroundImage: '', PaintColor: BLACK, LineWidth: 2, FontSize: 14, TextAlignment: 1, Width: -2, Height: -1 };
  }
  protected createElement() {
    const el = document.createElement('div');
    el.className = 'ai-canvas';
    this.canvas = document.createElement('canvas');
    el.appendChild(this.canvas);
    this.childHost = el;
    return el;
  }

  /** 캔버스 크기 (CSS 픽셀). 화면에 아직 없으면 디자이너 값 */
  width() {
    const w = this.el?.clientWidth ?? 0;
    if (w > 0) return w;
    const p = Number(this.props.Width);
    return p > 0 ? p : 300;
  }
  height() {
    const h = this.el?.clientHeight ?? 0;
    if (h > 0) return h;
    const p = Number(this.props.Height);
    return p > 0 ? p : 300;
  }

  apply(prop: string) {
    const el = this.el!;
    const v = this.props[prop];
    if (prop === 'BackgroundImage') {
      const url = v ? this.ctx.assetUrl(String(v)) : undefined;
      if (v && !url) this.ctx.warn(`그림 파일을 찾을 수 없습니다: ${String(v)} (${this.name}.배경이미지)`);
      el.style.backgroundImage = url ? `url("${url}")` : '';
    } else if (prop === 'Height') {
      // 자동(-1) 높이는 화면에서 보이도록 300px 로
      const n = Number(v);
      el.style.height = n === -1 ? '300px' : '';
      if (n !== -1) applyCommon(this, prop);
    } else if (prop === 'BackgroundColor') {
      el.style.backgroundColor = typeof v === 'number' && v !== 0 ? colorIntToCss(v) : '';
    } else if (prop in VISIBLE_PROPS) applyCommon(this, prop);
  }

  start() {
    this.resizeBuffer();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resizeBuffer());
      ro.observe(this.el!);
      this.cleanups.push(() => ro.disconnect());
    }
    this.bindTouch();
  }

  /** 그림 버퍼 크기를 화면 크기에 맞춘다 (이미 그린 것은 유지) */
  private resizeBuffer() {
    const w = Math.round(this.width());
    const h = Math.round(this.height());
    if (this.canvas.width === w && this.canvas.height === h) return;
    let old: HTMLCanvasElement | null = null;
    try {
      if (this.g && this.canvas.width && this.canvas.height) {
        old = document.createElement('canvas');
        old.width = this.canvas.width;
        old.height = this.canvas.height;
        old.getContext('2d')?.drawImage(this.canvas, 0, 0);
      }
    } catch {
      old = null;
    }
    this.canvas.width = w;
    this.canvas.height = h;
    try {
      this.g = this.canvas.getContext('2d');
    } catch {
      this.g = null; // jsdom 등 그림을 못 그리는 환경
    }
    if (old) this.g?.drawImage(old, 0, 0);
  }

  private paint() {
    const g = this.g;
    if (!g) return null;
    const color = colorIntToCss(Number(this.props.PaintColor));
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = Math.max(1, Number(this.props.LineWidth));
    g.lineCap = 'round';
    g.font = `${Number(this.props.FontSize)}px Roboto, 'Noto Sans KR', sans-serif`;
    g.textAlign = ({ 0: 'left', 1: 'center', 2: 'right' } as Record<number, CanvasTextAlign>)[Number(this.props.TextAlignment)] ?? 'center';
    g.textBaseline = 'alphabetic';
    return g;
  }

  methods(): Record<string, MethodDef> {
    const n = 'number' as const;
    return {
      Clear: {
        args: [],
        run: () => {
          this.drawLog.push('Clear');
          this.g?.clearRect(0, 0, this.canvas.width, this.canvas.height);
        },
      },
      DrawPoint: {
        args: [n, n],
        run: ([x, y]) => {
          this.drawLog.push(`DrawPoint ${x} ${y}`);
          const g = this.paint();
          const s = Math.max(1, Number(this.props.LineWidth));
          g?.fillRect(Number(x) - s / 2, Number(y) - s / 2, s, s);
        },
      },
      DrawCircle: {
        args: [n, n, n, 'boolean'],
        run: ([cx, cy, r, fill]) => {
          this.drawLog.push(`DrawCircle ${cx} ${cy} ${r} ${fill}`);
          const g = this.paint();
          if (!g) return;
          g.beginPath();
          g.arc(Number(cx), Number(cy), Math.max(0, Number(r)), 0, Math.PI * 2);
          if (fill) g.fill();
          else g.stroke();
        },
      },
      DrawLine: {
        args: [n, n, n, n],
        run: ([x1, y1, x2, y2]) => {
          this.drawLog.push(`DrawLine ${x1} ${y1} ${x2} ${y2}`);
          const g = this.paint();
          if (!g) return;
          g.beginPath();
          g.moveTo(Number(x1), Number(y1));
          g.lineTo(Number(x2), Number(y2));
          g.stroke();
        },
      },
      DrawText: {
        args: ['text', n, n],
        run: ([t, x, y]) => {
          this.drawLog.push(`DrawText ${t} ${x} ${y}`);
          this.paint()?.fillText(String(t), Number(x), Number(y));
        },
      },
      DrawTextAtAngle: {
        args: ['text', n, n, n],
        run: ([t, x, y, a]) => {
          this.drawLog.push(`DrawTextAtAngle ${t} ${x} ${y} ${a}`);
          const g = this.paint();
          if (!g) return;
          g.save();
          g.translate(Number(x), Number(y));
          g.rotate((-Number(a) * Math.PI) / 180);
          g.fillText(String(t), 0, 0);
          g.restore();
        },
      },
      DrawShape: {
        args: ['list', 'boolean'],
        run: ([pts, fill]) => {
          if (!isList(pts)) throw typeError('DrawShape', [pts]);
          const points = pts.items.map((p) => (isList(p) ? p.items.map((c) => coerceToNumber(c) ?? 0) : [0, 0]));
          this.drawLog.push(`DrawShape ${points.length} ${fill}`);
          const g = this.paint();
          if (!g || !points.length) return;
          g.beginPath();
          g.moveTo(points[0][0], points[0][1]);
          for (const [x, y] of points.slice(1)) g.lineTo(x, y);
          g.closePath();
          if (fill) g.fill();
          else g.stroke();
        },
      },
      DrawArc: {
        args: [n, n, n, n, n, n, 'boolean', 'boolean'],
        run: ([l, t, r, b, start, sweep, useCenter, fill]) => {
          this.drawLog.push(`DrawArc ${l} ${t} ${r} ${b} ${start} ${sweep}`);
          const g = this.paint();
          if (!g) return;
          const cx = (Number(l) + Number(r)) / 2;
          const cy = (Number(t) + Number(b)) / 2;
          const rad = (d: number) => (d * Math.PI) / 180;
          g.beginPath();
          if (useCenter) g.moveTo(cx, cy);
          g.ellipse(cx, cy, Math.abs(Number(r) - Number(l)) / 2, Math.abs(Number(b) - Number(t)) / 2, 0, rad(Number(start)), rad(Number(start) + Number(sweep)), Number(sweep) < 0);
          if (useCenter) g.closePath();
          if (fill) g.fill();
          else g.stroke();
        },
      },
      GetBackgroundPixelColor: { args: [n, n], run: () => Number(this.props.BackgroundColor) },
      GetPixelColor: {
        args: [n, n],
        run: ([x, y]) => {
          const g = this.g;
          if (g) {
            try {
              const d = g.getImageData(Math.round(Number(x)), Math.round(Number(y)), 1, 1).data;
              if (d[3] > 0) return ((d[3] << 24) | (d[0] << 16) | (d[1] << 8) | d[2]) | 0;
            } catch {
              /* 읽을 수 없음 */
            }
          }
          return Number(this.props.BackgroundColor);
        },
      },
      SetBackgroundPixelColor: {
        args: [n, n, 'number'],
        run: ([x, y, c]) => {
          const g = this.g;
          if (!g) return;
          g.fillStyle = colorIntToCss(Number(c));
          g.fillRect(Math.round(Number(x)), Math.round(Number(y)), 1, 1);
        },
      },
    };
  }

  // ── 터치 ──
  private bindTouch() {
    const el = this.el!;
    el.style.touchAction = 'none';
    let start: { x: number; y: number; prevX: number; prevY: number; sprites: SpriteComp[]; dragged: boolean } | null = null;
    const pos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.on(el, 'pointerdown', (ev) => {
      const e = ev as PointerEvent;
      const { x, y } = pos(e);
      const hit = this.spritesAt(x, y);
      start = { x, y, prevX: x, prevY: y, sprites: hit, dragged: false };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      for (const s of hit) this.ctx.fire(s.name, 'TouchDown', [x, y]);
      this.ctx.fire(this.name, 'TouchDown', [x, y]);
    });
    this.on(el, 'pointermove', (ev) => {
      if (!start) return;
      const { x, y } = pos(ev as PointerEvent);
      if (!start.dragged && Math.hypot(x - start.x, y - start.y) < 3) return;
      start.dragged = true;
      for (const s of start.sprites) this.ctx.fire(s.name, 'Dragged', [start.x, start.y, start.prevX, start.prevY, x, y]);
      this.ctx.fire(this.name, 'Dragged', [start.x, start.y, start.prevX, start.prevY, x, y, start.sprites.length > 0]);
      start.prevX = x;
      start.prevY = y;
    });
    this.on(el, 'pointerup', (ev) => {
      if (!start) return;
      const { x, y } = pos(ev as PointerEvent);
      const s0 = start;
      start = null;
      for (const s of s0.sprites) this.ctx.fire(s.name, 'TouchUp', [x, y]);
      this.ctx.fire(this.name, 'TouchUp', [x, y]);
      if (!s0.dragged) {
        const hit = this.spritesAt(x, y);
        for (const s of hit) this.ctx.fire(s.name, 'Touched', [x, y]);
        this.ctx.fire(this.name, 'Touched', [x, y, hit.length > 0]);
      }
    });
  }

  spritesAt(x: number, y: number) {
    return this.sprites.filter((s) => s.props.Visible !== false && s.containsPoint(x, y));
  }

  /** 스프라이트가 움직인 뒤 충돌 확인 (Canvas.findSpriteCollisions) */
  checkCollisions(moved: SpriteComp) {
    for (const other of this.sprites) {
      if (other === moved) continue;
      const colliding = moved.props.Visible !== false && other.props.Visible !== false && collide(moved, other);
      const registered = moved.collisions.has(other);
      if (colliding && !registered) {
        moved.collisions.add(other);
        other.collisions.add(moved);
        this.ctx.fire(moved.name, 'CollidedWith', [componentRef(other.name)]);
        this.ctx.fire(other.name, 'CollidedWith', [componentRef(moved.name)]);
      } else if (!colliding && registered) {
        moved.collisions.delete(other);
        other.collisions.delete(moved);
        this.ctx.fire(moved.name, 'NoLongerCollidingWith', [componentRef(other.name)]);
        this.ctx.fire(other.name, 'NoLongerCollidingWith', [componentRef(moved.name)]);
      }
    }
  }
}

function collide(a: SpriteComp, b: SpriteComp) {
  if (a instanceof BallComp && b instanceof BallComp) {
    const dx = a.centerX() - b.centerX();
    const dy = a.centerY() - b.centerY();
    return dx * dx + dy * dy <= (a.radius() + b.radius()) ** 2;
  }
  if (a instanceof BallComp || b instanceof BallComp) {
    const ball = (a instanceof BallComp ? a : b) as BallComp;
    const box = a instanceof BallComp ? b : a;
    // 원과 사각형: 사각형에서 원 중심에 가장 가까운 점까지의 거리
    const nx = Math.max(box.left(), Math.min(ball.centerX(), box.left() + box.w()));
    const ny = Math.max(box.top(), Math.min(ball.centerY(), box.top() + box.h()));
    return (nx - ball.centerX()) ** 2 + (ny - ball.centerY()) ** 2 <= ball.radius() ** 2;
  }
  return a.left() < b.left() + b.w() && b.left() < a.left() + a.w() && a.top() < b.top() + b.h() && b.top() < a.top() + a.h();
}

// ───────────────────────── Sprite (공통) ─────────────────────────
export abstract class SpriteComp extends RtComponent {
  readonly events = ['CollidedWith', 'NoLongerCollidingWith', 'EdgeReached', 'Touched', 'TouchDown', 'TouchUp', 'Dragged'];
  collisions = new Set<SpriteComp>();
  canvas: CanvasComp | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  protected spriteDefaults(): Record<string, Value> {
    return { X: 0, Y: 0, Heading: 0, Speed: 0, Interval: 100, Enabled: true, Visible: true, Z: 1 };
  }
  abstract w(): number;
  abstract h(): number;
  left() {
    return Number(this.props.X);
  }
  top() {
    return Number(this.props.Y);
  }
  centerX() {
    return this.left() + this.w() / 2;
  }
  centerY() {
    return this.top() + this.h() / 2;
  }
  containsPoint(x: number, y: number) {
    return x >= this.left() && x <= this.left() + this.w() && y >= this.top() && y <= this.top() + this.h();
  }

  start() {
    this.started = true;
    this.updateTimer();
    this.render();
  }

  setProperty(prop: string, value: Value) {
    super.setProperty(prop, value);
    // X, Y 를 바꾸면 앱인벤터처럼 가장자리·충돌을 다시 확인 (Sprite.registerChange)
    if (prop === 'X' || prop === 'Y' || prop === 'Visible' || prop === 'Picture' || prop === 'Width' || prop === 'Height' || prop === 'Radius')
      this.registerChange();
  }

  apply(prop: string) {
    if (prop === 'Enabled' || prop === 'Interval') this.updateTimer();
    else if (prop === 'Visible') this.el!.style.display = this.props.Visible === false ? 'none' : '';
    else if (prop === 'Z') this.el!.style.zIndex = String(Math.round(Number(this.props.Z)));
    this.render();
  }

  protected render() {
    const el = this.el;
    if (!el) return;
    el.style.left = `${this.left()}px`;
    el.style.top = `${this.top()}px`;
  }

  private updateTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.started) return;
    const iv = Number(this.props.Interval);
    if (this.props.Enabled === true && iv > 0) this.timer = setInterval(() => this.alarm(), iv);
  }

  /** Sprite.alarm: 한 칸 움직이기 */
  private alarm() {
    const speed = Number(this.props.Speed);
    if (!speed) return;
    const rad = (-Number(this.props.Heading) * Math.PI) / 180; // 아래쪽이 +y 이므로 뒤집는다
    this.props.X = Number(this.props.X) + speed * Math.cos(rad);
    this.props.Y = Number(this.props.Y) + speed * Math.sin(rad);
    this.render();
    this.registerChange();
  }

  /** Sprite.registerChange: 가장자리 확인 → 충돌 확인 */
  registerChange() {
    this.render();
    if (!this.started || !this.canvas) return;
    const edge = this.hitEdge();
    if (edge != null) this.ctx.fire(this.name, 'EdgeReached', [edge]);
    this.canvas.checkCollisions(this);
  }

  private hitEdge(): number | null {
    const cw = this.canvas!.width();
    const ch = this.canvas!.height();
    const west = this.left() < 0;
    const north = this.top() < 0;
    const east = this.left() + this.w() > cw;
    const south = this.top() + this.h() > ch;
    if (!(north || south || east || west)) return null;
    this.moveIntoBounds();
    if (west) return north ? DIR.Northwest : south ? DIR.Southwest : DIR.West;
    if (east) return north ? DIR.Northeast : south ? DIR.Southeast : DIR.East;
    return north ? DIR.North : DIR.South;
  }

  moveIntoBounds() {
    if (!this.canvas) return;
    const cw = this.canvas.width();
    const ch = this.canvas.height();
    let dx = 0;
    let dy = 0;
    if (this.w() > cw || this.left() < 0) dx = -this.left();
    else if (this.left() + this.w() > cw) dx = cw - this.w() - this.left();
    if (this.h() > ch || this.top() < 0) dy = -this.top();
    else if (this.top() + this.h() > ch) dy = ch - this.h() - this.top();
    this.props.X = Number(this.props.X) + dx;
    this.props.Y = Number(this.props.Y) + dy;
    this.render();
  }

  /** Sprite.BounceAbstract */
  bounce(edge: number) {
    this.moveIntoBounds();
    let a = Number(this.props.Heading) % 360;
    if (a < 0) a += 360;
    if ((edge === DIR.East && (a < 90 || a > 270)) || (edge === DIR.West && a > 90 && a < 270)) this.setHeading(180 - a);
    else if ((edge === DIR.North && a > 0 && a < 180) || (edge === DIR.South && a > 180)) this.setHeading(360 - a);
    else if (
      (edge === DIR.Northeast && a > 0 && a < 90) ||
      (edge === DIR.Northwest && a > 90 && a < 180) ||
      (edge === DIR.Southwest && a > 180 && a < 270) ||
      (edge === DIR.Southeast && a > 270)
    )
      this.setHeading(180 + a);
  }

  private setHeading(h: number) {
    this.props.Heading = h;
    this.apply('Heading');
  }

  private pointTo(x: number, y: number) {
    this.setHeading((-Math.atan2(y - this.centerY(), x - this.centerX()) * 180) / Math.PI);
  }

  methods(): Record<string, MethodDef> {
    const n = 'number' as const;
    return {
      MoveTo: { args: [n, n], run: ([x, y]) => this.moveTo(Number(x), Number(y)) },
      MoveToPoint: {
        args: ['list'],
        run: ([p]) => {
          const xy = isList(p) ? p.items.map((c) => coerceToNumber(c)) : [];
          if (xy.length !== 2 || xy.some((c) => c == null)) throw typeError('MoveToPoint', [p]);
          this.moveTo(xy[0]!, xy[1]!);
        },
      },
      Bounce: { args: [n], run: ([e]) => this.bounce(Number(e)) },
      PointInDirection: { args: [n, n], run: ([x, y]) => this.pointTo(Number(x), Number(y)) },
      PointTowards: {
        args: ['any'],
        run: ([t]) => {
          const target = isComponent(t) ? this.ctx.component(t.name) : undefined;
          if (!(target instanceof SpriteComp)) throw typeError('PointTowards', [t]);
          this.pointTo(target.centerX(), target.centerY());
        },
      },
      CollidingWith: {
        args: ['any'],
        run: ([t]) => {
          const other = isComponent(t) ? this.ctx.component(t.name) : undefined;
          return other instanceof SpriteComp ? this.collisions.has(other) : false;
        },
      },
      MoveIntoBounds: { args: [], run: () => this.moveIntoBounds() },
    };
  }

  protected moveTo(x: number, y: number) {
    this.props.X = x;
    this.props.Y = y;
    this.registerChange();
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    super.dispose();
  }
}

const SPRITE_PROPS: Record<string, PropType> = {
  X: 'number',
  Y: 'number',
  Heading: 'number',
  Speed: 'number',
  Interval: 'number',
  Enabled: 'boolean',
  Visible: 'boolean',
  Z: 'number',
};

// ───────────────────────── ImageSprite ─────────────────────────
export class ImageSpriteComp extends SpriteComp {
  readonly propTypes: Record<string, PropType> = { ...SPRITE_PROPS, Picture: 'text', Width: 'number', Height: 'number', Rotates: 'boolean' };
  protected defaults() {
    return { ...this.spriteDefaults(), Picture: '', Width: -1, Height: -1, Rotates: true };
  }
  protected createElement() {
    const img = document.createElement('img');
    img.className = 'ai-sprite';
    img.alt = this.name;
    img.draggable = false;
    img.addEventListener('load', () => this.registerChange());
    return img;
  }
  w() {
    const p = Number(this.props.Width);
    if (p >= 0) return p;
    return (this.el as HTMLImageElement | null)?.naturalWidth || 0;
  }
  h() {
    const p = Number(this.props.Height);
    if (p >= 0) return p;
    return (this.el as HTMLImageElement | null)?.naturalHeight || 0;
  }
  apply(prop: string) {
    const img = this.el as HTMLImageElement;
    if (prop === 'Picture') {
      const v = this.props.Picture;
      const url = v ? this.ctx.assetUrl(String(v)) : undefined;
      if (v && !url) this.ctx.warn(`그림 파일을 찾을 수 없습니다: ${String(v)} (${this.name}.사진)`);
      if (url) img.src = url;
      else img.removeAttribute('src');
    }
    super.apply(prop);
  }
  protected render() {
    super.render();
    const img = this.el as HTMLImageElement | null;
    if (!img) return;
    const pw = Number(this.props.Width);
    const ph = Number(this.props.Height);
    img.style.width = pw >= 0 ? `${pw}px` : '';
    img.style.height = ph >= 0 ? `${ph}px` : '';
    const rot = this.props.Rotates !== false ? Number(this.props.Heading) : 0;
    img.style.transform = rot ? `rotate(${-rot}deg)` : '';
  }
}

// ───────────────────────── Ball ─────────────────────────
export class BallComp extends SpriteComp {
  readonly propTypes: Record<string, PropType> = { ...SPRITE_PROPS, Radius: 'number', PaintColor: 'color', OriginAtCenter: 'boolean' };
  protected defaults() {
    return { ...this.spriteDefaults(), Radius: 5, PaintColor: BLACK, OriginAtCenter: false };
  }
  protected createElement() {
    const d = document.createElement('div');
    d.className = 'ai-ball';
    return d;
  }
  radius() {
    return Math.max(0, Number(this.props.Radius));
  }
  w() {
    return this.radius() * 2;
  }
  h() {
    return this.radius() * 2;
  }
  // OriginAtCenter 이면 X, Y 가 공의 중심
  left() {
    return Number(this.props.X) - (this.props.OriginAtCenter === true ? this.radius() : 0);
  }
  top() {
    return Number(this.props.Y) - (this.props.OriginAtCenter === true ? this.radius() : 0);
  }
  containsPoint(x: number, y: number) {
    return (x - this.centerX()) ** 2 + (y - this.centerY()) ** 2 <= this.radius() ** 2;
  }
  protected render() {
    const el = this.el;
    if (!el) return;
    el.style.left = `${this.left()}px`;
    el.style.top = `${this.top()}px`;
    el.style.width = el.style.height = `${this.w()}px`;
    el.style.backgroundColor = colorIntToCss(Number(this.props.PaintColor));
  }
}
