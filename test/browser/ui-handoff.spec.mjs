import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { destinations } from '../../src/domains/planner/services/travel-destinations.mjs';
const destinationFixtures = JSON.parse(readFileSync(new URL('../fixtures/destination-places.json', import.meta.url)));

const catalogueMaps = maps => maps.slice(0, maps.indexOf('export const getMapsLoader')) + `
const fixtures=${JSON.stringify(destinationFixtures)};
export const getMapsLoader=()=>({importLibrary:async()=>({Place:class {static async searchByText(request){
  window.catalogueRequests=(window.catalogueRequests||[]).concat(request);
  if(window.catalogueError) throw new Error(window.catalogueError);
  if(window.catalogueDelay) await new Promise(resolve=>setTimeout(resolve,window.catalogueDelay));
  return {places:fixtures.filter(row=>request.textQuery.startsWith(row.queryName+' ')).map(row=>row.place)};
}}})});`;

const place = {placeId:'paris-airport',displayName:'Paris Airport',formattedAddress:'Paris, France',lat:48.85,lng:2.35};
const trip = {id:'own123',userId:'owner',title:'Paris trip',createdAtMillis:1790000000000,itineraryPlan:{days:[1,2].map(day=>({day,date:`2030-10-${16+day}`,scheduleItems:[
  {type:'departure',title:'Airport',time:'09:00',endTime:'09:00',location:'Paris'},
  {type:'attraction',title:`Museum ${day}`,time:'10:00',endTime:'11:00',location:'Paris',selectedPlace:place},
  {type:'arrival',title:'Hotel',time:'18:00',endTime:'18:00',location:'Paris'},
]}))}};
const auth = `export const missingFirebaseConfig=[];export const app=null;
let user={uid:'owner',email:'owner@example.test',emailVerified:true,displayName:'Traveler',providerData:[]};
export const getCurrentUser=()=>user;export const subscribeToAuthChanges=callback=>{queueMicrotask(()=>callback(user));return()=>{}};
export const requireRecentLoginForDeletion=async()=>{};export const logout=async()=>{user=null};
export const loginWithGoogle=async()=>{};export const loginWithEmail=async()=>{};export const loginWithCustomToken=async()=>{};`;
const maps = `class PlaceInput extends HTMLElement {
 constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<input aria-label="Place search" style="box-sizing:border-box;width:100%;font-size:16px;min-height:44px">';this.shadowRoot.querySelector('input').addEventListener('change',()=>this.dispatchEvent(Object.assign(new Event('gmp-select'),{place:{id:this.value,displayName:this.value,formattedAddress:'Paris, France',location:{lat:48.85,lng:2.35}}})));}
 get value(){return this.shadowRoot.querySelector('input').value}set value(value){this.shadowRoot.querySelector('input').value=value||''}
}customElements.define('gmp-place-autocomplete',PlaceInput);
export const getMapsLoader=()=>({importLibrary:async()=>({Place:class {static async searchByText(request){return {places:[{id:request.textQuery,displayName:request.textQuery.split(',')[0].split(' ').slice(0,2).join(' '),formattedAddress:'Paris, France',location:{lat:48.85,lng:2.35},addressComponents:[{types:['country'],shortText:request.region.toUpperCase()}]}]}}}})});`;

test.beforeEach(async ({page,context,baseURL})=>{
 page.on('pageerror',error=>console.log('Browser error:',error.message));
 await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort('blockedbyclient'));
 await page.route('**/src/domains/auth/services/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:auth}));
 await page.route('**/src/domains/map/services/google-maps-loader.js',route=>route.fulfill({contentType:'text/javascript',body:maps}));
 await page.route('**/src/domains/itinerary/services/firestore-service.js',route=>route.fulfill({contentType:'text/javascript',body:`const trip=${JSON.stringify(trip)};export const getUserItineraries=async()=>[structuredClone(trip)];export const loadItineraryDocument=async()=>({access:'private',itineraryPlan:structuredClone(trip.itineraryPlan)});export const saveItinerary=async()=>{window.saves=(window.saves||0)+1;return trip.id};export const updateItinerary=async(id,plan)=>{window.updates=(window.updates||[]).concat([{id,plan}]);return id};export const createSharedItinerary=async()=>'';export const watchSharedItinerary=()=>()=>{};export const renameItinerary=async()=>{};export const deleteItinerary=async()=>{};`}));
 await page.route('**/src/domains/profile/services/account-deletion-api.js',route=>route.fulfill({contentType:'text/javascript',body:`export const accountDeletionClient={status:async()=>({state:'not-found'}),hasReceipt:()=>false};`}));
 await page.route('**/src/domains/map/ui/map-view.js',route=>route.fulfill({contentType:'text/javascript',body:`class MapView extends HTMLElement{connectedCallback(){this.handler=event=>{window.mapDays=(window.mapDays||[]).concat(event.detail.context.dayIndex);const items=event.detail.plan.days[0].scheduleItems;setTimeout(()=>window.dispatchEvent(new CustomEvent('transit-info-ready',{detail:{context:event.detail.context,routes:items.slice(1).map((_,index)=>({fromIndex:index,toIndex:index+1,durationMinutes:10,mode:'WALKING',steps:[]}))}})),0)};window.addEventListener('render-map-route',this.handler)}disconnectedCallback(){window.removeEventListener('render-map-route',this.handler)}}customElements.define('map-view',MapView);`}));
 await page.route('**/src/domains/planner/services/flexible-visit-checks.js',route=>route.fulfill({contentType:'text/javascript',body:`export const createFlexibleVisitChecks=()=>({travelMinutes:async()=>10,hoursStatus:async()=> 'open'});`}));
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:`export const getGenerationCredits=async()=>3;export async function generateOptimizedItinerary(request){window.generationCalls=(window.generationCalls||0)+1;window.generatedRequest=request;return {...${JSON.stringify(trip.itineraryPlan)},request}}`}));
});

async function selectPlace(control,name){await control.locator('input').fill(name);await control.locator('input').press('Tab');await expect.poll(()=>control.evaluate(element=>element.selectedPlace?.placeId)).toBe(name);}

async function mockAIRecommendations(page) {
 await page.route('**/src/domains/planner/services/ai-place-recommendations.js',route=>route.fulfill({contentType:'text/javascript',body:`
 export async function getAIPlaceRecommendations(input){
  window.aiRequests=(window.aiRequests||[]).concat(input);
  const error=window.aiError;
  if(window.aiDelay)await new Promise(resolve=>window.releaseAI=resolve);
  if(error)throw Object.assign(new Error('fixture'),{code:error});
  const next=input.excludedPlaces?.length?window.aiRequests.length:0;
  return {...input,weather:{status:window.aiWeather||'forecast',description:'비',minC:12,maxC:19,rainPercent:80},searchSuggestions:'<a href="https://www.google.com/search?q=Seoul">Google Search</a><script>parent.fixtureInjected=true</script>',
   places:[{place:{placeId:next?'ai-place-'+next:'ai-museum',displayName:(input.lang==='en'?'National Museum of Korea':'국립중앙박물관')+(next?' '+next:''),formattedAddress:'서울 용산구',lat:37.5238,lng:126.9803},reason:input.lang==='en'?'Indoor museum for the visit date.':'방문일 예보를 고려해 실내 관람을 추천합니다.',hours:window.aiHours||{status:'unknown',intervals:[]},sources:[{title:'공식 관람 안내',url:'https://example.test/guide'}],mapsUrl:'https://maps.google.com/?cid=museum',attributions:[]}]};
 }` }));
}

test.describe('AI discovery',()=>{
 // Playwright's SW-blocking init script throws in opaque sandbox frames; Vite dev registers no SW.
 test.use({serviceWorkers:'allow'});
test('refresh remembers recent results through errors and cached returns, bounds memory and resets on changed context',async({page})=>{
 await mockAIRecommendations(page);await page.emulateMedia({reducedMotion:'reduce'});
 for(const path of ['/recommend','/destination']){
  await page.goto(path);const flow=path==='/recommend'?'recommend':'destination';
  await page.locator(`[data-${flow}-country=KOR]`).click();await page.getByRole('button',{name:'서울',exact:true}).click();
  const widget=page.locator('.ai-place-recommendations');await widget.locator('input').fill('2030-10-17');
  const before=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
  for(let index=0;index<3;index++){
   await widget.locator('.ai-place-controls button').click();await expect(widget.locator('.ai-place-card')).toHaveCount(1);
   expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces.length)).toBe(index);
  }
  expect(await page.evaluate(()=>window.aiRequests[1].excludedPlaces)).toEqual([{placeId:'ai-museum',displayName:'국립중앙박물관'}]);
  await page.evaluate(()=>{window.aiError='functions/not-found';});await widget.locator('.ai-place-controls button').click();
  await expect(widget.getByRole('alert')).toContainText('최근 본 장소를 제외하고');await expect(widget.locator('.ai-place-card')).toHaveCount(0);
  const previous=await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces);
  await page.evaluate(()=>{window.aiError='functions/resource-exhausted';});await widget.locator('.ai-place-controls button').click();
  await expect(widget.getByRole('alert')).toContainText('요청이 많습니다');
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces)).toEqual(previous);
  await page.evaluate(()=>{window.aiError='';});await widget.locator('.ai-place-controls button').click();
  await expect(widget.locator('.ai-place-card')).toHaveCount(1);
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces)).toEqual(previous);
  for(let index=0;index<19;index++){
   await widget.locator('.ai-place-controls button').click();await expect(widget.locator('.ai-place-card')).toHaveCount(1);
  }
  const capped=await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces);
  expect(capped).toHaveLength(20);expect(capped.some(place=>place.placeId==='ai-museum')).toBe(false);
  expect(new Set(capped.map(place=>place.placeId)).size).toBe(20);
  expect(capped.every(place=>Object.keys(place).sort().join(',')==='displayName,placeId')).toBe(true);
  await page.evaluate(()=>window.navigate('/home'));await expect(page).toHaveURL(/home$/);
  // /recommend keeps its city in the address; the bare path would open the country step.
  const cached=path==='/recommend'?'/recommend?country=KOR&city=seoul':path;
  await page.evaluate(target=>window.navigate(target),cached);await expect(page).toHaveURL(new RegExp(cached.replace('?','\\?')+'$'));
  await widget.locator('.ai-place-controls button').click();await expect(widget.locator('.ai-place-card')).toHaveCount(1);
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces.length)).toBe(20);
  await widget.getByRole('button',{name:'산책',exact:true}).click();
  await widget.locator('.ai-place-controls button').focus();await page.keyboard.press('Enter');await expect(widget.locator('.ai-place-card')).toHaveCount(1);
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces)).toEqual([]);
  await widget.locator('input').fill('2030-10-18');await widget.locator('.ai-place-controls button').click();await expect(widget.locator('.ai-place-card')).toHaveCount(1);
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces)).toEqual([]);
  await page.evaluate(async()=>{(await import('/src/utils/i18n.js')).setLang('en');window.aiError='functions/not-found';});
  await widget.locator('.ai-place-controls button').click();await expect(widget.getByRole('alert')).toContainText('Could not verify new places');
  expect(await page.evaluate(()=>window.aiRequests.at(-1).excludedPlaces)).toEqual([]);
  expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(before);
  await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await page.evaluate(async()=>(await import('/src/utils/i18n.js')).setLang('ko'));
 }
});
test('visit-date hours show local, regular and unknown guidance without changing the draft on either route',async({page},testInfo)=>{
 await mockAIRecommendations(page);
 for(const path of ['/recommend','/destination']){
  await page.goto(path);const flow=path==='/recommend'?'recommend':'destination';
  await page.locator(`[data-${flow}-country=KOR]`).click();await page.getByRole('button',{name:'서울',exact:true}).click();
  const widget=page.locator('.ai-place-recommendations');await widget.locator('input').fill('2030-10-17');
  const before=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
  for(const [lang,status,label] of [['ko','current','현지 영업시간'],['ko','regular','공휴일·임시 휴무'],['ko','unknown','영업시간 미확인'],
   ['en','current','Local hours'],['en','regular','Regular weekday hours'],['en','unknown','Hours unconfirmed']]){
   await page.evaluate(async({lang,status})=>{(await import('/src/utils/i18n.js')).setLang(lang);window.aiHours={status,intervals:status==='unknown'?[]:['00:00–02:00','09:00–18:00']};},{lang,status});
   await widget.locator('.ai-place-controls button').click();
   await expect(widget.locator('.ai-place-hours')).toContainText(label);await expect(widget.locator('.ai-place-hours')).toContainText('2030-10-17');
   if(status==='unknown')await expect(widget.locator('.ai-place-hours')).not.toContainText('09:00');
   else await expect(widget.locator('.ai-place-hours')).toContainText('00:00–02:00, 09:00–18:00');
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
   }
   if(path==='/recommend'&&status==='regular'){
    await page.setViewportSize({width:lang==='ko'?390:1280,height:900});
    await widget.locator('.ai-place-card').scrollIntoViewIfNeeded();
    await page.screenshot({path:testInfo.outputPath(`ai-hours-${lang}.png`)});
   }
  }
  expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(before);
  await page.evaluate(async()=>(await import('/src/utils/i18n.js')).setLang('ko'));
 }
});
test('typing never removes regular recommendations; the list can be collapsed on both destination routes',async({page})=>{
 for(const path of ['/recommend','/destination']) {
  await page.goto(path);
  const country=path==='/recommend'?'recommend':'destination';
  await page.locator(`[data-${country}-country=KOR]`).click();await page.getByRole('button',{name:'서울',exact:true}).click();
  await page.locator('#destination-search input').fill('미술관');await page.locator('#destination-search').dispatchEvent('input');
  await expect(page.locator('.flow-place-list')).toBeVisible();await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await page.locator('.catalogue-places > summary').click();await expect(page.locator('.flow-place-list')).toBeHidden();
  await page.locator('.catalogue-places > summary').click();await expect(page.locator('.flow-place-list')).toBeVisible();
 }
});

