import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 검사 서버가 개발자의 .env 를 읽으면 실제 측정 ID·키로 검사가 돈다.
// Vite 5 에서 env 디렉터리를 false 로 주는 것은 "프로젝트 루트를 쓴다"는 뜻이라 막지 못한다.
test('브라우저 검사 서버는 .env 파일을 읽지 않는다', () => {
  const source = readFileSync(new URL('../scripts/test-browser-server.mjs', import.meta.url), 'utf8');
  const starts = source.match(/await (?:build|createServer)\(\{[\s\S]*?\}\);/g) || [];
  assert.equal(starts.length, 2, 'build 와 createServer 호출을 찾지 못했다');
  for (const call of starts) assert.match(call, /envFile:\s*false/, `.env 를 읽는 서버 시작:\n${call}`);
  assert.match(source, /key\.startsWith\('VITE_'\)\) delete process\.env\[key\]/, '셸에 있던 VITE_ 값을 지우지 않는다');
});
