// 테스트·시연용 .aia 파일을 만든다 (tests/fixtures/*.aia, public/samples/*.aia).
//   node scripts/build-fixtures.mjs
// .scm/.bky 형식은 App Inventor 가 내보내는 파일과 같게 맞췄다 (블록 type·mutation 은 appinventor-sources 기준).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import JSZip from 'jszip';

const here = path.dirname(new URL(import.meta.url).pathname);
const outDirs = [path.join(here, '../tests/fixtures'), path.join(here, '../public/samples')];

// ───────── .bky XML 빌더 ─────────
let seq = 0;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const id = () => `b${(++seq).toString(36)}`;
const attrs = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${esc(v)}"`).join('');

/** block(type, {mutation, fields, values, statements, next, x, y}) */
function block(type, o = {}) {
  let s = `<block type="${type}" id="${id()}"${o.x != null ? ` x="${o.x}" y="${o.y}"` : ''}>`;
  if (o.mutation) {
    const { children = '', ...rest } = o.mutation;
    s += `<mutation${attrs(rest)}>${children}</mutation>`;
  }
  for (const [k, v] of Object.entries(o.fields ?? {})) s += `<field name="${k}">${esc(v)}</field>`;
  for (const [k, v] of Object.entries(o.values ?? {})) if (v) s += `<value name="${k}">${v}</value>`;
  for (const [k, v] of Object.entries(o.statements ?? {})) if (v) s += `<statement name="${k}">${seqOf(v)}</statement>`;
  s += '</block>';
  return s;
}
/** 문장 블록 배열을 <next> 로 연결 */
function seqOf(list) {
  if (!Array.isArray(list)) return list;
  if (!list.length) return '';
  const [first, ...rest] = list;
  if (!rest.length) return first;
  return first.replace(/<\/block>$/, `<next>${seqOf(rest)}</next></block>`);
}
const xmlDoc = (blocks) =>
  `<xml xmlns="https://developers.google.com/blockly/xml">${blocks.join('')}<yacodeblocks ya-version="233" language-version="37"></yacodeblocks></xml>`;

const num = (n) => block('math_number', { fields: { NUM: n } });
const txt = (t) => block('text', { fields: { TEXT: t } });
const bool = (v) => block('logic_boolean', { fields: { BOOL: v ? 'TRUE' : 'FALSE' } });
const gget = (name) => block('lexical_variable_get', { fields: { VAR: `global ${name}` } });
const gset = (name, value) => block('lexical_variable_set', { fields: { VAR: `global ${name}` }, values: { VALUE: value } });
const gdecl = (name, value, x, y) => block('global_declaration', { x, y, fields: { NAME: name }, values: { VALUE: value } });
const list = (items) =>
  block('lists_create_with', { mutation: { items: items.length }, values: Object.fromEntries(items.map((v, i) => [`ADD${i}`, v])) });
const selectItem = (l, i) => block('lists_select_item', { values: { LIST: l, NUM: i } });
const add = (a, b) => block('math_add', { mutation: { items: 2 }, values: { NUM0: a, NUM1: b } });
const join = (...parts) => block('text_join', { mutation: { items: parts.length }, values: Object.fromEntries(parts.map((v, i) => [`ADD${i}`, v])) });
const mathCmp = (op, a, b) => block('math_compare', { fields: { OP: op }, values: { A: a, B: b } });
const textCmp = (op, a, b) => block('text_compare', { fields: { OP: op }, values: { TEXT1: a, TEXT2: b } });
const and = (a, b) => block('logic_operation', { mutation: { items: 2 }, fields: { OP: 'AND' }, values: { A: a, B: b } });
const or = (...xs) => block('logic_operation', { mutation: { items: xs.length }, fields: { OP: 'OR' }, values: Object.fromEntries(xs.map((v, i) => [i < 2 ? ['A', 'B'][i] : `BOOL${i}`, v])) });
const randInt = (a, b) => block('math_random_int', { values: { FROM: a, TO: b } });
const pickRandom = (l) => block('lists_pick_random_item', { values: { LIST: l } });
const length = (l) => block('lists_length', { values: { LIST: l } });

