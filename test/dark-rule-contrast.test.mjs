import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const dark = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));
const token = name => dark.match(new RegExp(`--cp-${name}:\\s*(#[0-9a-fA-F]{6})`))[1];
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

test('다크 모드의 버튼·입력칸 테두리는 어느 배경에서도 3:1 이상이다 (WCAG 1.4.11)', () => {
  for (const background of ['paper', 'surface', 'sunken']) {
    assert.ok(contrast(token('rule'), token(background)) >= 3, background);
  }
});
