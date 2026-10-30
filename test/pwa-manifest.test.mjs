/**
 * manifest 는 "설치했을 때 이 앱이 무엇인가"를 정하는 파일이다.
 * 브라우저 탭에서는 하나도 티가 안 나서, 빠져 있어도 오래 모른다.
 *
 * 색(theme_color / background_color)은 pwa-theme-color 가 지킨다.
 * 여기서는 설치 이후의 동작을 본다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url).pathname;
const manifest = JSON.parse(readFileSync(`${ROOT}public/manifest.json`, 'utf8'));
const main = readFileSync(`${ROOT}src/app/main.js`, 'utf8');

test('start_url 이 있고 홈을 가리킨다', () => {
  // 없으면 manifest 를 읽은 문서의 주소가 시작 주소가 된다. 즉 사용자가
  // /plan 을 보다가 설치하면 그 앱은 영영 /plan 으로 열린다.
  assert.ok(manifest.start_url, 'start_url 이 없다');
  assert.equal(manifest.start_url, '/');
});

test('scope 안에 start_url 이 있다', () => {
  // scope 를 벗어난 주소는 앱이 아니라 브라우저로 열린다.
  assert.ok(manifest.scope, 'scope 가 없다');
  assert.ok(manifest.start_url.startsWith(manifest.scope),
    `start_url(${manifest.start_url}) 이 scope(${manifest.scope}) 밖이다`);
});

test('id 가 있다', () => {
  // 없으면 start_url 이 앱의 신원이 된다. 나중에 시작 주소를 바꾸는 순간
  // 브라우저는 그것을 "다른 앱"으로 보고, 설치해 둔 사용자에게 업데이트가
  // 아니라 새 앱으로 취급된다.
  assert.ok(manifest.id, 'id 가 없다');
});

test('한국어 앱이라고 선언한다', () => {
  assert.equal(manifest.lang, 'ko');
  assert.ok(manifest.description, 'description 이 없으면 설치 화면이 비어 보인다');
});

test('아이콘 파일이 실제로 있다', () => {
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);
  for (const icon of manifest.icons) {
    assert.ok(existsSync(`${ROOT}public${icon.src}`), `${icon.src} 파일이 없다`);
    assert.ok(icon.sizes, `${icon.src} 에 sizes 가 없다`);
    assert.ok(icon.type, `${icon.src} 에 type 이 없다`);
  }
});

test('마스커블 아이콘이 두 크기 모두 있다', () => {
  // 없으면 안드로이드가 우리 아이콘을 흰 원 안에 축소해 넣는다.
  const maskable = manifest.icons.filter(i => String(i.purpose || '').includes('maskable'));
  const sizes = maskable.map(i => i.sizes);
  assert.ok(sizes.includes('192x192'), '192 마스커블이 없다');
  assert.ok(sizes.includes('512x512'), '512 마스커블이 없다');
  // 'any maskable' 로 한 파일을 겸용하면 안 된다 — 마스커블은 가장자리가
  // 잘리는 것을 전제로 여백을 넣어 그리므로, 일반 자리에 쓰면 작아 보인다.
  for (const icon of maskable) {
    assert.equal(String(icon.purpose).trim(), 'maskable',
      `${icon.src}: 겸용(any maskable) 대신 용도별로 나눈다`);
  }
});

test('마스커블 아이콘에는 투명한 자리가 없다', () => {
  // 마스크가 씌워질 때 투명한 모서리가 남으면 검게 뚫려 보인다.
  // PNG 헤더의 색 타입만 봐도 알파 채널 유무를 알 수 있다(6=RGBA, 4=GA).
  const maskable = manifest.icons.filter(i => String(i.purpose || '').includes('maskable'));
  for (const icon of maskable) {
    const buf = readFileSync(`${ROOT}public${icon.src}`);
    // IHDR: 8바이트 시그니처 + 4길이 + 4타입 + 4너비 + 4높이 + 1비트깊이 + 1색타입
    const colorType = buf[25];
    assert.ok(colorType !== 6 && colorType !== 4,
      `${icon.src}: 알파 채널이 있다(colorType=${colorType}). 마스크가 씌워지면 모서리가 뚫린다`);
  }
});

test('바로가기는 실제로 있는 경로만 가리킨다', () => {
  // 없는 주소를 가리키는 바로가기는 없느니만 못하다.
  const shortcuts = manifest.shortcuts || [];
  assert.ok(shortcuts.length > 0, '바로가기가 없다 — 설치한 앱을 길게 누를 때 나온다');
  // A new trip starts where home's 일정 만들기 does, not at the details form.
  assert.equal(shortcuts.find(s => s.short_name === '새 일정')?.url, '/recommend');
  for (const s of shortcuts) {
    assert.ok(s.name, '바로가기에 name 이 없다');
    assert.ok(s.url && s.url.startsWith(manifest.scope),
      `${s.url} 이 scope 밖이다`);
    assert.ok(main.includes(`'${s.url}'`),
      `${s.url} 을 라우터가 다루지 않는다`);
  }
});

test('세로 화면을 기준으로 한다', () => {
  // 지도와 타임라인이 세로로 붙는 화면이라, 가로로 돌면 둘 다 좁아진다.
  assert.ok(manifest.orientation, 'orientation 이 없다');
});

/**
 * 설치 화면에 보여 줄 앱 사진.
 *
 * 없으면 설치 프롬프트가 아이콘과 이름만 있는 밋밋한 상자가 된다.
 * 그런데 이건 **선언과 파일이 어긋나기 쉬운** 자리다 — 화면을 고쳐서
 * 다시 찍으면 크기가 바뀌는데 manifest 의 sizes 는 그대로 남는다.
 * 그래서 파일 헤더에서 실제 크기를 읽어 대조한다.
 */

