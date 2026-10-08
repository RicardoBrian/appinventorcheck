/**
 * App Inventor 블록 정의 (읽기 전용 렌더링용).
 *
 * mit-cml/appinventor-sources 의 appinventor/blocklyeditor/src/blocks/*.js 를 보고
 * 블록 type 이름, 입력(input) 이름, 필드 이름, mutation 속성, 메시지 키, 색을 똑같이 맞췄다.
 * 원본은 앱인벤터 편집기 전용 기능(컴포넌트 DB, 변수 플라이아웃, 뮤테이터 UI 등)에 의존하므로
 * 코드를 복사하지 않고, 화면에 보이는 모양만 다시 구현했다.
 */
import * as Blockly from 'blockly/core';
import { COLOUR, M, componentTypeName, displayVarName, eventName, methodName, paramName, propertyName } from './msg';
import { fixedDropdown, mapDropdown, paramLabel, swatch } from './fields';
import { eventParams, methodParams } from './componentInfo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type B = Blockly.BlockSvg & Record<string, any>;
const RIGHT = Blockly.inputs.Align.RIGHT;
const TIMES = '×'; // AI.BlockUtils.times_symbol

type Shape = 'out' | 'stmt' | 'none';

function shape(b: B, s: Shape) {
  if (s === 'out') {
    b.setOutput(true);
    b.setPreviousStatement(false);
    b.setNextStatement(false);
  } else if (s === 'stmt') {
    b.setOutput(false);
    b.setPreviousStatement(true);
    b.setNextStatement(true);
  }
}

function clearInputs(b: B) {
  while (b.inputList.length) {
    const input = b.inputList[0];
    if (input.name) b.removeInput(input.name);
    else {
      input.dispose();
      b.inputList.splice(0, 1);
    }
  }
}

const defs: Record<string, object> = {};

/** 단순 블록 정의 */
function def(type: string, colour: string, s: Shape, build: (b: B) => void, extra: object = {}) {
  defs[type] = {
    init(this: B) {
      this.setColour(colour);
      shape(this, s);
      build(this);
    },
    ...extra,
  };
}

/**
 * Blockly.Block.prototype.interpolateMsg (appinventor/blocklyeditor/src/block.js) 와 같은 동작.
 * args[i] 는 %{i+1} 에 해당: 문자열이면 값 입력(오른쪽 정렬), [이름, 필드] 면 필드.
 */
function interpolate(b: B, msg: string, ...args: (string | [string, Blockly.Field])[]) {
  const tokens = msg.split(/(%\d+|\n)/);
  let pending: (Blockly.Field | string | [string, Blockly.Field])[] = [];
  const flush = (input: Blockly.Input) => {
    for (const f of pending) {
      if (Array.isArray(f)) input.appendField(f[1], f[0]);
      else input.appendField(f);
    }
    pending = [];
  };
  for (let i = 0; i < tokens.length; i += 2) {
    const text = tokens[i].trim();
    if (text) pending.push(text);
    const sym = tokens[i + 1];
    let input: Blockly.Input | undefined;
    if (sym && sym[0] === '%') {
      const a = args[parseInt(sym.slice(1), 10) - 1];
      if (Array.isArray(a)) pending.push(a);
      else if (a != null) input = b.appendValueInput(a).setAlign(RIGHT);
    } else if (sym === '\n' && pending.length) {
      input = b.appendDummyInput();
    }
    if (input && pending.length) flush(input);
  }
  if (pending.length) flush(b.appendDummyInput().setAlign(RIGHT));
  b.setInputsInline(!/%1\s*$/.test(msg));
}

/** 반복 입력 블록 (Blockly.mutationToDom / domToMutation 의 items 속성) */
function repeating(
  type: string,
  colour: string,
  s: Shape,
  opts: {
    defaultCount: number;
    inline?: boolean;
    head?: (b: B) => void;
    add: (b: B, i: number, count: number) => Blockly.Input;
    empty?: (b: B) => void;
  },
) {
  defs[type] = {
    init(this: B) {
      this.setColour(colour);
      shape(this, s);
      if (opts.inline != null) this.setInputsInline(opts.inline);
      this.itemCount_ = opts.defaultCount;
      this.rebuild_();
    },
    rebuild_(this: B) {
      clearInputs(this);
      opts.head?.(this);
      for (let i = 0; i < this.itemCount_; i++) opts.add(this, i, this.itemCount_);
      if (this.itemCount_ === 0) opts.empty?.(this);
    },
    mutationToDom(this: B) {
      const m = Blockly.utils.xml.createElement('mutation');
      m.setAttribute('items', String(this.itemCount_));
      return m;
    },
    domToMutation(this: B, xml: Element) {
      const n = parseInt(xml.getAttribute('items') ?? '', 10);
      this.itemCount_ = Number.isFinite(n) ? n : opts.defaultCount;
      this.rebuild_();
    },
  };
}

// ───────────────────────────── 제어 (control.js) ─────────────────────────────
defs['controls_if'] = {
  init(this: B) {
    this.setColour(COLOUR.CONTROL);
    shape(this, 'stmt');
    this.elseifCount_ = 0;
    this.elseCount_ = 0;
    this.rebuild_();
  },
  rebuild_(this: B) {
    clearInputs(this);
    this.appendValueInput('IF0').appendField(M('LANG_CONTROLS_IF_MSG_IF'));
    this.appendStatementInput('DO0').appendField(M('LANG_CONTROLS_IF_MSG_THEN'));
    for (let i = 1; i <= this.elseifCount_; i++) {
      this.appendValueInput('IF' + i).appendField(M('LANG_CONTROLS_IF_MSG_ELSEIF'));
      this.appendStatementInput('DO' + i).appendField(M('LANG_CONTROLS_IF_MSG_THEN'));
    }
    // 원본은 Blockly.Msg.CONTROLS_IF_MSG_ELSE 를 쓰지만, 그 키의 한국어 번역은 저장소에 없다(영어 "else").
    // 앱인벤터 한국어 메시지 파일의 LANG_CONTROLS_IF_MSG_ELSE("아니면")로 표시한다.
    if (this.elseCount_) this.appendStatementInput('ELSE').appendField(M('LANG_CONTROLS_IF_MSG_ELSE'));
  },
  mutationToDom(this: B) {
    if (!this.elseifCount_ && !this.elseCount_) return null;
    const m = Blockly.utils.xml.createElement('mutation');
    if (this.elseifCount_) m.setAttribute('elseif', String(this.elseifCount_));
    if (this.elseCount_) m.setAttribute('else', '1');
    return m;
  },
  domToMutation(this: B, xml: Element) {
    this.elseifCount_ = parseInt(xml.getAttribute('elseif') ?? '', 10) || 0;
    this.elseCount_ = parseInt(xml.getAttribute('else') ?? '', 10) || 0;
    this.rebuild_();
  },
};

