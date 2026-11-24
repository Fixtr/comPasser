import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { itineraryStyles } from '../src/domains/itinerary/ui/itinerary-style.js';
import { renderScheduleCard } from '../src/domains/itinerary/ui/itinerary-schedule-card.js';
import { stripComments } from './helpers/style-contract.mjs';

// 스펙 5: 채운 주 버튼은 화면에 하나, 보라는 예약에만 쓰고 글자를 함께 둔다.
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const shell = stripComments(read('prototype/ionic-shell.css'));
const css = stripComments(itineraryStyles);
const rule = (source, selector) => {
  const at = source.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} 규칙이 있어야 한다`);
  return source.slice(at, source.indexOf('}', at));
};

test('홈의 채운 버튼은 첫 버튼(일정 만들기) 하나다', () => {
  const filled = shell.match(/[^{}]*\.ionic-home-links[^{}]*\{[^}]*background:\s*var\(--cp-ink\)[^}]*\}/g) || [];
  assert.equal(filled.length, 1);
  assert.match(filled[0], /\.ionic-home-links button:first-child\s*\{[^}]*color:\s*var\(--cp-surface\)/);
  assert.match(read('prototype/home-screen.jsx'), /className="ionic-home-links"><button onClick=\{\(\) => navigate\('\/recommend'\)\}>\{t\('shellRecommend'\)\}<\/button><button onClick=/);
  // 다가오는 여행 카드의 '보기'는 테두리 버튼이다.
  assert.doesNotMatch(read('domains/itinerary/ui/upcoming-trip.js'), /button \{[^}]*background:\s*var\(--cp-ink\)/);
});

test('상세 폼의 생성 복구 버튼은 테두리다(주 버튼은 폼의 검토)', () => {
  assert.match(read('prototype/ionic-screens.jsx'), /phase === 'form' && canRecover && <IonButton fill="outline"/);
});

test('일정 화면: 저장할 것이 있으면 다음 목적지의 길찾기는 테두리로 내려간다', () => {
  assert.match(rule(css, '.next-stop button'), /background:\s*var\(--cp-ink\)/);
  const outlined = rule(css, '#results:has(.save-btn:not(:disabled)) .next-stop button:not(.departure-leg-btn)');
  assert.match(outlined, /background:\s*var\(--cp-surface\)/);
  assert.match(outlined, /color:\s*var\(--cp-ink\)/);
});

test("일정 카드의 '확정' 배지는 보라 글자·테두리에 글자를 함께 둔다", () => {
  const badge = rule(css, '.anchor-badge');
  assert.match(badge, /[^-]color:\s*var\(--cp-anchor\)/);
  assert.match(badge, /border:\s*1px solid var\(--cp-anchor\)/);
  assert.doesNotMatch(badge, /background/);
  assert.match(read('domains/itinerary/ui/itinerary-schedule-card.js'),
    /scheduleItem\.type === 'AnchorSchedule' && scheduleItem\.flexible !== true \? `<span class="anchor-badge" data-i18n="anchorBadge">\$\{t\('anchorBadge'\)\}<\/span>` : ''/);
  // 시각을 맡긴 꼭 갈 곳(flexible)은 예약이 아니다. 탑승권·출발 카드와 같은 기준이다.
  const anchor = { title: 'A', time: '10:00', endTime: '11:00', location: 'x', type: 'AnchorSchedule' };
  assert.match(renderScheduleCard(anchor, 0, false), /anchor-badge/);
  assert.doesNotMatch(renderScheduleCard({ ...anchor, flexible: true }, 0, false), /anchor-badge/);
  // 방문 완료로 흐려질 때 배지는 빼 둔다(.55 로 흐리면 4.5:1 아래로 떨어진다).
  assert.match(css, /\.schedule-card\[data-visited\] \.schedule-title-row > :not\(\.anchor-badge\) \{ opacity: \.55; \}/);
});

test('출발 카드의 보라는 예약일 때만이고 배경에는 쓰지 않는다', () => {
  assert.match(rule(css, '.departure-card:not([data-state="next"])'), /border-color:\s*var\(--cp-anchor\)/);
  assert.match(rule(css, '.departure-card:not([data-state="next"]) span:first-child'), /color:\s*var\(--cp-anchor\)/);
  assert.match(rule(css, '#next-stop-departure'), /color:\s*var\(--cp-anchor\)/);
  assert.match(rule(css, ':host([mobile-summary]) .next-stop:has(#next-stop-departure:not(:empty))'), /border-color:\s*var\(--cp-anchor\)/);
  // 보라 배경은 번호 노드 하나뿐이고 글자는 surface 다(잉크나 고정 흰색은 대비가 모자란다).
  const backgrounds = css.match(/[^{}]*\{[^}]*background:\s*var\(--cp-anchor\)[^}]*\}/g) || [];
  assert.equal(backgrounds.length, 1);
  assert.match(backgrounds[0], /[^-]color:\s*var\(--cp-surface\)/);
  // 초록과 파랑은 버튼·배지에 쓰지 않는다.
  assert.doesNotMatch(css, /\.(anchor-badge|departure-card|next-stop)[^{}]*\{[^}]*--cp-(start|stop)/);
});
