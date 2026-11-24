async page => {
  const saved = 'https://www.google.com/maps/search/?api=1&query=Senso-ji&query_place_id=sensoji';
  const plan = (destination, stops) => ({ request: { destination, startTime: '09:00', endTime: '18:00' }, days: [{ day: 1, date: '2026-10-20', scheduleItems: [
    { type: 'departure', time: '09:00', title: 'Start' }, ...stops, { type: 'arrival', time: '18:00', title: 'End' }] }] });
  const open = plan => page.evaluate(async plan => {
    window.__placesFixtures = [];
    window.__opened = [];
    window.__events = [];
    window.gtag = (...args) => { window.__events.push(args); };
    window.open = (...args) => { window.__opened.push(args); return null; };
    document.getElementById('nav-popup-global')?.remove();
    const view = await window.__smoke.openPlan(plan);
    view.setAttribute('mobile-summary', '');
    view.renderCurrentState();
  }, plan);
  const opened = () => page.evaluate(() => window.__opened.splice(0));
  const navButton = title => page.locator('itinerary-view .schedule-card').filter({ hasText: title }).locator('.nav-btn');
  const nextStop = page.locator('itinerary-view #next-stop-directions');
  const popup = page.locator('#nav-popup-global');
  const clickNextStop = () => nextStop.evaluate(button => button.click());

  // Outside Korea: no popup, Google Maps opens in a new tab from the card and from the next-stop panel.
  await open(plan({ id: 'tokyo', country: 'JPN' }, [
    { type: 'attraction', time: '10:00', endTime: '11:00', title: 'Senso-ji', location: 'Senso-ji', googleMapsUrl: saved },
    { type: 'attraction', time: '12:00', endTime: '13:00', title: 'Ueno Park', location: 'Ueno Park' },
    { type: 'attraction', time: '14:00', endTime: '15:00', title: 'Tokyo Tower', location: { lat: 35.6586, lng: 139.7454 }, googleMapsUrl: 'https://evil.example/x' }]));
  await navButton('Senso-ji').click();
  const fromCard = await opened();
  if (JSON.stringify(fromCard) !== JSON.stringify([[saved, '_blank', 'noopener,noreferrer']])) throw Error('Tokyo card did not open the saved Google Maps address: ' + JSON.stringify(fromCard));
  await clickNextStop();
  const fromNextStop = await opened();
  if (JSON.stringify(fromNextStop) !== JSON.stringify(fromCard)) throw Error('Next stop and card disagree: ' + JSON.stringify(fromNextStop));
  await navButton('Ueno Park').click();
  const built = (await opened())[0]?.[0];
  if (built !== 'https://www.google.com/maps/dir/?api=1&destination=Ueno%20Park') throw Error('Tokyo stop without a saved address: ' + built);
  // A coordinate-only location falls back to the title, and a non-Google saved address is not opened.
  await navButton('Tokyo Tower').click();
  const fallback = (await opened())[0]?.[0];
  if (fallback !== 'https://www.google.com/maps/dir/?api=1&destination=Tokyo%20Tower') throw Error('Tokyo stop without a usable location or address: ' + fallback);
  const events = await page.evaluate(() => window.__events.filter(args => args[1] === 'navigate_map_click').map(args => args[2].map_service));
  if (JSON.stringify(events) !== JSON.stringify(['google', 'google', 'google', 'google'])) throw Error('Google directions were not tracked: ' + JSON.stringify(events));
  if (await popup.count()) throw Error('Tokyo trip opened the Naver/Kakao popup');

  // Shared and saved plans keep the request under metadata.
  const { request, days } = plan({ id: 'tokyo', country: 'JPN' }, [{ type: 'attraction', time: '10:00', endTime: '11:00', title: 'Senso-ji', location: 'Senso-ji', googleMapsUrl: saved }]);
  await open({ metadata: { request }, days });
  await navButton('Senso-ji').click();
  await clickNextStop();
  const fromMetadata = await opened();
  if (JSON.stringify(fromMetadata) !== JSON.stringify([...fromCard, ...fromCard])) throw Error('Plan with metadata.request: ' + JSON.stringify(fromMetadata));

  // Korea, English screen: the popup with exactly Naver and Kakao, and no Korean chrome.
  await page.evaluate(async () => (await import('/src/utils/i18n.js')).setLang('en'));
  await open(plan({ id: 'seoul', country: 'KOR' }, [
    { type: 'attraction', time: '10:00', endTime: '11:00', title: 'Gyeongbokgung', location: 'Gyeongbokgung', googleMapsUrl: saved }]));
  const checkPopup = async from => {
    await popup.waitFor({ state: 'visible' });
    const hrefs = await popup.locator('a.pop-opt').evaluateAll(links => links.map(link => link.href + '|' + link.target + '|' + link.rel));
    if (JSON.stringify(hrefs) !== JSON.stringify(['https://map.naver.com/v5/search/Gyeongbokgung|_blank|noopener noreferrer', 'https://map.kakao.com/?q=Gyeongbokgung|_blank|noopener noreferrer'])) throw Error(from + ': Seoul popup options wrong: ' + JSON.stringify(hrefs));
    const copy = await popup.evaluate(node => [node.getAttribute('aria-label'), node.querySelector('.popup-close').getAttribute('aria-label'), node.querySelector('.nav-inner').innerText].join(' | '));
    if (/[ㄱ-힣]/.test(copy)) throw Error(from + ': Korean left in the English popup: ' + copy);
    if (!copy.includes('Naver Map') || !copy.includes('Kakao Map') || !copy.includes('Directions to Gyeongbokgung')) throw Error(from + ': English popup copy missing: ' + copy);
    await popup.locator('.popup-close').click();
    await popup.waitFor({ state: 'detached' });
  };
  await navButton('Gyeongbokgung').click();
  await checkPopup('card');
  await clickNextStop();
  await checkPopup('next stop');
  if ((await opened()).length) throw Error('Seoul trip opened a window directly');

  // A plan saved before request data existed keeps the popup, in Korean on the Korean screen.
  await page.evaluate(async () => (await import('/src/utils/i18n.js')).setLang('ko'));
  await open({ days: [{ day: 1, date: '2026-10-20', scheduleItems: [{ type: 'departure', time: '09:00', title: '출발' },
    { type: 'attraction', time: '10:00', endTime: '11:00', title: '경복궁', location: '경복궁' }, { type: 'arrival', time: '18:00', title: '도착' }] }] });
  await navButton('경복궁').click();
  await popup.waitFor({ state: 'visible' });
  const korean = await popup.locator('.nav-inner').innerText();
  if (!korean.includes('네이버 지도') || !korean.includes('카카오맵') || await popup.getAttribute('aria-label') !== '경복궁 길찾기') throw Error('Korean popup copy changed: ' + korean);
  if ((await opened()).length) throw Error('Legacy trip opened a window directly');
  await popup.locator('.popup-close').click();
  await popup.waitFor({ state: 'detached' });
  await clickNextStop();
  await popup.waitFor({ state: 'visible' });
  if (await popup.getAttribute('aria-label') !== '경복궁 길찾기' || (await opened()).length) throw Error('Legacy next stop did not open the popup');
  await popup.locator('.popup-close').click();
  return { errors: page.smokeErrors };
}
