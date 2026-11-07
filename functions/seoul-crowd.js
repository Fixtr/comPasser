const AREA = '광화문·덕수궁';
const MAX_AGE_MS = 60 * 60 * 1000;

function parseCrowd(payload, now = Date.now()) {
  const record = payload?.['SeoulRtd.citydata_ppltn']?.[0];
  const level = record?.AREA_CONGEST_LVL;
  const observedAt = record?.PPLTN_TIME;
  const measured = typeof observedAt === 'string'
    ? Date.parse(`${observedAt.trim().replace(' ', 'T')}+09:00`) : NaN;
  if (record?.AREA_NM !== AREA || !['여유', '보통', '약간 붐빔', '붐빔'].includes(level)
    || !Number.isFinite(measured) || measured > now + 60_000 || now - measured > MAX_AGE_MS) return null;
  return { area: AREA, level, observedAt, delayed: now - measured > 20 * 60 * 1000,
    source: 'https://data.seoul.go.kr/dataVisual/seoul/guide.do' };
}

let cached;
let expires = 0;
async function getSeoulCrowd({ fetchImpl = fetch, now = Date.now() } = {}) {
  if (cached && now < expires) return cached;
  // The official sample key is restricted to this one area; a full key can replace it on the server.
  const key = process.env.SEOUL_OPEN_API_KEY || 'sample';
  // shortcut: Seoul API on :8088 is http only, key travels in clear; use a key with no billing until it offers TLS
  const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/citydata_ppltn/1/1/${encodeURIComponent(AREA)}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Seoul API returned ${response.status}`);
  const result = parseCrowd(await response.json(), now);
  if (!result) throw new Error('Seoul API data unavailable or stale');
  cached = result;
  expires = now + 5 * 60 * 1000;
  return result;
}

module.exports = { getSeoulCrowd, parseCrowd };
