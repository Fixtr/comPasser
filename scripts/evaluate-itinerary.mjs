import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { cases, CASE_VERSION } from './itinerary-evaluation-cases.mjs';
import { enforcePlannerConstraints, getLocationName } from '../src/domains/planner/services/planner-constraints.mjs';
import { prepareGeneratedPlaces, normalizePlaceIntent, isFixedPlace } from '../src/domains/map/services/recommendation-place.mjs';
import { applyTransitDelays, getEndTimeOverflowMinutes } from '../src/domains/itinerary/services/itinerary-schedule-adjust.mjs';
import { hasFixedArrivalConflict } from '../src/domains/itinerary/services/itinerary-end-fit.mjs';

const require = createRequire(import.meta.url);
const { buildPrompt, sanitizePlannerRequest, ITINERARY_SCHEMA } = require('../functions/itinerary-prompt.js');
const minutes = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Evaluate without repairing the supplied snapshot. Missing evidence is unknown.
export function evaluate(request, days, evidence = {}) {
  const expected = request.dailyData;
  days = Array.isArray(days) ? days : [];
  const structure = Array.isArray(days) && days.length === expected.length && expected.every(c =>
    days.filter(d => d?.day === c.day && d.date === c.date && Array.isArray(d.scheduleItems) && d.scheduleItems.length).length === 1)
    ? 'pass' : 'fail';
  return { structure, days: expected.map(c => {
    const items = days?.find(d => d?.day === c.day)?.scheduleItems;
    if (!Array.isArray(items) || !items.length || items.some(item => !item || typeof item !== 'object')) {
      return { day: c.day, missing: true, anchorContract: 'fail', anchorArrival: 'unknown', endArrival: 'unknown' };
    }
    const invalidTimes = items.flatMap((item, index) => {
      const start = minutes(item.time), end = minutes(item.endTime);
      return start === null || (!['departure', 'arrival'].includes(item.type) && (end === null || end < start)) ? [index] : [];
    });
    const missingAnchors = c.anchors.filter(a => !items.some(i => i.type === 'AnchorSchedule' &&
      i.title === a.name && i.time === a.time && i.endTime === a.endTime && getLocationName(i.location) === getLocationName(a.location)));
    const routes = evidence.source === 'google_maps' ? evidence.days?.find(d => d.day === c.day)?.transitRoutes || [] : [];
    const validRoutes = [];
    for (let fromIndex = 0; fromIndex < items.length - 1; fromIndex++) {
      const matches = routes.filter(r => r.fromIndex === fromIndex && (r.toIndex ?? r.fromIndex + 1) === fromIndex + 1);
      if (matches.length === 1 && Number.isFinite(matches[0].durationMinutes) && matches[0].durationMinutes >= 0) validRoutes.push(matches[0]);
    }
    const measured = validRoutes.length === items.length - 1 && invalidTimes.length === 0 &&
      items[0].type === 'departure' && items.at(-1).type === 'arrival';
    const projected = applyTransitDelays(items, validRoutes, c.startTime);
    const anchorConflict = hasFixedArrivalConflict(projected, validRoutes);
    const endOverflowMinutes = invalidTimes.length ? null : Math.max(
      getEndTimeOverflowMinutes(items, c.endTime), getEndTimeOverflowMinutes(projected, c.endTime));
    const ordinary = items.filter(i => !isFixedPlace(i));
    const shortStays = items.flatMap((item, index) => {
      if (isFixedPlace(item)) return [];
      const start = minutes(item.time), end = minutes(item.endTime);
      if (start === null || end === null || end < start) return [];
      const minimum = item.placeIntent?.category === 'restaurant' || (item.type === 'dining' && item.placeIntent?.category !== 'cafe') ? 60 : 20;
      return end - start < minimum ? [{ index, title: item.title, minutes: end - start, minimum }] : [];
    });
    return { day: c.day, itemCount: items.length, invalidTimes,
      anchorContract: missingAnchors.length ? 'fail' : 'pass', missingAnchors: missingAnchors.map(a => a.name),
      anchorArrival: missingAnchors.length || anchorConflict ? 'fail' : c.anchors.length === 0 ? 'not-applicable' : measured ? 'pass' : 'unknown',
      endArrival: endOverflowMinutes > 0 ? 'fail' : measured ? 'pass' : 'unknown', endOverflowMinutes,
      routes: { measured: validRoutes.length, expected: items.length - 1 },
      places: { verified: ordinary.filter(i => i.placeStatus === 'verified' && i.verifiedPlace?.source === 'google_places').length,
        unresolved: ordinary.filter(i => i.placeStatus === 'unresolved').length,
        pending: ordinary.filter(i => !['verified', 'unresolved'].includes(i.placeStatus)).length },
      invalidIntents: ordinary.filter(i => !normalizePlaceIntent(i.placeIntent)).length,
      invalidCenters: ordinary.filter(i => i.placeIntent?.purpose && ![c.startLocation, c.endLocation, ...c.anchors.map(a => a.location)]
        .some(location => getLocationName(location) === i.placeIntent.nearLocation)).length,
      shortStays };
  }) };
}

