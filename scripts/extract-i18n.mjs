// App Inventor 소스(mit-cml/appinventor-sources)에서 한국어 블록/컴포넌트 번역을 뽑아
// src/i18n/ai-ko.json 으로 저장한다.
//
// 사용법:
//   git clone --depth 1 https://github.com/mit-cml/appinventor-sources.git /tmp/ais
//   node scripts/extract-i18n.mjs /tmp/ais
//
// 원본 파일은 Apache License 2.0 (Copyright MIT) 이다. README 참고.
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  console.error('사용법: node scripts/extract-i18n.mjs <appinventor-sources 경로>');
  process.exit(1);
}
const ai = path.join(root, 'appinventor');
const msgDir = path.join(ai, 'blocklyeditor/src/msg/ai_blockly');
const i18nDir = path.join(ai, 'appengine/src/com/google/appinventor/client/editor/simple/components/i18n');
const odeKo = path.join(ai, 'appengine/src/com/google/appinventor/client/OdeMessages_ko_KR.properties');

function readJsonMessages(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith('Blockly.Msg.')) out[k.slice('Blockly.Msg.'.length)] = v;
  }
  return out;
}

function readProperties(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  let buf = '';
  for (let line of lines) {
    if (buf) line = buf + line.trimStart();
    buf = '';
    if (/^\s*[#!]/.test(line) || !line.trim()) continue;
    if (/(^|[^\\])(\\\\)*\\$/.test(line)) { buf = line.slice(0, -1); continue; }
    const m = line.match(/^\s*([^=:\s]+)\s*[=:]\s?(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\n/g, '\n').replace(/\\(.)/g, '$1').trim();
  }
  return out;
}

function bySuffix(props, suffix) {
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (k.endsWith(suffix)) {
      const name = k.slice(0, -suffix.length);
      if (name && !/Descriptions?$/.test(name)) out[name] = v;
    }
  }
  return out;
}

// BlocklyTranslationGenerator.java 와 같은 순서로 합친다: Blockly 영어 → AI 영어 → AI 한국어
function readBlocklyCore(file) {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete raw['@metadata'];
  return raw;
}
const blockly = {
  ...readBlocklyCore(path.join(ai, 'lib/blockly/msg/json/en.json')),
  ...readJsonMessages(path.join(msgDir, 'messages.json')),
  ...readJsonMessages(path.join(msgDir, 'messages_ko.json')),
};

const ev = readProperties(path.join(i18nDir, 'ComponentEventTranslations_ko_KR.properties'));
const me = readProperties(path.join(i18nDir, 'ComponentMethodTranslations_ko_KR.properties'));
const pr = readProperties(path.join(i18nDir, 'ComponentPropertyTranslations_ko_KR.properties'));
const info = readProperties(path.join(i18nDir, 'ComponentInfoTranslations_ko_KR.properties'));
const ode = readProperties(odeKo);

const components = {};
for (const src of [ode, info]) {
  for (const [k, v] of Object.entries(src)) {
    const m = k.match(/^([a-z][A-Za-z0-9]*)ComponentPallette$/);
    if (m) components[m[1][0].toUpperCase() + m[1].slice(1)] = v;
  }
}

const result = {
  _source: 'mit-cml/appinventor-sources (Apache License 2.0). scripts/extract-i18n.mjs 로 생성됨. 직접 수정하지 말 것.',
  blockly,
  components,
  events: bySuffix(ev, 'Events'),
  methods: bySuffix(me, 'Methods'),
  params: bySuffix(me, 'Params'),
  properties: bySuffix(pr, 'Properties'),
};

const outFile = path.join(path.dirname(new URL(import.meta.url).pathname), '../src/i18n/ai-ko.json');
fs.writeFileSync(outFile, JSON.stringify(result, null, 1) + '\n');
console.log('작성:', outFile, Object.fromEntries(Object.entries(result).filter(([k]) => k !== '_source').map(([k, v]) => [k, Object.keys(v).length])));