/** controls_if: clauses = [[cond, stmts], ...], elseStmts */
function ifBlock(clauses, elseStmts) {
  const mutation = {};
  if (clauses.length > 1) mutation.elseif = clauses.length - 1;
  if (elseStmts) mutation.else = 1;
  const values = {};
  const statements = {};
  clauses.forEach(([c, s], i) => {
    values[`IF${i}`] = c;
    statements[`DO${i}`] = s;
  });
  if (elseStmts) statements.ELSE = elseStmts;
  return block('controls_if', { mutation: Object.keys(mutation).length ? mutation : undefined, values, statements });
}
const setProp = (type, inst, prop, value) =>
  block('component_set_get', {
    mutation: { component_type: type, set_or_get: 'set', property_name: prop, is_generic: 'false', instance_name: inst },
    fields: { COMPONENT_SELECTOR: inst, PROP: prop },
    values: { VALUE: value },
  });
const getProp = (type, inst, prop) =>
  block('component_set_get', {
    mutation: { component_type: type, set_or_get: 'get', property_name: prop, is_generic: 'false', instance_name: inst },
    fields: { COMPONENT_SELECTOR: inst, PROP: prop },
  });
const event = (type, inst, ev, body, x, y) =>
  block('component_event', {
    x,
    y,
    mutation: { component_type: type, is_generic: 'false', instance_name: inst, event_name: ev },
    fields: { COMPONENT_SELECTOR: inst },
    statements: { DO: body },
  });

// ───────── .scm 빌더 ─────────
let uuid = 1000;
const comp = (type, name, props = {}, children) => ({
  $Name: name,
  $Type: type,
  $Version: { Label: '5', Button: '7', HorizontalArrangement: '4', VerticalArrangement: '4', Image: '6', Clock: '4', Sound: '3' }[type] ?? '1',
  ...props,
  Uuid: String(++uuid),
  ...(children ? { $Components: children } : {}),
});
function scm(appName, title, components, extra = {}) {
  const form = {
    authURL: ['ai2.appinventor.mit.edu'],
    YaVersion: '233',
    Source: 'Form',
    Properties: {
      $Name: 'Screen1',
      $Type: 'Form',
      $Version: '31',
      AppName: appName,
      Title: title,
      Sizing: 'Responsive',
      Theme: 'Classic',
      ...extra,
      Uuid: '0',
      $Components: components,
    },
  };
  return `#|\n$JSON\n${JSON.stringify(form)}\n|#\n`;
}
const projectProperties = (name) =>
  [
    '#',
    `#${new Date(0).toUTCString()}`,
    'sizing=Responsive',
    'color.primary.dark=&HFF303F9F',
    'color.primary=&HFF3F51B5',
    'color.accent=&HFFFF4081',
    `aname=${name}`,
    'defaultfilescope=App',
    `main=appinventor.ai_teacher.${name}.Screen1`,
    'source=../src',
    'actionbar=True',
    'useslocation=False',
    'assets=../assets',
    'build=../build',
    `name=${name}`,
    'showlistsasjson=True',
    'theme=Classic',
    'versioncode=1',
    'versionname=1.0',
    '',
  ].join('\n');

async function writeAia(fileName, name, screen1Scm, screen1Bky, assets = {}) {
  const zip = new JSZip();
  const opt = { date: new Date(Date.UTC(2024, 0, 1)), createFolders: false };
  const base = `src/appinventor/ai_teacher/${name}`;
  zip.file('youngandroidproject/project.properties', projectProperties(name), opt);
  zip.file(`${base}/Screen1.scm`, screen1Scm, opt);
  zip.file(`${base}/Screen1.bky`, screen1Bky, opt);
  for (const [n, data] of Object.entries(assets)) zip.file(`assets/${n}`, data, opt);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  for (const d of outDirs) {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, fileName), buf);
  }
  console.log('작성:', fileName);
}

