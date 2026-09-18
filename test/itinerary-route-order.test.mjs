import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestRouteOrder } from '../src/domains/itinerary/services/itinerary-route-order.mjs';
const place = n => ({placeId:`p${n}`,displayName:`P${n}`,formattedAddress:'서울',lat:37.5,lng:127+n*0.02});
const item = (n,type,time,endTime='') => ({title:`P${n}`,type,time,endTime,selectedPlace:place(n),duration:'keep',transitInfo:'old route'});
const fixture = () => [item(0,'departure','09:00'),item(3,'attraction','09:10','09:40'),
  item(1,'dining','09:50','10:50'),item(2,'leisure','11:00','11:20'),item(4,'AnchorSchedule','12:00','13:00'),item(5,'arrival','14:00')];
const span = i => {
  const m=s=>Number(s.slice(0,2))*60+Number(s.slice(3));return m(i.endTime)-m(i.time);
};
test('reduces backtracking without deleting venues, mutating input or moving anchors',()=>{
  const items=fixture(), before=JSON.stringify(items), result=suggestRouteOrder(items);
  assert.equal(result.changed,true);assert.ok(result.afterMeters<result.beforeMeters);
  assert.equal(JSON.stringify(items),before);
  assert.deepEqual(result.items.map(i=>i.title),['P0','P1','P2','P3','P4','P5']);
  for(const index of [0,4,5]) assert.equal(result.items[index],items[index]);
  for(const i of result.items.slice(1,4)) {
    const original=items.find(old=>old.title===i.title);
    assert.equal(span(i),span(original));assert.equal(i.selectedPlace,original.selectedPlace);
    assert.equal(i.transitInfo,'');
  }
  assert.equal(result.items[1].time,'09:10');assert.equal(result.items[3].endTime,'11:20');
});
test('unknown places, invalid clocks, overnight visits and overlaps are not reordered',()=>{
  for(const edit of [i=>delete i.selectedPlace,i=>i.time='25:00',i=>i.endTime='01:00',i=>i.endTime='10:30',
    i=>Object.assign(i,{placeIntent:{},placeStatus:'unresolved'})]) {
    const items=fixture();edit(items[1]);
    const result=suggestRouteOrder(items);assert.equal(result.changed,false);assert.equal(result.skippedBlocks,1);
  }
});
test('anchors partition the search and cannot be crossed',()=>{
  const items=fixture();items[2].type='AnchorSchedule';
  assert.equal(suggestRouteOrder(items).changed,false);
});
test('fixed places are not treated as unresolved AI recommendations',()=>{
  const items=fixture();
  for(const index of [0,4,5]) items[index].placeIntent=null;
  assert.equal(suggestRouteOrder(items).changed,true);
});
test('already efficient, same coordinates and missing boundaries stay unchanged',()=>{
  const sorted=suggestRouteOrder(fixture()).items;
  assert.equal(suggestRouteOrder(sorted).changed,false);
  assert.equal(suggestRouteOrder(fixture().map(i=>({...i,selectedPlace:place(0)}))).changed,false);
  assert.equal(suggestRouteOrder(fixture().slice(1,4)).changed,false);
  assert.equal(suggestRouteOrder(null).changed,false);
});
test('current resolved map coordinates support legacy venues without persisting them',()=>{
  const items=fixture();delete items[0].selectedPlace;delete items[4].selectedPlace;
  const resolved=[0,4].map(index=>({index,name:`P${index}`,address:'서울',coordinates:place(index)}));
  const result=suggestRouteOrder(items,resolved);
  assert.equal(result.changed,true);assert.equal(result.items[4],items[4]);
  assert.equal(result.items[4].coordinates,undefined);
  resolved[0].coordinates={lat:NaN,lng:127};
  assert.equal(suggestRouteOrder(items,resolved).changed,false);
});
