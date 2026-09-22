// AI transport claims must yield to the measured Google route.
async page => {
  await page.goto(page.smokeOrigin + '/view/smoke1');
  await page.locator('itinerary-view #timeline-container').waitFor({ state: 'visible' });

  const result = await page.evaluate(async () => {
    const view = document.querySelector('itinerary-view');
    const plan = { request: { date: ['2026-10-20'], startTime: '10:00', endTime: '12:00', startLocation: '서울역', endLocation: '인천국제공항' }, days: [{
      day: 1, date: '2026-10-20', scheduleItems: [
        { type: 'departure', title: '서울역 출발', location: '서울역', time: '10:00', endTime: '' },
        { type: 'AnchorSchedule', title: '인천국제공항 도착', location: '인천국제공항', time: '10:10', endTime: '10:30',
          transitInfo: 'KTX를 타고 약 1시간 이동', practicalInfo: { estimatedCost: 'KTX 요금 ₩59,800' } },
      ],
    }] };
    view.currentItinerary = plan;
    view.activeDayIndex = 0;
    view.isReadOnly = false;
    view.renderActiveDay(plan);
    view.refreshCostSummary();
    await new Promise(resolve => setTimeout(resolve, 200));
    const before = view.shadowRoot.textContent;
    const aiBefore = [...view.shadowRoot.querySelectorAll('.gemini-transit, .gemini-transport-cost')]
      .every(node => getComputedStyle(node).display !== 'none');
    view.renderTransitInfo([{
        fromIndex: 0, toIndex: 1, duration: '78분', durationMinutes: 78, distance: '65.4 km', mode: 'TRANSIT',
        vehicleType: 'COMMUTER_TRAIN', lineName: '공항철도',
        steps: [{ mode: 'TRANSIT', duration: '78분', vehicleType: 'COMMUTER_TRAIN', lineName: '공항철도' }],
    }]);
    const measured = view.shadowRoot.getElementById('transit-info-0')?.textContent || '';
    const aiAfter = [...view.shadowRoot.querySelectorAll('.gemini-transit, .gemini-transport-cost')]
      .some(node => getComputedStyle(node).display !== 'none');
    const costSummary = view.shadowRoot.getElementById('cost-summary')?.textContent || '';
    return { before, aiBefore, measured, aiAfter, costSummary };
  });

  if (!result.aiBefore || !result.before.includes('AI 예상 이동 · 확인 필요') || !result.before.includes('KTX')) {
    throw new Error('Unverified AI transit was not clearly labeled before route verification');
  }
  if (result.aiAfter) throw new Error('AI KTX claim remained visible after measured route arrived');
  if (!result.measured.includes('공항철도') || !result.measured.includes('78분')) {
    throw new Error('Measured airport railway route did not replace AI transit');
  }
  if (result.costSummary.includes('59,800')) throw new Error('AI transport fare leaked into the cost summary');

  return { results: ['PASS measured route replaces AI transit prose and transport fare'], errors: page.smokeErrors };
}
