import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';
import { selectRecommendation, normalizePlaceIntent, recommendationFields, prepareGeneratedPlaces, reusableRecommendation } from '../src/domains/map/services/recommendation-place.mjs';
import { createItineraryState } from '../src/domains/itinerary/services/itinerary-state.mjs';

const center = { placeId:'station', displayName:'서울역', formattedAddress:'서울특별시 중구', lat:37.55, lng:126.97 };
const intent = { purpose:'점심 식사', category:'restaurant', nearLocation:'서울역' };
const recommendation = { type:'dining', time:'12:00', endTime:'13:00', title:'점심 식사', location:'서울역', placeIntent:intent, displayIndex:2 };
const fixed = {type:'departure', selectedPlace:center, location:'서울역', displayIndex:1};
const candidate = (id='restaurant', extra={}) => ({ id, displayName:'실제 식당', formattedAddress:'서울특별시 중구 식당 주소',
  location:{lat:37.551,lng:126.971}, types:['restaurant','food'], businessStatus:'OPERATIONAL',
  addressComponents:[{types:['country'],shortText:'KR'}], ...extra });
function service(places) {
  const requests=[];
  return {requests, geocoder:new GeocodingService({importLibrary:async()=>({Place:{searchByText:async request=>{
    requests.push(request);
    if (places instanceof Error) throw places;
    return {places};
  }}})})};
}

test('intent accepts only supported categories and bounded purpose/hint', () => {
  assert.equal(normalizePlaceIntent({purpose:'lunch',category:'bank'}),null);
  assert.equal(normalizePlaceIntent({purpose:' ',category:'restaurant'}),null);
  assert.equal(normalizePlaceIntent({...intent,purpose:'a'.repeat(300)}).purpose.length,200);
});

test('candidate requires real identity, matching type, Korea, valid coordinates, proximity and non-closed status', () => {
  for (const extra of [ {id:''}, {displayName:''}, {formattedAddress:''}, {location:{lat:NaN,lng:127}},
    {location:{lat:35,lng:129}}, {types:['school']}, {types:[]}, {businessStatus:'CLOSED_TEMPORARILY'},
    {businessStatus:'CLOSED_PERMANENTLY'}, {addressComponents:[]}, {addressComponents:[{types:['country'],shortText:'JP'}]} ]) {
    assert.equal(selectRecommendation([candidate('bad',extra)],intent,center),null,JSON.stringify(extra));
  }
  assert.equal(selectRecommendation([candidate()],intent,null),null);
});

test('choose nearest valid candidate, not first search hit; do not repeat fixed or chosen IDs', () => {
  const places=[candidate('station'),candidate('far',{location:{lat:37.57,lng:126.97}}),candidate('near')];
  assert.equal(selectRecommendation(places,intent,center,new Set(['station'])).placeId,'near');
  assert.equal(selectRecommendation(places,intent,center,new Set(['station','near'])).placeId,'far');
});

test('actual candidate becomes canonical JSON identity and Place ID link, never invented business details', async () => {
  const {geocoder,requests}=service([candidate()]);
  const source={...recommendation, practicalInfo:{operatingHours:'24h',top3Recommendations:[{rating:'5.0'}]}, officialWebsiteUrl:'https://invented.example'};
  const [start,item]=await geocoder.geocodeSchedule([fixed,source]);
  assert.equal(start.selectedPlace.placeId,'station');
  assert.equal(item.title,'실제 식당');
  assert.equal(item.verifiedPlace.placeId,'restaurant');
  assert.match(item.googleMapsUrl,/query_place_id=restaurant/);
  assert.deepEqual(item.practicalInfo,{});
  assert.equal(item.officialWebsiteUrl,'');
  assert.equal(source.title,'점심 식사');
  assert.equal(requests[0].includedType,'restaurant');
  assert.equal(requests[0].useStrictTypeFiltering,true);
  assert.ok(requests[0].fields.includes('id'));
  assert.deepEqual(requests[0].locationBias,{lat:center.lat,lng:center.lng});
  assert.deepEqual(JSON.parse(JSON.stringify(item.verifiedPlace)),item.verifiedPlace);
});

test('no candidate / API failure / malformed intent / no trusted center never falls back to invented address', async () => {
  for (const response of [[],new Error('denied')]) {
    const {geocoder}=service(response);
    assert.equal((await geocoder.geocodeSchedule([fixed,recommendation])).length,1);
  }
  const {geocoder,requests}=service([candidate()]);
  assert.deepEqual(await geocoder.geocodeSchedule([recommendation]),[]);
  assert.equal((await geocoder.geocodeSchedule([fixed,{...recommendation,placeIntent:null}])).length,1);
  assert.equal(requests.length,0);
});

test('bounded lookup returns unresolved on timeout without a late mutation', async () => {
  const geocoder=new GeocodingService({importLibrary:()=>new Promise(()=>{})});
  assert.equal(await geocoder.resolveRecommendation(recommendation,center,new Set(),5),null);
});