// ───────── 아주 작은 PNG (단색 + 글자 대신 무늬) ─────────
function png(w, h, pixel) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const bg = [245, 245, 245];
const scissorsPng = png(96, 96, (x, y) => (Math.abs(x - y) < 6 || Math.abs(95 - x - y) < 6 ? [220, 60, 60] : inCircle(x, y, 48, 48, 46) ? [255, 235, 235] : bg));
const rockPng = png(96, 96, (x, y) => (inCircle(x, y, 48, 52, 34) ? [110, 110, 120] : bg));
const paperPng = png(96, 96, (x, y) => (x > 18 && x < 78 && y > 10 && y < 86 ? (y % 12 < 2 ? [150, 170, 220] : [255, 255, 255]) : bg));

// ═════════ 1. O/X 퀴즈 (채점 기준과 같은 구조) ═════════
function oxClick(btn, answer) {
  return [
    ifBlock([[textCmp('EQUAL', selectItem(gget('정답'), gget('문제번호')), txt(answer)), [gset('총점', add(gget('총점'), num(1)))]]]),
    setProp('Label', '점수', 'Text', join(txt('점수:'), gget('총점'))),
    gset('문제번호', add(gget('문제번호'), num(1))),
    ifBlock(
      [
        [
          mathCmp('LT', length(gget('문제목록')), gget('문제번호')),
          [setProp('Label', '문제', 'Text', txt('끝!')), setProp('Button', 'O', 'Enabled', bool(false)), setProp('Button', 'X', 'Enabled', bool(false))],
        ],
      ],
      [setProp('Label', '문제', 'Text', selectItem(gget('문제목록'), gget('문제번호')))],
    ),
  ];
}
const oxQuestions = ['고양이는 포유류이다', '지구는 태양 주위를 돈다', '물은 100도에서 언다', '대한민국의 수도는 서울이다', '거미의 다리는 6개이다'];
const oxAnswers = ['O', 'O', 'X', 'O', 'X'];
const oxBky = xmlDoc([
  gdecl('문제목록', list(oxQuestions.map(txt)), 20, 20),
  gdecl('정답', list(oxAnswers.map(txt)), 20, 200),
  gdecl('문제번호', num(1), 20, 340),
  gdecl('총점', num(0), 20, 390),
  event('Form', 'Screen1', 'Initialize', [
    setProp('Label', '문제', 'Text', selectItem(gget('문제목록'), gget('문제번호'))),
    setProp('Label', '점수', 'Text', join(txt('점수:'), gget('총점'))),
  ], 20, 480),
  event('Button', 'O', 'Click', oxClick('O', 'O'), 700, 20),
  event('Button', 'X', 'Click', oxClick('X', 'X'), 700, 480),
]);
const oxScm = scm('OXQuiz', 'O/X 퀴즈', [
  comp('Label', '문제', { FontSize: '20', Text: '문제', Width: '-2' }),
  comp('HorizontalArrangement', '수평배치1', { AlignHorizontal: '3', Width: '-2' }, [
    comp('Button', 'O', { FontSize: '30', Text: 'O', BackgroundColor: '&HFF2196F3' }),
    comp('Button', 'X', { FontSize: '30', Text: 'X', BackgroundColor: '&HFFF44336' }),
  ]),
  comp('Label', '점수', { FontSize: '16', Text: '점수:0' }),
]);

