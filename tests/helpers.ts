import fs from 'node:fs';
import path from 'node:path';
import { parseAia } from '../src/aia/parse';

export const fixturePath = (name: string) => path.join(__dirname, 'fixtures', name);

export async function loadFixture(name: string) {
  const buf = fs.readFileSync(fixturePath(name));
  return parseAia(new Uint8Array(buf), name);
}