test('new intents resolve against a fixed anchor before it, not just the first departure', async () => {
  const museum={...center,placeId:'museum',displayName:'국립중앙박물관',lat:37.523,lng:126.98};
  const {geocoder,requests}=service([candidate('near',{location:{lat:37.524,lng:126.98}})]);
  await geocoder.geocodeSchedule([fixed,{...recommendation,placeIntent:{...intent,nearLocation: museum.displayName}},
    {type:'AnchorSchedule',selectedPlace:museum}]);
  assert.deepEqual(requests[0].locationBias,{lat:museum.lat,lng:museum.lng});
});

test('untrusted location hint cannot move the search away from the user locations', async () => {
  const {geocoder,requests}=service([candidate()]);
  await geocoder.geocodeSchedule([fixed,{...recommendation,placeIntent:{...intent,nearLocation:'부산 가짜 주소'}}]);
  assert.doesNotMatch(requests[0].textQuery,/부산|가짜/);
});

test('multiple recommendations cannot silently select the same business', async () => {
  const {geocoder}=service([candidate()]);
  const result=await geocoder.geocodeSchedule([fixed,recommendation,{...recommendation,displayIndex:3}]);
  assert.deepEqual(result.map(i=>i.displayIndex),[1,2]);
});

test('saved identity is reused but intent or center changes invalidate reuse', async () => {
  const saved=selectRecommendation([candidate()],intent,center);
  const item={...recommendation,...recommendationFields(recommendation,saved)};
  const {geocoder,requests}=service([]);
  assert.equal((await geocoder.geocodeSchedule([fixed,JSON.parse(JSON.stringify(item))]))[1].verifiedPlace.placeId,'restaurant');
  assert.equal(requests.length,0);
  assert.equal(reusableRecommendation({...item,placeIntent:{...intent,category:'cafe'}},center),null);
  assert.equal(reusableRecommendation(item,{...center,placeId:'other'}),null);
  assert.equal(reusableRecommendation(item,{...center,lat:35}),null);
});

test('generation cannot self-assert verified fields; malformed intents remain explicit unresolved recommendations', () => {
  const [day]=prepareGeneratedPlaces([{scheduleItems:[{...recommendation,verifiedPlace:center,selectedPlace:center,latLng:{lat:1,lng:2}},
    {...recommendation,placeIntent:{category:'bank'},googleMapsUrl:'https://invented.example'}]}]);
  for(const [index,item] of day.scheduleItems.entries()) {
    assert.equal(item.verifiedPlace,null);
    assert.equal(item.selectedPlace,null);
    assert.equal(item.latLng,null);
    assert.equal(item.placeStatus,index===0?'pending':'unresolved');
    assert.equal(item.googleMapsUrl,'');
  }
});

test('verified identity and coordinates survive state persistence; failure clears stale identity even if names unchanged', () => {
  const values=new Map();
  const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const make=()=>{const s=createItineraryState({getStorage:()=>storage});s.setUser('owner');return s;};
  const state=make();
  state.open({days:[{scheduleItems:[recommendation]}]});
  const verifiedPlace=selectRecommendation([candidate()],intent,center);
  state.resolvePlaces(0,[{index:0,name:verifiedPlace.displayName,address:verifiedPlace.formattedAddress,verifiedPlace}]);
  const restored=make();
  restored.activateDraft();
  assert.equal(restored.snapshot().plan.days[0].scheduleItems[0].verifiedPlace.placeId,'restaurant');
  assert.deepEqual(restored.snapshot().plan.days[0].scheduleItems[0].latLng,{lat:37.551,lng:126.971});
  restored.resolvePlaces(0,[{index:0,name:verifiedPlace.displayName,address:verifiedPlace.formattedAddress,verifiedPlace:null}]);
  assert.equal(restored.snapshot().plan.days[0].scheduleItems[0].verifiedPlace,null);
  assert.equal(restored.snapshot().plan.days[0].scheduleItems[0].latLng,null);
});

test('server schema and prompt require intent, not model-generated business identities/ratings', () => {
  const {ITINERARY_SCHEMA,buildPrompt,sanitizePlannerRequest}=createRequire(import.meta.url)('../functions/itinerary-prompt.js');
  const schema=ITINERARY_SCHEMA.properties.days.items.properties.scheduleItems.items;
  assert.ok(schema.required.includes('placeIntent'));
  const prompt=buildPrompt(sanitizePlannerRequest({date:['2026-10-20']}),'ko');
  assert.match(prompt,/Google Places selects the actual venue/);
  assert.match(prompt,/Google route results are the sole source of transport facts/);
  assert.match(prompt,/Never put public-transit, train, taxi or other transport fares/);
  assert.doesNotMatch(prompt,/describe that whole multi-leg journey in the transitInfo/);
  assert.doesNotMatch(prompt,/EXACTLY 3 objects|Provide REAL street addresses|MUST specify exact departure/);
});
