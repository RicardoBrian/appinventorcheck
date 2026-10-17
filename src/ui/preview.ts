/** 디자이너 값 해석에 쓰는 공통 표 (실제 화면은 runtime/rt 의 컴포넌트가 만든다) */

export const NON_VISIBLE = new Set([
  'Clock', 'Sound', 'Player', 'TinyDB', 'TinyWebDB', 'Notifier', 'TextToSpeech', 'SpeechRecognizer', 'AccelerometerSensor',
  'OrientationSensor', 'LocationSensor', 'Web', 'File', 'CloudDB', 'Camera', 'BarcodeScanner', 'ActivityStarter', 'Texting',
  'PhoneCall', 'Sharing', 'BluetoothClient', 'BluetoothServer', 'SoundRecorder', 'VideoPlayer_', 'GyroscopeSensor',
  'ProximitySensor', 'LightSensor', 'Pedometer', 'Spreadsheet', 'Translator', 'YandexTranslate', 'ImagePicker_',
]);

/** 앱인벤터 크기 값: -1 자동, -2 부모 채우기, -1000-p 는 p%, 0 이상은 픽셀 */
export function sizeToCss(v: string | undefined, axis: 'w' | 'h'): string | undefined {
  if (v == null || v === '') return undefined;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n === -1) return undefined;
  if (n === -2) return axis === 'w' ? '100%' : undefined;
  if (n <= -1000) return `${-1000 - n}%`;
  if (n >= 0) return `${n}px`;
  return undefined;
}