def('controls_forRange', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('START')
    .appendField(M('LANG_CONTROLS_FORRANGE_INPUT_ITEM'))
    .appendField(new Blockly.FieldTextInput(M('LANG_CONTROLS_FORRANGE_INPUT_VAR')), 'VAR')
    .appendField(M('LANG_CONTROLS_FORRANGE_INPUT_START'))
    .setAlign(RIGHT);
  b.appendValueInput('END').appendField(M('LANG_CONTROLS_FORRANGE_INPUT_END')).setAlign(RIGHT);
  b.appendValueInput('STEP').appendField(M('LANG_CONTROLS_FORRANGE_INPUT_STEP')).setAlign(RIGHT);
  b.appendStatementInput('DO').appendField(M('LANG_CONTROLS_FORRANGE_INPUT_DO')).setAlign(RIGHT);
});
def('controls_forEach', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('LIST')
    .appendField(M('LANG_CONTROLS_FOREACH_INPUT_ITEM'))
    .appendField(new Blockly.FieldTextInput(M('LANG_CONTROLS_FOREACH_INPUT_VAR')), 'VAR')
    .appendField(M('LANG_CONTROLS_FOREACH_INPUT_INLIST'))
    .setAlign(RIGHT);
  b.appendStatementInput('DO').appendField(M('LANG_CONTROLS_FOREACH_INPUT_DO'));
});
def('controls_for_each_dict', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('DICT')
    .appendField(M('LANG_CONTROLS_FOR_EACH_DICT_TITLE'))
    .appendField(new Blockly.FieldTextInput('key'), 'KEY')
    .appendField(M('LANG_CONTROLS_FOR_EACH_DICT_WITH'))
    .appendField(new Blockly.FieldTextInput('value'), 'VALUE')
    .appendField(M('LANG_CONTROLS_FOR_EACH_DICT_IN'))
    .setAlign(RIGHT);
  b.appendStatementInput('DO').appendField(M('LANG_CONTROLS_FOREACH_DICT_INPUT_DO'));
});
def('controls_while', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('TEST').appendField(M('LANG_CONTROLS_WHILE_TITLE')).appendField(M('LANG_CONTROLS_WHILE_INPUT_TEST')).setAlign(RIGHT);
  b.appendStatementInput('DO').appendField(M('LANG_CONTROLS_WHILE_INPUT_DO')).setAlign(RIGHT);
});
def('controls_choose', COLOUR.CONTROL, 'out', (b) => {
  b.appendValueInput('TEST').appendField(M('LANG_CONTROLS_CHOOSE_TITLE')).appendField(M('LANG_CONTROLS_CHOOSE_INPUT_TEST')).setAlign(RIGHT);
  b.appendValueInput('THENRETURN').appendField(M('LANG_CONTROLS_CHOOSE_INPUT_THEN_RETURN')).setAlign(RIGHT);
  b.appendValueInput('ELSERETURN').appendField(M('LANG_CONTROLS_CHOOSE_INPUT_ELSE_RETURN')).setAlign(RIGHT);
});
def('controls_do_then_return', COLOUR.CONTROL, 'out', (b) => {
  b.appendStatementInput('STM').appendField(M('LANG_CONTROLS_DO_THEN_RETURN_INPUT_DO'));
  b.appendValueInput('VALUE').appendField(M('LANG_CONTROLS_DO_THEN_RETURN_INPUT_RETURN')).setAlign(RIGHT);
});
def('controls_eval_but_ignore', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('VALUE').appendField(M('LANG_CONTROLS_EVAL_BUT_IGNORE_TITLE'));
});
def('controls_openAnotherScreen', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('SCREEN').appendField(M('LANG_CONTROLS_OPEN_ANOTHER_SCREEN_TITLE')).appendField(M('LANG_CONTROLS_OPEN_ANOTHER_SCREEN_INPUT_SCREENNAME')).setAlign(RIGHT);
});
def('controls_openAnotherScreenWithStartValue', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('SCREENNAME')
    .appendField(M('LANG_CONTROLS_OPEN_ANOTHER_SCREEN_WITH_START_VALUE_TITLE'))
    .appendField(M('LANG_CONTROLS_OPEN_ANOTHER_SCREEN_WITH_START_VALUE_INPUT_SCREENNAME'))
    .setAlign(RIGHT);
  b.appendValueInput('STARTVALUE').appendField(M('LANG_CONTROLS_OPEN_ANOTHER_SCREEN_WITH_START_VALUE_INPUT_STARTVALUE')).setAlign(RIGHT);
});
def('controls_getStartValue', COLOUR.CONTROL, 'out', (b) => {
  b.appendDummyInput().appendField(M('LANG_CONTROLS_GET_START_VALUE_TITLE'));
});
def('controls_closeScreen', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendDummyInput().appendField(M('LANG_CONTROLS_CLOSE_SCREEN_TITLE'));
});
def('controls_closeScreenWithValue', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('SCREEN').appendField(M('LANG_CONTROLS_CLOSE_SCREEN_WITH_VALUE_TITLE')).appendField(M('LANG_CONTROLS_CLOSE_SCREEN_WITH_VALUE_INPUT_RESULT')).setAlign(RIGHT);
});
def('controls_closeApplication', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendDummyInput().appendField(M('LANG_CONTROLS_CLOSE_APPLICATION_TITLE'));
});
def('controls_getPlainStartText', COLOUR.CONTROL, 'out', (b) => {
  b.appendDummyInput().appendField(M('LANG_CONTROLS_GET_PLAIN_START_TEXT_TITLE'));
});
def('controls_closeScreenWithPlainText', COLOUR.CONTROL, 'stmt', (b) => {
  b.appendValueInput('TEXT').appendField(M('LANG_CONTROLS_CLOSE_SCREEN_WITH_PLAIN_TEXT_TITLE')).appendField(M('LANG_CONTROLS_CLOSE_SCREEN_WITH_PLAIN_TEXT_INPUT_TEXT')).setAlign(RIGHT);
});
def('controls_break', COLOUR.CONTROL, 'none', (b) => {
  b.setPreviousStatement(true);
  b.appendDummyInput().appendField(M('LANG_CONTROLS_BREAK_TITLE'));
});

