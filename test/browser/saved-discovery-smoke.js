async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.evaluate(() => {
    const db = JSON.parse(sessionStorage.getItem('__smoke_db'));
    db.discovery_saves = { smokeOwner: { placeIds: ['forest', 'haeundae'] } };
    sessionStorage.setItem('__smoke_db', JSON.stringify(db));
  });
  await page.goto('/recommend?country=KOR&city=seoul');
  const rows = page.locator('.flow-place-row');
  const filter = page.locator('.catalogue-saved-filter');
  await rows.first().waitFor();
  check(await rows.count() === 6, 'Start with the full catalogue');
  const before = await page.evaluate(() => sessionStorage.getItem('currentFormData'));
  await filter.click();
  await rows.filter({ hasText: '서울숲' }).waitFor();
  check(await rows.count() === 1, 'Only the signed-in owner’s saves for this city are listed');
  check(await page.evaluate(() => sessionStorage.getItem('currentFormData')) === before, 'Filtering never edits the draft');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Saved places', exact: true }).waitFor();
  check((await rows.locator('summary').innerText()).includes('Seoul Forest'), 'The saved filter survives a language switch');
  const pick = rows.locator('[data-place-pick]');
  await pick.click();
  await rows.locator('[data-place-pick][aria-pressed=true]').waitFor();
  await page.locator('.flow-primary').click();
  await page.waitForURL('**/preference/1');
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  check(draft.anchorSchedules.length === 1 && draft.anchorSchedules[0].location?.placeId && draft.anchorSchedules[0].flexible,
    'A saved place uses the verified untimed must-visit handoff');

  await page.evaluate(() => window.navigate('/recommend?country=KOR&city=seoul'));
  await filter.waitFor();
  await page.evaluate(() => window.__smoke.setUser({ uid: 'anotherOwner', emailVerified: true, providerData: [] }));
  if (await filter.getAttribute('aria-pressed') === 'false') await filter.click();
  await page.getByText("You haven't saved any places in this city.", { exact: true }).waitFor();
  check(await rows.count() === 0, 'A new account never gets the previous owner’s saved places');
  return { errors: page.smokeErrors, findings: [] };
}
