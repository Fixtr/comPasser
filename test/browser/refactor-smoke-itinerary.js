// Run after refactor-smoke-generation.js on the same page.
async (page) => {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const waitTitle = () => page.locator('itinerary-view .schedule-title').filter({hasText:'경복궁'}).waitFor({state:'visible'});
  const save = page.locator('itinerary-view #save-itinerary-btn');
  await page.evaluate(() => {window.__smoke.dbError='write';});
  await save.click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('save-itinerary-btn').disabled);
  check(page.url().endsWith('/view'), 'Failed save must not navigate');
  check(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('__smoke_db')).itineraries), 'Failed save must not persist');
  await page.evaluate(() => {window.__smoke.dbError=null;});
  page.smokeResults.push('PASS save failure/button recovery/no false persistence');

  await save.click();
  await page.waitForURL('**/view/smoke1');
  await page.reload();
  await waitTitle();
  check(await page.evaluate(() => document.querySelector('itinerary-view').state.snapshot().source.kind)==='private', 'Reload must load saved private itinerary');
  page.smokeResults.push('PASS save/private URL/reload from fake persistence');

  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host').waitFor({state:'visible'});
  await page.locator('#app-confirm-host .confirm-cancel').click();
  check(await page.evaluate(() => !JSON.parse(sessionStorage.getItem('__smoke_db')).shared_itineraries), 'Cancel must not publish');
  check(!await page.locator('itinerary-view #share-itinerary-btn').isDisabled(), 'Cancel must release share button');
  page.smokeResults.push('PASS public-share consent cancellation/no shared document');

  await page.locator('itinerary-view #share-itinerary-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('share-itinerary-btn').disabled);
  page.smokeShareUrl = await page.evaluate(() => navigator.clipboard.readText());
  check(page.smokeShareUrl===(page.smokeOrigin || 'http://127.0.0.1:4173')+'/share/smoke1', 'Clipboard must contain correct public link');
  page.smokeResults.push('PASS public-share consent/fake document/real browser clipboard');

  await page.locator('itinerary-view #kakao-share-btn').click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => window.__smoke.kakao.length===1);
  check(await page.evaluate(() => window.__smoke.kakao[0].content.link.webUrl.endsWith('/share/smoke2')), 'Kakao payload must contain newly shared URL');
  page.smokeResults.push('PASS Kakao SDK loading/payload wiring (delivery SDK is fake)');

  page.smokeThemeBefore = await page.evaluate(() => ({dark:document.body.classList.contains('dark'),theme:document.documentElement.getAttribute('data-theme'),route:document.documentElement.getAttribute('data-route-theme')}));
  // Select unsupported-Web-Share fallback explicitly: do not open an OS share sheet.
  await page.evaluate(() => Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false}));
  const downloading = page.waitForEvent('download');
  await page.locator('itinerary-view #download-image-btn').click();
  const download = await downloading;
  check((await download.failure())===null, 'PNG download must complete');
  if (page.smokeOutputDir) await download.saveAs(page.smokeOutputDir + '/ticket.png');
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('download-image-btn').disabled);
  const after = await page.evaluate(() => ({dark:document.body.classList.contains('dark'),theme:document.documentElement.getAttribute('data-theme'),route:document.documentElement.getAttribute('data-route-theme')}));
  check(JSON.stringify(after)===JSON.stringify(page.smokeThemeBefore), 'Export must restore all theme attributes');
  check(await page.locator('body > div[aria-hidden="true"]').count()===0, 'Export stage must be removed');
  page.smokeResults.push('PASS real html2canvas/PNG download/theme preservation/temporary DOM cleanup');

  let cancelledDownload = false;
  const unexpectedDownload = () => {cancelledDownload=true;};
  page.on('download',unexpectedDownload);
  await page.evaluate(() => {
    Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
    Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('User cancelled','AbortError');}});
  });
  await page.locator('itinerary-view #download-image-btn').click();
  await page.waitForFunction(() => !document.querySelector('itinerary-view').shadowRoot.getElementById('download-image-btn').disabled);
  check(!cancelledDownload, 'Cancelling sharing must not trigger a download');
  page.off('download',unexpectedDownload);
  check(await page.locator('body > div[aria-hidden="true"]').count()===0, 'Cancelled export must remove temporary DOM');
  page.smokeResults.push('PASS simulated OS share cancellation/no fallback download/button cleanup');

  // Reload public link as a guest, without touching real authentication.
  await page.evaluate(() => sessionStorage.setItem('__smoke_user','null'));
  await page.goto(page.smokeShareUrl);
  await waitTitle();
  check(await page.locator('itinerary-view #shared-notice').isVisible(), 'Guest must see shared notice');
  check(await page.locator('itinerary-view .item-edit-btn').count()===0, 'Shared itinerary must not expose editing');
  await page.locator('itinerary-view #save-itinerary-btn').click();
  await page.waitForURL('**/login?next=*');
  check(page.url().includes('next=%2Fshare%2Fsmoke1'), 'Guest login must preserve return URL');
  page.smokeResults.push('PASS guest shared-link reload/read-only/login return URL');
  check(page.smokeErrors.length===0, 'Unexpected page errors: '+page.smokeErrors.join(','));
  return {results:page.smokeResults, download:download.suggestedFilename(), errors:page.smokeErrors};
}
