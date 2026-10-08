import * as Blockly from 'blockly/core';
import * as Ko from 'blockly/msg/ko';
import { registerAiBlocks } from './defs';
import { prepareBkyXml } from './prepare';

let localeSet = false;

export interface BlocksView {
  /** .bky XML 을 그린다. 반환값: 대체 블록으로 그린 type 목록 */
  show(bky: string | null): { unknownTypes: string[]; blockCount: number };
  zoomToFit(): void;
  cleanUp(): void;
  resize(): void;
  dispose(): void;
}

export function createBlocksView(container: HTMLElement): BlocksView {
  if (!localeSet) {
    Blockly.setLocale(Ko as unknown as Record<string, string>);
    localeSet = true;
  }
  registerAiBlocks();
  const ws = Blockly.inject(container, {
    readOnly: true,
    // 확대/축소 아이콘 등을 외부 서버가 아닌 이 사이트에서 읽는다 (public/blockly-media, Blockly 패키지에서 복사)
    media: `${import.meta.env.BASE_URL}blockly-media/`,
    renderer: 'geras',
    theme: Blockly.Themes.Classic,
    trashcan: false,
    sounds: false,
    scrollbars: true,
    move: { scrollbars: true, drag: true, wheel: true },
    zoom: { controls: true, wheel: true, startScale: 0.8, maxScale: 3, minScale: 0.2, scaleSpeed: 1.15, pinch: true },
    grid: { spacing: 20, length: 3, colour: '#e5e5e5', snap: false },
  });

  const fit = () => {
    if (!ws.getTopBlocks(false).length) return;
    ws.zoomToFit();
    // 블록이 적을 때 지나치게 커지지 않게
    if (ws.scale > 1) ws.setScale(1);
    ws.scrollCenter();
  };

  return {
    show(bky) {
      ws.clear();
      if (!bky) return { unknownTypes: [], blockCount: 0 };
      const { dom, unknownTypes } = prepareBkyXml(bky);
      Blockly.Xml.domToWorkspace(dom, ws);
      // 앱인벤터는 블록 좌표를 저장하지만 좌표가 없거나 모두 겹친 파일도 있어 확인
      const tops = ws.getTopBlocks(false);
      const positions = new Set(tops.map((b) => `${Math.round(b.getRelativeToSurfaceXY().x)},${Math.round(b.getRelativeToSurfaceXY().y)}`));
      if (tops.length > 1 && positions.size === 1) ws.cleanUp();
      fit();
      return { unknownTypes, blockCount: ws.getAllBlocks(false).length };
    },
    zoomToFit: fit,
    cleanUp() {
      ws.cleanUp();
      fit();
    },
    resize() {
      Blockly.svgResize(ws);
    },
    dispose() {
      ws.dispose();
    },
  };
}
