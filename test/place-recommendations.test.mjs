import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {TRAVEL_REGIONS} from '../functions/travel-region.mjs';
import {RECOMMENDATION_CITIES} from '../functions/recommendation-cities.mjs';
import {DEFAULT_RECOMMENDATION_NAMES,RECOMMENDATION_NAME_GROUPS} from '../functions/recommendation-defaults.mjs';
import {RECOMMENDATION_INTERESTS} from '../functions/recommendation-interests.mjs';
import {validRecommendationWeather} from '../functions/recommendation-weather.mjs';
import {destinations} from '../src/domains/planner/services/travel-destinations.mjs';
import {tFor} from '../src/utils/i18n.js';
const require=createRequire(import.meta.url);
const {createPlaceRecommendations,createRecommendationLimiter,validateRecommendationInput,displayReason}=require('../functions/place-recommendations.js');
const now=()=>new Date('2026-10-14T03:00:00Z');
const input={cityId:'seoul',country:'KOR',date:'2026-10-15',lang:'ko',theme:'healing',budget:'standard'};
const source={url:'https://english.visitseoul.net/guide',title:'Visit Seoul'};
const venue=(name='국립중앙박물관',id='museum')=>({id,displayName:{text:name},formattedAddress:'서울특별시 용산구',location:{latitude:37.5238,longitude:126.9803},businessStatus:'OPERATIONAL',googleMapsUri:'https://maps.google.com/?cid=museum',
 addressComponents:[{types:['country'],shortText:'KR'},{types:['administrative_area_level_1'],longText:'서울특별시',shortText:'서울특별시'}],attributions:[{provider:'Provider',providerUri:'https://example.org/credits'}]});