test('AI recommendation browsing preserves inputs, sends visit context and adds/removes a verified place without Maps relookup',async({page},testInfo)=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await mockAIRecommendations(page);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/recommend');await page.locator('[data-recommend-country=KOR]').click();
 const before=await page.evaluate(async location=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.save({date:['2030-10-17'],theme:'food',budget:'standard',startTime:'09:00',endTime:'18:00',startLocation:location,endLocation:location,anchorSchedules:[]}),place);
 await page.locator('[data-recommend-city=seoul]').click();const widget=page.locator('.ai-place-recommendations');
 await widget.getByRole('button',{name:'전시/문화',exact:true}).click();
 await widget.locator('input[type=date]').fill('2030-10-20');await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();
 await expect(widget.locator('.ai-place-card')).toHaveCount(1);await expect(widget).toContainText('강수 확률 80%');
 expect(await page.evaluate(()=>window.aiRequests)).toEqual([{cityId:'seoul',country:'KOR',date:'2030-10-20',lang:'ko',theme:'food',budget:'standard',interest:'culture',excludedPlaces:[]}]);
 expect(await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual(before);
 await expect(widget.locator('iframe')).toHaveAttribute('sandbox','allow-popups allow-popups-to-escape-sandbox');
 expect(await page.evaluate(()=>window.fixtureInjected)).toBeUndefined();
 const add=widget.locator('.ai-place-card button');await add.click();await expect(add).toHaveAttribute('aria-pressed','true');
 const selected=await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
 expect(selected.anchorSchedules[0]).toMatchObject({flexible:true,location:{placeId:'ai-museum'},suggestionId:'ai:ai-museum'});expect(selected.anchorSchedules[0].day).toBeUndefined();
 expect(selected.date).toEqual(before.date);expect(selected.startLocation).toEqual(before.startLocation);expect(selected.theme).toBe(before.theme);
 expect(await page.evaluate(()=>window.catalogueRequests||[])).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('ai-interests-390.png'),fullPage:true});
 await add.click();await expect(add).toHaveAttribute('aria-pressed','false');await expect(page.locator('.flow-primary')).toHaveText('장소 선택 없이 다음');
 await page.evaluate(async()=>(await import('/src/utils/i18n.js')).setLang('en'));
 await expect(widget.getByRole('button',{name:'Get AI recommendations',exact:true})).toBeVisible();
 await expect(widget.getByRole('button',{name:'Arts & culture',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.evaluate(()=>{window.aiWeather='seasonal';});await widget.getByRole('button',{name:'Get AI recommendations',exact:true}).click();
 await expect(widget).toContainText('Beyond the forecast range');await expect(widget.locator('h3')).toHaveText('National Museum of Korea');
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:testInfo.outputPath('ai-interests-1280.png'),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 expect(errors).toEqual([]);
});

test('AI failures retain regular places and allow retry; guest users can browse recommendations',async({page})=>{
 await mockAIRecommendations(page);
 await page.route('**/src/domains/auth/services/firebase-auth.js',route=>route.fulfill({contentType:'text/javascript',body:auth.replace("let user={uid:'owner',email:'owner@example.test',emailVerified:true,displayName:'Traveler',providerData:[]};",'let user=null;')}));
 await page.goto('/recommend');await page.locator('[data-recommend-country=JPN]').click();await page.locator('[data-recommend-city=tokyo]').click();
 const widget=page.locator('.ai-place-recommendations');
 for(const code of ['functions/resource-exhausted','functions/unavailable','functions/failed-precondition']){
  await page.evaluate(code=>{window.aiError=code;},code);await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();
  await expect(widget.getByRole('alert')).toBeVisible();await expect(page.locator('.flow-place-list')).toBeVisible();await expect(page.locator('.flow-place-row')).toHaveCount(3);
  await expect(widget.getByRole('button',{name:'AI 추천 받기',exact:true})).toBeEnabled();
 }
 await page.evaluate(()=>{window.aiError='';window.aiWeather='unavailable';});await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();
 await expect(widget.locator('.ai-place-card')).toHaveCount(1);await expect(widget).toContainText('날씨를 확인하지 못해');
 expect((await page.evaluate(()=>window.aiRequests)).every(request=>request.country==='JPN'&&request.cityId==='tokyo')).toBe(true);
});

test('pending AI requests cannot apply after the visit date changes or cached navigation leaves the city',async({page})=>{
 await mockAIRecommendations(page);await page.goto('/recommend');await page.locator('[data-recommend-country=KOR]').click();await page.locator('[data-recommend-city=seoul]').click();
 const widget=page.locator('.ai-place-recommendations');await page.evaluate(()=>{window.aiDelay=true;});
 await widget.getByRole('button',{name:'산책',exact:true}).click();
 await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.releaseAI)).toBe('function');
 await expect(widget.getByRole('button',{name:'장소 찾는 중…',exact:true})).toBeDisabled();
 await widget.locator('input').fill('2030-10-20');await page.evaluate(()=>window.releaseAI());await expect(widget.locator('.ai-place-card')).toHaveCount(0);
 await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.aiRequests.length)).toBe(2);
 const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await page.evaluate(()=>window.navigate('/home'));await expect(page).toHaveURL(/home$/);await page.evaluate(()=>window.releaseAI());
 await page.goBack();await expect(page).toHaveURL(/recommend\?country=KOR&city=seoul$/);
 await expect(widget.locator('.ai-place-card')).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
 await expect(widget.getByRole('button',{name:'산책',exact:true})).toBeVisible();
 await expect(widget.getByRole('button',{name:'산책',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.aiRequests.map(request=>request.interest))).toEqual(['walk','walk']);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();await page.locator('[data-recommend-city=busan]').click();
 await expect(widget.getByRole('button',{name:'상관없음',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.aiRequests.length)).toBe(2);
});

test('recommendation interests are optional single choices on both routes, support keyboard and translations, and never auto-fetch or edit the draft',async({page})=>{
 await mockAIRecommendations(page);
 const labels=['상관없음','실내 위주','산책','전시/문화','먹거리','새로운 곳'];
 for(const path of ['/recommend','/destination']){
  await page.emulateMedia({reducedMotion:path==='/recommend'?'no-preference':'reduce'});
  await page.goto(path);const flow=path==='/recommend'?'recommend':'destination';
  await page.locator(`[data-${flow}-country=KOR]`).click();await page.getByRole('button',{name:'서울',exact:true}).click();
  const widget=page.locator('.ai-place-recommendations'),group=widget.getByRole('group',{name:'어떤 장소를 찾으세요?'});
  const before=await page.evaluate(async()=>{
   window.interestWidget=document.querySelector('.ai-place-recommendations');window.interestPage=window.interestWidget.closest('.ion-page');
   return {draft:(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read(),stored:sessionStorage.getItem('currentFormData')};
  });
  await expect(group.getByRole('button')).toHaveCount(6);await expect(group.locator('[aria-pressed=true]')).toHaveText('상관없음');
  for(const label of labels){
   await group.getByRole('button',{name:label,exact:true}).click();await expect(group.locator('[aria-pressed=true]')).toHaveCount(1);
   await expect(group.locator('[aria-pressed=true]')).toHaveText(label);
  }
  const indoor=group.getByRole('button',{name:'실내 위주',exact:true});await indoor.focus();await indoor.press('Space');
  await expect(indoor).toBeFocused();await expect(indoor).toHaveAttribute('aria-pressed','true');
  await indoor.press('Tab');const walk=group.getByRole('button',{name:'산책',exact:true});await expect(walk).toBeFocused();await walk.press('Enter');
  await expect(walk).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>window.aiRequests||[])).toEqual([]);
  expect(await page.evaluate(async()=>({draft:(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read(),stored:sessionStorage.getItem('currentFormData')}))).toEqual(before);
  expect(await widget.evaluate(node=>node===window.interestWidget&&node.closest('.ion-page')===window.interestPage)).toBe(true);
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:900});
   for(const button of await group.getByRole('button').all())expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  }
  await page.evaluate(async()=>(await import('/src/utils/i18n.js')).setLang('en'));
  await expect(widget.getByRole('group',{name:'What kind of places?'}).getByRole('button',{name:'Walks',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(widget).toContainText('Your trip theme and budget stay the same.');
  await page.evaluate(async()=>(await import('/src/utils/i18n.js')).setLang('ko'));
 }
});

test('changing interest clears old results and errors, ignores old successes and failures, and keeps the current loading state',async({page})=>{
 await mockAIRecommendations(page);await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/recommend');await page.locator('[data-recommend-country=KOR]').click();await page.locator('[data-recommend-city=seoul]').click();
 const widget=page.locator('.ai-place-recommendations');
 const before=await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
 await widget.getByRole('button',{name:'실내 위주',exact:true}).click();await page.evaluate(()=>{window.aiDelay=true;});
 await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.releaseAI)).toBe('function');
 await page.evaluate(()=>{window.releaseOldAI=window.releaseAI;});
 await widget.getByRole('button',{name:'산책',exact:true}).click();await expect(widget.getByRole('status')).toHaveCount(0);
 await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.aiRequests.length)).toBe(2);
 await page.evaluate(async()=>{window.releaseOldAI();await new Promise(resolve=>requestAnimationFrame(resolve));});
 await expect(widget.locator('.ai-place-card')).toHaveCount(0);await expect(widget.getByRole('button',{name:'장소 찾는 중…',exact:true})).toBeDisabled();
 await page.evaluate(()=>window.releaseAI());await expect(widget.locator('.ai-place-card')).toHaveCount(1);
 await widget.getByRole('button',{name:'산책',exact:true}).click();await expect(widget.locator('.ai-place-card')).toHaveCount(1);
 await widget.getByRole('button',{name:'먹거리',exact:true}).click();await expect(widget.locator('.ai-place-card')).toHaveCount(0);
 await expect(widget.locator('iframe')).toHaveCount(0);
 await page.evaluate(()=>{window.aiError='functions/unavailable';});await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.aiRequests.length)).toBe(3);await page.evaluate(()=>{window.releaseOldAI=window.releaseAI;window.aiError='';window.aiDelay=false;});
 await widget.getByRole('button',{name:'전시/문화',exact:true}).click();await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();
 await expect(widget.locator('.ai-place-card')).toHaveCount(1);
 await page.evaluate(async()=>{window.releaseOldAI();await new Promise(resolve=>requestAnimationFrame(resolve));});
 await expect(widget.getByRole('alert')).toHaveCount(0);await expect(widget.locator('.ai-place-card')).toHaveCount(1);
 await widget.getByRole('button',{name:'새로운 곳',exact:true}).click();await page.evaluate(()=>{window.aiError='functions/unavailable';});
 await widget.getByRole('button',{name:'AI 추천 받기',exact:true}).click();await expect(widget.getByRole('alert')).toBeVisible();
 await expect(widget.getByRole('button',{name:'새로운 곳',exact:true})).toHaveAttribute('aria-pressed','true');
 await widget.getByRole('button',{name:'상관없음',exact:true}).click();await expect(widget.getByRole('alert')).toHaveCount(0);
 await expect(widget.getByRole('button',{name:'AI 추천 받기',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>window.aiRequests.map(request=>request.interest))).toEqual(['indoor','walk','food','culture','discovery']);
 expect(await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual(before);
 await expect(page.locator('.flow-place-row')).toHaveCount(6);
});
});

test('domestic recommendations continue without places, preserve inputs and remember each chosen city', async ({ page }, testInfo) => {
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 await page.setViewportSize({width:390,height:844});
 for (const city of destinations.filter(city=>city.country==='KOR')) {
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  const before=await page.evaluate(async location=>{
   const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
   return plannerDraftStore.save({date:['2030-10-17'],startTime:'09:00',endTime:'18:00',startLocation:location,endLocation:location,
    theme:'food',budget:'standard',anchorSchedules:[],
    selectedWaypoints:[{name:'Existing optional visit',location}]});
  },place);
  await page.locator(`[data-recommend-city=${city.id}]`).click();
  const button=page.locator('.flow-primary');
  await expect(button).toBeEnabled(); await expect(button).toHaveText('장소 선택 없이 다음');
  if(city.id==='seoul') await page.screenshot({path:testInfo.outputPath('recommend-empty-390.png'),fullPage:true});
  if(city.id==='busan') {
   await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
   await expect(button).toHaveText('Continue without places');
  }
  await button.click(); await expect(page).toHaveURL(/\/preference\/1$/);
  const after=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  expect(after).toEqual({...before,step:'/preference/1',country:'KOR',destinationStage:'places',destination:expect.objectContaining({id:city.id,country:'KOR'})});
  expect(await page.evaluate(()=>window.catalogueRequests||[])).toEqual([]);
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));
 }
});

test('removing the only recommended place restores skip, while the plan add dialog still requires a selection', async ({ page }) => {
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 await page.goto('/recommend'); await page.locator('[data-recommend-country=KOR]').click(); await page.locator('[data-recommend-city=seoul]').click();
 const row=page.locator('.flow-place-row').first(); const button=page.locator('.flow-primary');
 await row.locator('button').click(); await expect(row.locator('button')).toHaveAttribute('aria-pressed','true');
 await expect(button).toHaveText('선택한 장소 1개 · 다음');
 await row.locator('button').click(); await expect(button).toBeEnabled(); await expect(button).toHaveText('장소 선택 없이 다음');
 await page.evaluate(async()=>{
  await import('/src/domains/planner/ui/home-recommendations.js');
  const element=document.createElement('home-recommendations');element.setAttribute('planner-pick','');document.querySelector('main.flow-page').append(element);
 });
 const cards=page.locator('home-recommendations'); const add=cards.locator('#discover-plan');
 await expect(add).toHaveText('내 일정에 추가'); await expect(add).toBeDisabled();
 await cards.locator('button[data-place=palace]').click(); await expect(add).toBeEnabled();
 await cards.locator('button[data-place=palace]').click(); await expect(add).toBeDisabled();
});