// ───────────────────────────── 논리 (logic.js) ─────────────────────────────
const BOOL_OPS = (): [string, string][] => [
  [M('LANG_LOGIC_BOOLEAN_TRUE'), 'TRUE'],
  [M('LANG_LOGIC_BOOLEAN_FALSE'), 'FALSE'],
];
def('logic_boolean', COLOUR.LOGIC, 'out', (b) => {
  b.appendDummyInput().appendField(mapDropdown(BOOL_OPS(), 'TRUE'), 'BOOL');
});
def('logic_false', COLOUR.LOGIC, 'out', (b) => {
  b.appendDummyInput().appendField(mapDropdown(BOOL_OPS(), 'FALSE'), 'BOOL');
});
def('logic_negate', COLOUR.LOGIC, 'out', (b) => {
  b.appendValueInput('BOOL').appendField(M('LANG_LOGIC_NEGATE_INPUT_NOT'));
});
def('logic_compare', COLOUR.LOGIC, 'out', (b) => {
  b.appendValueInput('A');
  b.appendValueInput('B').appendField(
    mapDropdown([
      [M('LANG_LOGIC_COMPARE_EQ'), 'EQ'],
      [M('LANG_LOGIC_COMPARE_NEQ'), 'NEQ'],
    ]),
    'OP',
  );
  b.setInputsInline(true);
});
for (const [type, op] of [
  ['logic_operation', 'AND'],
  ['logic_or', 'OR'],
] as const) {
  const ops = (): [string, string][] => [
    [M('LANG_LOGIC_OPERATION_AND'), 'AND'],
    [M('LANG_LOGIC_OPERATION_OR'), 'OR'],
  ];
  const opLabel = (v: string) => ops().find((o) => o[1] === v)?.[0] ?? v;
  const identity = (v: string) => M(v === 'OR' ? 'LANG_LOGIC_BOOLEAN_FALSE' : 'LANG_LOGIC_BOOLEAN_TRUE');
  // 연산자 드롭다운 값이 XML 에서 정해지면 세 번째 이후 입력의 "그리고/또는" 글자도 맞춘다 (원본의 updateFields)
  const sync = (b: B) => (v: string) => {
    b.opValue_ = v;
    for (const input of b.inputList)
      for (const f of input.fieldRow) {
        if (f.name?.startsWith('OPLABEL')) f.setValue(opLabel(v));
        if (f.name === 'IDENTITY') f.setValue(identity(v));
      }
  };
  repeating(type, COLOUR.LOGIC, 'out', {
    defaultCount: 2,
    inline: true,
    add(b, i, count) {
      const name = i > 1 ? 'BOOL' + i : ['A', 'B'][i];
      const input = b.appendValueInput(name);
      const cur: string = b.opValue_ ?? op;
      if (i === 1 || (count === 1 && i === 0)) {
        if (count === 1) input.appendField(new Blockly.FieldLabel(identity(cur)), 'IDENTITY');
        input.appendField(mapDropdown(ops(), cur, sync(b)), 'OP');
      } else if (i > 1) {
        input.appendField(new Blockly.FieldLabel(opLabel(cur)), 'OPLABEL' + i);
      }
      return input;
    },
    empty(b) {
      b.appendDummyInput('EMPTY').appendField(mapDropdown(ops(), b.opValue_ ?? op, sync(b)), 'OP');
    },
  });
}

