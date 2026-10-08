/**
 * 이벤트·메서드 매개변수 이름 표.
 * 앱인벤터는 빌드할 때 만든 simple_components.json 에서 이 정보를 읽는데, 그 파일은 .aia 에 들어 있지 않다.
 * 그래서 수업에서 자주 쓰는 컴포넌트만 (appinventor/components/src/.../runtime/*.java 의 @SimpleEvent/@SimpleFunction
 * 시그니처 기준으로) 적어 둔다. 여기에 없는 이벤트/메서드도 블록은 그려지며, 매개변수 이름만 빠진다.
 */
type Sig = Record<string, string[]>;

const VISIBLE_COMMON_EVENTS: Sig = { GotFocus: [], LostFocus: [], TouchDown: [], TouchUp: [] };

export const EVENT_PARAMS: Record<string, Sig> = {
  Form: {
    Initialize: [],
    BackPressed: [],
    ErrorOccurred: ['component', 'functionName', 'errorNumber', 'message'],
    OtherScreenClosed: ['otherScreenName', 'result'],
    ScreenOrientationChanged: [],
    PermissionDenied: ['component', 'functionName', 'permissionName'],
    PermissionGranted: ['permissionName'],
  },
  Button: { Click: [], LongClick: [], ...VISIBLE_COMMON_EVENTS },
  Label: {},
  TextBox: { GotFocus: [], LostFocus: [], TextChanged: [] },
  PasswordTextBox: { GotFocus: [], LostFocus: [], TextChanged: [] },
  Image: { Click: [] },
  Clock: { Timer: [] },
  CheckBox: { Changed: [], GotFocus: [], LostFocus: [] },
  Switch: { Changed: [], GotFocus: [], LostFocus: [] },
  Slider: { PositionChanged: ['thumbPosition'], TouchDown: [], TouchUp: [] },
  ListPicker: { BeforePicking: [], AfterPicking: [], GotFocus: [], LostFocus: [], TouchDown: [], TouchUp: [] },
  ListView: { AfterPicking: [] },
  Spinner: { AfterSelecting: ['selection'] },
  DatePicker: { AfterDateSet: [], BeforePicking: [] },
  TimePicker: { AfterTimeSet: [], BeforePicking: [] },
  Notifier: { AfterChoosing: ['choice'], AfterTextInput: ['response'], ChoosingCanceled: [], TextInputCanceled: [], AfterPicking: [] },
  Player: { Completed: [], PlayerError: ['message'], OtherPlayerStarted: [] },
  Sound: {},
  TextToSpeech: { AfterSpeaking: ['result'], BeforeSpeaking: [] },
  SpeechRecognizer: { AfterGettingText: ['result', 'partial'], BeforeGettingText: [] },
  AccelerometerSensor: { AccelerationChanged: ['xAccel', 'yAccel', 'zAccel'], Shaking: [] },
  OrientationSensor: { OrientationChanged: ['azimuth', 'pitch', 'roll'] },
  LocationSensor: { LocationChanged: ['latitude', 'longitude', 'altitude', 'speed'], StatusChanged: ['provider', 'status'] },
  Canvas: {
    Touched: ['x', 'y', 'touchedAnySprite'],
    TouchDown: ['x', 'y'],
    TouchUp: ['x', 'y'],
    Dragged: ['startX', 'startY', 'prevX', 'prevY', 'currentX', 'currentY', 'draggedAnySprite'],
    Flung: ['x', 'y', 'speed', 'heading', 'xvel', 'yvel', 'flungSprite'],
  },
  ImageSprite: {
    CollidedWith: ['other'],
    NoLongerCollidingWith: ['other'],
    EdgeReached: ['edge'],
    Touched: ['x', 'y'],
    TouchDown: ['x', 'y'],
    TouchUp: ['x', 'y'],
    Dragged: ['startX', 'startY', 'prevX', 'prevY', 'currentX', 'currentY'],
    Flung: ['x', 'y', 'speed', 'heading', 'xvel', 'yvel'],
  },
  Web: { GotText: ['url', 'responseCode', 'responseType', 'responseContent'] },
  TinyWebDB: { GotValue: ['tagFromWebDB', 'valueFromWebDB'], ValueStored: [], WebServiceError: ['message'] },
  Camera: { AfterPicture: ['image'] },
  BarcodeScanner: { AfterScan: ['result'] },
};
EVENT_PARAMS.Ball = EVENT_PARAMS.ImageSprite;

export const METHOD_PARAMS: Record<string, Sig> = {
  Notifier: {
    ShowAlert: ['notice'],
    ShowMessageDialog: ['message', 'title', 'buttonText'],
    ShowChooseDialog: ['message', 'title', 'button1Text', 'button2Text', 'cancelable'],
    ShowTextDialog: ['message', 'title', 'cancelable'],
    LogInfo: ['message'],
  },
  Sound: { Play: [], Pause: [], Resume: [], Stop: [], Vibrate: ['millisecs'] },
  Player: { Start: [], Pause: [], Stop: [], Vibrate: ['milliseconds'] },
  TextToSpeech: { Speak: ['message'] },
  TextBox: { HideKeyboard: [], RequestFocus: [] },
  TinyDB: { StoreValue: ['tag', 'valueToStore'], GetValue: ['tag', 'valueIfTagNotThere'], ClearTag: ['tag'], ClearAll: [], GetTags: [] },
  Clock: {
    Now: [],
    SystemTime: [],
    FormatDateTime: ['instant', 'pattern'],
    FormatTime: ['instant'],
    FormatDate: ['instant', 'pattern'],
  },
  Canvas: {
    Clear: [],
    DrawCircle: ['centerX', 'centerY', 'radius', 'fill'],
    DrawLine: ['x1', 'y1', 'x2', 'y2'],
    DrawPoint: ['x', 'y'],
    DrawText: ['text', 'x', 'y'],
  },
  ImageSprite: { MoveTo: ['x', 'y'], Bounce: ['edge'], PointInDirection: ['x', 'y'], CollidingWith: ['other'] },
};
METHOD_PARAMS.Ball = METHOD_PARAMS.ImageSprite;

export function eventParams(componentType: string, event: string): string[] | undefined {
  return EVENT_PARAMS[componentType]?.[event];
}

export function methodParams(componentType: string, method: string): string[] | undefined {
  return METHOD_PARAMS[componentType]?.[method];
}