// ═════════ 2. 가위바위보 ═════════
const rpsBky = xmlDoc([
  gdecl('패목록', list([txt('scissors.png'), txt('rock.png'), txt('paper.png')]), 20, 20),
  gdecl('패1', num(1), 20, 120),
  gdecl('패2', num(1), 20, 170),
  event('Button', '대결', 'Click', [
    gset('패1', randInt(num(1), num(3))),
    gset('패2', randInt(num(1), num(3))),
    setProp('Image', '플레이어1', 'Picture', selectItem(gget('패목록'), gget('패1'))),
    setProp('Image', '플레이어2', 'Picture', selectItem(gget('패목록'), gget('패2'))),
    ifBlock(
      [
        [mathCmp('EQ', gget('패1'), gget('패2')), [setProp('Label', '결과', 'Text', txt('비겼습니다'))]],
        [
          or(
            and(mathCmp('EQ', gget('패1'), num(1)), mathCmp('EQ', gget('패2'), num(3))),
            and(mathCmp('EQ', gget('패1'), num(2)), mathCmp('EQ', gget('패2'), num(1))),
            and(mathCmp('EQ', gget('패1'), num(3)), mathCmp('EQ', gget('패2'), num(2))),
          ),
          [setProp('Label', '결과', 'Text', txt('플레이어1 승리!'))],
        ],
      ],
      [setProp('Label', '결과', 'Text', txt('플레이어2 승리!'))],
    ),
  ], 20, 240),
]);
const rpsScm = scm('RockPaperScissors', '가위바위보', [
  comp('HorizontalArrangement', '수평배치1', { AlignHorizontal: '3', Width: '-2' }, [
    comp('Image', '플레이어1', { Picture: 'rock.png', Width: '120', Height: '120', ScalePictureToFit: 'True' }),
    comp('Image', '플레이어2', { Picture: 'rock.png', Width: '120', Height: '120', ScalePictureToFit: 'True' }),
  ]),
  comp('Label', '결과', { FontSize: '20', Text: '버튼을 누르세요' }),
  comp('Button', '대결', { Text: '가위바위보!', FontSize: '18' }),
], { AlignHorizontal: '3' });

// ═════════ 3. 오늘의 운세 ═════════
const fortunes = ['대박 나는 날!', '친구에게 좋은 일이 생겨요', '조심조심 하루', '공부가 잘 되는 날', '맛있는 것을 먹게 돼요', '뜻밖의 선물이 와요'];
const fortuneBky = xmlDoc([
  gdecl('운세목록', list(fortunes.map(txt)), 20, 20),
  gdecl('횟수', num(0), 20, 220),
  event('Button', '운세보기', 'Click', [
    gset('횟수', num(0)),
    setProp('Button', '운세보기', 'Enabled', bool(false)),
    setProp('Clock', '시계1', 'TimerEnabled', bool(true)),
  ], 20, 290),
  event('Clock', '시계1', 'Timer', [
    gset('횟수', add(gget('횟수'), num(1))),
    ifBlock(
      [[mathCmp('LTE', gget('횟수'), num(6)), [setProp('Label', '운세', 'Text', pickRandom(gget('운세목록')))]]],
      [setProp('Clock', '시계1', 'TimerEnabled', bool(false)), setProp('Button', '운세보기', 'Enabled', bool(true))],
    ),
  ], 20, 450),
]);
const fortuneScm = scm('Fortune', '오늘의 운세', [
  comp('Label', '운세', { FontSize: '22', Text: '버튼을 눌러 보세요', Width: '-2', TextAlignment: '1' }),
  comp('Button', '운세보기', { Text: '운세 보기', FontSize: '18' }),
  comp('Clock', '시계1', { TimerInterval: '300', TimerEnabled: 'False' }),
], { AlignHorizontal: '3' });

await writeAia('ox-quiz.aia', 'OXQuiz', oxScm, oxBky);
await writeAia('rock-paper-scissors.aia', 'RockPaperScissors', rpsScm, rpsBky, { 'scissors.png': scissorsPng, 'rock.png': rockPng, 'paper.png': paperPng });
await writeAia('fortune.aia', 'Fortune', fortuneScm, fortuneBky);
