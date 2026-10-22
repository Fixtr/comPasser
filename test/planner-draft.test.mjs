import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlannerDraftStore, toPlannerDraft } from '../src/domains/planner/services/planner-draft.mjs';
import { getFormData } from '../src/domains/planner/ui/travel-form-data.js';

function fixture() {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  return { values, storage, store: createPlannerDraftStore({ getStorage: () => storage }) };
}
const edited = () => ({
  date: ['2026-10-01', '2026-10-02'], theme: 'food', budget: 'budget',
  startTime: '09:00', endTime: '18:00', startLocation: '서울역', endLocation: '서울역',
  anchorSchedules: [{ day: 2, name: '공연', time: '12:00', endTime: '13:00', location: '공연장' }],
});
function form(draft, { readOnly = true, value = '2026-10-01 ~ 2026-10-02' } = {}) {
  const elements = {
    'schedule-date': { readOnly, value },
    'start-time': { value: draft.startTime }, 'end-time': { value: draft.endTime },
    'start-location': { value: draft.startLocation }, 'end-location': { value: draft.endLocation },
    'daily-times-toggle': { checked: false },
  };
  return {
    getElementById: id => elements[id],
    querySelectorAll: selector => selector === '.overnight-location'
      ? (draft.overnightLocations || []).map(value => typeof value === 'string' ? {value, querySelector: () => null}
        : {value:value.displayName,selectedPlace:value,selectedPlaceText:value.displayName})
      : draft.anchorSchedules.map(anchor => ({ querySelector: selector => ({ value: {
      '.anchor-day': anchor.day, '.anchor-name': anchor.name, '.anchor-time': anchor.time,
      '.anchor-end-time': anchor.endTime, '.anchor-location': anchor.location,
    }[selector] }) })),
  };
}

test('editing a saved trip replaces all preferences; read-only date submit uses the displayed draft', () => {
  const { store, values } = fixture();
  values.set('userPreference', JSON.stringify({ date: ['2026-10-20'], theme: 'photo', budget: 'flex' }));
  const draft = store.save(edited());
  const result = getFormData(form(draft), draft);
  assert.deepEqual(result.date, edited().date);
  assert.equal(result.theme, 'food');
  assert.equal(result.budget, 'budget');
  assert.equal(result.anchorSchedules[0].day, 2);
  assert.equal(result.dailyTimes.length, 2);
  assert.deepEqual(JSON.parse(values.get('userPreference')).date, edited().date);
});

test('overnight places survive draft storage and form reading', () => {
  const {store} = fixture();
  const hotel = {placeId:'hotel-id',displayName:'서울 호텔',formattedAddress:'서울 중구',lat:37.5,lng:127};
  const draft = store.save({...edited(),overnightLocations:[hotel]});
  assert.deepEqual(store.read().overnightLocations,[hotel]);
  assert.deepEqual(getFormData(form(draft),draft).overnightLocations,[hotel]);
});

test('arriving and departing flights survive the draft and are read from shown flight entries only', () => {
  const arrival = { airport: '인천국제공항', time: '10:00', kind: 'international' };
  const draft = toPlannerDraft({ ...edited(), flights: { arrival, departure: null } });
  assert.deepEqual(draft.flights, { arrival, departure: null });
  assert.deepEqual(toPlannerDraft(edited()).flights, { arrival: null, departure: null });
  // An entry being filled in keeps its place; a bad time or kind is reset rather than kept.
  assert.deepEqual(toPlannerDraft({ ...edited(), flights: { departure: { time: '9pm', kind: 'charter' } } }).flights.departure,
    { airport: '', time: '', kind: 'international' });
  const entry = (hidden, values) => ({ hidden, querySelector: selector => ({ value: values[selector] }) });
  const flightForm = form(draft);
  const lookup = flightForm.getElementById;
  flightForm.getElementById = id => ({
    'arrival-flight': entry(false, { '.flight-airport': '인천국제공항', '.flight-time': '10:00', '.flight-kind': 'international' }),
    'departure-flight': entry(true, { '.flight-airport': '김포국제공항', '.flight-time': '21:00', '.flight-kind': 'domestic' }),
  })[id] ?? lookup(id);
  assert.deepEqual(getFormData(flightForm, draft).flights, { arrival, departure: null });
});

