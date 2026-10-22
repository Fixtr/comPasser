import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { buildPrompt, sanitizePlannerRequest, ITINERARY_SCHEMA } = createRequire(import.meta.url)('../functions/itinerary-prompt.js');

test('all budget prompts use transit, omit fixed stops and only require meals when they fit', () => {
  for (const budget of ['flex', 'standard', 'budget']) {
    const prompt = buildPrompt(sanitizePlannerRequest({ date: ['2026-10-06'], budget,
      dailyData: [{ day: 1, date: '2026-10-06', startTime: '11:00', endTime: '14:00', startLocation: '서울역', endLocation: '서울숲', anchors: [] }] }), 'ko');
    assert.match(prompt, /The app inserts departure, arrival and AnchorSchedule items/);
    assert.match(prompt, /public transit and walking for every budget/);
    assert.match(prompt, /Only include a meal if its full 60-minute stay fits/);
    // gemini-3.5-flash-lite left 09:00-21:00 with one cafe when only the "fewer visits" rules were stated.
    assert.match(prompt, /free block of 2 hours or more should hold at least one optional visit/);
    assert.match(prompt, /a day of 3 hours or less usually 1-2\. The gaps above still separate every pair of visits/);
    assert.match(prompt, /move lunch before or after a fixed appointment rather than skip it/);
    assert.doesNotMatch(prompt, /ALL transportation|occasional taxi|tips in localTip|estimate the real travel time|MUST include ScheduleItems with type/);
  }
  assert.deepEqual(ITINERARY_SCHEMA.properties.days.items.properties.scheduleItems.items.properties.type.enum,
    ['attraction', 'dining', 'leisure']);
});

test('place-search examples and budget words follow the request language', () => {
  const constraints = sanitizePlannerRequest({ date: ['2026-10-06'], budget: 'standard',
    dailyData: [{ day: 1, date: '2026-10-06', startTime: '11:00', endTime: '14:00', startLocation: '서울역', endLocation: '서울숲', anchors: [] }] });
  const ko = buildPrompt(constraints, 'ko'), en = buildPrompt(constraints, 'en');
  assert.match(ko, /placeIntent\.purpose in Korean/);assert.match(ko, /\(저렴한, 중간 가격대 or 고급\)/);
  assert.doesNotMatch(ko, /inexpensive, moderate or premium|English equivalents/);
  assert.match(en, /placeIntent\.purpose in English/);assert.match(en, /\(inexpensive, moderate or premium\)/);
  assert.doesNotMatch(en, /"한식 식당"/);
});

test('each day exposes exact permitted center names, with addresses kept as context', () => {
  const constraints = sanitizePlannerRequest({ date: ['2026-10-06'], dailyData: [{
    day: 1, date: '2026-10-06', startTime: '09:00', endTime: '18:00',
    startLocation: { displayName: '서울역', formattedAddress: '서울 용산구 한강대로 405' }, endLocation: '서울역',
    anchors: [{ name: '관람', time: '12:00', endTime: '13:00', location: '박물관' }]
  }] });
  assert.deepEqual(constraints.dailyData[0].nearLocations, ['서울역', '박물관']);
  const prompt = buildPrompt(constraints, 'ko');
  assert.match(prompt, /Allowed nearLocation values: \["서울역","박물관"\]/);
  assert.match(prompt, /서울 용산구 한강대로 405/);
});

test('multi-day prompt connects overnight boundaries and asks for distinct visits', () => {
  const constraints = sanitizePlannerRequest({date:['2026-10-06','2026-10-07'],dailyData:[
    {day:1,date:'2026-10-06',startTime:'09:00',endTime:'18:00',startLocation:'서울역',endLocation:'호텔',anchors:[]},
    {day:2,date:'2026-10-07',startTime:'09:00',endTime:'18:00',startLocation:'호텔',endLocation:'인천공항',anchors:[]}
  ]});
  const prompt=buildPrompt(constraints,'ko');
  assert.match(prompt,/explicit day overrides may differ/);
  assert.match(prompt,/Avoid repeating the same attraction, area or visit purpose on different days/);
});
