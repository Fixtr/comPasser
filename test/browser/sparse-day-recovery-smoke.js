async page => {
  const result = await page.evaluate(async () => {
    const { enforcePlannerConstraints, recoverSparseGeneratedDays } = await import('/src/domains/planner/services/planner-constraints.mjs');
    const dates = ['2026-10-07','2026-10-08','2026-10-09','2026-10-10'];
    const request = { date:dates, startTime:'09:00', endTime:'18:00', startLocation:'서울역',
      endLocation:'인천공항', overnightLocations:['호텔 A','호텔 B','호텔 C'],
      dailyTimes:[{day:4,startTime:'15:00',endTime:'17:00'}] };
    const generated = dates.map((date,index) => ({day:index+1,date,scheduleItems:index===2
      ? [{type:'attraction',title:'기존 방문',location:'호텔 B',time:'11:00',endTime:'12:00'}] : []}));
    const days = recoverSparseGeneratedDays(enforcePlannerConstraints(generated,request));
    const counts = days.map(day => day.scheduleItems.filter(item => item.placeStatus === 'pending').length);
    const near = days[1].scheduleItems[1].placeIntent?.nearLocation;
    const boundaries = days.map(day => [day.scheduleItems[0].location,day.scheduleItems.at(-1).location]);
    const view = document.querySelector('itinerary-view');
    view.state.open({request,days});
    window.navigate('/view');
    view.renderCurrentState();
    return {counts,near,boundaries};
  });
  if (JSON.stringify(result.counts) !== JSON.stringify([1,1,1,0]) || result.near !== '호텔 A')
    throw Error('Sparse multi-day recovery did not preserve existing/short days');
  if (JSON.stringify(result.boundaries) !== JSON.stringify([
    ['서울역','호텔 A'],['호텔 A','호텔 B'],['호텔 B','호텔 C'],['호텔 C','인천공항']]))
    throw Error('Recovery changed trip boundaries');
  await page.locator('itinerary-view .schedule-title').filter({hasText:'주변 명소 탐방'}).waitFor();
  await page.getByRole('button',{name:'2일차 2026-10-08',exact:true}).click();
  await page.locator('itinerary-view .schedule-title').filter({hasText:'주변 명소 탐방'}).waitFor();
  return {findings:[],errors:[],checks:['four-day empty-day recovery','lodging boundaries','existing visit and short day preserved']};
}
