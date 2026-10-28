import { test, expect } from '@playwright/test';

test('설치한 모바일 PWA는 모든 자체 JS/CSS와 공유 화면을 오프라인에서 다시 연다', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeVisible();
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === 'activated');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const name = names.find(value => value.startsWith('compasser-shell-'));
    const cache = await caches.open(name);
    return (await cache.keys()).map(request => new URL(request.url).pathname);
  });
  expect(cached).toContain('/');
  const assets = cached.filter(path => /^\/assets\/.*\.(?:js|css)$/.test(path));
  expect(assets.length).toBeGreaterThan(20);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeVisible();
  await page.goto('/share/abc123');
  await expect(page.locator('main.flow-page')).toContainText('오프라인');
  await expect(page.locator('itinerary-view,map-view')).toHaveCount(0);
  // The privacy policy is not part of the app, so offline it must not open the app's not-found page.
  await expect(page.goto('/privacy')).rejects.toThrow();
  // Public pages must not display a cached copy after the owner unpublishes.
  await expect(page.goto('/en/routes/curated-seoul')).rejects.toThrow();
});

test('본인 오프라인 일정은 앱 재실행 후 주소와 시각을 열람하며 저장 해제 후 사라진다', async ({page,context,baseURL},testInfo)=>{
  await context.route('**/*',route=>new URL(route.request().url()).origin===baseURL?route.continue():route.abort('blockedbyclient'));
  await page.goto('/');
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  // Seed from a same-origin page without the app: a still-starting Firebase/shell treats a signed-out start as truth and erases the fixtures.
  await page.goto('/manifest.json');
  await page.evaluate(async()=>{
    const uid='offline-owner';
    const request=indexedDB.open('firebaseLocalStorageDb',1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('firebaseLocalStorage'))request.result.createObjectStore('firebaseLocalStorage',{keyPath:'fbase_key'});};
    const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    const transaction=db.transaction('firebaseLocalStorage','readwrite');
    transaction.objectStore('firebaseLocalStorage').put({fbase_key:'firebase:authUser:browser-fixture-api-key:[DEFAULT]',value:{uid,email:'offline@example.test',emailVerified:true,isAnonymous:false,providerData:[],apiKey:'browser-fixture-api-key',appName:'[DEFAULT]',stsTokenManager:{refreshToken:'fixture-refresh',accessToken:'fixture-token',expirationTime:Date.now()+86400000},createdAt:'1700000000000',lastLoginAt:'1700000000000'}});
    await new Promise((resolve,reject)=>{transaction.oncomplete=resolve;transaction.onerror=()=>reject(transaction.error)});db.close();
    localStorage.setItem('compasser.offline.v1',JSON.stringify({version:1,owner:uid,trips:[{id:'own123',userId:uid,title:'오프라인 파리 여행',savedAt:Date.now(),itineraryPlan:{days:[{day:1,date:'2030-10-17',scheduleItems:[{type:'attraction',title:'Louvre',time:'10:00',endTime:'12:00',location:'Rue de Rivoli, Paris, France'}]}]}}]}));
  });
  await context.setOffline(true);await page.goto('/profile/trips');
  await expect(page.locator('profile-view:visible .trip-title')).toHaveText('오프라인 파리 여행',{timeout:15000});
  await page.locator('profile-view:visible .btn-view').click();
  await expect(page.locator('main.flow-page')).toContainText('Rue de Rivoli');await expect(page.locator('main.flow-page')).toContainText('10:00 – 12:00');
  await expect(page.locator('itinerary-view,map-view')).toHaveCount(0);
  await page.reload();await expect(page.locator('main.flow-page')).toContainText('Rue de Rivoli');
  await expect(page.getByText('초안을 기기에 저장하지 못했습니다.',{exact:false})).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('own-trip-offline-reload.png'),fullPage:true});
  await page.evaluate(()=>localStorage.removeItem('compasser.offline.v1'));await page.reload();await expect(page.locator('main.flow-page')).toContainText('저장한 일정이');
});