// ───────────────────────────── 수학 (math.js) ─────────────────────────────
def('math_number', COLOUR.MATH, 'out', (b) => {
  b.appendDummyInput().appendField(new Blockly.FieldTextInput('0'), 'NUM');
});
def('math_number_radix', COLOUR.MATH, 'out', (b) => {
  b.appendDummyInput()
    .appendField(
      mapDropdown(
        [
          [M('LANG_MATH_DECIMAL_FORMAT'), 'DEC'],
          [M('LANG_MATH_BINARY_FORMAT'), 'BIN'],
          [M('LANG_MATH_OCTAL_FORMAT'), 'OCT'],
          [M('LANG_MATH_HEXADECIMAL_FORMAT'), 'HEX'],
        ],
        'DEC',
      ),
      'OP',
    )
    .appendField(new Blockly.FieldTextInput('0'), 'NUM');
});
def('math_compare', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('A');
  b.appendValueInput('B').appendField(
    mapDropdown(
      [
        [M('LANG_MATH_COMPARE_EQ'), 'EQ'],
        [M('LANG_MATH_COMPARE_NEQ'), 'NEQ'],
        [M('LANG_MATH_COMPARE_LT'), 'LT'],
        [M('LANG_MATH_COMPARE_LTE'), 'LTE'],
        [M('LANG_MATH_COMPARE_GT'), 'GT'],
        [M('LANG_MATH_COMPARE_GTE'), 'GTE'],
      ],
      'EQ',
    ),
    'OP',
  );
  b.setInputsInline(true);
});
repeating('math_add', COLOUR.MATH, 'out', {
  defaultCount: 2,
  inline: true,
  add(b, i, count) {
    const input = b.appendValueInput('NUM' + i);
    if (i !== 0) input.appendField(M('LANG_MATH_ARITHMETIC_ADD'));
    else if (count === 1) input.appendField('0 ' + M('LANG_MATH_ARITHMETIC_ADD'));
    return input;
  },
  empty(b) {
    b.appendDummyInput('EMPTY').appendField(M('LANG_MATH_ARITHMETIC_ADD'));
  },
});
repeating('math_multiply', COLOUR.MATH, 'out', {
  defaultCount: 2,
  inline: true,
  add(b, i, count) {
    const input = b.appendValueInput('NUM' + i);
    if (i !== 0) input.appendField(TIMES);
    else if (count === 1) input.appendField('1 ' + TIMES);
    return input;
  },
  empty(b) {
    b.appendDummyInput('EMPTY').appendField(TIMES);
  },
});
for (const [type, key] of [
  ['math_subtract', 'LANG_MATH_ARITHMETIC_MINUS'],
  ['math_division', 'LANG_MATH_ARITHMETIC_DIVIDE'],
  ['math_power', 'LANG_MATH_ARITHMETIC_POWER'],
] as const) {
  def(type, COLOUR.MATH, 'out', (b) => {
    b.appendValueInput('A');
    b.appendValueInput('B').appendField(M(key));
    b.setInputsInline(true);
  });
}
def('math_random_int', COLOUR.MATH, 'out', (b) => {
  interpolate(b, M('LANG_MATH_RANDOM_INT_INPUT'), 'FROM', 'TO');
  b.setInputsInline(true);
});
def('math_random_float', COLOUR.MATH, 'out', (b) => {
  b.appendDummyInput().appendField(M('LANG_MATH_RANDOM_FLOAT_TITLE_RANDOM'));
});
def('math_random_set_seed', COLOUR.MATH, 'stmt', (b) => {
  b.appendValueInput('NUM').appendField(M('LANG_MATH_RANDOM_SEED_TITLE_RANDOM')).appendField(M('LANG_MATH_RANDOM_SEED_INPUT_TO'));
});
const SINGLE_OPS = (): [string, string][] => [
  [M('LANG_MATH_SINGLE_OP_ROOT'), 'ROOT'],
  [M('LANG_MATH_SINGLE_OP_ABSOLUTE'), 'ABS'],
  [M('LANG_MATH_SINGLE_OP_NEG'), 'NEG'],
  [M('LANG_MATH_SINGLE_OP_LN'), 'LN'],
  [M('LANG_MATH_SINGLE_OP_EXP'), 'EXP'],
  [M('LANG_MATH_ROUND_OPERATOR_ROUND'), 'ROUND'],
  [M('LANG_MATH_ROUND_OPERATOR_CEILING'), 'CEILING'],
  [M('LANG_MATH_ROUND_OPERATOR_FLOOR'), 'FLOOR'],
];
for (const [type, op] of [
  ['math_single', 'ROOT'],
  ['math_abs', 'ABS'],
  ['math_neg', 'NEG'],
  ['math_round', 'ROUND'],
  ['math_ceiling', 'CEILING'],
  ['math_floor', 'FLOOR'],
] as const) {
  def(type, COLOUR.MATH, 'out', (b) => {
    b.appendValueInput('NUM').appendField(mapDropdown(SINGLE_OPS(), op), 'OP');
  });
}
def('math_divide', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('DIVIDEND').appendField(
    mapDropdown(
      [
        [M('LANG_MATH_DIVIDE_OPERATOR_MODULO'), 'MODULO'],
        [M('LANG_MATH_DIVIDE_OPERATOR_REMAINDER'), 'REMAINDER'],
        [M('LANG_MATH_DIVIDE_OPERATOR_QUOTIENT'), 'QUOTIENT'],
      ],
      'MODULO',
    ),
    'OP',
  );
  b.appendValueInput('DIVISOR').appendField(M('LANG_MATH_DIVIDE'));
  b.setInputsInline(true);
});
const TRIG_OPS = (): [string, string][] => [
  [M('LANG_MATH_TRIG_SIN'), 'SIN'],
  [M('LANG_MATH_TRIG_COS'), 'COS'],
  [M('LANG_MATH_TRIG_TAN'), 'TAN'],
  [M('LANG_MATH_TRIG_ASIN'), 'ASIN'],
  [M('LANG_MATH_TRIG_ACOS'), 'ACOS'],
  [M('LANG_MATH_TRIG_ATAN'), 'ATAN'],
];
for (const [type, op] of [
  ['math_trig', 'SIN'],
  ['math_cos', 'COS'],
  ['math_tan', 'TAN'],
] as const) {
  def(type, COLOUR.MATH, 'out', (b) => {
    b.appendValueInput('NUM').appendField(mapDropdown(TRIG_OPS(), op), 'OP');
  });
}
def('math_atan2', COLOUR.MATH, 'out', (b) => {
  b.appendDummyInput().appendField(M('LANG_MATH_TRIG_ATAN2'));
  b.appendValueInput('Y').appendField(M('LANG_MATH_TRIG_ATAN2_Y')).setAlign(RIGHT);
  b.appendValueInput('X').appendField(M('LANG_MATH_TRIG_ATAN2_X')).setAlign(RIGHT);
  b.setInputsInline(false);
});
def('math_convert_angles', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('NUM')
    .appendField(M('LANG_MATH_CONVERT_ANGLES_TITLE_CONVERT'))
    .appendField(
      mapDropdown([
        [M('LANG_MATH_CONVERT_ANGLES_OP_RAD_TO_DEG'), 'RADIANS_TO_DEGREES'],
        [M('LANG_MATH_CONVERT_ANGLES_OP_DEG_TO_RAD'), 'DEGREES_TO_RADIANS'],
      ]),
      'OP',
    );
});
def('math_format_as_decimal', COLOUR.MATH, 'out', (b) => {
  interpolate(b, M('LANG_MATH_FORMAT_AS_DECIMAL_INPUT'), 'NUM', 'PLACES');
  b.setInputsInline(false);
});
def('math_is_a_number', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('NUM').appendField(
    mapDropdown([
      [M('LANG_MATH_IS_A_NUMBER_INPUT_NUM'), 'NUMBER'],
      [M('LANG_MATH_IS_A_DECIMAL_INPUT_NUM'), 'BASE10'],
      [M('LANG_MATH_IS_A_HEXADECIMAL_INPUT_NUM'), 'HEXADECIMAL'],
      [M('LANG_MATH_IS_A_BINARY_INPUT_NUM'), 'BINARY'],
    ]),
    'OP',
  );
});
def('math_convert_number', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('NUM')
    .appendField(M('LANG_MATH_CONVERT_NUMBER_TITLE_CONVERT'))
    .appendField(
      mapDropdown([
        [M('LANG_MATH_CONVERT_NUMBER_OP_DEC_TO_HEX'), 'DEC_TO_HEX'],
        [M('LANG_MATH_CONVERT_NUMBER_OP_HEX_TO_DEC'), 'HEX_TO_DEC'],
        [M('LANG_MATH_CONVERT_NUMBER_OP_DEC_TO_BIN'), 'DEC_TO_BIN'],
        [M('LANG_MATH_CONVERT_NUMBER_OP_BIN_TO_DEC'), 'BIN_TO_DEC'],
      ]),
      'OP',
    );
});
def('math_on_list2', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('LIST').appendField(
    mapDropdown([
      [M('LANG_MATH_ONLIST_OPERATOR_AVG'), 'AVG'],
      [M('LANG_MATH_ONLIST_OPERATOR_MIN_LIST'), 'MIN'],
      [M('LANG_MATH_ONLIST_OPERATOR_MAX_LIST'), 'MAX'],
      [M('LANG_MATH_ONLIST_OPERATOR_GM'), 'GM'],
      [M('LANG_MATH_ONLIST_OPERATOR_SD'), 'SD'],
      [M('LANG_MATH_ONLIST_OPERATOR_SE'), 'SE'],
    ]),
    'OP',
  );
});
def('math_mode_of_list', COLOUR.MATH, 'out', (b) => {
  b.appendValueInput('LIST').appendField(M('LANG_MATH_LIST_MODE_TITLE'));
});
repeating('math_on_list', COLOUR.MATH, 'out', {
  defaultCount: 2,
  inline: false,
  add(b, i) {
    const input = b.appendValueInput('NUM' + i);
    if (i === 0)
      input.appendField(
        mapDropdown(
          [
            [M('LANG_MATH_ONLIST_OPERATOR_MIN'), 'MIN'],
            [M('LANG_MATH_ONLIST_OPERATOR_MAX'), 'MAX'],
          ],
          'MIN',
        ),
        'OP',
      );
    return input;
  },
  empty(b) {
    b.appendDummyInput('EMPTY').appendField(
      mapDropdown([
        [M('LANG_MATH_ONLIST_OPERATOR_MIN'), 'MIN'],
        [M('LANG_MATH_ONLIST_OPERATOR_MAX'), 'MAX'],
      ]),
      'OP',
    );
  },
});

