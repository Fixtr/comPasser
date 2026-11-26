import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const token = name => tokens.match(new RegExp(`--cp-${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
const luminance = hex => {
  const [r, g, b] = [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('테두리 색을 글자 뒤 배경으로 쓰지 않는다', () => {
  const style = readFileSync(new URL('../src/domains/itinerary/ui/itinerary-style.js', import.meta.url), 'utf8');
  assert.doesNotMatch(style, /\.rec-btn\.direction:hover\s*\{\s*background:\s*var\(--cp-rule\)/);
});

test('버튼·입력칸 테두리는 어느 배경에서도 3:1 이상이다 (WCAG 1.4.11)', () => {
  for (const background of ['paper', 'surface', 'sunken']) {
    assert.ok(contrast(token('rule'), token(background)) >= 3, background);
  }
});

test('예약 보라는 글자 4.5:1, 테두리 3:1 을 넘는다 (WCAG 1.4.3, 1.4.11)', () => {
  // 배지와 출발 카드는 surface 위, 화면 바탕은 paper, 눌린 영역은 sunken. 번호 노드는 보라 배경에 surface 글자다.
  for (const background of ['paper', 'surface', 'sunken']) {
    assert.ok(contrast(token('anchor'), token(background)) >= 4.5, background);
  }
});

// 일정 화면은 다크로만 보이다가 라이트 전용이 됐다. 그때 드러난 네 곳을 지킨다.
const style = readFileSync(new URL('../src/domains/itinerary/ui/itinerary-style.js', import.meta.url), 'utf8');
const block = selector => style.slice(style.indexOf(selector)).match(/\{([^}]*)\}/)[1];
const tokenOf = (css, property) => token(css.match(new RegExp(`(?:^|[;\\s])${property}:\\s*var\\(--cp-([a-z0-9-]+)\\)`))[1]);
// 불투명도로 흐린 글자가 배경 위에서 실제로 보이는 색.
const faded = (foreground, background, opacity) => '#' + [1, 3, 5].map(at =>
  Math.round(opacity * parseInt(foreground.slice(at, at + 2), 16) + (1 - opacity) * parseInt(background.slice(at, at + 2), 16))
    .toString(16).padStart(2, '0')).join('');

test('첫 장소 번호는 초록 바탕에서도 4.5:1, 테두리는 카드 위에서 3:1 을 넘는다', () => {
  const node = block('.timeline-item:first-child .schedule-card::before');
  assert.ok(contrast(tokenOf(node, 'color'), tokenOf(node, 'background')) >= 4.5);
  assert.ok(contrast(tokenOf(node, 'border-color'), token('surface')) >= 3);
});

test('이동 거리와 장소 추가 버튼은 글자를 흐리지 않는다', () => {
  assert.doesNotMatch(block('.transit-distance {'), /opacity/);
  assert.doesNotMatch(block('.insert-slot-btn {'), /opacity\s*:/);
});

test('다녀온 카드는 흐려져도 본문과 보조 글자가 4.5:1 을 넘는다', () => {
  const opacity = Number(style.match(/\.schedule-card\[data-visited\] > :not\(\.visited-btn, \.schedule-title-row\)[^{]*\{ opacity: ([\d.]+); \}/)[1]);
  for (const text of ['ink', 'ink-2', 'muted']) {
    assert.ok(contrast(faded(token(text), token('surface'), opacity), token('surface')) >= 4.5, `${text} at ${opacity}`);
  }
});
