import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSelectedPlace, bindPlaceSelection, readPlaceInput, restorePlaceInput} from '../src/domains/planner/services/selected-place.mjs';
import {createPlannerDraftStore} from '../src/domains/planner/services/planner-draft.mjs';
import {normalizePlannerRequest, enforcePlannerConstraints} from '../src/domains/planner/services/planner-constraints.mjs';
import {GeocodingService} from '../src/domains/map/services/geocoding-service.js';
const selected = {placeId:'chosen-station',displayName:'서울역',formattedAddress:'서울특별시 중구 한강대로 405',lat:37.554,lng:126.97};
const widget = () => Object.assign(new EventTarget(),{dataset:{},value:''});
const choose = (el,place) => el.dispatchEvent(Object.assign(new Event('gmp-select'),{placePrediction:{toPlace:()=>place}}));
const googlePlace = (value=selected) => ({id:value.placeId,displayName:value.displayName,formattedAddress:value.formattedAddress,location:{lat:()=>value.lat,lng:()=>value.lng},fetchFields:async()=>{}});

test('Google 인스턴스를 JSON 데이터로 한정하고 잘못된 좌표를 거절한다',()=>{
  assert.deepEqual(normalizeSelectedPlace(googlePlace()),selected);
  for(const extra of [{lat:91},{lng:Infinity},{placeId:''},{displayName:''},{formattedAddress:''},{lat:'37'}]) assert.equal(normalizeSelectedPlace({...selected,...extra}),null);
});
test('현재 선택 이벤트는 상세정보를 받아 보존하고 수동 입력은 선택 ID를 해제한다',async()=>{
  const el=widget();let notified=0;bindPlaceSelection(el,()=>notified++);bindPlaceSelection(el,()=>notified++);
  choose(el,googlePlace());await el.placeSelectionPending;
  assert.deepEqual(readPlaceInput(el,el.value),selected);assert.equal(notified,1);
  el.value='다른 장소';el.dispatchEvent(new Event('input'));
  assert.equal(readPlaceInput(el,el.value),'다른 장소');assert.equal(el.selectedPlace,null);
});
test('늦은 상세 응답은 새 선택 또는 직접 입력을 덮어쓰지 않는다',async()=>{
  const el=widget();bindPlaceSelection(el,()=>{});let finish;
  const old=googlePlace();old.fetchFields=()=>new Promise(resolve=>finish=resolve);
  choose(el,old);const pending=el.placeSelectionPending;
  choose(el,googlePlace({...selected,placeId:'new',displayName:'새 장소'}));await el.placeSelectionPending;
  finish();await pending;assert.equal(el.selectedPlace.placeId,'new');
  choose(el,old);const second=el.placeSelectionPending;
  el.value='직접 수정';el.dispatchEvent(new Event('input'));finish();await second;
  assert.equal(el.value,'직접 수정');assert.equal(el.selectedPlace,null);
});
test('조회 실패와 초기화 뒤의 늦은 응답은 이전 ID를 되살리지 않는다',async()=>{
  const el=widget();bindPlaceSelection(el,()=>{});restorePlaceInput(el,selected);
  choose(el,{fetchFields:async()=>{throw Error('offline');}});await el.placeSelectionPending;
  assert.equal(el.selectedPlace,null);
  let finish;const old=googlePlace();old.fetchFields=()=>new Promise(resolve=>finish=resolve);
  choose(el,old);restorePlaceInput(el,'');finish();await el.placeSelectionPending;
  assert.equal(el.value,'');assert.equal(el.selectedPlace,null);
});
test('선택 장소는 초안 복원·요청 정규화·필수 일정 보정·직렬화 뒤에도 동일하다',async()=>{
  const data=new Map();const storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  const draft={date:['2026-10-20'],startTime:'10:00',endTime:'16:00',startLocation:selected,endLocation:{...selected,placeId:'end'},anchorSchedules:[{name:'예약',day:1,time:'13:00',endTime:'14:00',location:{...selected,placeId:'anchor',displayName:'박물관'}}]};
  createPlannerDraftStore({getStorage:()=>storage}).save(draft);
  const restored=createPlannerDraftStore({getStorage:()=>storage}).read();
  assert.deepEqual(restored.startLocation,selected);
  const request=normalizePlannerRequest(restored);
  const days=enforcePlannerConstraints([{day:1,scheduleItems:[]}],request);
  const items=JSON.parse(JSON.stringify(days))[0].scheduleItems;
  assert.deepEqual(items.map(i=>i.selectedPlace.placeId),['chosen-station','anchor','end']);
  let searches=0;const service=new GeocodingService({importLibrary:async()=>{searches++;throw Error('must not search');}});
  const mapped=await service.geocodeSchedule(items.map(i=>({...i,latLng:{lat:1,lng:2},resolvedName:'wrong'})));
  assert.equal(searches,0);assert.deepEqual(mapped[0].latLng,{lat:selected.lat,lng:selected.lng});
  assert.equal(mapped[0].resolvedName,'서울역');
});
test('기존 문자열 일정과 장소 ID 없는 옛 객체 입력은 계속 복원된다',()=>{
  const el=widget();restorePlaceInput(el,'서울역');assert.equal(readPlaceInput(el,el.value),'서울역');
  restorePlaceInput(el,{displayName:'옛 장소'});assert.equal(readPlaceInput(el,el.value),'옛 장소');
  restorePlaceInput(el,selected);assert.deepEqual(readPlaceInput(el,el.value),selected);
  el.value='수정';assert.equal(readPlaceInput(el,el.value),'수정');
});

test('출발지와 이름이 같은 앵커도 별도 ID와 고정 시간을 잃지 않는다',()=>{
  const request={date:['2026-10-20'],startTime:'10:00',endTime:'16:00',startLocation:selected,endLocation:selected,anchorSchedules:[{name:'예약',day:1,time:'13:00',endTime:'14:00',location:{...selected,placeId:'other-branch'}}]};
  const [day]=enforcePlannerConstraints([{day:1,scheduleItems:[]}],request);
  assert.deepEqual(day.scheduleItems.map(i=>[i.type,i.selectedPlace.placeId]),[['departure','chosen-station'],['AnchorSchedule','other-branch'],['arrival','chosen-station']]);
  assert.equal(day.scheduleItems[1].time,'13:00');
});