/** WebP 헤더에서 가로·세로를 읽는다(라이브러리 없이). */
function webpSize(buf) {
  assert.equal(buf.subarray(0, 4).toString('latin1'), 'RIFF', 'RIFF 가 아니다');
  assert.equal(buf.subarray(8, 12).toString('latin1'), 'WEBP', 'WEBP 가 아니다');
  const chunk = buf.subarray(12, 16).toString('latin1');
  if (chunk === 'VP8 ') {
    // 손실 압축: 26~29 바이트에 14비트씩 들어 있다.
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8X') {
    // 확장 포맷: 3바이트 리틀엔디안으로 (실제값 - 1) 이 들어 있다.
    const read3 = (at) => buf[at] | (buf[at + 1] << 8) | (buf[at + 2] << 16);
    return { w: read3(24) + 1, h: read3(27) + 1 };
  }
  throw new Error(`읽을 수 없는 WebP 청크: ${chunk}`);
}

test('설치 화면에 보여 줄 사진이 있다', () => {
  const shots = manifest.screenshots;
  assert.ok(Array.isArray(shots) && shots.length > 0, 'screenshots 가 없다');
  for (const shot of shots) {
    assert.ok(existsSync(`${ROOT}public${shot.src}`), `${shot.src} 파일이 없다`);
    assert.ok(shot.label, `${shot.src} 에 label 이 없다 — 설치 화면에서 사진 밑에 뜬다`);
    assert.match(shot.type, /^image\//, `${shot.src} 에 type 이 없다`);
  }
});

test('좁은 화면과 넓은 화면 둘 다 있다', () => {
  // 하나만 있으면 브라우저가 그 하나를 양쪽에 늘려 쓰거나 아예 접는다.
  const forms = manifest.screenshots.map(s => s.form_factor);
  assert.ok(forms.includes('narrow'), '폰용 사진이 없다');
  assert.ok(forms.includes('wide'), '노트북용 사진이 없다');
});

test('적어 둔 크기가 파일의 실제 크기와 같다', () => {
  // 화면을 고쳐 다시 찍으면 크기가 바뀌는데 sizes 는 그대로 남기 쉽다.
  // 어긋나면 브라우저가 사진을 늘리거나 잘라서 보여 준다.
  for (const shot of manifest.screenshots) {
    const buf = readFileSync(`${ROOT}public${shot.src}`);
    const real = webpSize(buf);
    assert.equal(`${real.w}x${real.h}`, shot.sizes,
      `${shot.src}: 파일은 ${real.w}x${real.h} 인데 manifest 에는 ${shot.sizes} 로 적혀 있다`);
  }
});

test('좁은 쪽은 세로로, 넓은 쪽은 가로로 길다', () => {
  // form_factor 와 실제 비율이 어긋나면 설치 화면에서 엉뚱하게 잘린다.
  for (const shot of manifest.screenshots) {
    const { w, h } = webpSize(readFileSync(`${ROOT}public${shot.src}`));
    if (shot.form_factor === 'narrow') {
      assert.ok(h > w, `${shot.src}: narrow 인데 가로가 더 길다(${w}x${h})`);
    } else {
      assert.ok(w > h, `${shot.src}: wide 인데 세로가 더 길다(${w}x${h})`);
    }
  }
});