function assess(record) {
  if (record.error) return { case: record.case, model: record.model, error: record.error };
  const raw = evaluate(record.request, record.response?.days);
  if (raw.structure !== 'pass' || raw.days.some(d => d.missing)) return { case: record.case, model: record.model, raw, normalized: null };
  const normalizedDays = enforcePlannerConstraints(prepareGeneratedPlaces(record.response.days), record.request, 'ko');
  return { case: record.case, model: record.model, milliseconds: record.milliseconds, usage: record.usage,
    raw, normalized: evaluate(record.request, normalizedDays),
    // A Maps export must carry its own exact displayed items; indexes cannot be
    // applied to a newly normalized plan where stops may have moved or vanished.
    measured: record.mapsSnapshot ? evaluate(record.request, record.mapsSnapshot.days, record.mapsSnapshot) : null };
}

async function main() {
  const { values } = parseArgs({ options: { live: { type: 'boolean' }, replay: { type: 'string' },
    model: { type: 'string', default: 'gemini-2.5-flash-lite' }, out: { type: 'string' } } });
  if ((!values.live && !values.replay) || (values.live && values.replay) || !values.out) {
    throw new Error('Usage: node scripts/evaluate-itinerary.mjs (--live [--model ID] | --replay DIR) --out NEW_DIR');
  }
  if (values.live && !process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required for --live');
  if (!/^gemini-[a-z0-9.-]+$/.test(values.model)) throw new Error('Invalid model ID');
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length) throw new Error('Output directory must be empty; keep baseline captures immutable');
  const results = [];
  if (values.replay) {
    const files = (await readdir(values.replay)).filter(name => name.endsWith('.capture.json')).sort();
    if (!files.length) throw new Error('No .capture.json files found');
    for (const file of files) results.push(assess(JSON.parse(await readFile(join(values.replay, file), 'utf8'))));
  } else {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    for (const c of cases) {
      const prompt = buildPrompt(sanitizePlannerRequest(c.request), 'ko');
      const record = { case: c.id, description: c.description, caseVersion: CASE_VERSION, request: c.request,
        model: values.model, capturedAt: new Date().toISOString(), revision, prompt, promptHash: hash(prompt), schemaHash: hash(ITINERARY_SCHEMA) };
      const started = Date.now();
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${values.model}:generateContent`, {
          method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: ITINERARY_SCHEMA } }),
          signal: AbortSignal.timeout(90000)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.json();
        record.usage = body.usageMetadata;
        record.finishReason = body.candidates?.[0]?.finishReason;
        record.rawText = (body.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        if (record.finishReason !== 'STOP') throw new Error(`Finish reason: ${record.finishReason}`);
        record.response = JSON.parse(record.rawText);
      } catch (error) {
        // Do not persist provider error bodies or request headers (API secrets).
        record.error = error.name === 'SyntaxError' ? 'Invalid JSON response' :
          error.name === 'TimeoutError' ? 'Request timed out' : /^HTTP \d+$|^Finish reason:/.test(error.message) ? error.message : 'Request failed';
      }
      record.milliseconds = Date.now() - started;
      await writeFile(join(out, `${c.id}.capture.json`), JSON.stringify(record, null, 2) + '\n');
      results.push(assess(record));
      console.log(`${c.id}: ${record.error || `${record.milliseconds}ms`}`);
    }
  }
  await writeFile(join(out, 'report.json'), JSON.stringify({ evaluatedAt: new Date().toISOString(),
    evaluatorHash: hash(await readFile(new URL(import.meta.url), 'utf8')), results }, null, 2) + '\n');
  const sum = (stage, field) => stage?.days.reduce((total, day) => total + (Array.isArray(day[field]) ? day[field].length : day[field] || 0), 0);
  const status = (stage, field) => !stage ? '미측정' : stage.days.some(d => d[field] === 'fail') ? '위반' :
    stage.days.some(d => d[field] === 'unknown') ? '미측정' : stage.days.every(d => d[field] === 'not-applicable') ? '해당 없음' : '통과';
  const coverage = (stage, key, numerator, denominator) => !stage ? '미측정' :
    `${stage.days.reduce((n, d) => n + (d[key]?.[numerator] || 0), 0)}/${stage.days.reduce((n, d) => n + denominator(d[key] || {}), 0)}`;
  const hasMaps = results.some(r => r.measured);
  const lines = ['# 경로 생성 품질 기준선', '',
    '각 사례의 단일 응답을 평가했다. 평균 성공률이나 모델 간 우열을 의미하지 않는다.', '',
    '앱 보정은 실제 prepareGeneratedPlaces → enforcePlannerConstraints 순서를 재사용한다.',
    hasMaps ? 'Maps 캡처의 실제 장소·경로 조회 및 시간 보정 후 결과를 함께 평가했다.' : '지도 캡처가 없어 실제 장소·경로는 미측정이다.',
    '지각·도착은 실제 Google 경로가 없으면 미측정이며, 일정 자체의 충돌이 확인되면 위반이다. 체류시간은 현재 일정표 기준이다.', '',
    '| 사례 | 모델 | 생성 초 | 원본→보정→지도 후 짧은 체류 | 잘못된 검색 기준점 | 잘못된 방문 목적 | 장소 확인/대상 | 경로 확인/대상 | 필수 일정 도착 | 종료 시각 |',
    '|---|---|---:|---:|---:|---:|---|---|---|---|'];
  for (const r of results) {
    lines.push(r.error ? `| ${r.case} | ${r.model} | 오류 | — | — | — | 미측정 | 미측정 | 미측정 | ${r.error} |` :
      `| ${r.case} | ${r.model} | ${(r.milliseconds / 1000).toFixed(1)} | ${sum(r.raw, 'shortStays')} → ${sum(r.normalized, 'shortStays') ?? '미측정'} → ${sum(r.measured, 'shortStays') ?? '미측정'} | ${sum(r.normalized, 'invalidCenters') ?? '미측정'} | ${sum(r.normalized, 'invalidIntents') ?? '미측정'} | ${coverage(r.measured, 'places', 'verified', p => (p.verified || 0) + (p.unresolved || 0) + (p.pending || 0))} | ${coverage(r.measured, 'routes', 'measured', p => p.expected || 0)} | ${status(r.measured || r.normalized, 'anchorArrival')} | ${status(r.measured || r.normalized, 'endArrival')} |`);
  }
  lines.push('', hasMaps ? '장소 확인은 선택 방문만 센다. 경로 확인은 고정 장소까지 포함한 인접 구간 전체를 센다. 일부 구간이 미확인인 경우 도착 가능 판정은 미측정으로 남긴다.' :
    '실제 장소 검색 실패율은 Maps 증거가 없는 이번 생성 기준선에서 미측정이다. pending을 실패로 계산하지 않는다.',
    '상세 항목·시간·토큰은 [report.json](report.json), 정확한 입력·프롬프트·응답은 같은 폴더의 *.capture.json에 보관한다.', '');
  await writeFile(join(out, 'report.md'), lines.join('\n'));
  console.log(`Report: ${join(out, 'report.json')}`);
  if (results.some(r => r.error)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
