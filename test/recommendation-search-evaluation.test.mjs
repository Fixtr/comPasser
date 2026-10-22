import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../scripts/evaluate-recommendation-search.mjs';

const statement = '국립중앙박물관은 한국 역사 유물을 상설 전시하는 대표 박물관입니다.';
const data = { cityId: 'seoul', country: 'KOR', date: '2099-11-07', lang: 'ko', theme: null, budget: null, interest: 'culture', excludedPlaces: [] };
const reply = body => ({ ok: true, status: 200, json: async () => body });

test('measures search and formatter on the requested models and stops before Places', async () => {
  const requests = [];
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    if (body.tools) return reply({ usageMetadata: { promptTokenCount: 10 }, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: statement }] },
      groundingMetadata: { webSearchQueries: ['서울 박물관', '국립중앙박물관'], groundingChunks: [{ web: { uri: 'https://www.museum.go.kr/', title: 'museum' } }],
        groundingSupports: [{ segment: { text: statement }, groundingChunkIndices: [0] }], searchEntryPoint: { renderedContent: '<div></div>' } } }] });
    return reply({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ places: [{ name: '국립중앙박물관', mentionedName: '국립중앙박물관', evidenceIndex: 0, event: null }] }) }] } }] });
  };
  const result = await run({ key: 'test', searchModel: 'gemini-3.5-flash-lite', formatModel: 'gemini-3.5-flash-lite', data, fetch });
  assert.deepEqual(requests.map(r => r.url.split('/').pop()), Array(2).fill('gemini-3.5-flash-lite:generateContent'));
  assert.deepEqual(requests[0].body.generationConfig.thinkingConfig, { thinkingLevel: 'minimal' });
  assert.equal(result.reachedPlaces, true);
  assert.deepEqual([result.searched, result.searchQueries, result.evidence, result.candidates, result.failure], [true, 2, 1, 1, null]);
});

test('a search miss is recorded once instead of being retried on the backup', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return reply({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: statement }] } }] }); };
  const result = await run({ key: 'test', searchModel: 'gemini-2.5-flash', formatModel: 'gemini-2.5-flash-lite', data, fetch });
  assert.equal(calls, 1);
  assert.deepEqual([result.searched, result.evidence, result.reachedPlaces], [false, 0, false]);
});