test('travel dates show the chosen city as text and a translated change button on first load', async ({ page }, testInfo) => {
 await page.emulateMedia({reducedMotion:'reduce'});
 for(const width of [390,1280]) {
  await page.setViewportSize({width,height:900}); await page.goto('/home');
  await page.evaluate(async()=>{
   const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
   plannerDraftStore.save({destination:{id:'seoul',country:'KOR',name:'Seoul, South Korea'},destinationStage:'places',date:['2030-10-17']});
   window.navigate('/preference/1');
  });
  const view=page.locator('preference-view:visible');
  await expect(view.locator('.destination-summary')).toBeVisible();
  await expect(view.locator('.destination-summary p')).toHaveText('여행지 · 서울');
  await expect(view.locator('input[readonly]')).toHaveCount(0);
  await expect(view.getByRole('button',{name:'여행지 다시 선택',exact:true})).toBeVisible();
  expect((await view.locator('#change-destination').boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await view.locator('button:visible').evaluateAll(buttons=>buttons.every(button=>button.textContent.trim()))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`travel-date-${width}.png`),fullPage:true});
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(view.locator('.destination-summary p')).toHaveText('Destination · Seoul');
  await view.getByRole('button',{name:'Change destination',exact:true}).click(); await expect(page).toHaveURL(/\/destination$/);
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read().date)).toEqual(['2030-10-17']);
  await page.getByRole('button',{name:'← Back',exact:true}).click();
  await page.getByRole('button',{name:'Busan',exact:true}).click();
  await page.locator('.flow-primary').click(); await expect(page).toHaveURL(/\/preference\/1$/);
  await expect(view.locator('.destination-summary p')).toHaveText('Destination · Busan');
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));
 }
});

test('travel dates hide the city summary when no destination has been selected', async ({ page }) => {
 await page.goto('/home');
 await page.evaluate(async()=>{
  const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');plannerDraftStore.clear();window.navigate('/preference/1');
 });
 const view=page.locator('preference-view:visible');
 await expect(view.locator('.destination-summary')).toBeHidden();
 await expect(view.locator('#preference-destination')).toHaveText('');
 await expect(view.locator('#change-destination')).toBeHidden();
 await expect(view.locator('[data-date-type=today]')).toBeVisible();
});

test('all 111 recommended places across 11 countries save verified catalogue identities', async ({ page }) => {
 test.setTimeout(120000);
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 await page.goto('/recommend');
 for (const city of destinations) {
  const groups = [city.places];
  for (const group of groups) {
   await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
   await page.goto('/recommend');
   await page.locator(`[data-recommend-country=${city.country}]`).click();
   await page.locator(`[data-recommend-city=${city.id}]`).click();
   for (let index=0;index<group.length;index++) {
    const button=page.locator('.flow-place-row').nth(index).locator('button');
    await button.click(); await expect(button).toHaveAttribute('aria-pressed','true');
   }
   await expect(page.locator('[role=alert]')).toHaveCount(0);
   const expected=group.map(place=>destinationFixtures.find(row=>row.city===city.id&&row.id===place.id).place.id);
   await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData'))?.anchorSchedules.map(anchor=>anchor.location?.placeId))).toEqual(expected);
  }
 }
});

test('catalogue quota errors preserve the draft and allow retry in both recommendation flows', async ({ page }) => {
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 for (const [country,city] of [['JPN','tokyo'],['KOR','seoul']]) {
  await page.goto('/recommend');
  await page.locator(`[data-recommend-country=${country}]`).click(); await page.locator(`[data-recommend-city=${city}]`).click();
  await page.evaluate(()=>{window.catalogueError='PLACES_SEARCH_TEXT: RESOURCE_EXHAUSTED: SearchTextRequest per day';});
  const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
  const button=page.locator('.flow-place-row').first().locator('button');
  await button.click();
  await expect(page.getByText('지도 서비스의 일일 검색 한도에 도달했습니다. 한도 갱신 후 다시 시도해 주세요.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
  await expect(button).toBeEnabled();
  await page.evaluate(()=>{window.catalogueError='';}); await button.click();
  const id=destinationFixtures.find(row=>row.city===city&&row.id===(country==='JPN'?'浅草寺':'palace')).place.id;
  await expect.poll(()=>page.evaluate(id=>JSON.parse(sessionStorage.getItem('currentFormData')).anchorSchedules.some(anchor=>anchor.location?.placeId===id),id)).toBe(true);
 }
});

test('leaving domestic recommendations during place lookup never saves late results', async ({ page }) => {
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 await page.goto('/recommend'); await page.locator('[data-recommend-country=KOR]').click(); await page.locator('[data-recommend-city=seoul]').click();
 await page.evaluate(()=>{window.catalogueDelay=500;});
 const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await page.locator('.flow-place-row').first().locator('button').click();
 await expect(page.locator('.flow-primary')).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>window.catalogueRequests?.length)).toBe(1);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await expect(page.locator('[data-recommend-city=seoul]')).toBeVisible();
 await expect(page.locator('.flow-place-row')).toHaveCount(0);
 await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,600)));
 expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
});

test('cached home navigation invalidates pending catalogue lookups for domestic and international recommendations', async ({ page }) => {
 await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:catalogueMaps(maps)}));
 for(const [country,city] of [['KOR','seoul'],['JPN','tokyo']]) {
  await page.goto('/recommend'); await page.locator(`[data-recommend-country=${country}]`).click(); await page.locator(`[data-recommend-city=${city}]`).click();
  await page.evaluate(()=>{window.catalogueDelay=500;});
  const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
  await page.locator('.flow-place-row').first().locator('button').click();
  await expect.poll(()=>page.evaluate(()=>window.catalogueRequests?.length)).toBe(1);
  await page.evaluate(()=>window.navigate('/home')); await expect(page).toHaveURL(/\/home$/);
  await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,600)));
  expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
 }
});

test('country cards share region groups and responsive columns across discovery and trip creation',async({page},testInfo)=>{
 for(const [path,kind] of [['/recommend','recommend'],['/courses','course'],['/destination','destination']]){
  await page.setViewportSize({width:320,height:760});await page.goto(path);
  const picker=page.locator('.country-picker');await expect(picker.locator('.country-card')).toHaveCount(11);
  await expect(picker.getByRole('heading')).toHaveText(['아시아','유럽','북미']);
  const korea=picker.locator(`[data-${kind}-country=KOR]`);await expect(korea).toHaveAccessibleName('대한민국');await expect(picker.locator('small')).toHaveCount(0);
  expect((await korea.boundingBox()).height).toBeCloseTo(64,1);
  const columns=()=>picker.locator('.country-grid').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(await columns()).toBe(2);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);
  await page.setViewportSize({width:850,height:900});expect(await columns()).toBe(3);
  await page.setViewportSize({width:1200,height:900});expect(await columns()).toBe(4);
  await korea.click();
  const cityGrid=page.locator('.city-grid');await expect(cityGrid.locator('button')).toHaveCount(6);
  expect(await cityGrid.evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await page.setViewportSize({width:320,height:760});
  expect(await cityGrid.evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  expect((await cityGrid.locator('button').first().boundingBox()).height).toBe(52);
  await expect(cityGrid.locator('button').first()).toHaveText('서울');
  expect(await cityGrid.locator('button').first().evaluate(element=>getComputedStyle(element).textAlign)).toBe('center');
  await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 }
 await page.setViewportSize({width:1200,height:900});await page.screenshot({path:testInfo.outputPath('country-cards-desktop.png'),fullPage:true});
 await page.setViewportSize({width:320,height:760});await page.evaluate(async()=>{const {setLang}=await import('/src/utils/i18n.js');setLang('en')});
 await expect(page.locator('.country-picker').getByRole('heading')).toHaveText(['Asia','Europe','North America']);
 await expect(page.getByRole('button',{name:'United Kingdom',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('country-cards-en-mobile.png'),fullPage:true});
 await page.getByRole('button',{name:'United Kingdom',exact:true}).click();await expect(page.getByRole('button',{name:'London',exact:true})).toBeVisible();
});

test('all added countries offer places and curated courses, and US selections keep destination metadata',async({page},testInfo)=>{
 const cities=[['TWN','taipei','중정기념당'],['THA','bangkok','방콕 왕궁'],['VNM','hanoi','호안끼엠 호수'],['SGP','singapore','머라이언 파크'],['ITA','rome','콜로세움'],['ESP','barcelona','사그라다 파밀리아'],['GBR','london','웨스트민스터 사원'],['USA','newyork','메트로폴리탄 미술관']];
 await page.setViewportSize({width:320,height:760});
 await page.route('**/src/domains/map/services/google-maps-loader.js',route=>route.fulfill({contentType:'text/javascript',body:maps.replace('static async searchByText(request){return','static async searchByText(request){window.discoverySearch=request;return').replace("displayName:request.textQuery.split(',')[0].split(' ').slice(0,2).join(' ')","displayName:'The Metropolitan Museum of Art'")}));
 await page.route('**/src/domains/itinerary/services/public-course-service.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function getPublicCourse(){return null}export async function listPublicCourses(){return {courses:[{id:'nyc1',title:'NYC walk',stops:[{name:'Park',location:'New York',stayMinutes:60}]},{id:'rome1',title:'Rome walk',stops:[{name:'Forum',location:'Rome',stayMinutes:60}]}],hasMore:false}}`}));
 await page.goto('/recommend');
 const initial=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await expect(page.locator('[data-recommend-country]')).toHaveCount(11);
 for(const [country,city,name] of cities){
  await page.goto('/recommend');await page.locator(`[data-recommend-country=${country}]`).click();await page.locator(`[data-recommend-city=${city}]`).click();
  await expect(page.locator('.flow-place-row')).toHaveCount(country==='USA'?6:3);await expect(page.locator('.flow-place-list')).toContainText(name);
  await expect.poll(()=>page.locator('gmp-place-autocomplete').evaluate(element=>element.includedRegionCodes?.[0])).toBe({TWN:'TW',THA:'TH',VNM:'VN',SGP:'SG',ITA:'IT',ESP:'ES',GBR:'GB',USA:'US'}[country]);
  await page.goto('/courses');await page.locator(`[data-course-country=${country}]`).click();await page.locator(`[data-course-city=${city}]`).click();
  await expect(page.locator('home-courses article')).toHaveCount(3);await expect(page.locator('home-courses article').first()).toContainText(name);
  await expect(page.locator('home-courses article a').first()).toHaveAttribute('href',new RegExp(`/en/routes/curated-${city}$`));
 }
 expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(initial);
 await page.locator('public-courses').scrollIntoViewIfNeeded();await expect(page.locator('public-courses article')).toHaveCount(1);await expect(page.locator('public-courses article')).toContainText('NYC walk');
 await page.screenshot({path:testInfo.outputPath('courses-newyork-320.png'),fullPage:true});
 const courseCards=page.locator('home-courses article');
 const firstCard=await courseCards.nth(0).boundingBox();const secondCard=await courseCards.nth(1).boundingBox();const thirdCard=await courseCards.nth(2).boundingBox();
 expect(Math.abs(firstCard.y-secondCard.y)).toBeLessThan(1);expect(Math.abs(firstCard.y-thirdCard.y)).toBeLessThan(1);
 expect(thirdCard.x).toBeGreaterThan(secondCard.x);expect(thirdCard.x+thirdCard.width).toBeLessThanOrEqual(320);
 await expect(courseCards.locator('p')).toHaveCount(0);
 await page.setViewportSize({width:1280,height:900});
 await page.locator('home-courses h2').scrollIntoViewIfNeeded();
 expect((await courseCards.first().boundingBox()).width).toBeLessThanOrEqual(280);
 await page.screenshot({path:testInfo.outputPath('courses-newyork-compact-desktop.png'),fullPage:true});
 await page.setViewportSize({width:320,height:760});
 await page.locator('home-courses button[data-course=curated-newyork-2]').click();await expect(page).toHaveURL(/\/preference\/1$/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')));
 expect(draft.destination).toMatchObject({id:'newyork',country:'USA'});expect(draft.anchorSchedules).toHaveLength(2);
 expect(draft.anchorSchedules.map(stop=>stop.name)).toEqual(['메트로폴리탄 미술관','타임스 스퀘어']);
 await page.goto('/recommend');await page.locator('[data-recommend-country=USA]').click();await page.locator('[data-recommend-city=newyork]').click();
 await page.getByRole('button',{name:'꼭 갈 장소로 담기: 메트로폴리탄 미술관',exact:true}).click();
 await expect(page.getByRole('button',{name:'선택 해제: 메트로폴리탄 미술관',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>window.discoverySearch)).toMatchObject({language:'en',region:'us'});
 await selectPlace(page.locator('gmp-place-autocomplete'),'Times Square');await page.getByRole('button',{name:'꼭 갈 장소로 담기',exact:true}).click();
 expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')).anchorSchedules.at(-1).location.placeId)).toBe('Times Square');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);
});

test('globe wheel and native two-finger pinch zoom without scrolling, rotating or selecting a country',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/home');
 const globe=page.locator('.globe-stage svg'),ocean=globe.locator('circle');await expect(ocean).toHaveAttribute('r','128');
 const toggle=page.locator('.globe-stage .globe-auto');await expect(toggle).toHaveAttribute('aria-pressed','true');
 expect(await toggle.evaluate(element=>{const style=getComputedStyle(element);return [style.right,style.bottom,style.borderWidth,style.backgroundColor]})).toEqual(['0px','0px','0px','rgba(0, 0, 0, 0)']);
 await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','true');
 const radius=()=>ocean.evaluate(element=>Number(element.getAttribute('r')));
 const box=await globe.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 const scroll=()=>page.locator('ion-content:visible').evaluate(async element=>(await element.getScrollElement()).scrollTop);
 const beforeScroll=await scroll();await page.mouse.move(x,y);await page.mouse.wheel(0,-200);
 await expect.poll(radius).toBeGreaterThan(128);expect(await scroll()).toBe(beforeScroll);
 await page.mouse.wheel(0,200);await expect.poll(async()=>Math.abs(await radius()-128)).toBeLessThan(.01);
 await page.mouse.wheel(0,-10000);await expect.poll(radius).toBe(512);
 await page.mouse.wheel(0,10000);await page.mouse.wheel(0,10000);await expect.poll(radius).toBe(83.2);
 await globe.focus();await page.keyboard.press('+');await expect.poll(radius).toBeGreaterThan(83.2);
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const point=(id,dx)=>({id,x:x+dx,y});
 const rotation=await globe.locator('path[data-country=CHN]').getAttribute('d');const initial=await radius();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,-25),point(2,25)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,-65),point(2,65)]});
 await expect.poll(radius).toBeGreaterThan(initial);
 await expect(globe.locator('path.globe-selected')).toHaveCount(0);
 // Pinch changes projected scale but must leave its orientation intact.
 const expanded=await radius();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,-25),point(2,25)]});
 await expect.poll(radius).toBeLessThan(expanded);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=>Math.abs(await radius()-initial)).toBeLessThan(.01);
 await expect(globe.locator('path[data-country=CHN]')).toHaveAttribute('d',rotation);
 await expect(globe.locator('path.globe-selected')).toHaveCount(0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,0)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,40)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(globe.locator('path[data-country=CHN]')).not.toHaveAttribute('d',rotation);
 await expect(globe.locator('path.globe-selected')).toHaveCount(0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,-25),point(2,25)]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await expect(globe.locator('path.globe-selected')).toHaveCount(0);
 await page.mouse.click(x,y);await expect(globe.locator('path.globe-selected')).toHaveCount(1);await cdp.detach();
});

