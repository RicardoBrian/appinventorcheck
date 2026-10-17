// jsdom 에는 캔버스 그리기가 없다. 실행기는 그리기 없이도 동작하므로 "구현 안 됨" 경고만 막는다.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
