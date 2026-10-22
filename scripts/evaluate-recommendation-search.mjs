import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { createPlaceRecommendations } = require('../functions/place-recommendations.js');
const GEMINI = 'https://generativelanguage.googleapis.com/';
const STOP = 'harness-stop';

// Same rule as production bodyFor: Gemini 3 rejects thinkingBudget and takes thinkingLevel.
const forModel = (model, body) => !model.startsWith('gemini-3') ? body
  : { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingLevel: 'minimal' } } };

// Runs the production recommendPlaces up to its first Places lookup, with the search and formatter
// calls sent to the given models. Weather, Places and Firestore are never called.
export async function run({ key, searchModel, formatModel, data, fetch = globalThis.fetch }) {
  const calls = [];
  let reachedPlaces = false;
  const axios = {
    get: async () => { throw new Error(STOP); }, // weather; dates more than 9 days ahead skip it
    post: async (url, body, config) => {
      if (!url.startsWith(GEMINI)) { reachedPlaces = true; throw new Error(STOP); }
      const search = Boolean(body.tools);
      // Production retries a search miss on the backup model; only the first search is measured.
      if (search && calls.some(c => c.search)) throw new Error(STOP);
      const model = search ? searchModel : formatModel;
      const started = Date.now();
      const response = await fetch(`${GEMINI}v1beta/models/${model}:generateContent`, { method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(forModel(model, body)), signal: AbortSignal.timeout(config.timeout) });
      const call = { search, model, milliseconds: Date.now() - started, status: response.status };
      calls.push(call);
      // Do not keep provider error bodies (they can echo request data).
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { response: { status: response.status } });
      const result = await response.json();
      const candidate = result.candidates?.[0];
      const meta = candidate?.groundingMetadata;
      const text = (candidate?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
      Object.assign(call, { usage: result.usageMetadata, finishReason: candidate?.finishReason });
      if (search) Object.assign(call, { queries: meta?.webSearchQueries || [], chunks: meta?.groundingChunks?.length || 0,
        supports: meta?.groundingSupports?.length || 0, searchEntry: Boolean(meta?.searchEntryPoint?.renderedContent), text });
      else {
        // The formatter prompt ends with the JSON array that survived groundedEvidence.
        const prompt = body.contents[0].parts[0].text;
        call.evidence = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)).length;
        try { call.candidates = JSON.parse(text).places.map(p => p.name); } catch { call.candidates = null; }
      }
      return { data: result };
    }
  };
  const recommend = createPlaceRecommendations({ axios, getKeys: () => ({ gemini: key, maps: 'unused' }), reserveRequest: async () => {} });
  const quiet = ['info', 'warn', 'error'].map(level => [level, console[level]]);
  quiet.forEach(([level]) => { console[level] = () => {}; });
  let failure = null;
  try { await recommend({ data, rawRequest: {} }); } catch (error) {
    failure = { reason: error.details?.reason || null, detail: error.details?.detail || null };
  } finally { quiet.forEach(([level, fn]) => { console[level] = fn; }); }
  const searchCall = calls.find(c => c.search);
  const formatCall = calls.find(c => !c.search);
  return { searchModel, formatModel, interest: data.interest, calls, reachedPlaces,
    searched: Boolean(searchCall?.queries?.length || searchCall?.chunks),
    searchQueries: searchCall?.queries?.length ?? 0,
    evidence: formatCall?.evidence ?? 0,
    candidates: formatCall?.candidates?.length ?? 0,
    failure: reachedPlaces ? null : failure };
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' }, runs: { type: 'string', default: '4' },
    date: { type: 'string', default: '2026-11-07' } } });
  if (!values.out) throw new Error('Usage: node scripts/evaluate-recommendation-search.mjs --out NEW_DIR [--runs N] [--date YYYY-MM-DD]');
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is required');
  const out = resolve(values.out);
  await mkdir(out, { recursive: true });
  if ((await readdir(out)).length) throw new Error('Output directory must be empty');
  const pairs = [['gemini-2.5-flash', 'gemini-2.5-flash-lite'], ['gemini-3.5-flash-lite', 'gemini-3.5-flash-lite']];
  const records = [];
  // Interleave models so time-of-day or quota effects hit both equally.
  for (let i = 0; i < Number(values.runs); i++) for (const interest of ['any', 'culture']) for (const [searchModel, formatModel] of pairs) {
    const data = { cityId: 'seoul', country: 'KOR', date: values.date, lang: 'ko', theme: null, budget: null, interest, excludedPlaces: [] };
    const record = { run: i + 1, capturedAt: new Date().toISOString(), ...await run({ key: process.env.GEMINI_API_KEY, searchModel, formatModel, data }) };
    records.push(record);
    console.log(`${record.run} ${interest} ${searchModel}: searched=${record.searched} queries=${record.searchQueries} evidence=${record.evidence} candidates=${record.candidates} ${record.failure?.detail || record.failure?.reason || ''}`);
  }
  const source = execFileSync('git', ['hash-object', 'functions/place-recommendations.js'], { encoding: 'utf8' }).trim();
  await writeFile(join(out, 'runs.json'), JSON.stringify({ revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    placeRecommendationsBlob: source, date: values.date, evaluatorHash: createHash('sha256').update(String(run)).digest('hex'), records }, null, 2) + '\n');
  console.log(`Runs: ${join(out, 'runs.json')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
