async (page) => {
  const check = (condition,message) => {if (!condition) throw new Error(message);};
  await page.route('**/src/domains/map/services/google-maps-loader.js*', route => route.fulfill({contentType:'text/javascript',body:`
    class PlaceInput extends HTMLElement {
      constructor(){super();this.attachShadow({mode:'open'});}
      connectedCallback(){this.shadowRoot.innerHTML='<input aria-label="테스트 장소 입력">';this.shadowRoot.querySelector('input').value=this._value||'';}
      get value(){return this.shadowRoot.querySelector('input')?.value||this._value||'';}
      set value(v){this._value=v;if(this.shadowRoot.querySelector('input'))this.shadowRoot.querySelector('input').value=v;}
    }
    if(!customElements.get('gmp-place-autocomplete'))customElements.define('gmp-place-autocomplete',PlaceInput);
    window.google={maps:{TravelMode:{TRANSIT:'TRANSIT'}}};
    const candidates=['nearby','far','second'].map((id,index)=>({id,displayName:id==='nearby'?'동선 명소':id==='far'?'먼 명소':'둘째 명소',
      formattedAddress:'서울 중구',location:{lat:37.55,lng:126.981+index*.001},types:['tourist_attraction'],businessStatus:'OPERATIONAL',
      addressComponents:[{types:['country'],shortText:'KR'}]}));
    class Place {
      constructor({id}){this.id=id;}
      async fetchFields(){Object.assign(this,{utcOffsetMinutes:540,regularOpeningHours:{periods:[{open:{day:0,hour:0,minute:0}}]}});}
      static async searchByText(){
        if(window.__routeHold)await new Promise(resolve=>window.__releaseRoute=resolve);
        return {places:candidates};
      }
    }
    class DirectionsService {
      async route(request){
        if(window.__routeFailure)throw new Error('TEST: Maps unavailable');
        window.__routeCalls||=[];window.__routeCalls.push(request);
        const slow=request.origin.lng===126.982||request.destination.lng===126.982;
        return {routes:[{overview_path:[{lat:37.55,lng:126.981}],legs:[{duration:{value:slow?2400:600}}]}]};
      }
    }
    export const getMapsLoader=()=>({importLibrary:async()=>({Place,DirectionsService})});
  `}));
  await page.reload();
  await page.evaluate(()=>window.navigate('/plan'));
  const form=page.locator('travel-form');
  const place=(placeId,displayName,lng)=>({placeId,displayName,formattedAddress:'서울 중구',lat:37.55,lng});
  const original={date:['2026-10-08','2026-10-09'],startTime:'09:00',endTime:'18:00',
    startLocation:place('start','서울역',126.98),endLocation:place('end','공항',126.99),
    overnightLocations:[place('hotel','숙소',126.985)],
    anchorSchedules:[{name:'예약',day:1,time:'15:00',endTime:'16:00',location:place('booking','공연장',126.986)}]};
  await form.evaluate((element,value)=>element.populateForm(value),original);
  const originalBooking=await form.evaluate(element=>element.getFormData().anchorSchedules[0]);
  const dialog=form.locator('#discovery-dialog');
  const open=async()=>{await form.locator('#where-to-go').click();await dialog.locator('[data-discovery-mode=stops]').click();};
  await open();
  check(await dialog.locator('#discovery-city-group').isHidden(),'Use entered route instead of a city catalogue');
  await dialog.locator('#find-route-stops').click();
  await dialog.locator('[data-route-pick="0"]').waitFor();
  check((await dialog.locator('#discovery-places').innerText()).includes('추가 이동 10분'),'Show measured detour minutes');
  check(!(await dialog.locator('#discovery-places').innerText()).includes('먼 명소'),'Exclude a 40-minute detour');
  check(await page.evaluate(()=>window.__routeCalls.some(call=>call.origin.lng===126.98 && call.destination.lng===126.986)), 'Measure the actual leg to the fixed booking');
  for (const width of [390,1280]) {
    await page.setViewportSize({width,height:900});
    check(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth),'Route recommendations fit mobile and desktop');
    await page.screenshot({path:page.smokeOutputDir+'/route-discovery-'+width+'.png',fullPage:true});
  }
  await dialog.locator('[data-route-pick="0"]').click();
  await dialog.waitFor({state:'hidden'});
  let draft=await form.evaluate(element=>element.getFormData());
  check(draft.anchorSchedules[1].location.placeId==='nearby' && draft.anchorSchedules[1].flexible && draft.anchorSchedules[1].day===1,'Keep selected identity and chosen day');
  check(Object.entries(originalBooking).every(([key,value]) =>
    JSON.stringify(draft.anchorSchedules[0][key])===JSON.stringify(value)),'Preserve fixed reservation');
  check(draft.startLocation.placeId==='start' && draft.overnightLocations[0].placeId==='hotel','Preserve endpoints and lodging');
  await page.reload();
  await form.locator('#where-to-go').waitFor();
  check((await form.evaluate(element=>element.getFormData())).anchorSchedules[1].location.placeId==='nearby','Route pick survives reload');
  await open();
  await page.evaluate(()=>window.__routeFailure=true);
  await dialog.locator('#find-route-stops').click();
  await page.waitForFunction(()=>document.querySelector('travel-form').shadowRoot.querySelector('#route-discovery-status').textContent.includes('확인하지 못했습니다'));
  check(await dialog.locator('[data-route-pick]').count()===0,'Failure must not leave stale recommendations');
  await page.evaluate(()=>{window.__routeFailure=false;window.__routeHold=true;});
  await dialog.locator('#find-route-stops').click();
  await page.waitForFunction(()=>typeof window.__releaseRoute==='function');
  await dialog.locator('#discovery-day').selectOption('2');
  await page.evaluate(()=>{window.__routeHold=false;window.__releaseRoute();});
  await dialog.locator('#find-route-stops').click();
  await dialog.locator('[data-route-pick="0"]').waitFor();
  await dialog.locator('[data-route-pick="0"]').click();
  draft=await form.evaluate(element=>element.getFormData());
  check(draft.anchorSchedules.at(-1).day===2 && draft.anchorSchedules.at(-1).location.placeId!=='nearby','Ignore stale day-1 results and avoid a repeated place');
  check(page.smokeErrors.length===0,'No browser errors: '+page.smokeErrors.join(','));
  return {errors:page.smokeErrors};
}
