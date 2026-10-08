/** 디자이너(.scm)의 컴포넌트 하나 */
export interface ComponentNode {
  name: string;
  /** App Inventor 내부 타입 이름 (예: Button, Label, Form) */
  type: string;
  version?: string;
  uuid?: string;
  /** $Name/$Type/$Version/$Components/Uuid 를 뺀 디자이너 속성 */
  props: Record<string, string>;
  children: ComponentNode[];
}

export interface ScreenData {
  name: string;
  /** Screen 자체 (type 은 'Form') */
  form: ComponentNode | null;
  /** .bky 원문 (Blockly XML). 블록이 없으면 null */
  bky: string | null;
  scmError?: string;
}

export interface AiaProject {
  fileName: string;
  /** youngandroidproject/project.properties */
  properties: Record<string, string>;
  appName: string;
  /** src/appinventor/ai_<계정>/<프로젝트> */
  packagePath: string;
  screens: ScreenData[];
  /** assets/ 아래 파일 (경로는 assets/ 를 뺀 이름) */
  assets: Map<string, Uint8Array>;
}
