import test from 'node:test';
import assert from 'node:assert/strict';
import { replaceSchedulePlace } from '../src/domains/itinerary/services/itinerary-edit.mjs';
import { GeocodingService } from '../src/domains/map/services/geocoding-service.js';

const place = {placeId:'park-id',displayName:'용산가족공원',formattedAddress:'서울 용산구 서빙고로 185',lat:37.52,lng:126.98};
test('replacement preserves slot, clears old claims and persists an exact selected identity', async () => {
  const original = [{type:'leisure',time:'14:55',endTime:'15:25',duration:'30분',title:'휴식',placeIntent:{purpose:'휴식'},placeStatus:'unresolved',verifiedPlace:{placeId:'wrong'},practicalInfo:{estimatedCost:'무료'},reviews:['old'],officialWebsiteUrl:'https://old.example'}];
  const before = structuredClone(original);
  const {items,replaced} = replaceSchedulePlace(original,0,place);
  assert.deepEqual(original,before);
  assert.equal(replaced.time,'14:55');
  assert.equal(replaced.endTime,'15:25');
  for(const key of ['placeIntent','verifiedPlace','placeStatus','practicalInfo','reviews','officialWebsiteUrl']) assert.equal(Object.hasOwn(replaced,key),false);
  assert.deepEqual(replaced.selectedPlace,place);
  const restored=JSON.parse(JSON.stringify(items));
  restored[0].latLng={lat:0,lng:0};
  const service = new GeocodingService({importLibrary:async()=>{throw Error('No text search permitted');}});
  const result=await service.geocodeSchedule(restored);
  assert.deepEqual(result[0].latLng,{lat:place.lat,lng:place.lng});
  assert.match(result[0].googleMapsUrl,/query_place_id=park-id/);
});
test('replacement rejects text, invalid identities and protected boundaries', () => {
  for(const type of ['departure','arrival','AnchorSchedule']) assert.equal(replaceSchedulePlace([{type}],0,place).replaced,null);
  for(const candidate of ['용산가족공원',null,{...place,lat:NaN},{...place,placeId:''}]) assert.equal(replaceSchedulePlace([{type:'leisure'}],0,candidate).replaced,null);
  assert.equal(replaceSchedulePlace([],0,place).replaced,null);
});