test('recommend waits for country and city, scopes Korean landmarks, and reuses international place selection',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:760});await page.goto('/recommend');
 await expect(page.getByRole('heading',{name:'어느 나라로 떠날까요?'})).toBeVisible();
 await expect(page.locator('home-recommendations,gmp-place-autocomplete')).toHaveCount(0);
 const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await page.locator('[data-recommend-country=KOR]').click();
 await expect(page.getByRole('heading',{name:'어느 도시가 끌리나요?'})).toBeVisible();
 await expect(page.locator('[data-recommend-city]')).toHaveCount(6);
 await expect(page.locator('home-recommendations')).toHaveCount(0);
 await page.locator('[data-recommend-city=busan]').click();
 const rows=page.locator('.flow-place-row');await expect(rows).toHaveCount(6);
 await expect(page.locator('home-recommendations')).toHaveCount(0);
 await expect(page.locator('gmp-place-autocomplete')).toBeVisible();
 await expect(rows.locator('details[open]')).toHaveCount(0);
 await rows.first().locator('summary').click();await expect(rows.first().locator('p')).toBeVisible();
 await rows.first().locator('summary').click();await expect(rows.first().locator('p')).toBeHidden();
 await expect(page.getByRole('button',{name:'꼭 갈 장소로 담기: 감천문화마을',exact:true})).toBeVisible();
 await expect(rows).toContainText(['해운대해수욕장','동백섬','광안리해수욕장','감천문화마을','자갈치시장','태종대']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('recommend-busan-320.png'),fullPage:true});
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await expect(page.locator('home-recommendations')).toHaveCount(0);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await page.locator('[data-recommend-country=JPN]').click();
 await expect(page.locator('[data-recommend-city]')).toHaveCount(2);
 await page.locator('[data-recommend-city=tokyo]').click();
 await expect(page.locator('.flow-place-list')).toContainText('센소지');
 await expect(page.locator('home-recommendations')).toHaveCount(0);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await expect(page.locator('[data-recommend-city=kyoto]')).toBeVisible();
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await page.locator('[data-recommend-country=FRA]').click();await page.locator('[data-recommend-city=paris]').click();
 await expect(page.locator('.flow-place-list')).toContainText('루브르 박물관');
 expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
 await selectPlace(page.locator('#destination-search'),'Louvre');
 await page.getByRole('button',{name:'꼭 갈 장소로 담기',exact:true}).click();
 await expect(page.locator('.flow-place-chip')).toContainText('Louvre');
 await page.getByRole('button',{name:'선택한 장소 1개 · 다음',exact:true}).click();
 await expect(page).toHaveURL(/preference\/1$/);
 const selected=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')));
 expect(selected.destination.id).toBe('paris');expect(selected.destination.country).toBe('FRA');expect(selected.anchorSchedules[0].location.placeId).toBe('Louvre');
});

test('320px wizard restores destination, shifts stays, preserves overrides, reviews first and generates once',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:760});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 const themeButton=page.getByRole('button',{name:'다크 모드',exact:true});await expect(themeButton).toBeVisible();
 const themeBox=await themeButton.boundingBox();expect(themeBox.height).toBe(32);expect(themeBox.x).toBeGreaterThan(200);
 const createBox=await page.getByRole('button',{name:'일정 만들기',exact:true}).boundingBox();const tabBox=await page.locator('ion-tab-bar').boundingBox();expect(createBox.y+createBox.height).toBeLessThanOrEqual(tabBox.y);
 await page.screenshot({path:testInfo.outputPath('home-ko-light-320.png'),fullPage:true});
 await page.goto('/destination');
 await page.getByRole('button',{name:'프랑스',exact:true}).click();await page.reload();
 await expect(page.getByRole('heading',{name:'어느 도시가 끌리나요?'})).toBeVisible();
 await page.getByRole('button',{name:'파리',exact:true}).click();await page.getByRole('button',{name:'장소 선택 없이 다음',exact:true}).click();
 const preference=page.locator('preference-view:visible');await expect(preference.locator('#preference-destination')).toHaveText('파리');
 await preference.locator('#custom-date-input').fill('2030-10-17');await preference.locator('#custom-date-input').dispatchEvent('change');await preference.locator('[data-duration="4"]').click();
 await expect(page).toHaveURL(/preference\/1$/);await preference.locator('#next-step-btn').click();
 const style=page.locator('preference-view').filter({has:page.locator('#step2-container:visible')});await style.locator('#theme-grid [data-value=food]').click();await style.locator('#budget-grid [data-value=standard]').click();await style.locator('#submit-btn').click();
 const form=page.locator('travel-form:visible');await expect(form.locator('#trip-end-date')).toHaveValue('2030-10-20');
 await selectPlace(form.locator('#start-location'),'Paris Airport');await selectPlace(form.locator('#end-location'),'Paris Airport');
 await form.locator('#start-time').fill('09:00');await form.locator('#end-time').fill('18:00');
 await form.locator('#add-trip-stay').click();await selectPlace(form.locator('.stay-location').first(),'Hotel A');await form.locator('#add-trip-stay').click();await selectPlace(form.locator('.stay-location').last(),'Hotel B');
 await expect(form.locator('.stay-checkout').first()).toHaveValue('2030-10-19');await expect(form.locator('.stay-checkin').last()).toHaveValue('2030-10-19');
 await form.evaluate(element=>{const data=element.getFormData();data.dailyLocations=[1,2,3,4].map(day=>({day,startLocation:day===2?{placeId:'custom',displayName:'Manual luggage drop',formattedAddress:'Paris, France',lat:48.8,lng:2.3}:'',endLocation:''}));element.populateForm(data);});
 await form.locator('#reselect-date-btn').click();await expect(preference.locator('#step1-container')).toBeVisible();
 await preference.locator('#custom-date-input').fill('2030-10-20');await preference.locator('#custom-date-input').dispatchEvent('change');
 await preference.locator('#next-step-btn').click();await expect(page).toHaveURL(/plan$/);await expect(form).toBeVisible();
 await expect(form.locator('#trip-end-date')).toHaveValue('2030-10-23');await expect(form.locator('.stay-checkin').first()).toHaveValue('2030-10-20');
 await expect.poll(()=>form.evaluate(element=>element.getFormData().dailyLocations?.[1]?.startLocation?.placeId)).toBe('custom');
 await form.locator('button[type=submit].primary-btn').click();await expect(form.locator('#review-panel')).toBeVisible();
 expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);await page.screenshot({path:testInfo.outputPath('review-ko-light-320.png'),fullPage:true});
 await page.evaluate(()=>window.navigate('/home'));await expect(page.getByRole('alertdialog')).toContainText('이 창을 나가면 입력값이 삭제됩니다. 나가시겠습니까?');await page.getByRole('button',{name:'아니오',exact:true}).click();await expect(page).toHaveURL(/plan$/);await expect(form.locator('#review-panel')).toBeVisible();
 await form.locator('#final-generate').click();await expect(page).toHaveURL(/view$/);expect(await page.evaluate(()=>window.generationCalls)).toBe(1);
 expect(await page.evaluate(()=>window.generatedRequest.destination.country)).toBe('FRA');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('compasser.planner.v1')||'null'))).toBeNull();
});

test('fixed overlap is shown in review with correction for only the offending visit',async({page})=>{
 await page.goto('/destination');await page.evaluate(async(location)=>{const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');plannerDraftStore.save({destination:{id:'paris',country:'FRA',name:'Paris, France'},date:['2030-10-17'],stays:[],startLocation:location,endLocation:location,startTime:'09:00',endTime:'18:00',anchorSchedules:[{name:'First',day:1,time:'10:00',endTime:'11:00',location},{name:'Second',day:1,time:'10:30',endTime:'12:00',location}]});},place);
 await page.goto('/plan');const form=page.locator('travel-form:visible');await form.locator('button[type=submit].primary-btn').click();await form.locator('#final-generate').click();
 await expect(form.locator('#review-issues')).toContainText('겹칩니다');expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
 await form.locator('#review-issues').getByRole('button',{name:'자동 배치로 변경'}).click();
 expect(await form.evaluate(element=>element.getFormData().anchorSchedules.map(a=>!!a.flexible))).toEqual([false,true]);
});

test('online own trip stays editable, undo is per day, and only changed day is recalculated',async({page})=>{
 await page.setViewportSize({width:1100,height:850});await page.goto('/profile/trips');
 const profile=page.locator('profile-view[data-active]');await profile.locator('.btn-offline').click();await profile.locator('.btn-view').click();
 const view=page.locator('itinerary-view:visible');await expect(view.locator('#timeline-container')).toContainText('Museum 1');await expect(view.locator('#recalculate-times-btn')).toBeDisabled();
 await view.evaluate(element=>{void element.handleItemEdit('remove',1);});
 await page.locator('#app-confirm-host .confirm-ok').click();await expect(view.locator('#undo-deletion-btn')).toBeVisible();await expect(view.locator('#recalculate-times-btn')).toBeEnabled();
 await view.evaluate(element=>element.selectDay(1));await expect(view.locator('#undo-deletion-btn')).toBeHidden();await expect(view.locator('#recalculate-times-btn')).toBeDisabled();
 await view.evaluate(element=>element.selectDay(0));await view.locator('#undo-deletion-btn').click();await expect(view.locator('#timeline-container')).toContainText('Museum 1');
 await page.evaluate(()=>{window.mapDays=[]});await view.locator('#recalculate-times-btn').click();await expect(view.locator('#recalculate-times-btn')).toBeDisabled();expect(await page.evaluate(()=>window.mapDays.every(day=>day===0))).toBe(true);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,value:false});window.dispatchEvent(new Event('offline'))});
 await expect(page.locator('main.flow-page')).toContainText('Paris, France');await expect(page.locator('itinerary-view')).toHaveCount(0);await expect(page.locator('main.flow-page')).toContainText('인터넷');
});

test('saved trip edits update the same trip; the button shows unsaved and saved states',async({page})=>{
 await page.setViewportSize({width:1100,height:850});await page.goto('/profile/trips');
 const profile=page.locator('profile-view[data-active]');await profile.locator('.btn-offline').click();await profile.locator('.btn-view').click();
 const view=page.locator('itinerary-view:visible');const save=view.locator('#save-itinerary-btn');
 await expect(view.locator('#timeline-container')).toContainText('Museum 1');await expect(save).toHaveText('저장됨');await expect(save).toBeDisabled();
 await view.evaluate(element=>{void element.handleItemEdit('remove',1);});await page.locator('#app-confirm-host .confirm-ok').click();
 await expect(save).toHaveText('변경 사항 저장');await expect(save).toBeEnabled();
 await page.reload();await expect(save).toHaveText('변경 사항 저장');
 await save.click();await expect(save).toHaveText('저장됨');await expect(save).toBeDisabled();await expect(page).toHaveURL(/view\/own123$/);
 const updates=await page.evaluate(()=>(window.updates||[]).map(update=>[update.id,update.plan.days[0].scheduleItems.map(item=>item.title)]));
 expect(updates).toHaveLength(1);expect(updates[0][0]).toBe('own123');expect(updates[0][1]).not.toContain('Museum 1');
 expect(await page.evaluate(()=>window.saves||0)).toBe(0);
 // The copy kept for offline reading shows the saved change.
 expect(await page.evaluate(()=>localStorage.getItem('compasser.offline.v1'))).not.toContain('Museum 1');
 await page.reload();await expect(save).toHaveText('저장됨');
});