test('legacy repeated endpoints require lodging; first departure and final destination survive editing', () => {
  const source = { dailyData: Array.from({ length: 4 }, (_, index) => ({
    day: index + 1, date: `2026-10-0${index + 1}`, startTime: '09:00', endTime: '18:00',
    startLocation: '서울역', endLocation: index === 3 ? '인천공항 T2' : '인천공항 T1', anchors: [],
  })) };
  const before = structuredClone(source);
  const draft = toPlannerDraft(source);
  assert.equal(draft.startLocation, '서울역');
  assert.equal(draft.endLocation, '인천공항 T2');
  assert.deepEqual(draft.overnightLocations, ['', '', '']);
  assert.equal(draft.sameOvernightLocation, false);
  assert.deepEqual(source, before);
});

test('consecutive-night selection repeats the selected identity and follows duration changes', () => {
  const { store, storage } = fixture();
  const hotel = { placeId: 'hotel-id', displayName: '서울 호텔', formattedAddress: '서울 중구', lat: 37.5, lng: 127 };
  store.save({ ...edited(), sameOvernightLocation: true, overnightLocations: [hotel] });
  const expanded = store.updatePreferences({ date: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'] });
  assert.deepEqual(expanded.overnightLocations, [hotel, hotel, hotel]);
  assert.equal(createPlannerDraftStore({ getStorage: () => storage }).read().sameOvernightLocation, true);
  const shorter = store.updatePreferences({ date: ['2026-10-01', '2026-10-02'] });
  assert.deepEqual(shorter.overnightLocations, [hotel]);
  const single = store.updatePreferences({ date: ['2026-10-01'] });
  assert.deepEqual(single.overnightLocations, []);
  assert.equal(single.sameOvernightLocation, false);
});

test('different-night selections resize without restoring removed lodging', () => {
  const { store } = fixture();
  store.save({ ...edited(), date: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    overnightLocations: ['첫 숙소', '둘째 숙소', '셋째 숙소'] });
  assert.deepEqual(store.updatePreferences({ date: edited().date }).overnightLocations, ['첫 숙소']);
  assert.deepEqual(store.updatePreferences({ date: ['2026-10-01', '2026-10-02', '2026-10-03'] }).overnightLocations,
    ['첫 숙소', '']);
});

test('reload and re-entry retain edited fields even when legacy preferences are stale', () => {
  const { store, values, storage } = fixture();
  store.save(edited());
  values.set('userPreference', JSON.stringify({ date: ['2026-10-20'], theme: 'photo', budget: 'flex' }));
  const reloaded = createPlannerDraftStore({ getStorage: () => storage });
  assert.deepEqual(reloaded.read(), toPlannerDraft(edited()));
  assert.deepEqual(store.read(), reloaded.read());
});

test('explicit preference changes preserve detailed inputs; skipping clears theme and budget', () => {
  const { store } = fixture();
  store.save(edited());
  const result = store.updatePreferences({ date: ['2026-11-01', '2026-11-02'], theme: null, budget: null });
  assert.deepEqual(result.date, ['2026-11-01', '2026-11-02']);
  assert.equal(result.theme, null);
  assert.equal(result.budget, null);
  assert.deepEqual(result.anchorSchedules, edited().anchorSchedules);
  assert.equal(result.startLocation, '서울역');
});

test('empty editable date stays empty instead of falling back to an older selection', () => {
  const draft = toPlannerDraft(edited());
  const result = getFormData(form(draft, { readOnly: false, value: '' }), draft);
  assert.equal(result.date, '');
  assert.deepEqual(toPlannerDraft(result).date, []);
});

test('reset clears details but keeps the visible dates and preference selection across reload', () => {
  const { store, storage } = fixture();
  store.save({ ...edited(), selectedWaypoints: [{ name: '서울숲', location: '서울 성동구 뚝섬로 273' }] });
  assert.deepEqual(getFormData(form(store.read()), store.read()).selectedWaypoints, [{ name: '서울숲', location: '서울 성동구 뚝섬로 273' }]);
  assert.equal(createPlannerDraftStore({ getStorage: () => storage }).read().selectedWaypoints[0].name, '서울숲');
  const cleared = store.resetDetails();
  assert.deepEqual(cleared.date, edited().date);
  assert.equal(cleared.theme, 'food');
  assert.equal(cleared.startLocation, '');
  assert.equal(cleared.startTime, '');
  assert.deepEqual(cleared.anchorSchedules, []);
  assert.deepEqual(cleared.selectedWaypoints, []);
  assert.deepEqual(createPlannerDraftStore({ getStorage: () => storage }).read(), cleared);
});

test('legacy preference-only and partial form copies are migrated without overwriting explicit nulls', () => {
  const { store, values } = fixture();
  values.set('userPreference', JSON.stringify({ date: ['2026-10-20'], theme: 'food', budget: 'flex' }));
  assert.deepEqual(store.read().date, ['2026-10-20']);
  values.set('currentFormData', JSON.stringify({ startLocation: '역', theme: null }));
  assert.equal(store.read().startLocation, '역');
  assert.equal(store.read().theme, null);
  assert.equal(store.read().budget, 'flex');
  values.set('currentFormData', '{broken');
  assert.equal(store.read().theme, 'food');
});

test('a legacy per-day request becomes editable flat fields; stale derived data is not retained', () => {
  const draft = toPlannerDraft({ dailyData: [
    { date: '2026-10-01', startTime: '09:00', endTime: '18:00', startLocation: { displayName: '서울역' }, anchors: [] },
    { date: '2026-10-02', startTime: '10:00', endTime: '19:00', anchors: [{ name: '공연', location: '공연장' }] },
  ] });
  assert.deepEqual(draft.date, edited().date);
  assert.equal(draft.startLocation, '서울역');
  assert.equal(draft.dailyTimes[1].startTime, '10:00');
  assert.equal(draft.anchorSchedules[0].day, 2);
  assert.equal(Object.hasOwn(draft, 'dailyData'), false);
});

test('saved trip and draft snapshots do not share mutable arrays', () => {
  const { store } = fixture();
  const source = edited();
  const snapshot = store.save(source);
  snapshot.anchorSchedules[0].name = 'changed';
  source.date[0] = 'different';
  assert.equal(store.read().anchorSchedules[0].name, '공연');
  assert.equal(store.read().date[0], '2026-10-01');
});

test('unavailable storage keeps the current edit in memory', () => {
  const store = createPlannerDraftStore({ getStorage: () => { throw new Error('blocked'); } });
  store.save(edited());
  assert.deepEqual(store.read(), toPlannerDraft(edited()));
});

test('a rejected recovery write does not restore the old form over the current edit', () => {
  const values = new Map([['currentFormData', JSON.stringify({ date: ['2026-10-20'] })]]);
  const store = createPlannerDraftStore({ getStorage: () => ({
    getItem: key => values.get(key) ?? null,
    setItem() { throw new Error('quota'); },
  }) });
  store.save(edited());
  assert.deepEqual(store.read(), toPlannerDraft(edited()));
});

test('daily location overrides survive storage, resize by duration and never infer from legacy dailyData', () => {
  const {store} = fixture();
  const place = {placeId:'station',displayName:'부산역',formattedAddress:'부산',lat:35.1,lng:129};
  store.save({...edited(), dailyLocations: [{day:2,startLocation:place,endLocation:''}]});
  assert.deepEqual(store.read().dailyLocations, [
    {day:1,startLocation:'',endLocation:''}, {day:2,startLocation:place,endLocation:''},
  ]);
  store.updatePreferences({date:['2026-10-01','2026-10-02','2026-10-03']});
  assert.deepEqual(store.read().dailyLocations[2], {day:3,startLocation:'',endLocation:''});
  store.updatePreferences({date:['2026-10-01']});
  assert.equal(store.read().dailyLocations, null);
  store.updatePreferences({date:['2026-10-01','2026-10-02']});
  assert.equal(store.read().dailyLocations, null);
  assert.equal(toPlannerDraft({dailyData:[{date:'2026-10-01',startLocation:'역'},
    {date:'2026-10-02',startLocation:'공항'}]}).dailyLocations, null);
});
