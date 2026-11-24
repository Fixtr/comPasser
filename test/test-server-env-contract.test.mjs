import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// 검사 서버가 개발자의 .env 를 읽으면 실제 측정 ID·키로 검사가 돈다.
// Vite 5 에서 env 디렉터리를 false 로 주면 "프로젝트 루트를 쓴다"는 뜻이라 막지 못하고,
// envFile: false 는 process.env 에 넣어 둔 검사용 값까지 버린다. .env 가 없는 폴더를 가리키는 것만 둘 다 만족한다.
test('브라우저 검사 서버는 .env 파일을 읽지 않고 검사용 값만 쓴다', () => {
  const source = readFileSync(new URL('../scripts/test-browser-server.mjs', import.meta.url), 'utf8');
  const starts = source.match(/await (?:build|createServer)\(\{[\s\S]*?\}\);/g) || [];
  assert.equal(starts.length, 2, 'build 와 createServer 호출을 찾지 못했다');
  for (const call of starts) {
    assert.match(call, /envDir:\s*ENV_DIR/, `.env 를 읽을 수 있는 서버 시작:\n${call}`);
    assert.doesNotMatch(call, /envFile/, 'envFile: false 는 검사용 Firebase 값까지 버린다');
  }
  const dir = source.match(/const ENV_DIR = fileURLToPath\(new URL\('\.\.\/([^']+)', import\.meta\.url\)\);/);
  assert.ok(dir, 'ENV_DIR 정의를 찾지 못했다');
  const envFiles = readdirSync(new URL(`../${dir[1]}`, import.meta.url)).filter(name => name.startsWith('.env'));
  assert.deepEqual(envFiles, [], `${dir[1]} 에 .env 파일이 있으면 검사 서버가 읽는다`);
  assert.match(source, /key\.startsWith\('VITE_'\)\) delete process\.env\[key\]/, '셸에 있던 VITE_ 값을 지우지 않는다');
});