test('saving a generated draft replaces it in history, so Back cannot reopen a copy that offers Save again',async({page})=>{
 const form=await openExitTestForm(page);
 await form.evaluate(el=>el.showReview());
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page).toHaveURL(/view$/);await expect(page.getByText('Museum 1').first()).toBeVisible();
 const save=page.locator('itinerary-view:visible #save-itinerary-btn');
 await expect(save).toHaveText('이 일정 저장하기');await save.click();
 await expect(page).toHaveURL(/view\/own123$/);await expect(save).toHaveText('저장됨');
 await page.locator('.ionic-result-back:visible').click();await expect(page).toHaveURL(/plan$/);await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await expect(form.locator('#review-panel')).toContainText('Booked visit');
 expect(await page.evaluate(()=>window.saves)).toBe(1);
});

test('switching language on a result re-renders the timeline without a new map request',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await page.goto('/profile/trips');
 const profile=page.locator('profile-view[data-active]');await profile.locator('.btn-offline').click();await profile.locator('.btn-view').click();
 const view=page.locator('itinerary-view:visible');await expect(view.locator('#day-tabs-container')).toContainText('1일차');
 await page.evaluate(()=>{window.mapDays=[]});
 await page.locator('.ionic-desktop-schedule').getByRole('button',{name:'English',exact:true}).click();
 await expect(view.locator('#day-tabs-container')).toContainText('Day 1');await expect(view.locator('#timeline-container')).not.toContainText('방문 시간 수정');
 expect(await page.evaluate(()=>window.mapDays.length)).toBe(0);
});

test('profile trips keep profile navigation; language is inside security; home is usable in English dark at 320px',async({page},testInfo)=>{
 await page.setViewportSize({width:320,height:760});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/profile/personal');
 const profile=page.locator('profile-view[data-active]');await profile.locator('.nav-item[data-tab=trips]').click();await expect(page).toHaveURL(/profile\/personal\?tab=trips$/);await expect(page.locator('ion-tab-button[tab=profile]')).toHaveClass(/tab-selected/);await expect(profile.locator('.sidebar')).toBeVisible();
 await page.locator('profile-view[data-active]').locator('.nav-item[data-tab=security]').click();await expect(page).toHaveURL(/profile\/security$/);await page.locator('profile-view #security.active #profile-language:visible').selectOption('en');
 await page.goto('/home');await expect(page.getByRole('button',{name:'Dark mode',exact:true})).toBeVisible();await page.getByRole('button',{name:'Dark mode',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('.globe-stage svg')).toHaveAttribute('width','320');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=320)).toBe(true);await page.screenshot({path:testInfo.outputPath('home-en-dark-320.png'),fullPage:true});
});

test('typed but unselected departure or arrival blocks generation until a search result is chosen',async({page})=>{
 await page.addInitScript(()=>{window.generationCalls=0});
 const form=await openExitTestForm(page,{startLocation:'',endLocation:'',anchorSchedules:[{name:'Booked visit',day:1,time:'12:00',endTime:'13:00',location:'Paris'}]});
 await selectPlace(form.locator('#start-location'),'Paris Airport');await selectPlace(form.locator('.anchor-location').first(),'Louvre');
 // Typing fires only input, never gmp-select: the text stays unverified, like "인천국제공항" resolving to a seaport.
 await form.locator('#end-location').evaluate(element=>{element.value='Airport Terminal 1';element.dispatchEvent(new Event('input',{bubbles:true}))});
 await form.locator('button[type=submit].primary-btn').click();
 await expect(form.locator('#review-issues')).toContainText('장소를 확인하지 못했습니다. 검색에서 다시 선택해 주세요.');await expect(form.locator('#final-generate')).toBeDisabled();
 expect(await page.evaluate(()=>window.generationCalls)).toBe(0);await expect(page).toHaveURL(/plan$/);
 await form.locator('#review-issues button').first().click();
 await selectPlace(form.locator('#end-location'),'Paris Airport');
 await form.locator('button[type=submit].primary-btn').click();await form.locator('#final-generate').click();
 await expect(page).toHaveURL(/view$/);expect(await page.evaluate(()=>window.generationCalls)).toBe(1);
});

test('profile security offers logout to a signed-in user, then hides it after signing out',async({page})=>{
 await page.goto('/profile/security');
 const logout=page.locator('profile-view[data-active] #security.active #btn-logout');
 await expect(logout).toBeVisible();await expect(logout).toHaveText('로그아웃');
 await logout.click();await expect(page).toHaveURL(/\/home$/);
 // The auth mock never re-notifies, so wait until profile is really inactive before returning to it.
 await expect(page.locator('profile-view[data-active]')).toHaveCount(0);
 await page.evaluate(()=>window.navigate('/profile/security'));
 await expect(page.locator('profile-view[data-active] #security.active')).toBeVisible();
 await expect(page.locator('profile-view[data-active] #btn-logout')).toBeHidden();
});