// ───────────────────────────── 텍스트 (text.js) ─────────────────────────────
def('text', COLOUR.TEXT, 'out', (b) => {
  b.appendDummyInput()
    .appendField(M('LANG_TEXT_TEXT_LEFT_QUOTE'))
    .appendField(new Blockly.FieldTextInput(''), 'TEXT')
    .appendField(M('LANG_TEXT_TEXT_RIGHT_QUOTE'));
});
def('text_multiline_text', COLOUR.TEXT, 'out', (b) => {
  b.appendDummyInput()
    .appendField(M('LANG_TEXT_MULTILINE_TEXT_TITLE'))
    .appendField(M('LANG_TEXT_TEXT_LEFT_QUOTE'))
    .appendField(new Blockly.FieldTextInput(''), 'TEXT')
    .appendField(M('LANG_TEXT_TEXT_RIGHT_QUOTE'));
});
def('obfuscated_text', COLOUR.TEXT, 'out', (b) => {
  b.appendDummyInput()
    .appendField(M('LANG_TEXT_TEXT_OBFUSCATE') + ' ' + M('LANG_TEXT_TEXT_LEFT_QUOTE'))
    .appendField(new Blockly.FieldTextInput(''), 'TEXT')
    .appendField(M('LANG_TEXT_TEXT_RIGHT_QUOTE'));
});
repeating('text_join', COLOUR.TEXT, 'out', {
  defaultCount: 2,
  add(b, i) {
    const input = b.appendValueInput('ADD' + i);
    if (i === 0) input.appendField(M('LANG_TEXT_JOIN_TITLE_JOIN'));
    return input;
  },
  empty(b) {
    b.appendDummyInput('EMPTY').appendField(M('LANG_TEXT_JOIN_TITLE_JOIN'));
  },
});
def('text_length', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('VALUE').appendField(M('LANG_TEXT_LENGTH_INPUT_LENGTH'));
});
def('text_isEmpty', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('VALUE').appendField(M('LANG_TEXT_ISEMPTY_INPUT_ISEMPTY'));
});
def('text_compare', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('TEXT1').appendField(M('LANG_TEXT_COMPARE_INPUT_COMPARE'));
  b.appendValueInput('TEXT2').appendField(
    mapDropdown(
      [
        [M('LANG_TEXT_COMPARE_LT'), 'LT'],
        [M('LANG_TEXT_COMPARE_EQUAL'), 'EQUAL'],
        [M('LANG_TEXT_COMPARE_NEQ'), 'NEQ'],
        [M('LANG_TEXT_COMPARE_GT'), 'GT'],
      ],
      'EQUAL',
    ),
    'OP',
  );
  b.setInputsInline(true);
});
def('text_trim', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('TEXT').appendField(M('LANG_TEXT_TRIM_TITLE_TRIM'));
});
def('text_changeCase', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('TEXT').appendField(
    mapDropdown([
      [M('LANG_TEXT_CHANGECASE_OPERATOR_UPPERCASE'), 'UPCASE'],
      [M('LANG_TEXT_CHANGECASE_OPERATOR_DOWNCASE'), 'DOWNCASE'],
    ]),
    'OP',
  );
});
def('text_starts_at', COLOUR.TEXT, 'out', (b) => {
  interpolate(b, M('LANG_TEXT_STARTS_AT_INPUT'), 'TEXT', 'PIECE');
  b.setInputsInline(false);
});
def(
  'text_contains',
  COLOUR.TEXT,
  'out',
  (b) => {
    interpolate(
      b,
      M('LANG_TEXT_CONTAINS_INPUT'),
      [
        'OP',
        mapDropdown([
          [M('LANG_TEXT_CONTAINS_OPERATOR_CONTAINS'), 'CONTAINS'],
          [M('LANG_TEXT_CONTAINS_OPERATOR_CONTAINS_ANY'), 'CONTAINS_ANY'],
          [M('LANG_TEXT_CONTAINS_OPERATOR_CONTAINS_ALL'), 'CONTAINS_ALL'],
        ]),
      ],
      'TEXT',
      ['PIECE_TEXT', new Blockly.FieldLabel(M('LANG_TEXT_CONTAINS_INPUT_PIECE'))],
      'PIECE',
    );
    b.setInputsInline(false);
  },
  {
    mutationToDom(this: B) {
      const m = Blockly.utils.xml.createElement('mutation');
      m.setAttribute('mode', this.getFieldValue('OP'));
      return m;
    },
    domToMutation(this: B, xml: Element) {
      const mode = xml.getAttribute('mode') ?? 'CONTAINS';
      this.setFieldValue(mode, 'OP');
      if (mode !== 'CONTAINS') this.setFieldValue(M('LANG_TEXT_CONTAINS_INPUT_PIECE_LIST'), 'PIECE_TEXT');
    },
  },
);
def(
  'text_split',
  COLOUR.TEXT,
  'out',
  (b) => {
    b.appendValueInput('TEXT')
      .appendField(
        mapDropdown([
          [M('LANG_TEXT_SPLIT_OPERATOR_SPLIT'), 'SPLIT'],
          [M('LANG_TEXT_SPLIT_OPERATOR_SPLIT_AT_FIRST'), 'SPLITATFIRST'],
          [M('LANG_TEXT_SPLIT_OPERATOR_SPLIT_AT_ANY'), 'SPLITATANY'],
          [M('LANG_TEXT_SPLIT_OPERATOR_SPLIT_AT_FIRST_OF_ANY'), 'SPLITATFIRSTOFANY'],
        ]),
        'OP',
      )
      .appendField(M('LANG_TEXT_SPLIT_INPUT_TEXT'));
    b.appendValueInput('AT').appendField(M('LANG_TEXT_SPLIT_INPUT_AT'), 'ARG2_NAME').setAlign(RIGHT);
  },
  {
    domToMutation(this: B, xml: Element) {
      const mode = xml.getAttribute('mode') ?? 'SPLIT';
      if (mode === 'SPLITATANY' || mode === 'SPLITATFIRSTOFANY') this.setFieldValue(M('LANG_TEXT_SPLIT_INPUT_AT_LIST'), 'ARG2_NAME');
    },
  },
);
def('text_split_at_spaces', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('TEXT').appendField(M('LANG_TEXT_SPLIT_AT_SPACES_TITLE'));
});
def('text_segment', COLOUR.TEXT, 'out', (b) => {
  interpolate(b, M('LANG_TEXT_SEGMENT_INPUT'), 'TEXT', 'START', 'LENGTH');
  b.setInputsInline(false);
});
def('text_replace_all', COLOUR.TEXT, 'out', (b) => {
  interpolate(b, M('LANG_TEXT_REPLACE_ALL_INPUT'), 'TEXT', 'SEGMENT', 'REPLACEMENT');
  b.setInputsInline(false);
});
def('text_is_string', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('ITEM').appendField(M('LANG_TEXT_TEXT_IS_STRING_TITLE')).appendField(M('LANG_TEXT_TEXT_IS_STRING_INPUT_THING'));
});
def('text_reverse', COLOUR.TEXT, 'out', (b) => {
  b.appendValueInput('VALUE').appendField(M('LANG_TEXT_REVERSE_INPUT'));
});

// ───────────────────────────── 리스트 (lists.js) ─────────────────────────────
repeating('lists_create_with', COLOUR.LIST, 'out', {
  defaultCount: 2,
  add(b, i) {
    const input = b.appendValueInput('ADD' + i);
    if (i === 0) input.appendField(M('LANG_LISTS_CREATE_WITH_TITLE_MAKE_LIST'));
    return input;
  },
  empty(b) {
    b.appendDummyInput('EMPTY').appendField(M('LANG_LISTS_CREATE_EMPTY_TITLE'));
  },
});
repeating('lists_add_items', COLOUR.LIST, 'stmt', {
  defaultCount: 1,
  head(b) {
    b.appendValueInput('LIST').appendField(M('LANG_LISTS_ADD_ITEMS_TITLE_ADD')).appendField(M('LANG_LISTS_ADD_ITEMS_INPUT_LIST'));
  },
  add(b, i) {
    return b.appendValueInput('ITEM' + i).appendField(M('LANG_LISTS_ADD_ITEMS_INPUT_ITEM')).setAlign(RIGHT);
  },
});
const interp = (type: string, s: Shape, key: string, args: string[], inline = false) =>
  def(type, COLOUR.LIST, s, (b) => {
    interpolate(b, M(key), ...args);
    b.setInputsInline(inline);
  });
