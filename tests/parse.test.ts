import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { flattenComponents, parseAia, parseScm } from '../src/aia/parse';
import { chain, parseBky } from '../src/aia/bky';
import { loadFixture } from './helpers';

describe('aia 파서', () => {
  it('O/X 퀴즈: 화면, 컴포넌트 트리, 블록을 읽는다', async () => {
    const p = await loadFixture('ox-quiz.aia');
    expect(p.appName).toBe('OXQuiz');
    expect(p.packagePath).toBe('src/appinventor/ai_teacher/OXQuiz');
    expect(p.screens.map((s) => s.name)).toEqual(['Screen1']);
    const form = p.screens[0].form!;
    expect(form.type).toBe('Form');
    expect(form.props.Title).toBe('O/X 퀴즈');
    // Screen1 > 문제, 수평배치1 > (O, X), 점수
    expect(form.children.map((c) => `${c.name}:${c.type}`)).toEqual(['문제:Label', '수평배치1:HorizontalArrangement', '점수:Label']);
    expect(form.children[1].children.map((c) => c.name)).toEqual(['O', 'X']);
    expect(flattenComponents(form)).toHaveLength(6);

    const doc = parseBky(p.screens[0].bky);
    expect(doc.yaVersion).toBe('233');
    const types = doc.topBlocks.map((b) => b.type);
    expect(types.filter((t) => t === 'global_declaration')).toHaveLength(4);
    expect(types.filter((t) => t === 'component_event')).toHaveLength(3);
    const oClick = doc.topBlocks.find((b) => b.mutation.instance_name === 'O')!;
    expect(oClick.mutation).toMatchObject({ component_type: 'Button', event_name: 'Click', is_generic: 'false' });
    expect(chain(oClick.statements.DO).map((b) => b.type)).toEqual(['controls_if', 'component_set_get', 'lexical_variable_set', 'controls_if']);
  });

  it('가위바위보: assets 를 읽는다', async () => {
    const p = await loadFixture('rock-paper-scissors.aia');
    expect([...p.assets.keys()].sort()).toEqual(['paper.png', 'rock.png', 'scissors.png']);
    expect(p.assets.get('rock.png')![0]).toBe(0x89); // PNG 시그니처
  });

  it('화면이 여러 개면 main 화면을 먼저, 나머지는 이름 순으로', async () => {
    const zip = new JSZip();
    zip.file('youngandroidproject/project.properties', 'main=appinventor.ai_x.P.Screen1\nname=P\n');
    const scm = (n: string) => `#|\n$JSON\n{"Properties":{"$Name":"${n}","$Type":"Form","Uuid":"0"}}\n|#`;
    for (const n of ['Screen10', 'Screen2', 'Screen1']) zip.file(`src/appinventor/ai_x/P/${n}.scm`, scm(n));
    zip.file('src/appinventor/ai_x/P/Screen2.bky', '<xml xmlns="https://developers.google.com/blockly/xml"></xml>');
    const p = await parseAia(await zip.generateAsync({ type: 'uint8array' }), 'p.aia');
    expect(p.screens.map((s) => s.name)).toEqual(['Screen1', 'Screen2', 'Screen10']);
    expect(p.screens[0].bky).toBeNull();
    expect(p.appName).toBe('P');
  });

  it('aia 가 아니면 알기 쉬운 오류', async () => {
    await expect(parseAia(new Uint8Array([1, 2, 3]), 'x.aia')).rejects.toThrow('zip 파일을 열 수 없습니다');
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    await expect(parseAia(await zip.generateAsync({ type: 'uint8array' }), 'y.aia')).rejects.toThrow('화면(.scm) 파일이 없습니다');
  });

  it('scm 의 $JSON 앞뒤 공백/줄바꿈 차이를 견딘다', () => {
    const c = parseScm('#|\r\n$JSON\r\n{"YaVersion":"1","Properties":{"$Name":"Screen1","$Type":"Form","$Components":[{"$Name":"L","$Type":"Label","Text":"a"}]}}\r\n|#\r\n');
    expect(c.children[0]).toMatchObject({ name: 'L', type: 'Label', props: { Text: 'a' } });
  });
});