const reason='국립중앙박물관은 한국의 역사와 문화유산을 살펴볼 수 있는 실내 공간입니다.';
const candidate=(name='국립중앙박물관',evidenceIndex=0)=>({name,evidenceIndex,event:null});
function fixture({candidates=[candidate()],places=[venue()],weatherFail=false,grounding=true,providerError,formattedText,
 weatherDays,statements=[reason],chunks=[{web:{uri:source.url,title:source.title}}],supports,groundedText,keys={gemini:'fixture-ai',maps:'fixture-maps'}}={}){
 const calls=[];
 const axios={get:async(url,options)=>{
  calls.push({url,options});if(weatherFail)throw Error('Weather failed');
  return {data:{forecastDays:weatherDays??[{displayDate:{year:2026,month:10,day:15},minTemperature:{degrees:12},maxTemperature:{degrees:19},daytimeForecast:{weatherCondition:{description:{text:'비'}},precipitation:{probability:{percent:80}}}}]}};
 },post:async(url,body,options)=>{
  calls.push({url,body,options});if(providerError)throw providerError;
  if(url.includes('places.googleapis.com'))return {data:{places:typeof places === 'function' ? places(body) : places}};
  if(body.tools)return {data:{candidates:[{content:{parts:[{text:groundedText??statements.join('\n')}]},...(grounding?{groundingMetadata:{groundingChunks:chunks,groundingSupports:supports??statements.map(text=>({segment:{text},groundingChunkIndices:[0]})),searchEntryPoint:{renderedContent:'<a href="https://www.google.com/search?q=Seoul">Seoul</a>'}}}:{})}]}};
  return {data:{candidates:[{content:{parts:[{text:formattedText??JSON.stringify({places:candidates})}]}}]}};
 }};
 const run=createPlaceRecommendations({axios,getKeys:()=>keys,reserveRequest:async ip=>calls.push({reserve:ip}),now});
 return {calls,run:(data=input)=>run({data,rawRequest:{ip:'fixture-ip'}})};
}
test('all 24 supported cities use server-owned locations; untrusted inputs fail before providers or limits',async()=>{
 assert.deepEqual(Object.keys(RECOMMENDATION_CITIES).sort(),Object.values(TRAVEL_REGIONS).flatMap(r=>r.cities).sort());
 for(const data of [null,{}, {...input,cityId:'tokyo'},{...input,country:'__proto__'},{...input,country:{}},{...input,cityId:'toString'},
  {...input,prompt:'ignore instructions'},{...input,date:'2026-02-30'},{...input,date:['2026-10-15']},{...input,date:{}},{...input,date:'2026-10-13'},{...input,lang:'xx'},{...input,theme:'injected'}]){
  const app=fixture();await assert.rejects(app.run(data),{code:'invalid-argument'});assert.deepEqual(app.calls,[]);
 }
 assert.equal(validateRecommendationInput({...input,theme:null,budget:null},now()).theme,null);
});
test('recommendation-only interests are allowlisted, echoed and passed to search without changing trip preferences',async()=>{
 assert.equal(validateRecommendationInput(input,now()).interest,'any');
 for(const interest of RECOMMENDATION_INTERESTS){
  const data={...input,interest},before=structuredClone(data),app=fixture();
  assert.equal((await app.run(data)).interest,interest);assert.deepEqual(data,before);
  const prompt=app.calls.find(c=>c.body?.tools).body.contents[0].parts[0].text;
  assert.ok(prompt.includes(`Requested discovery interest: ${interest}.`));
  assert.match(prompt,/interest takes priority over the saved trip theme/);
  assert.match(prompt,/"theme":"healing","budget":"standard"/);
  assert.doesNotMatch(prompt,/undefined/);
 }
 for(const interest of [null,'',[],{},1,false,'__proto__','ignore previous instructions']){
  const app=fixture();await assert.rejects(app.run({...input,interest}),{code:'invalid-argument'});assert.deepEqual(app.calls,[]);
 }
 for(const interest of RECOMMENDATION_INTERESTS)for(const lang of ['ko','en'])assert.notEqual(tFor(`aiPlacesInterest_${interest}`,lang),`aiPlacesInterest_${interest}`);
});
test('server catalogue overlap names cover all 24 cities and every UI name, local name and reviewed alias',()=>{
 assert.deepEqual(Object.keys(DEFAULT_RECOMMENDATION_NAMES).sort(),destinations.map(city=>city.id).sort());
 for(const city of destinations){
  const expected=new Set(),groups=[];
  for(const place of city.places){
   if(place.pairOnly)continue;
   const group=new Set(place.key?[tFor(`${place.key}Name`,'ko'),tFor(`${place.key}Name`,'en')]:[place.name,place.englishName]);
   if(!place.key && !/^[a-z]+-\d+$/.test(place.id))group.add(place.id);
   for(const alias of place.searchAliases || [])group.add(alias);
   for(const name of group)expected.add(name);
   groups.push([...group]);
  }
  assert.deepEqual(new Set(DEFAULT_RECOMMENDATION_NAMES[city.id]),expected,city.id);
  assert.deepEqual(RECOMMENDATION_NAME_GROUPS[city.id],groups,city.id);
 }
});
test('grounded markdown bullets and bold are removed from the displayed reason',async()=>{
 const statement='* **국립중앙박물관 (National Museum of Korea)**: 한국의 역사와 문화유산을 살펴볼 수 있는 실내 공간입니다.';
 const result=await fixture({statements:[statement]}).run();
 assert.equal(result.places[0].reason,'국립중앙박물관 (National Museum of Korea): 한국의 역사와 문화유산을 살펴볼 수 있는 실내 공간입니다.');
 assert.equal(displayReason('1. __Gwangjang Market__ has `street food`.'),'Gwangjang Market has street food.');
 assert.equal(displayReason('## 경복궁은 조선의 법궁입니다.'),'경복궁은 조선의 법궁입니다.');
 assert.equal(displayReason(reason),reason);
});
test('weather and grounded evidence yield a canonical place, sources and required Search widget',async()=>{
 const app=fixture(),result=await app.run();
 assert.equal(result.places.length,1);assert.deepEqual(result.weather,{status:'forecast',description:'비',minC:12,maxC:19,rainPercent:80});
 assert.deepEqual(result.places[0].place,{placeId:'museum',displayName:'국립중앙박물관',formattedAddress:'서울특별시 용산구',lat:37.5238,lng:126.9803});
 assert.deepEqual(result.places[0].sources,[source]);assert.match(result.searchSuggestions,/google.com/);
 assert.equal(result.places[0].reason,reason);
 const search=app.calls.find(c=>c.body?.tools);assert.match(search.body.contents[0].parts[0].text,/rainPercent.*80/);
 const formatted=app.calls.find(c=>c.body?.generationConfig?.responseSchema);assert.ok(formatted);assert.equal(formatted.body.tools,undefined);
 const lookup=app.calls.find(c=>c.url?.includes('places.googleapis.com'));assert.equal(lookup.body.regionCode,'KR');assert.ok(lookup.body.locationRestriction);
 assert.equal(lookup.options.headers['X-Goog-Api-Key'],'fixture-maps');
});
test('out-of-range and unavailable weather are explicitly seasonal; provider failure never becomes a forecast',async()=>{
 const future=fixture(),result=await future.run({...input,date:'2027-01-01'});assert.deepEqual(result.weather,{status:'seasonal'});assert.equal(future.calls.filter(c=>c.url?.includes('weather')).length,0);
 const unavailable=fixture({weatherFail:true});assert.deepEqual((await unavailable.run()).weather,{status:'unavailable'});
 assert.match(unavailable.calls.find(c=>c.body?.tools).body.contents[0].parts[0].text,/do not claim a forecast/);
});
test('wrong names, countries, cities, coordinates, closed places and missing citations are excluded; duplicates are removed',async()=>{
 const valid=venue();
 const invalid=[{...valid,displayName:{text:'Other venue'}},{...valid,addressComponents:[{types:['country'],shortText:'JP'}]},
  {...valid,addressComponents:[{types:['country'],shortText:'KR'},{types:['locality'],longText:'Busan'}]},
  {...valid,location:{latitude:35,longitude:129}},{...valid,businessStatus:'CLOSED_PERMANENTLY'},{...valid,businessStatus:'CLOSED_TEMPORARILY'},
  {...valid,location:{latitude:NaN,longitude:126.98}},{...valid,id:''},{...valid,formattedAddress:{unexpected:true}}];
 for(const place of invalid)await assert.rejects(fixture({places:[place]}).run(),e=>e.details.reason==='recommendation-no-places');
 await assert.rejects(fixture({candidates:[{...candidate(),evidenceIndex:99}]}).run(),e=>e.details.reason==='recommendation-no-places');
 const unique=await fixture({candidates:[candidate(),candidate()]}).run();assert.equal(unique.places.length,1);
});
test('missing grounding, invalid output, quota and missing configuration stay explicit',async()=>{
 await assert.rejects(fixture({grounding:false}).run(),e=>e.details.reason==='recommendation-sources');
 await assert.rejects(fixture({formattedText:'not JSON'}).run(),e=>e.details.reason==='recommendation-response');
 await assert.rejects(fixture({providerError:{response:{status:429}}}).run(),{code:'resource-exhausted'});
 const app=fixture({keys:{gemini:'fixture-ai'}});await assert.rejects(app.run(),{code:'failed-precondition'});assert.deepEqual(app.calls,[]);
});
test('all six candidates can be checked for variety but at most four are returned; oversized pools are rejected',async()=>{
 const names=Array.from({length:6},(_,i)=>`서울 미술관 ${i}`);
 const app=fixture({candidates:names.map(candidate),statements:names.map(name=>`${name}은 미술 작품을 살펴볼 수 있는 실내 공간입니다.`),places:body=>{const name=body.textQuery.split(',')[0];return [venue(name,name)];}});
 assert.equal((await app.run()).places.length,4);
 assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,6);
 assert.equal(app.calls.filter(c=>c.url?.includes('generativelanguage.googleapis.com')).length,2);
 const oversized=fixture({candidates:Array.from({length:7},()=>candidate())});
 await assert.rejects(oversized.run(),e=>e.details.reason==='recommendation-response');
 assert.equal(oversized.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
});
test('new venues outrank default landmarks and reviewed spelling aliases even when defaults occur first',async()=>{
 for(const defaultName of ['경복궁','Gyeongbokgung Palace','N서울타워','N Seoul Tower','북촌 한옥마을']){
  const names=[defaultName,'새 문화관 A','새 문화관 B','새 문화관 C','새 문화관 D'];
  const app=fixture({candidates:names.map(candidate),statements:names.map(name=>`${name}은 여행 중 둘러볼 수 있는 공간입니다.`),
   places:body=>{const name=body.textQuery.split(',')[0];return [{...venue(name,name),primaryType:name===defaultName?'park':'museum'}];}});
  assert.deepEqual((await app.run()).places.map(item=>item.place.displayName),names.slice(1));
  assert.match(app.calls.find(c=>c.body?.tools).body.contents[0].parts[0].text,/default catalogue.*경복궁/);
 }
});
test('provider types bring later nature, food and shopping candidates ahead of repeated museums without changing reasons',async()=>{
 const names=['문화관 A','문화관 B','문화관 C','숲길 D','찻집 E','상점 F'];
 const types=['museum','art_gallery','history_museum','park','cafe','shopping_mall'];
 const statements=names.map(name=>`${name}은 방문해 볼 만한 공간입니다.`);
 const app=fixture({candidates:names.map((name,index)=>({...candidate(name,index),category:'museum'})),statements,
  places:body=>{const name=body.textQuery.split(',')[0];return [{...venue(name,name),primaryType:types[names.indexOf(name)]}];}});
 const result=await app.run();
 assert.deepEqual(result.places.map(item=>item.place.displayName),['문화관 A','숲길 D','찻집 E','상점 F']);
 for(const item of result.places){
  assert.equal(item.reason,statements[names.indexOf(item.place.displayName)]);assert.deepEqual(item.sources,[source]);
  assert.equal('group' in item,false);assert.equal('isDefault' in item,false);
 }
 for(const call of app.calls.filter(c=>c.url?.includes('places.googleapis.com'))){
  assert.match(call.options.headers['X-Goog-FieldMask'],/places.primaryType/);assert.match(call.options.headers['X-Goog-FieldMask'],/places.types/);
 }
});
test('primary types win over secondary types and missing or unknown types keep honest, stable fallback order',async()=>{
 const names=['공간 A','공간 B','공간 C','공간 D','공간 E'];
 const statements=names.map(name=>`${name}은 둘러볼 수 있는 장소입니다.`);
 const run=types=>fixture({candidates:names.map(candidate),statements,
  places:body=>{const name=body.textQuery.split(',')[0];return [{...venue(name,name),...types[names.indexOf(name)]}];}}).run();
 const primary=await run([
  {primaryType:'korean_restaurant',types:['museum','restaurant']}, {primaryType:'cafe',types:['museum','cafe']},
  {primaryType:'museum',types:['museum','park']}, {types:['point_of_interest','park']}, {primaryType:'art_gallery'},
 ]);
 assert.deepEqual(primary.places.map(item=>item.place.displayName),['공간 A','공간 C','공간 D','공간 B']);
 const missing=await run([{}, {types:['unsupported']}, {primaryType:'museum'}, {primaryType:'park'}, {types:[]}]);
 assert.deepEqual(missing.places.map(item=>item.place.displayName),['공간 A','공간 C','공간 D','공간 B']);
});
test('insufficient new venues allow verified catalogue fallback, and a single available kind is never padded or discarded',async()=>{
 const names=['경복궁','서울숲','새 문화관 A','새 문화관 B'];
 const app=fixture({candidates:names.map(candidate),statements:names.map(name=>`${name}은 둘러볼 수 있는 장소입니다.`),
  places:body=>{const name=body.textQuery.split(',')[0];return [{...venue(name,name),primaryType:name==='서울숲'?'park':'museum'}];}});
 assert.deepEqual((await app.run()).places.map(item=>item.place.displayName),['새 문화관 A','새 문화관 B','서울숲','경복궁']);
 const sparse=fixture({candidates:[candidate(),candidate()],places:[{...venue(),primaryType:'museum'}]});
 assert.equal((await sparse.run()).places.length,1);
 assert.equal(sparse.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,1);
});
test('variety cannot rescue a closed, wrong-country, unsupported or duplicate place',async()=>{
 const names=['새 문화관 A','닫힌 공원 B','외국 식당 C','출처 없는 상점 D','같은 문화관 E'];
 const app=fixture({candidates:names.map((name,index)=>candidate(name,index===3?99:index)),statements:names.map(name=>`${name}은 둘러볼 수 있는 장소입니다.`),
  places:body=>{
   const name=body.textQuery.split(',')[0],index=names.indexOf(name);
   const place={...venue(name,'same-place'),primaryType:['museum','park','restaurant','shopping_mall','museum'][index]};
   if(index===1)place.businessStatus='CLOSED_TEMPORARILY';
   if(index===2)place.addressComponents=[{types:['country'],shortText:'JP'}];
   return [place];
  }});
 assert.deepEqual((await app.run()).places.map(item=>item.place.displayName),['새 문화관 A']);
 assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,4);
});
test('a failed extra lookup preserves four verified places and does not continue paid lookups',async()=>{
 const names=Array.from({length:6},(_,index)=>`새 문화관 ${index}`);
 const app=fixture({candidates:names.map(candidate),statements:names.map(name=>`${name}은 둘러볼 수 있는 장소입니다.`),places:body=>{
  const name=body.textQuery.split(',')[0];
  if(name===names[4])throw {response:{status:429}};
  return [{...venue(name,name),primaryType:'museum'}];
 }});
 assert.deepEqual((await app.run()).places.map(item=>item.place.displayName),names.slice(0,4));
 assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,5);
});
test('reasons and citations come from the selected supported statement, never from formatter inventions',async()=>{
 const other={web:{uri:'https://example.org/unrelated',title:'Unrelated source'}};
 const app=fixture({chunks:[other,{web:{uri:source.url,title:source.title}}],
  supports:[{segment:{text:reason},groundingChunkIndices:[1]}],
  candidates:[{...candidate(),reason:'Invented free admission and popularity.',sourceIndices:[0]}]});
 const result=await app.run();
 assert.equal(result.places[0].reason,reason);assert.deepEqual(result.places[0].sources,[source]);
 const formatter=app.calls.find(c=>c.body?.generationConfig?.responseSchema);
 assert.equal(formatter.body.contents[0].parts[0].text.includes('https://example.org/unrelated'),false);
 for(const entry of [{...candidate(),name:'경복궁'},{...candidate(),evidenceIndex:-1},{...candidate(),evidenceIndex:'0'},null]){
  const invalid=fixture({candidates:[entry]});
  await assert.rejects(invalid.run(),e=>e.details.reason==='recommendation-no-places');
  assert.equal(invalid.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
});
test('unsafe chunks do not shift citation indexes and unsupported or malformed segments fail before formatting',async()=>{
 const chunks=[{web:{uri:'javascript:alert(1)',title:'Unsafe'}},{web:{uri:source.url,title:source.title}}];
 const app=fixture({chunks,supports:[{segment:{text:reason},groundingChunkIndices:[1]}]});
 assert.deepEqual((await app.run()).places[0].sources,[source]);
 for(const support of [null,{segment:{text:reason},groundingChunkIndices:[0]},
  {segment:{text:reason},groundingChunkIndices:[99]}, {segment:{text:reason},groundingChunkIndices:['1']},
  {segment:{text:reason},groundingChunkIndices:[]}, {segment:{text:'Invented supported sentence'},groundingChunkIndices:[1]},
  {segment:{text:reason},groundingChunkIndices:[1,0]}]){
  const invalid=fixture({chunks,supports:[support]});
  await assert.rejects(invalid.run(),e=>e.details.reason==='recommendation-sources');
  assert.equal(invalid.calls.filter(c=>c.body?.generationConfig?.responseSchema).length,0);
  assert.equal(invalid.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
});
test('event dates and venue must share the cited statement and include the visit date, including both boundaries',async()=>{
 const event={name:'가을 문화전',startDate:'2026-10-15',endDate:'2026-10-20'};
 const statement='국립중앙박물관에서 가을 문화전이 2026-10-15부터 2026-10-20까지 열립니다.';
 for(const date of ['2026-10-15','2026-10-17','2026-10-20']){
  const result=await fixture({statements:[statement],candidates:[{...candidate(),event}]}).run({...input,date});
  assert.equal(result.places[0].reason,statement);assert.deepEqual(result.places[0].sources,[source]);
 }
 for(const date of ['2026-10-14','2026-10-21']){
  const app=fixture({statements:[statement],candidates:[{...candidate(),event}]});
  await assert.rejects(app.run({...input,date}),e=>e.details.reason==='recommendation-no-places');
  assert.equal(app.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
 const oneDay={...event,startDate:'2026-10-15',endDate:'2026-10-15'};
 assert.equal((await fixture({statements:['국립중앙박물관의 가을 문화전은 2026-10-15 하루 열립니다.'],candidates:[{...candidate(),event:oneDay}]}).run()).places.length,1);
});
test('undated, inferred, conflicting, reversed and impossible event periods cannot become recommendations',async()=>{
 const event={name:'가을 문화전',startDate:'2026-10-15',endDate:'2026-10-20'};
 const statement='국립중앙박물관에서 가을 문화전이 2026-10-15부터 2026-10-20까지 열립니다.';
 const cases=[
  {event:null,statements:[statement]}, {event:undefined,statements:[reason]},
  {event:null,statements:['국립중앙박물관에서 가을 특별전시를 즐길 수 있습니다.']},
  {event:null,statements:['국립중앙박물관 hosts a pop-up event worth visiting.']},
  {event,statements:['국립중앙박물관에서 가을 문화전이 10월 15일부터 20일까지 열립니다.']},
  {event,statements:['국립중앙박물관에서 가을 문화전이 2025-10-15부터 2025-10-20까지 열립니다.']},
  {event,statements:['국립중앙박물관에서 가을 문화전이 열립니다.','다른 미술관의 행사는 2026-10-15부터 2026-10-20까지입니다.']},
  {event,statements:[statement+' 다른 안내에는 종료일이 2026-10-18입니다.']},
  {event:{...event,startDate:'2026-10-20',endDate:'2026-10-15'},statements:[statement]},
  {event:{...event,startDate:'2026-02-30'},statements:['국립중앙박물관에서 가을 문화전은 2026-02-30부터 2026-10-20까지입니다.']},
  {event:{...event,name:'다른 문화전'},statements:[statement]},
 ];
 for(const data of cases){
  const app=fixture({statements:data.statements,candidates:[{...candidate(),event:data.event}]});
  await assert.rejects(app.run(),e=>e.details.reason==='recommendation-no-places');
  assert.equal(app.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
});
test('an unverified event is removed while a separately supported timeless venue still succeeds',async()=>{
 const invalid='국립중앙박물관에서 기간 한정 행사를 즐길 수 있습니다.';
 const app=fixture({statements:[invalid,reason],candidates:[candidate(),candidate('국립중앙박물관',1)]});
 const result=await app.run();assert.equal(result.places.length,1);assert.equal(result.places[0].reason,reason);
 assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,1);
 assert.equal(app.calls.filter(c=>c.url?.includes('generativelanguage.googleapis.com')).length,2);
});
test('persistent guest limits enforce cooldown, daily individual and hourly/global budget caps without storing IP addresses',async()=>{
 const docs=new Map();let time=Date.parse('2026-10-14T03:00:00Z');
 const db={collection:name=>({doc:id=>({path:`${name}/${id}`})}),runTransaction:async callback=>callback({get:async ref=>({data:()=>docs.get(ref.path)}),set:(ref,value)=>docs.set(ref.path,value)})};
 const reserve=createRecommendationLimiter({db,now:()=>time});
 await reserve('fixture-ip');await assert.rejects(reserve('fixture-ip'),{code:'resource-exhausted'});
 for(let i=1;i<10;i++){time+=60001;await reserve('fixture-ip');}time+=60001;await assert.rejects(reserve('fixture-ip'),{code:'resource-exhausted'});
 assert.equal([...docs.keys()].some(key=>key.includes('fixture-ip')),false);
 docs.set('ai_place_limits/global',{hour:Math.floor(time/3600000),hourly:60});await assert.rejects(reserve('other-ip'),{code:'resource-exhausted'});
 docs.set('ai_place_limits/global',{day:new Date(time).toISOString().slice(0,10),count:300});await assert.rejects(reserve('third-ip'),{code:'resource-exhausted'});
 time+=86400000;await reserve('fixture-ip');
});
test('client checks request scope and rejects unsafe source links instead of rendering arbitrary responses',async()=>{
 const sourceCode=readFileSync(new URL('../src/domains/planner/services/ai-place-recommendations.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function');
 const response={cityId:'seoul',country:'KOR',date:input.date,lang:'ko',interest:'any',weather:{status:'seasonal'},searchSuggestions:'',places:[{place:{placeId:'museum'},reason:'Reason',sources:[source]}]};
 const sent=[];
 const context={app:{},getFunctions:()=>({}),httpsCallable:()=>async data=>{sent.push(data);return {data:response};},normalizeSelectedPlace:p=>p?.placeId?{}:null,validRecommendationWeather,URL};
 vm.runInNewContext(sourceCode+'\nglobalThis.run=getAIPlaceRecommendations;',context);
 assert.equal((await context.run(input)).cityId,'seoul');
 await assert.rejects(context.run({...input,excludedPlaces:[{placeId:'museum',displayName:'Museum'}]}),/recommendation-response/);
 await context.run({...input,excludedPlaces:[{placeId:'another',displayName:'Another place'}]});
 response.interest='culture';await assert.rejects(context.run(input),/recommendation-response/);
 const cultural={...input,interest:'culture'};assert.equal((await context.run(cultural)).interest,'culture');assert.deepEqual(sent.at(-1),cultural);
 response.interest='food';await assert.rejects(context.run(cultural),/recommendation-response/);response.interest='any';
 response.cityId='tokyo';await assert.rejects(context.run(input),/recommendation-response/);response.cityId='seoul';
 for(const hours of [{status:'current',intervals:['09:00–18:00']},{status:'regular',intervals:['00:00–24:00']},{status:'unknown',intervals:[]}]){
  response.places[0].hours=hours;await context.run(input);
 }
 for(const hours of [null,{status:'closed',intervals:[]},{status:'current',intervals:[]},{status:'unknown',intervals:['09:00–18:00']},
  {status:'regular',intervals:['18:00–09:00']},{status:'current',intervals:['09:99–28:00']},{status:'regular',intervals:['open forever']}]){
  response.places[0].hours=hours;await assert.rejects(context.run(input),/recommendation-response/);
 }
 delete response.places[0].hours;
 for(const weather of [{status:'forecast'}, {status:'forecast',description:'',minC:null,maxC:null,rainPercent:null},
  {status:'forecast',description:'Sunny',minC:20,maxC:10,rainPercent:0},
  {status:'forecast',description:{bad:true},minC:10,maxC:20,rainPercent:10},
  {status:'forecast',description:'Rain',minC:10,maxC:20,rainPercent:101}]){
  response.weather=weather;await assert.rejects(context.run(input),/recommendation-response/);
 }
 response.weather={status:'forecast',description:'',minC:0,maxC:null,rainPercent:0};await context.run(input);
 response.places[0].sources=[{url:'javascript:alert(1)',title:'Unsafe'}];await assert.rejects(context.run(input),/recommendation-response/);
});

test('reviewed aliases are scoped to one venue in all 24 cities; another catalogue venue never matches',async()=>{
 for(const city of destinations){
  const meta=RECOMMENDATION_CITIES[city.id],groups=RECOMMENDATION_NAME_GROUPS[city.id];
  const country=TRAVEL_REGIONS[city.country].countryCode;
  for(const group of groups){
   const name=group[0],canonical=group.at(-1);
   const place={...venue(canonical),location:{latitude:meta[1],longitude:meta[2]},addressComponents:[{types:['country'],shortText:country},{types:['locality'],longText:meta[4][0]}]};
   const app=fixture({candidates:[candidate(name)],statements:[`${name} is a visitor destination.`],places:[place]});
   const result=await app.run({...input,cityId:city.id,country:city.country});
   assert.equal(result.places[0].place.displayName,canonical,`${city.id}: ${name}`);
   assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,1);
  }
  const name=groups[0][0],other=groups[1][0];
  const place={...venue(other),location:{latitude:meta[1],longitude:meta[2]},addressComponents:[{types:['country'],shortText:country},{types:['locality'],longText:meta[4][0]}]};
  await assert.rejects(fixture({candidates:[candidate(name)],statements:[`${name} is a visitor destination.`],places:[place]}).run({...input,cityId:city.id,country:city.country}),e=>e.details.reason==='recommendation-no-places');
 }
});

test('international names keep diacritic normalization but never fuzzy-match another business or branch',async()=>{
 const name='Sensoji Temple',meta=RECOMMENDATION_CITIES.tokyo;
 const place={...venue('Sensō-ji'),location:{latitude:meta[1],longitude:meta[2]},addressComponents:[{types:['country'],shortText:'JP'},{types:['locality'],longText:'Taito City'},{types:['administrative_area_level_1'],longText:'Tokyo'}]};
 const run=places=>fixture({candidates:[candidate(name)],statements:[`${name} is a visitor destination.`],places}).run({...input,cityId:'tokyo',country:'JPN'});
 assert.equal((await run([place])).places[0].place.displayName,'Sensō-ji');
 for(const invalid of [{...place,displayName:{text:'Sensoji Temple Cafe'}},{...place,displayName:{text:'Tokyo Tower'}},{...place,addressComponents:[{types:['country'],shortText:'JP'},{types:['locality'],longText:'Osaka'}]},
  {...place,location:{latitude:34,longitude:135}},{...place,businessStatus:'FUTURE_OPENING'}])await assert.rejects(run([invalid]),e=>e.details.reason==='recommendation-no-places');
 await assert.rejects(run([place,{...place,id:'different-branch'}]),e=>e.details.reason==='recommendation-no-places');
 assert.equal((await run([place,{...place}])).places.length,1);
});

test('city validation distinguishes boroughs and city states from broad states or counties',async()=>{
 const scenarios=[
  ['newyork','USA',[['locality','Brooklyn'],['administrative_area_level_1','New York']],true],
  ['newyork','USA',[['locality','Yonkers'],['administrative_area_level_1','New York']],false],
  ['newyork','USA',[['administrative_area_level_1','New York']],false],
  ['losangeles','USA',[['locality','Santa Monica']],true],
  ['losangeles','USA',[['locality','Pasadena'],['administrative_area_level_2','Los Angeles County']],false],
  ['kyoto','JPN',[['locality','Kyoto City']],true],
  ['kyoto','JPN',[['locality','Uji'],['administrative_area_level_1','Kyoto']],false],
  ['taipei','TWN',[['administrative_area_level_1','臺北市']],true],
  ['taipei','TWN',[['locality','New Taipei City']],false],
  ['london','GBR',[['postal_town','London']],true],
  ['rome','ITA',[['locality','Roma']],true],
  ['bangkok','THA',[['administrative_area_level_1','กรุงเทพมหานคร']],true],
  ['hanoi','VNM',[['administrative_area_level_1','Hà Nội']],true],
  ['singapore','SGP',[['country','Singapore']],true],
 ];
 for(const [cityId,country,areas,valid] of scenarios){
  const meta=RECOMMENDATION_CITIES[cityId],name='Visitor Centre';
  const place={...venue(name),location:{latitude:meta[1],longitude:meta[2]},addressComponents:[{types:['country'],shortText:TRAVEL_REGIONS[country].countryCode},...areas.map(([type,name])=>({types:[type],longText:name}))]};
  const result=fixture({candidates:[candidate(name)],statements:[`${name} is a visitor destination.`],places:[place]}).run({...input,cityId,country});
  if(valid)assert.equal((await result).places.length,1,cityId);else await assert.rejects(result,e=>e.details.reason==='recommendation-no-places');
 }
});

test('resolved hours exclude visit-day closure, preserve honest unknowns and use each city local date',async()=>{
 const closed={...venue(),currentOpeningHours:{periods:[]}};
 await assert.rejects(fixture({places:[closed]}).run(),e=>e.details.reason==='recommendation-no-places');
 const open={...venue(),currentOpeningHours:{openNow:false,periods:[{open:{date:{year:2026,month:10,day:15},day:4,hour:9},close:{date:{year:2026,month:10,day:15},day:4,hour:18}}]}};
 const app=fixture({places:[open]});assert.deepEqual((await app.run()).places[0].hours,{status:'current',intervals:['09:00–18:00']});
 assert.match(app.calls.find(c=>c.url?.includes('places.googleapis.com')).options.headers['X-Goog-FieldMask'],/places.currentOpeningHours,places.regularOpeningHours/);
 assert.deepEqual((await fixture().run()).places[0].hours,{status:'unknown',intervals:[]});
 // At 03:00Z Oct 14 it is Oct 13 in Hawaii: Oct 20 is outside the current seven-day window.
 const name='Visitor Centre',meta=RECOMMENDATION_CITIES.honolulu;
 const hawaii={...venue(name),location:{latitude:meta[1],longitude:meta[2]},addressComponents:[{types:['country'],shortText:'US'},{types:['locality'],longText:'Honolulu'}],currentOpeningHours:{periods:[]},regularOpeningHours:{periods:[{open:{day:2,hour:9},close:{day:2,hour:17}}]}};
 const result=await fixture({places:[hawaii],candidates:[candidate(name)],statements:[`${name} is a visitor destination.`]}).run({...input,cityId:'honolulu',country:'USA',date:'2026-10-20'});
 assert.deepEqual(result.places[0].hours,{status:'regular',intervals:['09:00–17:00']});
});

test('recent exclusions are bounded and validated before account limits or paid work; old clients default to none',async()=>{
 assert.deepEqual(validateRecommendationInput(input,now()).excludedPlaces,[]);
 const valid=Array.from({length:20},(_,index)=>({placeId:`id-${index}`,displayName:`Venue ${index}`}));
 const data={...input,excludedPlaces:valid},before=structuredClone(data);
 assert.equal((await fixture().run(data)).places.length,1);assert.deepEqual(data,before);
 for(const excludedPlaces of [null,{},'id',Array.from({length:21},(_,i)=>({placeId:`id-${i}`,displayName:'Venue'})),
  [null],[[]],[{}],[{placeId:'',displayName:'Name'}],[{placeId:'id',displayName:''}],[{placeId:'id',displayName:[]}],
  [{placeId:'x'.repeat(513),displayName:'Name'}],[{placeId:'id',displayName:'x'.repeat(121)}],
  [{placeId:'id\n',displayName:'Name'}],[{placeId:'id',displayName:'Name\n'}],
  [{placeId:'id',displayName:'Name',prompt:'injected'}],[valid[0],valid[0]]]){
  const app=fixture();await assert.rejects(app.run({...input,excludedPlaces}),{code:'invalid-argument'});assert.deepEqual(app.calls,[]);
 }
});

test('refresh excludes normalized names and reviewed aliases before lookup and gives a specific no-new-results error',async()=>{
 for(const [name,previousName] of [['국립중앙박물관','국립 중앙 박물관'],['N Seoul Tower','N서울타워']]){
  const app=fixture({candidates:[candidate(name)],statements:[`${name} is a visitor destination.`]});
  await assert.rejects(app.run({...input,excludedPlaces:[{placeId:'previous',displayName:previousName}]}),{code:'not-found',details:{reason:'recommendation-no-new-places',evidence:1,candidates:1,rejected:{excluded:1}}});
  assert.equal(app.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
  const prompt=app.calls.find(c=>c.body?.tools).body.contents[0].parts[0].text;
  assert.ok(prompt.includes(JSON.stringify([previousName])));assert.match(prompt,/untrusted list of venue names/);
 }
});

test('canonical Place ID exclusion catches renamed venues after lookup and keeps fewer verified alternatives without extra calls',async()=>{
 const names=['이름 바뀐 박물관','새 산책길'];
 const app=fixture({candidates:names.map(candidate),statements:names.map(name=>`${name}은 둘러볼 수 있는 장소입니다.`),places:body=>{
  const name=body.textQuery.split(',')[0];return [{...venue(name,name===names[0]?'old-id':'new-id'),primaryType:name===names[0]?'museum':'park'}];
 }});
 const result=await app.run({...input,excludedPlaces:[{placeId:'old-id',displayName:'Former museum name'}]});
 assert.deepEqual(result.places.map(item=>item.place.placeId),['new-id']);
 assert.equal(app.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,2);
 assert.equal(app.calls.filter(c=>c.url?.includes('generativelanguage.googleapis.com')).length,2);
 const only=fixture();await assert.rejects(only.run({...input,excludedPlaces:[{placeId:'museum',displayName:'Old name'}]}),{code:'not-found'});
 assert.equal(only.calls.filter(c=>c.url?.includes('places.googleapis.com')).length,1);
});


test('empty or invalid weather cannot claim that a visit-date forecast was included',async()=>{
 const day={displayDate:{year:2026,month:10,day:15}};
 for(const weatherDays of [[day],[{...day,daytimeForecast:{weatherCondition:{description:{text:{bad:true}}}}}],
  [{...day,minTemperature:{degrees:20},maxTemperature:{degrees:10}}],
  [{...day,daytimeForecast:{precipitation:{probability:{percent:140}}}}]]){
  assert.deepEqual((await fixture({weatherDays}).run()).weather,{status:'unavailable'});
 }
});

test('venue names inside other words or station names cannot attach a different venue description',async()=>{
 for(const [name,statement] of [['Art','Cart is a quiet visitor destination.'],['국립중앙박물관','국립중앙박물관역은 편리한 교통 시설입니다.']]){
  const app=fixture({candidates:[candidate(name)],statements:[statement],places:[venue(name)]});
  await assert.rejects(app.run(),e=>e.details.reason==='recommendation-no-places');
  assert.equal(app.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
 for(const [name,statement] of [['M+ (Art)','M+ (Art) is a cultural destination.'],['국립중앙박물관','국립중앙박물관의 소장품을 살펴볼 수 있습니다.']]){
  assert.equal((await fixture({candidates:[candidate(name)],statements:[statement],places:[venue(name)]}).run()).places.length,1);
 }
});

test('unverified operational, forecast and popularity claims cannot override structured information in recommendation prose',async()=>{
 for(const statement of ['국립중앙박물관은 오늘 영업 중입니다.','국립중앙박물관은 내일 비가 내릴 예정이라 추천합니다.',
  '국립중앙박물관은 실시간 인기 1위입니다.','국립중앙박물관 is open today until 18:00.',
  '국립중앙박물관 is recommended because rain is forecast for tomorrow.','국립중앙박물관 is the most popular attraction right now.']){
  const app=fixture({statements:[statement],weatherFail:true});
  await assert.rejects(app.run(),e=>e.details.reason==='recommendation-no-places');
  assert.equal(app.calls.some(c=>c.url?.includes('places.googleapis.com')),false);
 }
});