interp('lists_is_in', 'out', 'LANG_LISTS_IS_IN_INPUT', ['ITEM', 'LIST']);
interp('lists_position_in', 'out', 'LANG_LISTS_POSITION_IN_INPUT', ['ITEM', 'LIST']);
interp('lists_select_item', 'out', 'LANG_LISTS_SELECT_ITEM_INPUT', ['LIST', 'NUM']);
interp('lists_insert_item', 'stmt', 'LANG_LISTS_INSERT_INPUT', ['LIST', 'INDEX', 'ITEM']);
interp('lists_replace_item', 'stmt', 'LANG_LISTS_REPLACE_ITEM_INPUT', ['LIST', 'NUM', 'ITEM']);
interp('lists_remove_item', 'stmt', 'LANG_LISTS_REMOVE_ITEM_INPUT', ['LIST', 'INDEX']);
interp('lists_append_list', 'stmt', 'LANG_LISTS_APPEND_LIST_INPUT', ['LIST0', 'LIST1']);
interp('lists_lookup_in_pairs', 'out', 'LANG_LISTS_LOOKUP_IN_PAIRS_INPUT', ['KEY', 'LIST', 'NOTFOUND']);
interp('lists_join_with_separator', 'out', 'LANG_LISTS_JOIN_WITH_SEPARATOR_INPUT', ['SEPARATOR', 'LIST']);
interp('lists_slice', 'out', 'LANG_LISTS_SLICE_INPUT', ['LIST', 'INDEX1', 'INDEX2']);
const simpleList = (type: string, s: Shape, input: string, keys: string[]) =>
  def(type, COLOUR.LIST, s, (b) => {
    const i = b.appendValueInput(input);
    for (const k of keys) i.appendField(M(k));
  });
simpleList('lists_length', 'out', 'LIST', ['LANG_LISTS_LENGTH_INPUT_LENGTH', 'LANG_LISTS_LENGTH_INPUT_LIST']);
simpleList('lists_is_empty', 'out', 'LIST', ['LANG_LISTS_TITLE_IS_EMPTY', 'LANG_LISTS_INPUT_LIST']);
simpleList('lists_pick_random_item', 'out', 'LIST', ['LANG_LISTS_PICK_RANDOM_TITLE_PICK_RANDOM', 'LANG_LISTS_PICK_RANDOM_ITEM_INPUT_LIST']);
simpleList('lists_copy', 'out', 'LIST', ['LANG_LISTS_COPY_TITLE_COPY', 'LANG_LISTS_COPY_INPUT_LIST']);
simpleList('lists_is_list', 'out', 'ITEM', ['LANG_LISTS_IS_LIST_TITLE_IS_LIST', 'LANG_LISTS_IS_LIST_INPUT_THING']);
simpleList('lists_reverse', 'out', 'LIST', ['LANG_LISTS_REVERSE_TITLE_REVERSE', 'LANG_LISTS_REVERSE_INPUT_LIST']);
simpleList('lists_to_csv_row', 'out', 'LIST', ['LANG_LISTS_TO_CSV_ROW_TITLE_TO_CSV', 'LANG_LISTS_TO_CSV_ROW_INPUT_LIST']);
simpleList('lists_to_csv_table', 'out', 'LIST', ['LANG_LISTS_TO_CSV_TABLE_TITLE_TO_CSV', 'LANG_LISTS_TO_CSV_TABLE_INPUT_LIST']);
simpleList('lists_from_csv_row', 'out', 'TEXT', ['LANG_LISTS_FROM_CSV_ROW_TITLE_FROM_CSV', 'LANG_LISTS_FROM_CSV_ROW_INPUT_TEXT']);
simpleList('lists_from_csv_table', 'out', 'TEXT', ['LANG_LISTS_FROM_CSV_TABLE_TITLE_FROM_CSV', 'LANG_LISTS_FROM_CSV_TABLE_INPUT_TEXT']);
simpleList('lists_sort', 'out', 'LIST', ['LANG_LISTS_SORT_NONDEST_TITLE_SORT']);
simpleList('lists_but_first', 'out', 'LIST', ['LANG_LISTS_BUT_FIRST_INPUT_BUT_FIRST']);
simpleList('lists_but_last', 'out', 'LIST', ['LANG_LISTS_BUT_LAST_INPUT_BUT_LAST']);

// ───────────────────────────── 색 (colors.js) ─────────────────────────────
for (const [type, hex] of [
  ['color_black', '#000000'],
  ['color_white', '#FFFFFF'],
  ['color_red', '#FF0000'],
  ['color_pink', '#FFAFAF'],
  ['color_orange', '#FFC800'],
  ['color_yellow', '#FFFF00'],
  ['color_green', '#00FF00'],
  ['color_cyan', '#00FFFF'],
  ['color_blue', '#0000FF'],
  ['color_magenta', '#FF00FF'],
  ['color_light_gray', '#CCCCCC'],
  ['color_gray', '#888888'],
  ['color_dark_gray', '#444444'],
] as const) {
  def(type, COLOUR.COLOR, 'out', (b) => {
    b.appendDummyInput().appendField(swatch(hex), 'COLOR');
  });
}
def('color_make_color', COLOUR.COLOR, 'out', (b) => {
  b.appendValueInput('COLORLIST').appendField(M('LANG_COLOUR_MAKE_COLOUR'));
});
def('color_split_color', COLOUR.COLOR, 'out', (b) => {
  b.appendValueInput('COLOR').appendField(M('LANG_COLOUR_SPLIT_COLOUR'));
});

// ───────────────────────────── 변수 (lexical-variables.js) ─────────────────────────────
def('global_declaration', COLOUR.VARIABLE, 'none', (b) => {
  b.appendValueInput('VALUE')
    .appendField(M('LANG_VARIABLES_GLOBAL_DECLARATION_TITLE_INIT'))
    .appendField(new Blockly.FieldTextInput(M('LANG_VARIABLES_GLOBAL_DECLARATION_NAME')), 'NAME')
    .appendField(M('LANG_VARIABLES_GLOBAL_DECLARATION_TO'));
});

/** <mutation><eventparam name="x"/></mutation> : 이벤트 매개변수를 가리키는 변수 블록 */
const eventParamMutation = {
  mutationToDom(this: B) {
    if (!this.eventparam) return null;
    const m = Blockly.utils.xml.createElement('mutation');
    const e = Blockly.utils.xml.createElement('eventparam');
    e.setAttribute('name', this.eventparam);
    m.appendChild(e);
    return m;
  },
  domToMutation(this: B, xml: Element) {
    for (const c of Array.from(xml.children)) {
      if (c.nodeName.toLowerCase() === 'eventparam') this.eventparam = c.getAttribute('name') ?? undefined;
    }
  },
};
const varDisplay = (b: B) => (v: string) => (b.eventparam && v === b.eventparam ? paramName(v) : displayVarName(v));

def(
  'lexical_variable_get',
  COLOUR.VARIABLE,
  'out',
  (b) => {
    b.appendDummyInput().appendField(M('LANG_VARIABLES_GET_TITLE_GET')).appendField(fixedDropdown(' ', varDisplay(b)), 'VAR');
  },
  eventParamMutation,
);
def(
  'lexical_variable_set',
  COLOUR.VARIABLE,
  'stmt',
  (b) => {
    b.appendValueInput('VALUE')
      .appendField(M('LANG_VARIABLES_SET_TITLE_SET'))
      .appendField(fixedDropdown(' ', varDisplay(b)), 'VAR')
      .appendField(M('LANG_VARIABLES_SET_TITLE_TO'));
  },
  eventParamMutation,
);

