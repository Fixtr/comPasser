async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => window.navigate('/plan'));
  const form = page.locator('travel-form');
  await form.evaluate(element => element.populateForm({
    date: ['2026-10-08', '2026-10-09', '2026-10-10'], startTime: '09:00', endTime: '18:00',
    startLocation: '서울역', endLocation: '인천공항', overnightLocations: ['첫 숙소', '둘째 숙소'],
    anchorSchedules: [{ name: '예약 공연', day: 2, time: '15:00', endTime: '16:00', location: '공연장' }],
  }));
  const dialog = form.locator('#discovery-dialog');
  const open = () => form.locator('#where-to-go').click();
  const read = () => form.evaluate(element => element.getFormData());
  const original = await read();
  await open();
  await dialog.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  check(JSON.stringify(await read()) === JSON.stringify(original), 'Cancel must preserve every form field');
  await open();
  await dialog.locator('[data-discovery-mode=destination]').click();
  await dialog.locator('[data-destination-city]').first().waitFor();
  check(await dialog.locator('[data-destination-city]').count() === 6, 'Offer six supported destinations with reasons');
  await dialog.locator('[data-destination-city=busan]').click();
  const cards = dialog.locator('home-recommendations');
  await cards.locator('button[data-place=haeundae]').waitFor();
  await dialog.locator('#discovery-day').selectOption('3');
  await cards.locator('button[data-place=haeundae]').click();
  await cards.locator('#discover-plan').click();
  await dialog.waitFor({ state: 'hidden' });
  let draft = await read();
  check(draft.anchorSchedules.some(anchor => anchor.name === '해운대해수욕장' && anchor.day === 3 && anchor.flexible), 'Add to chosen day as an untimed required visit');
  check(draft.startLocation === original.startLocation && draft.endLocation === original.endLocation
    && JSON.stringify(draft.overnightLocations) === JSON.stringify(original.overnightLocations), 'Keep endpoints and hotels');
  check(JSON.stringify(draft.anchorSchedules[0]) === JSON.stringify(original.anchorSchedules[0]), 'Keep the fixed booking');
  await open();
  await dialog.locator('[data-discovery-mode=destination]').click();
  await dialog.locator('#discovery-city').selectOption('busan');
  await cards.locator('button[data-place=haeundae]').click();
  await cards.locator('#discover-plan').click();
  draft = await read();
  check(draft.anchorSchedules.filter(anchor => anchor.name === '해운대해수욕장').length === 1, 'Repeated picks must not create duplicate visits');
  await page.reload();
  await form.locator('#where-to-go').waitFor();
  check((await read()).anchorSchedules.some(anchor => anchor.name === '해운대해수욕장' && anchor.day === 3), 'Picks must survive reload');
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await open();
    await dialog.locator('[data-discovery-mode=destination]').click();
    await dialog.locator('#discovery-city').selectOption('seoul');
    await cards.locator('button[data-place=forest]').waitFor();
    check(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), 'Dialog must not overflow horizontally');
    await page.screenshot({ path: page.smokeOutputDir + `/planner-discovery-${width}.png`, fullPage: true });
    await dialog.locator('#close-discovery').click();
  }
  check(page.smokeErrors.length === 0, 'No browser errors');
  return { errors: page.smokeErrors };
}
