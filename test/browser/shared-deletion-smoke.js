// Local fake persistence only; production view, actions, loader and sharing service.
async (page) => {
  const check=(v,m)=>{if(!v)throw Error(m);};
  await page.evaluate(()=>{
    const plan={days:[{date:'2026-09-14',scheduleItems:[{type:'attraction',title:'삭제 검증 장소',location:'서울',time:'10:00',endTime:'11:00'}]}]};
    window.__smoke.setUser({uid:'smokeOwner',displayName:'검증',emailVerified:true,providerData:[]});
    const db={itineraries:{original:{userId:'smokeOwner',itineraryPlan:plan},copy:{userId:'recipient',itineraryPlan:plan}},
      shared_itineraries:{linked:{sourceId:'original',ownerId:'smokeOwner',itineraryPlan:plan}},
      shared_itinerary_status:{linked:{sourceId:'original',ownerId:'smokeOwner'}}};
    sessionStorage.setItem('__smoke_db',JSON.stringify(db));
    window.__smoke.setUser(null);
    window.navigate('/share/linked');
  });
  await page.getByText('삭제 검증 장소',{exact:true}).first().waitFor({state:'visible'});
  await page.evaluate(()=>{
    const db=JSON.parse(sessionStorage.getItem('__smoke_db'));
    delete db.itineraries.original;
    sessionStorage.setItem('__smoke_db',JSON.stringify(db));
  });
  // No route change/focus event: exercise the production periodic access check.
  await page.getByText('이 일정은 삭제된 일정입니다.',{exact:true}).waitFor({state:'visible',timeout:25000});
  check(await page.getByText('삭제 검증 장소',{exact:true}).count()===0,'Place must be removed');
  check(!await page.locator('itinerary-view #save-itinerary-btn').isVisible(),'Cannot copy deleted content');
  check(await page.evaluate(()=>Boolean(JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries.copy)),'Recipient copy survives');
  await page.reload();
  await page.getByText('이 일정은 삭제된 일정입니다.',{exact:true}).waitFor({state:'visible'});
  return {errors:page.smokeErrors,findings:[]};
}
