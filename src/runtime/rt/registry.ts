/** 컴포넌트 타입 → 실행용 클래스 */
import type { ComponentNode } from '../../aia/types';
import { RtComponent, type PropType, type RtContext } from './base';
import { ArrangementComp, ButtonComp, FormComp, ImageComp, LabelComp, ListPickerComp, SliderComp, SpinnerComp, TextBoxComp, ToggleComp } from './basic';
import { BallComp, CanvasComp, ImageSpriteComp } from './canvas';
import { ClockComp, NotifierComp, PlayerComp, SoundComp, TextToSpeechComp, TinyDBComp } from './nonvisible';

type Ctor = new (node: ComponentNode, ctx: RtContext) => RtComponent;

const CLASSES: Record<string, Ctor> = {
  Form: FormComp,
  Label: LabelComp,
  Button: ButtonComp,
  TextBox: TextBoxComp,
  PasswordTextBox: TextBoxComp,
  Image: ImageComp,
  HorizontalArrangement: ArrangementComp,
  VerticalArrangement: ArrangementComp,
  HorizontalScrollArrangement: ArrangementComp,
  VerticalScrollArrangement: ArrangementComp,
  CheckBox: ToggleComp,
  Switch: ToggleComp,
  Slider: SliderComp,
  ListPicker: ListPickerComp,
  Spinner: SpinnerComp,
  Canvas: CanvasComp,
  ImageSprite: ImageSpriteComp,
  Ball: BallComp,
  Clock: ClockComp,
  Sound: SoundComp,
  Player: PlayerComp,
  Notifier: NotifierComp,
  TinyDB: TinyDBComp,
  TextToSpeech: TextToSpeechComp,
};

export const SUPPORTED_COMPONENT_TYPES = Object.keys(CLASSES);

/** 지원하지 않는 컴포넌트: 보이는 것이면 점선 상자로 자리만 표시 */
export class UnsupportedComp extends RtComponent {
  readonly events: string[] = [];
  readonly propTypes: Record<string, PropType> = {};
  constructor(
    node: ComponentNode,
    ctx: RtContext,
    private visible: boolean,
  ) {
    super(node, ctx);
  }
  protected createElement() {
    if (!this.visible) return null;
    const el = document.createElement('div');
    el.className = 'ai-unsupported';
    el.textContent = `${this.node.type} (${this.node.name}) — 지원하지 않는 컴포넌트`;
    this.childHost = el;
    return el;
  }
  apply() {}
}

export function createComponent(node: ComponentNode, ctx: RtContext, nonVisible: boolean): RtComponent {
  const C = CLASSES[node.type];
  if (C) return new C(node, ctx);
  return new UnsupportedComp(node, ctx, !nonVisible);
}