/** local_declaration_statement / expression : <mutation><localname name="x"/>...</mutation> */
for (const [type, s, body] of [
  ['local_declaration_statement', 'stmt', 'STACK'],
  ['local_declaration_expression', 'out', 'RETURN'],
] as const) {
  defs[type] = {
    init(this: B) {
      this.setColour(COLOUR.VARIABLE);
      shape(this, s);
      this.localNames_ = [M('LANG_VARIABLES_LOCAL_DECLARATION_DEFAULT_NAME')];
      this.rebuild_();
    },
    rebuild_(this: B) {
      clearInputs(this);
      this.localNames_.forEach((n: string, i: number) => {
        this.appendValueInput('DECL' + i)
          .appendField(M('LANG_VARIABLES_LOCAL_DECLARATION_TITLE_INIT'))
          .appendField(new Blockly.FieldTextInput(n), 'VAR' + i)
          .appendField(M('LANG_VARIABLES_LOCAL_DECLARATION_INPUT_TO'))
          .setAlign(RIGHT);
      });
      if (body === 'STACK') this.appendStatementInput('STACK').appendField(M('LANG_VARIABLES_LOCAL_DECLARATION_IN_DO'));
      else this.appendValueInput('RETURN').appendField(M('LANG_VARIABLES_LOCAL_DECLARATION_EXPRESSION_IN_RETURN')).setAlign(RIGHT);
    },
    mutationToDom(this: B) {
      const m = Blockly.utils.xml.createElement('mutation');
      for (const n of this.localNames_) {
        const e = Blockly.utils.xml.createElement('localname');
        e.setAttribute('name', n);
        m.appendChild(e);
      }
      return m;
    },
    domToMutation(this: B, xml: Element) {
      this.localNames_ = Array.from(xml.children)
        .filter((c) => c.nodeName.toLowerCase() === 'localname')
        .map((c) => c.getAttribute('name') ?? '');
      this.rebuild_();
    },
  };
}

// ───────────────────────────── 함수 (procedures.js) ─────────────────────────────
function argNames(xml: Element): string[] {
  return Array.from(xml.children)
    .filter((c) => c.nodeName.toLowerCase() === 'arg')
    .map((c) => c.getAttribute('name') ?? '');
}
for (const [type, ret] of [
  ['procedures_defnoreturn', false],
  ['procedures_defreturn', true],
] as const) {
  defs[type] = {
    init(this: B) {
      this.setColour(COLOUR.PROCEDURE);
      this.arguments_ = [];
      this.rebuild_();
    },
    rebuild_(this: B) {
      const name = (this.getFieldValue('NAME') as string | null) ?? 'procedure';
      clearInputs(this);
      const header = this.appendDummyInput('HEADER')
        .appendField(M(ret ? 'LANG_PROCEDURES_DEFRETURN_DEFINE' : 'LANG_PROCEDURES_DEFNORETURN_DEFINE'))
        .appendField(new Blockly.FieldTextInput(name), 'NAME');
      this.arguments_.forEach((a: string, i: number) => header.appendField(new Blockly.FieldTextInput(a), 'VAR' + i));
      if (ret) this.appendValueInput('RETURN').appendField(M('LANG_PROCEDURES_DEFRETURN_RETURN')).setAlign(RIGHT);
      else this.appendStatementInput('STACK').appendField(M('LANG_PROCEDURES_DEFNORETURN_DO'));
    },
    mutationToDom(this: B) {
      const m = Blockly.utils.xml.createElement('mutation');
      for (const a of this.arguments_) {
        const e = Blockly.utils.xml.createElement('arg');
        e.setAttribute('name', a);
        m.appendChild(e);
      }
      return m;
    },
    domToMutation(this: B, xml: Element) {
      this.arguments_ = argNames(xml);
      this.rebuild_();
    },
  };
}
for (const [type, ret] of [
  ['procedures_callnoreturn', false],
  ['procedures_callreturn', true],
] as const) {
  defs[type] = {
    init(this: B) {
      this.setColour(COLOUR.PROCEDURE);
      shape(this, ret ? 'out' : 'stmt');
      this.arguments_ = [];
      this.rebuild_('');
    },
    rebuild_(this: B, procName: string) {
      clearInputs(this);
      this.appendDummyInput()
        .appendField(M(ret ? 'LANG_PROCEDURES_CALLRETURN_CALL' : 'LANG_PROCEDURES_CALLNORETURN_CALL'))
        .appendField(fixedDropdown(procName), 'PROCNAME');
      this.arguments_.forEach((a: string, i: number) => this.appendValueInput('ARG' + i).appendField(a).setAlign(RIGHT));
    },
    mutationToDom(this: B) {
      const m = Blockly.utils.xml.createElement('mutation');
      m.setAttribute('name', this.getFieldValue('PROCNAME'));
      for (const a of this.arguments_) {
        const e = Blockly.utils.xml.createElement('arg');
        e.setAttribute('name', a);
        m.appendChild(e);
      }
      return m;
    },
    domToMutation(this: B, xml: Element) {
      this.arguments_ = argNames(xml);
      this.rebuild_(xml.getAttribute('name') ?? '');
    },
  };
}

// ───────────────────────────── 컴포넌트 (components.js) ─────────────────────────────
function compDropdown(instance: string) {
  return fixedDropdown(instance);
}

defs['component_event'] = {
  init(this: B) {
    this.setColour(COLOUR.EVENT);
  },
  mutationToDom(this: B) {
    const m = Blockly.utils.xml.createElement('mutation');
    m.setAttribute('component_type', this.typeName);
    m.setAttribute('is_generic', this.isGeneric ? 'true' : 'false');
    if (!this.isGeneric) m.setAttribute('instance_name', this.instanceName);
    m.setAttribute('event_name', this.eventName);
    if (!this.horizontalParameters) m.setAttribute('vertical_parameters', 'true');
    return m;
  },
  domToMutation(this: B, xml: Element) {
    clearInputs(this);
    this.typeName = xml.getAttribute('component_type') ?? '';
    this.eventName = xml.getAttribute('event_name') ?? '';
    this.isGeneric = xml.getAttribute('is_generic') === 'true';
    this.instanceName = xml.getAttribute('instance_name') ?? '';
    this.horizontalParameters = xml.getAttribute('vertical_parameters') !== 'true';
    this.setColour(COLOUR.EVENT);
    const localized = eventName(this.eventName);
    if (!this.isGeneric) {
      this.appendDummyInput('WHENTITLE')
        .appendField(M('LANG_COMPONENT_BLOCK_TITLE_WHEN'))
        .appendField(compDropdown(this.instanceName), 'COMPONENT_SELECTOR')
        .appendField('.' + localized);
    } else {
      this.appendDummyInput('WHENTITLE').appendField(
        M('LANG_COMPONENT_BLOCK_GENERIC_EVENT_TITLE') + componentTypeName(this.typeName) + '.' + localized,
      );
    }
    // 매개변수: param_name0.. 가 있으면 그 이름(사용자가 바꾼 이름), 없으면 표에서 기본 이름
    const defaults = eventParams(this.typeName, this.eventName) ?? [];
    const params = defaults.map((p, i) => xml.getAttribute('param_name' + i) ?? p);
    for (let i = params.length; xml.getAttribute('param_name' + i); i++) params.push(xml.getAttribute('param_name' + i)!);
    if (this.isGeneric) params.unshift('component', 'notAlreadyHandled');
    if (params.length) {
      if (this.horizontalParameters) {
        const input = this.appendDummyInput('PARAMETERS').appendField(' ');
        params.forEach((p, i) => input.appendField(paramLabel(paramName(p)), 'VAR' + i).appendField(' '));
      } else {
        params.forEach((p, i) => this.appendDummyInput('VAR' + i).appendField(paramLabel(paramName(p)), 'VAR' + i).setAlign(RIGHT));
      }
    }
    this.appendStatementInput('DO').appendField(M('LANG_COMPONENT_BLOCK_TITLE_DO'));
    this.setPreviousStatement(false);
    this.setNextStatement(false);
  },
};