test('public course cards use three columns on desktop, stack on phones, with separate contained action buttons', async ({page}) => {
 await page.route('**/src/domains/itinerary/services/public-course-service.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function listPublicCourses(){return {courses:[1,2,3].map(n=>({id:'course'+n,title:'서울 산책 '+n,review:n===2?'다양한 장소를 둘러보고 즐기는 서울의 산책 코스입니다.':'' ,stops:[{name:'서울숲',location:'Seoul',stayMinutes:60}]})),hasMore:false}}export async function getPublicCourse(){return null}`}));
 await page.goto('/courses');await page.locator('[data-course-country=KOR]').click();await page.locator('[data-course-city=seoul]').click();
 const courses=page.locator('public-courses');await courses.scrollIntoViewIfNeeded();await expect(courses.locator('article')).toHaveCount(3);
 for(const width of [320,1280]) {
  await page.setViewportSize({width,height:900});
  const cards=await courses.locator('article').all();const first=await cards[0].boundingBox();
  const firstAction=await cards[0].locator('button[data-course]').boundingBox();
  for(const card of cards) {
   const box=await card.boundingBox();
   const buttons=card.locator(':scope > button');const make=await buttons.nth(0).boundingBox();const review=await buttons.nth(1).boundingBox();
   // Phones stack the cards so an opened review panel keeps the full width.
   if(width>600) {expect(Math.abs(box.y-first.y)).toBeLessThan(1);expect(Math.abs(make.y-firstAction.y)).toBeLessThan(1);}
   else {expect(Math.abs(box.x-first.x)).toBeLessThan(1);expect(box.width).toBeGreaterThan(width*0.8);}
   expect(review.y).toBeGreaterThanOrEqual(make.y+make.height+8);
   for(const action of [make,review]) {expect(action.x).toBeGreaterThanOrEqual(box.x);expect(action.x+action.width).toBeLessThanOrEqual(box.x+box.width);expect(action.height).toBeGreaterThanOrEqual(44);}
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('all catalogue countries and cities expose both places and three courses', async ({page}) => {
 const {destinations,destinationCountries}=await import('../../src/domains/planner/services/travel-destinations.mjs');
 await page.route('**/src/domains/itinerary/services/public-course-service.js',route=>route.fulfill({contentType:'text/javascript',body:`export async function listPublicCourses(){return {courses:[],hasMore:false}}export async function getPublicCourse(){return null}`}));
 await page.setViewportSize({width:390,height:844});
 for(const [path,kind] of [['/recommend','recommend'],['/courses','course']]) {
  await page.goto(path);await expect(page.locator(`[data-${kind}-country]`)).toHaveCount(destinationCountries.length);
  for(const country of destinationCountries) {
   const cities=destinations.filter(city=>city.country===country);
   await page.locator(`[data-${kind}-country=${country}]`).click();await expect(page.locator(`[data-${kind}-city]`)).toHaveCount(cities.length);
   for(const city of cities) {
    await page.locator(`[data-${kind}-city=${city.id}]`).click();
    if(kind==='course') {
     await expect(page.locator('home-courses article')).toHaveCount(3);
     for(const suffix of ['', '-2', '-3']) await expect(page.locator(`home-courses button[data-course=curated-${city.id}${suffix}]`)).toBeVisible();
    } else await expect(page.locator('.flow-place-row')).toHaveCount(city.places.length);
    await page.getByRole('button',{name:'← 뒤로',exact:true}).click();await expect(page.locator(`[data-${kind}-city=${city.id}]`)).toBeVisible();
   }
   await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
  }
 }
});

test('Japanese and French course cards switch names with the language and import English names', async ({page}, testInfo) => {
 for (const [country,city,korean,english] of [
  ['JPN','tokyo','센소지 → 도쿄 타워','Sensoji Temple → Tokyo Tower'],
  ['JPN','kyoto','기요미즈데라 → 후시미 이나리 신사','Kiyomizu-dera Temple → Fushimi Inari-taisha Shrine'],
  ['FRA','paris','에펠탑 → 루브르 박물관','Eiffel Tower → Louvre Museum'],
  ['FRA','nice','프롬나드 데 장글레 → 캐슬 힐','Promenade des Anglais → Castle Hill'],
 ]) {
  await page.goto('/courses');
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));
  await page.locator(`[data-course-country=${country}]`).click();await page.locator(`[data-course-city=${city}]`).click();
  const titles=page.locator('home-courses h3');await expect(titles).toHaveCount(3);await expect(titles.first()).toHaveText(korean);
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(titles.first()).toHaveText(english);
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));await expect(titles.first()).toHaveText(korean);
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));await expect(titles.first()).toHaveText(english);
 }
 await page.screenshot({path:testInfo.outputPath('nice-courses-english.png'),fullPage:true});
 await page.locator('home-courses button[data-course=curated-nice]').click();
 await expect(page).toHaveURL(/preference\/1$/);
 const draft=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')));
 expect(draft.anchorSchedules.slice(-2).map(stop=>stop.name)).toEqual(['Promenade des Anglais','Castle Hill']);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
 test(`cached tabs and result pages honor screen motion: ${reducedMotion}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(() => {
   window.routeMotions = [];
   const animate = Element.prototype.animate;
   Element.prototype.animate = function (frames, options) {
    if (options?.id === 'compasser-screen' && this.classList.contains('ion-page')) window.routeMotions.push(location.pathname);
    return animate.call(this, frames, options);
   };
  });
  await page.goto('/home');
  for (const [tab, path] of [['trips', '/profile/trips'], ['profile', '/profile/personal'], ['home', '/home']]) {
   await page.locator(`ion-tab-button[tab="${tab}"]`).click();
   await expect(page).toHaveURL(new RegExp(`${path}$`));
   if (reducedMotion === 'no-preference') await expect.poll(() => page.evaluate(() => window.routeMotions)).toContain(path);
  }
  await page.locator('ion-tab-button[tab=trips]').click();
  const profile = page.locator('profile-view[data-active]');
  await profile.locator('.btn-offline').click();
  await profile.locator('.btn-view').click();
  await expect(page.locator('itinerary-view:visible').first()).toBeVisible();
  if (reducedMotion === 'no-preference') await expect.poll(() => page.evaluate(() => window.routeMotions)).toContain('/view/own123');
  await page.goBack();
  await expect(page).toHaveURL(/\/profile\/trips$/);
  await page.locator('ion-tab-button[tab=home]').click();
  await expect(page).toHaveURL(/\/home$/);
  if (reducedMotion === 'no-preference') await expect.poll(() => page.evaluate(() => window.routeMotions.filter(path => path === '/home').length)).toBeGreaterThanOrEqual(3);
  else expect(await page.evaluate(() => window.routeMotions)).toEqual([]);
 });
}

 test('US cities show six localized landmarks, preserve selections and import local courses', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:maps.replace("displayName:request.textQuery.split(',')[0].split(' ').slice(0,2).join(' ')","displayName:'Griffith Observatory'").replace("formattedAddress:'Paris, France',location:{lat:48.85,lng:2.35}}]", "formattedAddress:request.textQuery,location:{lat:34.05,lng:-118.24}}]")}));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=USA]').click();
  await expect(page.locator('[data-recommend-city]')).toHaveCount(7);
  await page.screenshot({ path:testInfo.outputPath('us-cities-mobile.png'), animations:'disabled' });
  await page.locator('[data-recommend-city=losangeles]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await expect(page.locator('.flow-place-list')).toContainText('그리피스 천문대');
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(page.locator('.flow-place-list')).toContainText('Griffith Observatory');
  await page.locator('.flow-place-row button').first().click();
  await expect(page.locator('.flow-place-row button').first()).toHaveAttribute('aria-pressed','true');
  const picked = await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(picked.destination).toMatchObject({country:'USA',id:'losangeles'});
  expect(picked.anchorSchedules[0].name).toBe('Griffith Observatory');
  await page.screenshot({ path:testInfo.outputPath('losangeles-landmarks-english.png'), animations:'disabled', fullPage:true });
  await page.goto('/courses');
  await page.locator('[data-course-country=USA]').click();
  await expect(page.locator('[data-course-city]')).toHaveCount(7);
  await page.locator('[data-course-city=honolulu]').click();
  await expect(page.locator('home-courses article')).toHaveCount(3);
  await expect(page.locator('home-courses article').first()).toContainText('Waikiki Beach');
  await page.locator('home-courses button[data-course=curated-honolulu]').click();
  await expect(page).toHaveURL(/preference\/1$/);
  const imported=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(imported.destination).toMatchObject({country:'USA',id:'honolulu'});
  expect(imported.anchorSchedules.slice(-2).map(stop=>stop.name)).toEqual(['Waikiki Beach','Diamond Head State Monument']);
 });

 test('globe city selection opens its country rather than resuming a saved preference step', async ({ page }) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/home');
  await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.update({step:'/preference/2',country:'FRA',date:['2030-10-17']}));
  await page.locator('svg path[data-country=KOR]').click();
  await expect(page.locator('.globe-selection')).toContainText('대한민국');
  await page.locator('.globe-selection button').click();
  await expect(page).toHaveURL(/destination$/);
  await expect(page.getByRole('heading',{name:'어느 도시가 끌리나요?',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'서울',exact:true})).toBeVisible();
 });

async function openExitTestForm(page,extra={}) {
 await page.goto('/home');
 const draft={date:['2030-10-17','2030-10-18'],country:'FRA',destination:{id:'paris',country:'FRA',name:'Paris, France'},theme:'food',budget:'standard',startTime:'09:00',endTime:'18:00',startLocation:place,endLocation:place,anchorSchedules:[{name:'Booked visit',day:1,time:'12:00',endTime:'13:00',location:place}],stays:[],...extra};
 await page.evaluate(async draft=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.save(draft),draft);
 await page.evaluate(()=>window.navigate('/plan'));
 await expect(page.locator('travel-form #start-time')).toHaveValue(draft.startTime);
 return page.locator('travel-form');
}
async function expectEmptyPlanner(page) {
 const draft=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
 expect(draft.date).toEqual([]);expect(draft.anchorSchedules).toEqual([]);expect(draft.destination).toBeNull();expect(draft.startTime).toBe('');expect(draft.theme).toBeNull();expect(draft.budget).toBeNull();
}

test('plan exit No preserves typed values; Yes deletes the entire draft and cached form', async ({page},testInfo) => {
 const form=await openExitTestForm(page);
 await form.locator('#start-time').fill('10:30');
 const draft=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await page.evaluate(()=>window.navigate('/home'));
 const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('이 창을 나가면 입력값이 삭제됩니다. 나가시겠습니까?');
 await expect(dialog.getByRole('button',{name:'아니오',exact:true})).toBeFocused();
 await page.screenshot({path:testInfo.outputPath('plan-exit-confirmation.png'),fullPage:true});
 await dialog.getByRole('button',{name:'아니오',exact:true}).click();
 await expect(page).toHaveURL(/plan$/);await expect(form.locator('#start-time')).toHaveValue('10:30');
 expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(draft);
 await page.evaluate(()=>window.navigate('/home'));await dialog.getByRole('button',{name:'예',exact:true}).click();
 await expect(page).toHaveURL(/home$/);await expectEmptyPlanner(page);
 expect(await page.evaluate(()=>[sessionStorage.getItem('currentFormData'),sessionStorage.getItem('userPreference'),localStorage.getItem('compasser.planner.v1')])).toEqual([null,null,null]);
 await expect(form.locator('#start-time')).toHaveValue('');await expect(form.locator('.anchor-item')).toHaveCount(0);
 await page.reload();await expectEmptyPlanner(page);
});

test('browser Back from plan restores the URL on No and leaves cleanly on Yes', async ({page}) => {
 const form=await openExitTestForm(page);
 await page.evaluate(()=>history.back());
 const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();await expect(page).toHaveURL(/plan$/);
 await dialog.getByRole('button',{name:'아니오',exact:true}).click();await expect(form.locator('#start-time')).toHaveValue('09:00');
 await page.evaluate(()=>history.back());await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'예',exact:true}).click();
 await expect(page).toHaveURL(/home$/);await expectEmptyPlanner(page);
 await page.goForward();await expect(page).toHaveURL(/plan$/);await expect(form.locator('#start-time')).toHaveValue('');await expectEmptyPlanner(page);
});

test('plan back button requests confirmation; Escape keeps inputs', async ({page}) => {
 const form=await openExitTestForm(page);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page).toHaveURL(/plan$/);
 await expect(form.locator('#start-time')).toHaveValue('09:00');
});

for (const reducedMotion of ['no-preference', 'reduce']) {
 test(`plan destination edit preserves every input and cached return: motion=${reducedMotion}`, async ({page}) => {
  await page.emulateMedia({reducedMotion});
  const form=await openExitTestForm(page);
  await form.evaluate(async element=>{
   const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
   element.populateForm(plannerDraftStore.update({stays:[{location:'Paris Hotel',checkin:'2030-10-17',checkout:'2030-10-18'}],
    dailyLocations:[{day:1,startLocation:'Paris Station',endLocation:''},{day:2,startLocation:'',endLocation:'Paris Airport'}]}));
  });
  await form.locator('#start-time').fill('10:30');
  await selectPlace(form.locator('#start-location'),'First departure');
  await selectPlace(form.locator('#end-location'),'Final arrival');
  const before=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  await form.locator('#change-trip-destination').click();await expect(page).toHaveURL(/destination$/);
  await expect(page.getByRole('heading',{name:'꼭 갈 장소',exact:true})).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual(before);
  await page.goBack();await expect(page).toHaveURL(/plan$/);await expect(form).toBeVisible();await expect(form.locator('#start-time')).toHaveValue('10:30');
  await form.locator('#change-trip-destination').click();await expect(page).toHaveURL(/destination$/);
  await expect(page.getByRole('heading',{name:'꼭 갈 장소',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
  await page.getByRole('button',{name:'니스',exact:true}).click();
  await page.locator('.flow-primary').click();await expect(page).toHaveURL(/plan$/);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const after=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  expect(after).toEqual({...before,country:'FRA',destinationStage:'places',destination:{id:'nice',country:'FRA',name:'Nice, France'},step:'/plan'});
  await expect(form.locator('#trip-destination')).toHaveValue('프랑스 / 니스');
  await expect(form.locator('#start-time')).toHaveValue('10:30');
  await expect(form.locator('#start-location input')).toHaveValue('First departure');
  await expect(form.locator('#end-location input')).toHaveValue('Final arrival');
  await expect(form.locator('.anchor-item')).toHaveCount(1);
  expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
  await page.evaluate(()=>window.navigate('/home'));await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page).toHaveURL(/plan$/);
 });
}

test('plan country/city and read-only dates align; stay deletion preserves other inputs', async ({page},testInfo) => {
 const form=await openExitTestForm(page);
 await form.evaluate(async element=>{
  const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
  element.populateForm(plannerDraftStore.update({date:['2030-10-17','2030-10-18','2030-10-19'],
   stays:[{location:'Hotel A',checkin:'2030-10-17',checkout:'2030-10-18'},{location:'Hotel B',checkin:'2030-10-18',checkout:'2030-10-19'}]}));
 });
 const before=await form.evaluate(element=>element.getFormData());
 for(const width of [320,390,1280]) {
  await page.setViewportSize({width,height:1000});
  for(const lang of ['ko','en']) {
   await page.evaluate(async lang=>(await import('/src/utils/i18n.js')).setLang(lang),lang);
   await expect(form.locator('#trip-destination')).toHaveValue(lang==='ko'?'프랑스 / 파리':'France / Paris');
   for(const [id,date] of [['schedule-date','2030-10-17'],['trip-end-date','2030-10-19']]) {
    await expect(form.locator(`#${id}`)).toHaveValue(date);
    await expect(form.locator(`#${id}`)).toHaveAttribute('type','text');
    expect(await form.locator(`#${id}`).evaluate(input=>input.readOnly)).toBe(true);
   }
   const start=await form.locator('#schedule-date').boundingBox(),end=await form.locator('#trip-end-date').boundingBox();
   expect(Math.abs(start.y-end.y)).toBeLessThan(1);expect(start.x+start.width).toBeLessThan(end.x);
   expect(end.x+end.width).toBeLessThanOrEqual(width);
   const remove=form.locator('.trip-stay').first().getByRole('button',{name:lang==='ko'?'삭제':'Delete',exact:true});
   await expect(remove).toBeVisible();
   const button=await remove.boundingBox(),location=await form.locator('.stay-location').first().boundingBox();
   expect(button.y+button.height).toBeLessThanOrEqual(location.y);expect(button.height).toBeGreaterThanOrEqual(44);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
   if(lang==='ko')await page.screenshot({path:testInfo.outputPath(`plan-dates-stays-${width}.png`),fullPage:true});
  }
 }
 await form.locator('#daily-times-wrapper label').click();await expect(form.locator('#daily-times-toggle')).toBeChecked();
 await expect(form.locator('.daily-time-row')).toHaveCount(3);
 const toggleBox=await form.locator('#daily-times-wrapper').boundingBox(),dailyBox=await form.locator('#daily-times-accordion').boundingBox();
 expect(dailyBox.y).toBeGreaterThanOrEqual(toggleBox.y+toggleBox.height);
 const datesBox=await form.locator('#schedule-date').boundingBox(),lastDateBox=await form.locator('#trip-end-date').boundingBox();
 expect(dailyBox.width).toBeCloseTo(lastDateBox.x+lastDateBox.width-datesBox.x,0);
 await form.locator('#daily-times-toggle').focus();await form.locator('#daily-times-toggle').press('Space');
 await expect(form.locator('#daily-times-toggle')).not.toBeChecked();
 expect(await form.evaluate(element=>element.getFormData())).toEqual(before);
 await form.locator('.trip-stay').first().getByRole('button',{name:'Delete',exact:true}).click();
 await expect(form.locator('.trip-stay')).toHaveCount(1);
 expect(await form.evaluate(element=>element.getFormData())).toEqual({...before,stays:[before.stays[1]],overnightLocations:['',before.overnightLocations[1]]});
 await form.evaluate(async element=>{
  const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
  element.populateForm(plannerDraftStore.update({country:'KOR',destination:{id:'seoul',country:'KOR',name:'Seoul, South Korea'}}));
 });
 await expect(form.locator('#trip-destination')).toHaveValue('South Korea / Seoul');
 await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));
 await expect(form.locator('#trip-destination')).toHaveValue('대한민국 / 서울');
 await form.evaluate(element=>element.showReview());await expect(form.locator('#review-panel')).toContainText('대한민국 / 서울');
 await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
 await expect(form.locator('#review-panel')).toContainText('South Korea / Seoul');
});

test('plan destination action and endpoints align on desktop and fit on mobile', async ({page},testInfo) => {
 const form=await openExitTestForm(page);
 for (const width of [390,1280]) {
  await page.setViewportSize({width,height:1000});
  for (const lang of ['ko','en']) {
   await page.evaluate(async lang=>(await import('/src/utils/i18n.js')).setLang(lang),lang);
   const bounds=await form.evaluate(element=>{
    const root=element.shadowRoot;
    const box=selector=>{const {x,y,width,height}=root.querySelector(selector).getBoundingClientRect();return {x,y,width,height}};
    return {destinationLabel:box('label[for="trip-destination"]'),button:box('#change-trip-destination'),destination:box('#trip-destination'),
     startLabel:box('label[for="start-location"]'),endLabel:box('label[for="end-location"]'),start:box('#start-location'),end:box('#end-location')};
   });
   expect(bounds.button.y+bounds.button.height).toBeLessThanOrEqual(bounds.destination.y);
   expect(Math.abs(bounds.button.y+bounds.button.height/2-bounds.destinationLabel.y-bounds.destinationLabel.height/2)).toBeLessThan(1);
   expect(bounds.button.x+bounds.button.width).toBeLessThanOrEqual(width);
   expect(bounds.start.height).toBe(bounds.end.height);
   if(width===1280) {
    expect(Math.abs(bounds.start.y-bounds.end.y)).toBeLessThan(1);
    expect(Math.abs(bounds.startLabel.y-bounds.endLabel.y)).toBeLessThan(1);
   }
   if(lang==='ko') await page.screenshot({path:testInfo.outputPath(`plan-fields-${width}.png`),fullPage:true});
  }
 }
});

for (const entry of ['form', 'review']) {
 test(`plan theme and budget edit preserves inputs through cached return and skip: entry=${entry}`, async ({page}) => {
  await page.emulateMedia({reducedMotion:entry==='review'?'reduce':'no-preference'});
  const form=await openExitTestForm(page);
  await form.evaluate(async element=>{
   const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
   element.populateForm(plannerDraftStore.update({stays:[{location:'Paris Hotel',checkin:'2030-10-17',checkout:'2030-10-18'}],
    dailyLocations:[{day:1,startLocation:'Paris Station',endLocation:''},{day:2,startLocation:'',endLocation:'Paris Airport'}]}));
  });
  await form.locator('#start-time').fill('10:30');
  await selectPlace(form.locator('#start-location'),'First departure');
  await selectPlace(form.locator('#end-location'),'Final arrival');
  const before=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  if(entry==='review') {await form.evaluate(element=>element.showReview());await form.locator('[data-review-edit=style]').click();}
  else await form.locator('#reselect-preference-btn').click();
  await expect(page).toHaveURL(/preference\/2$/);
  const preference=page.locator('preference-view:visible');
  await expect(preference.locator('#step2-container')).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual({...before,step:'/preference/2'});
  await page.goBack();await expect(page).toHaveURL(/plan$/);await expect(form.locator('#travel-form')).toBeVisible();
  await expect(form.locator('#start-time')).toHaveValue('10:30');
  await form.locator('#reselect-preference-btn').click();await expect(preference.locator('#step2-container')).toBeVisible();
  await preference.locator('#theme-grid [data-value=healing]').click();
  await preference.locator('#budget-grid [data-value=flex]').click();
  await preference.locator('#submit-btn').click();await expect(page).toHaveURL(/plan$/);
  await expect(form.locator('#travel-form')).toBeVisible();
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual({...before,theme:'healing',budget:'flex',step:'/plan'});
  await expect(form.locator('#start-location input')).toHaveValue('First departure');
  await expect(form.locator('#end-location input')).toHaveValue('Final arrival');
  await expect(form.locator('.anchor-item')).toHaveCount(1);
  await form.locator('#reselect-preference-btn').click();await expect(preference.locator('#step2-container')).toBeVisible();
  await expect(preference.locator('#theme-grid [data-value=healing]')).toHaveAttribute('aria-pressed','true');
  await expect(preference.locator('#budget-grid [data-value=flex]')).toHaveAttribute('aria-pressed','true');
  await preference.locator('#skip-btn').click();await expect(page).toHaveURL(/plan$/);
  await expect(form.locator('#travel-form')).toBeVisible();
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual({...before,theme:null,budget:null,step:'/plan'});
  expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
 });
}

test('reload dismissal keeps the plan; accepted reload clears recovery copies', async ({page}) => {
 const form=await openExitTestForm(page);await form.locator('#start-time').fill('11:00');
 const dismissed=page.waitForEvent('dialog');const cancelledReload=page.reload({timeout:3000}).catch(()=>{});const first=await dismissed;expect(first.type()).toBe('beforeunload');await first.dismiss();await cancelledReload;
 await expect(form.locator('#start-time')).toHaveValue('11:00');
 const accepted=page.waitForEvent('dialog');const reload=page.reload();const second=await accepted;await second.accept();await reload;
 await expect(page.locator('travel-form #start-time')).toHaveValue('');await expectEmptyPlanner(page);
});

for (const reducedMotion of ['no-preference','reduce']) {
 test(`plan date edit applies dates directly without losing inputs: motion=${reducedMotion}`, async ({page}) => {
  await page.emulateMedia({reducedMotion});
  const form=await openExitTestForm(page);
  await form.evaluate(async element=>{
   const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');
   element.populateForm(plannerDraftStore.update({stays:[{location:'Paris Hotel',checkin:'2030-10-17',checkout:'2030-10-18'}],
    dailyLocations:[{day:1,startLocation:'Paris Station',endLocation:''},{day:2,startLocation:'',endLocation:'Paris Airport'}]}));
  });
  await form.locator('#start-time').fill('10:30');
  await selectPlace(form.locator('#start-location'),'First departure');
  await selectPlace(form.locator('#end-location'),'Final arrival');
  const before=await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  await form.locator('#reselect-date-btn').click();await expect(page).toHaveURL(/preference\/1$/);
  const preference=page.locator('preference-view:visible');
  await expect(preference.locator('#step1-container')).toBeVisible();await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(preference.locator('#next-step-btn')).toHaveText('날짜 적용하기');
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual({...before,step:'/preference/1'});
  await preference.locator('#custom-date-input').fill('2030-10-20');await preference.locator('#custom-date-input').dispatchEvent('change');
  await preference.locator('#next-step-btn').click();await expect(page).toHaveURL(/plan$/);
  await expect(form.locator('#travel-form')).toBeVisible();await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).toEqual({...before,
   date:['2030-10-20','2030-10-21'],stays:[{location:'Paris Hotel',checkin:'2030-10-20',checkout:'2030-10-21'}],step:'/plan'});
  await expect(form.locator('#schedule-date')).toHaveValue('2030-10-20');await expect(form.locator('#trip-end-date')).toHaveValue('2030-10-21');
  await expect(form.locator('#start-location input')).toHaveValue('First departure');await expect(form.locator('#end-location input')).toHaveValue('Final arrival');
  await expect(form.locator('.anchor-item')).toHaveCount(1);
  await form.locator('#reselect-date-btn').click();await expect(preference.locator('#step1-container')).toBeVisible();
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(preference.locator('#next-step-btn')).toHaveText('Apply dates');
  await preference.locator('#next-step-btn').click();await expect(page).toHaveURL(/plan$/);await expect(form.locator('#travel-form')).toBeVisible();
  // The cached date page must restore normal creation mode on an ordinary visit.
  await page.evaluate(()=>window.navigate('/home'));await page.getByRole('alertdialog').getByRole('button',{name:'Yes',exact:true}).click();await expect(page).toHaveURL(/home$/);
  await page.evaluate(async()=>{(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.save({date:['2030-10-22']});window.navigate('/preference/1');});
  await expect(preference.locator('#next-step-btn')).toHaveText('Choose your travel theme');
  await preference.locator('#next-step-btn').click();await expect(page).toHaveURL(/preference\/2$/);
  expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
 });
}

test('date edit warns on page Back, browser Back, reload and tab close; cancelling preserves inputs', async ({page}) => {
 const form=await openExitTestForm(page);
 await form.locator('#reselect-date-btn').click();await expect(page.locator('preference-view:visible #step1-container')).toBeVisible();
 const before=await page.evaluate(()=>sessionStorage.getItem('currentFormData'));
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 const dialog=page.getByRole('alertdialog');await expect(dialog).toContainText('이 창을 나가면 입력값이 삭제됩니다. 나가시겠습니까?');
 await dialog.getByRole('button',{name:'아니오',exact:true}).click();await expect(page).toHaveURL(/preference\/1$/);
 await page.evaluate(()=>history.back());await expect(dialog).toBeVisible();await expect(page).toHaveURL(/preference\/1$/);await page.keyboard.press('Escape');
 const closing=page.waitForEvent('dialog');await page.close({runBeforeUnload:true});const closeDialog=await closing;expect(closeDialog.type()).toBe('beforeunload');await closeDialog.dismiss();
 expect(page.isClosed()).toBe(false);
 const reloading=page.waitForEvent('dialog');const reload=page.reload({timeout:3000}).catch(()=>{});const reloadDialog=await reloading;expect(reloadDialog.type()).toBe('beforeunload');await reloadDialog.dismiss();await reload;
 expect(await page.evaluate(()=>sessionStorage.getItem('currentFormData'))).toBe(before);
 await page.evaluate(()=>history.back());await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'예',exact:true}).click();
 await expect(page).toHaveURL(/plan$/);await expect(form.locator('#start-time')).toHaveValue('');await expectEmptyPlanner(page);
});

test('accepted reload from date edit clears recovery inputs', async ({page}) => {
 const form=await openExitTestForm(page);
 await form.locator('#reselect-date-btn').click();await expect(page.locator('preference-view:visible #step1-container')).toBeVisible();
 const accepted=page.waitForEvent('dialog');const reload=page.reload();const dialog=await accepted;expect(dialog.type()).toBe('beforeunload');await dialog.accept();await reload;
 await expectEmptyPlanner(page);await expect(page.locator('preference-view:visible #next-step-btn')).toBeDisabled();
});

test('date edit action precedes theme edit and both fit in Korean and English', async ({page},testInfo) => {
 await page.emulateMedia({reducedMotion:'reduce'});
 const form=await openExitTestForm(page);
 for(const width of [390,1280]) {
  await page.setViewportSize({width,height:1000});
  for(const lang of ['ko','en']) {
   await page.evaluate(async lang=>(await import('/src/utils/i18n.js')).setLang(lang),lang);
   const date=form.locator('#reselect-date-btn');const theme=form.locator('#reselect-preference-btn');
   await expect(date).toHaveText(lang==='ko'?'여행날짜 다시 설정하기':'Change travel dates');
   const a=await date.boundingBox(),b=await theme.boundingBox();
   expect(a.x+a.width).toBeLessThanOrEqual(width);expect(b.x+b.width).toBeLessThanOrEqual(width);
   expect(a.y).toBeLessThanOrEqual(b.y+1);
   if(width===1280) {expect(Math.abs(a.y-b.y)).toBeLessThan(1);expect(a.x+a.width).toBeLessThan(b.x);}
   if(lang==='ko')await page.screenshot({path:testInfo.outputPath(`plan-date-edit-${width}.png`),fullPage:true});
  }
 }
});

const slowGeneration=`export const getGenerationCredits=async()=>3;export const generateOptimizedItinerary=(request,{onStage}={})=>new Promise(resolve=>{window.generationCalls=(window.generationCalls||0)+1;window.stage=onStage;window.releaseGeneration=()=>resolve({...${JSON.stringify(trip.itineraryPlan)},request})})`;
async function startGeneration(page,form) {
 await form.evaluate(el=>el.showReview());
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page.getByRole('heading',{name:'여행 동선을 만들고 있습니다',exact:true})).toBeVisible();
}

test('generation shows which stage is running and how long it can take', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:slowGeneration}));
 const form=await openExitTestForm(page);await startGeneration(page,form);
 const steps=page.locator('.ionic-generation-steps li');
 await expect(steps).toHaveText(['일정 초안 만들기','장소 확인','이동시간 계산']);
 await expect(steps.nth(0)).toHaveAttribute('aria-current','step');
 await page.evaluate(()=>window.stage('places'));
 await expect(steps.nth(1)).toHaveAttribute('aria-current','step');await expect(steps.nth(0)).not.toHaveAttribute('aria-current','step');
 // Screen readers hear the stage as text in the status region; the list itself is visual.
 await expect(page.locator('.ionic-generation .ionic-visually-hidden')).toHaveText('장소 확인');
 await page.evaluate(()=>window.stage('routes'));await expect(steps.nth(2)).toHaveAttribute('aria-current','step');
 await expect(page.locator('.ionic-generation')).toContainText('1분 넘게 걸릴 수도 있어요');
});

for (const back of ['button','history']) {
 test(`Back during generation asks to stop instead of deleting inputs: ${back}`, async ({page}) => {
  await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:slowGeneration}));
  const form=await openExitTestForm(page);await startGeneration(page,form);
  const goBack=()=>back==='button'?page.getByRole('button',{name:'← 뒤로',exact:true}).click():page.evaluate(()=>history.back());
  await goBack();const dialog=page.getByRole('alertdialog');
  await expect(dialog).toContainText('일정 만들기를 멈출까요?');await expect(dialog).not.toContainText('삭제');await expect(page).toHaveURL(/plan$/);
  await dialog.getByRole('button',{name:'계속 기다리기',exact:true}).click();
  await expect(page.getByRole('heading',{name:'여행 동선을 만들고 있습니다',exact:true})).toBeVisible();
  await goBack();await page.getByRole('alertdialog').getByRole('button',{name:'멈추기',exact:true}).click();
  await expect(form.locator('#review-panel')).toBeVisible();await expect(form.locator('#review-panel')).toContainText('Booked visit');
  await page.evaluate(()=>window.releaseGeneration());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,200)));
  await expect(page).toHaveURL(/plan$/);await expect(form.locator('#review-panel')).toBeVisible();
  // The usual exit question is back once nothing is generating.
  await page.evaluate(()=>window.navigate('/home'));await expect(page.getByRole('alertdialog')).toContainText('이 창을 나가면 입력값이 삭제됩니다');
  await page.getByRole('button',{name:'예',exact:true}).click();await expect(page).toHaveURL(/home$/);await expectEmptyPlanner(page);
 });
}

test('a stopped generation ignores its late result even after leaving the planner', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:slowGeneration}));
 const form=await openExitTestForm(page);await startGeneration(page,form);
 await page.evaluate(()=>window.navigate('/home'));await page.getByRole('alertdialog').getByRole('button',{name:'멈추기',exact:true}).click();
 await expect(form.locator('#review-panel')).toBeVisible();
 await page.evaluate(()=>window.navigate('/home'));await page.getByRole('button',{name:'예',exact:true}).click();await expect(page).toHaveURL(/home$/);
 await page.evaluate(()=>window.releaseGeneration());await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,200)));
 await expect(page).toHaveURL(/home$/);await expectEmptyPlanner(page);
});

test('the stop question leaves out credits for an unlimited account', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:slowGeneration.replace('getGenerationCredits=async()=>3','getGenerationCredits=async()=>"unlimited"')}));
 const form=await openExitTestForm(page);await expect(form.locator('#travel-form > .credit-balance')).toContainText('무제한');await startGeneration(page,form);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();
 await expect(page.getByRole('alertdialog')).toContainText('입력한 내용은 그대로 남아요');await expect(page.getByRole('alertdialog')).not.toContainText('생성권');
});

test('a result that arrives while the stop question is open still opens it', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:slowGeneration}));
 const form=await openExitTestForm(page);await startGeneration(page,form);
 await page.getByRole('button',{name:'← 뒤로',exact:true}).click();await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.evaluate(()=>window.releaseGeneration());
 await expect(page).toHaveURL(/view$/);await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('an AI failure offers 다시 시도 with the same request and keeps the inputs', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:`export const getGenerationCredits=async()=>3;export async function generateOptimizedItinerary(request){window.generationRequests=(window.generationRequests||[]).concat([request]);if(window.generationRequests.length===1)throw Object.assign(new Error('AI가 일정을 만들지 못했어요.'),{retryable:true});return {...${JSON.stringify(trip.itineraryPlan)},request}}`}));
 const form=await openExitTestForm(page);
 await form.evaluate(el=>el.showReview());
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page.getByRole('heading',{name:'일정을 만들지 못했습니다',exact:true})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'AI가 일정을 만들지 못했어요.'})).toBeVisible();await expect(page).toHaveURL(/plan$/);
 expect(await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read().anchorSchedules[0].name)).toBe('Booked visit');
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await expect(page).toHaveURL(/view$/);
 const requests=await page.evaluate(()=>window.generationRequests);expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);
});

test('the review lists every blocking field at once and keeps 일정 생성하기 off until they are fixed', async ({page}) => {
 const form=await openExitTestForm(page,{startTime:'',endTime:'',startLocation:'',endLocation:'',anchorSchedules:[{name:'Booked visit',day:1,time:'12:00',endTime:'',location:place}]});
 await form.locator('button[type=submit].primary-btn').click();
 const review=form.locator('#review-panel'),issues=review.locator('#review-issues');
 await expect(review).toContainText('시간 미입력 – 시간 미입력');
 await expect(issues.locator('p')).toHaveCount(5);await expect(issues.getByRole('button',{name:'수정',exact:true})).toHaveCount(5);
 for (const text of ['시작 시간','종료 시간','출발지','도착지','1번째 고정 일정']) await expect(issues).toContainText(text);
 await expect(review.locator('#final-generate')).toBeDisabled();
 await issues.getByRole('button',{name:'수정',exact:true}).nth(3).click();
 await expect(form.locator('#travel-form')).toBeVisible();await expect(form.locator('#end-location')).toHaveAttribute('aria-invalid','true');
 await form.locator('#start-time').fill('18:00');await form.locator('#end-time').fill('09:00');
 await selectPlace(form.locator('#start-location'),'Paris Airport');await selectPlace(form.locator('#end-location'),'Paris Airport');
 await form.locator('.anchor-end-time').first().fill('13:00');
 await form.locator('button[type=submit].primary-btn').click();
 await expect(issues.locator('p')).toHaveCount(1);await expect(issues).toContainText('종료 시간은 시작 시간보다 늦어야');await expect(review.locator('#final-generate')).toBeDisabled();
 await issues.getByRole('button',{name:'수정',exact:true}).click();
 await form.locator('#start-time').fill('09:00');await form.locator('#end-time').fill('18:00');
 await form.locator('button[type=submit].primary-btn').click();
 await expect(issues).toBeHidden();await expect(review.locator('#final-generate')).toBeEnabled();
 await review.locator('#final-generate').click();await expect(page).toHaveURL(/view$/);expect(await page.evaluate(()=>window.generationCalls)).toBe(1);
});