defs['component_set_get'] = {
  init(this: B) {
    this.setColour(COLOUR.GET);
  },
  mutationToDom(this: B) {
    const m = Blockly.utils.xml.createElement('mutation');
    m.setAttribute('component_type', this.typeName);
    m.setAttribute('set_or_get', this.setOrGet);
    m.setAttribute('property_name', this.propertyName);
    m.setAttribute('is_generic', this.isGeneric ? 'true' : 'false');
    if (!this.isGeneric) m.setAttribute('instance_name', this.instanceName);
    return m;
  },
  domToMutation(this: B, xml: Element) {
    clearInputs(this);
    this.typeName = xml.getAttribute('component_type') ?? '';
    this.setOrGet = xml.getAttribute('set_or_get') ?? 'get';
    this.propertyName = xml.getAttribute('property_name') ?? '';
    this.isGeneric = xml.getAttribute('is_generic') === 'true';
    this.instanceName = xml.getAttribute('instance_name') ?? '';
    const prop = fixedDropdown(this.propertyName, propertyName);
    if (this.setOrGet === 'get') {
      this.setColour(COLOUR.GET);
      shape(this, 'out');
      if (!this.isGeneric) {
        this.appendDummyInput().appendField(compDropdown(this.instanceName), 'COMPONENT_SELECTOR').appendField('.').appendField(prop, 'PROP');
      } else {
        this.appendDummyInput().appendField(componentTypeName(this.typeName) + '.').appendField(prop, 'PROP');
        this.appendValueInput('COMPONENT').appendField(M('LANG_COMPONENT_BLOCK_GENERIC_GETTER_TITLE_OF_COMPONENT')).setAlign(RIGHT);
      }
    } else {
      this.setColour(COLOUR.SET);
      shape(this, 'stmt');
      if (!this.isGeneric) {
        this.appendValueInput('VALUE')
          .appendField(M('LANG_COMPONENT_BLOCK_SETTER_TITLE_SET'))
          .appendField(compDropdown(this.instanceName), 'COMPONENT_SELECTOR')
          .appendField('.')
          .appendField(prop, 'PROP')
          .appendField(M('LANG_COMPONENT_BLOCK_SETTER_TITLE_TO'));
      } else {
        this.appendDummyInput()
          .appendField(M('LANG_COMPONENT_BLOCK_GENERIC_SETTER_TITLE_SET') + componentTypeName(this.typeName) + '.')
          .appendField(prop, 'PROP');
        this.appendValueInput('COMPONENT').appendField(M('LANG_COMPONENT_BLOCK_GENERIC_SETTER_TITLE_OF_COMPONENT')).setAlign(RIGHT);
        this.appendValueInput('VALUE').appendField(M('LANG_COMPONENT_BLOCK_GENERIC_SETTER_TITLE_TO')).setAlign(RIGHT);
      }
    }
  },
};

defs['component_method'] = {
  init(this: B) {
    this.setColour(COLOUR.METHOD);
  },
  mutationToDom(this: B) {
    const m = Blockly.utils.xml.createElement('mutation');
    m.setAttribute('component_type', this.typeName);
    m.setAttribute('method_name', this.methodName);
    m.setAttribute('is_generic', this.isGeneric ? 'true' : 'false');
    if (!this.isGeneric) m.setAttribute('instance_name', this.instanceName);
    return m;
  },
  domToMutation(this: B, xml: Element) {
    clearInputs(this);
    this.typeName = xml.getAttribute('component_type') ?? '';
    this.methodName = xml.getAttribute('method_name') ?? '';
    this.isGeneric = xml.getAttribute('is_generic') === 'true';
    this.instanceName = xml.getAttribute('instance_name') ?? '';
    this.setColour(COLOUR.METHOD);
    const localized = methodName(this.methodName);
    if (!this.isGeneric) {
      this.appendDummyInput()
        .appendField(M('LANG_COMPONENT_BLOCK_METHOD_TITLE_CALL'))
        .appendField(compDropdown(this.instanceName), 'COMPONENT_SELECTOR')
        .appendField('.' + localized);
    } else {
      this.appendDummyInput().appendField(M('LANG_COMPONENT_BLOCK_GENERIC_METHOD_TITLE_CALL') + componentTypeName(this.typeName) + '.' + localized);
      this.appendValueInput('COMPONENT').appendField(M('LANG_COMPONENT_BLOCK_GENERIC_METHOD_TITLE_FOR_COMPONENT')).setAlign(RIGHT);
    }
    // 인자 개수/모양은 prepare.ts 가 XML 을 보고 data-argc, data-shape 로 알려 준다
    const known = methodParams(this.typeName, this.methodName) ?? [];
    const argc = Math.max(known.length, parseInt(xml.getAttribute('data-argc') ?? '0', 10) || 0);
    for (let i = 0; i < argc; i++) this.appendValueInput('ARG' + i).appendField(known[i] ? paramName(known[i]) : '').setAlign(RIGHT);
    shape(this, xml.getAttribute('data-shape') === 'out' ? 'out' : 'stmt');
  },
};

defs['component_component_block'] = {
  init(this: B) {
    this.setColour(COLOUR.COMPONENT);
    shape(this, 'out');
  },
  mutationToDom(this: B) {
    const m = Blockly.utils.xml.createElement('mutation');
    m.setAttribute('component_type', this.typeName);
    m.setAttribute('instance_name', this.instanceName);
    return m;
  },
  domToMutation(this: B, xml: Element) {
    clearInputs(this);
    this.typeName = xml.getAttribute('component_type') ?? '';
    this.instanceName = xml.getAttribute('instance_name') ?? '';
    this.appendDummyInput().appendField(compDropdown(this.instanceName), 'COMPONENT_SELECTOR');
  },
};

let registered = false;
/** 블록 정의를 Blockly 에 등록한다 (한 번만) */
export function registerAiBlocks() {
  if (registered) return;
  registered = true;
  for (const [type, d] of Object.entries(defs)) Blockly.Blocks[type] = d;
}

export const definedTypes = () => Object.keys(defs);