test('the review offers automatic placement for a visit without times, and lists a stay past the trip once', async ({page}) => {
 const form=await openExitTestForm(page,{anchorSchedules:[{name:'Booked visit',day:1,time:'',endTime:'',location:place}],stays:[{location:place,checkin:'2030-10-17',checkout:'2030-10-19'}]});
 await form.locator('button[type=submit].primary-btn').click();
 const issues=form.locator('#review-issues');
 await expect(issues.locator('p')).toHaveCount(2);await expect(issues).toContainText('숙박 날짜');await expect(issues.locator('p').first()).not.toHaveText(/^:/);
 await issues.getByRole('button',{name:'자동 배치로 변경',exact:true}).click();
 await expect(issues.locator('p')).toHaveCount(1);
 await issues.getByRole('button',{name:'수정',exact:true}).click();await expect(form.locator('.trip-stay .stay-checkin').first()).toHaveAttribute('aria-invalid','true');
});

test('a flight airport picked after its time fills the locked first departure', async ({page}) => {
 const form=await openExitTestForm(page,{date:['2030-10-17'],startLocation:''});
 await form.locator('#add-arrival-flight').click();await form.locator('#arrival-flight-time').fill('10:00');
 await selectPlace(form.locator('#arrival-flight-airport'),'Paris Airport');
 await expect.poll(()=>form.evaluate(element=>element.getFormData().startLocation?.placeId)).toBe('Paris Airport');
 await form.locator('button[type=submit].primary-btn').click();
 await expect(form.locator('#review-issues')).toBeHidden();await expect(form.locator('#final-generate')).toBeEnabled();
});

for (const [credits,shown,blocked] of [[0,'0장',true],['unlimited','무제한',false],['fail','확인 불가',false]]) {
 test(`credit balance leads the plan form and the review; only a known zero blocks generation: ${credits}`, async ({page}) => {
  await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:`export const getGenerationCredits=async()=>{if(${JSON.stringify(credits)}==='fail')throw new Error('offline');return ${JSON.stringify(credits)}};export async function generateOptimizedItinerary(request){window.generationCalls=(window.generationCalls||0)+1;return {...${JSON.stringify(trip.itineraryPlan)},request}}`}));
  const form=await openExitTestForm(page);
  const top=form.locator('#travel-form > .credit-balance');await expect(top).toContainText(shown);
  expect((await top.boundingBox()).y).toBeLessThan((await form.locator('#travel-form > .form-section').first().boundingBox()).y);
  await expect(top.locator('.credit-empty')).toBeVisible({visible:blocked});
  await form.evaluate(el=>el.showReview());
  const review=form.locator('#review-panel');await expect(review.locator('.credit-balance')).toContainText(shown);
  const generate=review.locator('#final-generate');
  if (blocked) {
   await expect(generate).toBeDisabled();await expect(review.locator('.credit-empty')).toBeVisible();
   await generate.click({force:true});expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
   await review.locator('[data-review-edit]').first().click();await expect(form.locator('#start-time')).toHaveValue('09:00');
  } else await expect(generate).toBeEnabled();
 });
}

test('a failed generation re-reads the credit balance, so the returned review blocks at zero', async ({page}) => {
 await page.route('**/src/domains/planner/services/gemini-optimizer.js',route=>route.fulfill({contentType:'text/javascript',body:`let balance=1;export const getGenerationCredits=async()=>balance;export async function generateOptimizedItinerary(){balance=0;throw new Error('남은 생성권이 없어 일정을 만들 수 없습니다.')}`}));
 const form=await openExitTestForm(page);await expect(form.locator('#travel-form > .credit-balance')).toContainText('1장');
 await form.evaluate(el=>el.showReview());
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page.getByRole('button',{name:'다시 시도'})).toHaveCount(0);await page.getByRole('button',{name:'입력으로 돌아가기'}).click();
 await expect(form.locator('#review-panel .credit-balance')).toContainText('0장');await expect(form.locator('#review-panel #final-generate')).toBeDisabled();
});

test('the plan form spreads untimed picks across the trip days and shows the opening-hours hint once', async ({page}) => {
 await page.goto('/home');
 await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.save({date:['2030-10-17','2030-10-18','2030-10-19'],country:'FRA',destination:{id:'paris',country:'FRA',name:'Paris, France'},theme:'food',budget:'standard',startTime:'09:00',endTime:'18:00',stays:[],anchorSchedules:['A','B','C','D','E'].map(name=>({name,location:'Paris',time:'',endTime:'',flexible:true,stayMinutes:60}))}));
 await page.evaluate(()=>window.navigate('/plan'));
 const form=page.locator('travel-form');await expect(form.locator('.anchor-day')).toHaveCount(5);
 // The days are spread just after the rows render; wait for the values, not only the row count.
 await expect.poll(()=>form.locator('.anchor-day').evaluateAll(selects=>selects.map(select=>select.value))).toEqual(['1','2','3','1','2']);
 await expect(form.locator('.anchor-flexible-hint:visible')).toHaveCount(1);
 await form.locator('.anchor-day').first().selectOption('3');await form.evaluate(el=>el.saveDraft());
 const days=async()=>(await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read())).anchorSchedules.map(anchor=>anchor.day);
 expect(await days()).toEqual([3,2,3,1,2]);
 // A day the user chose is kept when the form is filled from storage again (reloading /plan discards inputs by design).
 await form.evaluate(el=>el.refreshFromStorage());await expect(form.locator('.anchor-day')).toHaveCount(5);
 await expect.poll(()=>form.locator('.anchor-day').evaluateAll(selects=>selects.map(select=>select.value))).toEqual(['3','2','3','1','2']);
});

test('a night without a stay ends at a localized stay-unset label with no reviews or directions', async ({page}) => {
 const form=await openExitTestForm(page);
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page).toHaveURL(/view$/);
 const view=page.locator('itinerary-view:visible');await expect(view.locator('#timeline-container')).toContainText('숙소 미정 (파리 중심)');
 await expect(view.locator('#timeline-container')).not.toContainText('Paris, France');
 const arrival=view.locator('.schedule-card[data-type=arrival]');await expect(arrival).toHaveCount(1);
 await expect(arrival.locator('.nav-btn')).toHaveCount(0);await expect(arrival.locator('a.primary')).toHaveCount(0);
});

test('unsaved result Back asks first; No keeps the result, Yes returns to the review with every input', async ({page}) => {
 const form=await openExitTestForm(page);
 await form.evaluate(el=>el.showReview());
 await form.evaluate(el=>el.dispatchEvent(new CustomEvent('generate-itinerary',{detail:el.getFormData(),bubbles:true,composed:true})));
 await expect(page).toHaveURL(/view$/);await expect(page.getByText('Museum 1').first()).toBeVisible();await expectEmptyPlanner(page);
 const back=page.locator('.ionic-result-back:visible');const dialog=page.getByRole('alertdialog');
 await back.click();await expect(dialog).toContainText('이 일정은 아직 저장하지 않아 내 일정에 남지 않습니다.');
 await expect(dialog.getByRole('button',{name:'아니오',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(page).toHaveURL(/view$/);await expectEmptyPlanner(page);
 await back.click();await dialog.getByRole('button',{name:'아니오',exact:true}).click();await expect(page).toHaveURL(/view$/);
 await back.click();await dialog.getByRole('button',{name:'예',exact:true}).click();
 await expect(page).toHaveURL(/plan$/);await expect(dialog).toHaveCount(0);
 const review=form.locator('#review-panel');await expect(review).toBeVisible();
 await expect(review).toContainText('Booked visit');await expect(review).toContainText('09:00');
 const draft=await page.evaluate(async()=>(await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
 expect([draft.date,draft.theme,draft.budget,draft.destination?.id,draft.anchorSchedules.map(a=>a.name)]).toEqual([['2030-10-17','2030-10-18'],'food','standard','paris',['Booked visit']]);
});

test('saved trip Back leaves without asking', async ({page}) => {
 await page.goto('/profile/trips');
 const profile=page.locator('profile-view[data-active]');await profile.locator('.btn-offline').click();await profile.locator('.btn-view').click();
 await expect(page).toHaveURL(/view\/own123$/);
 await page.locator('.ionic-result-back:visible').click();
 await expect(page).toHaveURL(/profile\/trips$/);await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('flights fill and lock the first departure and last arrival; removing a flight unlocks it',async({page})=>{
 const open=async date=>{await page.goto('/destination');await page.evaluate(async date=>{const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');plannerDraftStore.save({destination:{id:'paris',country:'FRA',name:'Paris, France'},date,startLocation:'Paris Station',endLocation:'Paris Station',startTime:'09:00',endTime:'21:00',anchorSchedules:[]});},date);
  await page.goto('/plan');return page.locator('travel-form:visible');};
 const locked=(form,id)=>form.locator(`#${id}`).evaluate(element=>element.closest('.form-group').inert);
 let form=await open(['2030-10-17']);
 await expect(form.locator('#arrival-flight')).toBeHidden();expect(await locked(form,'start-location')).toBe(false);
 await form.locator('#add-arrival-flight').click();await selectPlace(form.locator('#arrival-flight-airport'),'Paris Airport');
 await form.locator('#arrival-flight-time').fill('10:00');await expect(form.locator('#start-time')).toHaveValue('11:00');
 await expect(form.locator('#add-arrival-flight')).toBeHidden();
 await expect(form.locator('#arrival-flight .flight-note')).toContainText('11:00');
 expect(await form.locator('#start-location').evaluate(element=>element.selectedPlace?.placeId)).toBe('Paris Airport');
 expect(await locked(form,'start-location')).toBe(true);await expect(form.locator('#start-location-lock')).toBeVisible();
 await form.locator('#add-departure-flight').click();await selectPlace(form.locator('#departure-flight-airport'),'Paris Airport');
 await form.locator('#departure-flight-time').fill('21:00');await expect(form.locator('#end-time')).toHaveValue('18:00');
 await form.locator('#departure-flight-kind').selectOption('domestic');await expect(form.locator('#end-time')).toHaveValue('19:30');
 await form.locator('#departure-flight-time').fill('01:00');await expect(form.locator('#end-time')).toHaveValue('19:30');
 await expect(form.locator('#departure-flight .flight-note')).toContainText('직접 입력');
 await form.locator('#departure-flight-time').fill('21:00');
 const flights=()=>form.evaluate(element=>{const {arrival,departure}=element.getFormData().flights;return [arrival&&[arrival.airport?.placeId,arrival.time,arrival.kind],departure&&[departure.airport?.placeId,departure.time,departure.kind]];});
 expect(await flights()).toEqual([['Paris Airport','10:00','international'],['Paris Airport','21:00','domestic']]);
 await form.evaluate(async element=>{const {plannerDraftStore}=await import('/src/domains/planner/services/planner-draft.mjs');element.populateForm(plannerDraftStore.read());});
 await expect(form.locator('#departure-flight-time')).toHaveValue('21:00');await expect(form.locator('#departure-flight-kind')).toHaveValue('domestic');
 expect(await locked(form,'end-location')).toBe(true);
 await form.locator('#arrival-flight .flight-remove').click();await expect(form.locator('#arrival-flight')).toBeHidden();
 expect(await locked(form,'start-location')).toBe(false);expect((await flights())[0]).toBeNull();
 await expect(form.locator('#add-arrival-flight')).toBeVisible();

 form=await open(['2030-10-17','2030-10-18']);
 await form.locator('#add-departure-flight').click();await selectPlace(form.locator('#departure-flight-airport'),'Paris Airport');
 await form.locator('#departure-flight-time').fill('21:00');await expect(form.locator('#daily-times-toggle')).toBeChecked();
 await form.locator('#add-arrival-flight').click();await selectPlace(form.locator('#arrival-flight-airport'),'Paris Airport');
 await form.locator('#arrival-flight-time').fill('10:00');
 expect(await form.evaluate(element=>element.getFormData().dailyTimes.map(day=>[day.startTime,day.endTime]))).toEqual([['11:00','21:00'],['09:00','18:00']]);

 form=await open(['2030-10-17']);await form.locator('#add-arrival-flight').click();
 await form.locator('button[type=submit].primary-btn').click();await expect(form.locator('#final-generate')).toBeDisabled();
 await expect(form.locator('#review-issues')).toContainText('도착편: 항공편의 공항과 시각');expect(await page.evaluate(()=>window.generationCalls||0)).toBe(0);
});

test('Back from the phone result sheet lands focus on the trip list heading, not the page body', async ({page}) => {
 await page.setViewportSize({width:390,height:844});
 await page.goto('/profile/trips');
 const profile=page.locator('profile-view[data-active]');
 await profile.locator('.btn-view').click();
 await expect(page.locator('itinerary-view:visible').first()).toBeVisible();
 await page.goBack();
 await expect(page).toHaveURL(/\/profile\/trips$/);
 await expect.poll(()=>page.evaluate(()=>{const host=document.activeElement;return host?.tagName==='PROFILE-VIEW'?host.shadowRoot.activeElement?.tagName:host?.tagName;})).toMatch(/^H[12]$/);
});
