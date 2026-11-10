import { test, expect } from '@playwright/test';
import { geoOrthographic } from 'd3-geo';

const authModule = `
  export const missingFirebaseConfig = [];
  export const app = null;
  let currentUser = null;
  const listeners = new Set();
  const notify = user => listeners.forEach(callback => callback(user));
  export function subscribeToAuthChanges(callback) {
    listeners.add(callback);
    setTimeout(() => callback(currentUser), 0);
    return () => listeners.delete(callback);
  }
  export function getCurrentUser() { return currentUser; }
  export async function loginWithEmail() { currentUser = { uid: 'test-user', providerData: [], emailVerified: true }; notify(currentUser); }
  export async function loginWithGoogle() { return loginWithEmail(); }
  export async function loginWithCustomToken() { return loginWithEmail(); }
  export async function signUpWithEmail() {}
  export async function verifyEmailCode() {}
  export async function sendPasswordReset() {}
  export async function resetPassword() {}
  export async function requireRecentLoginForDeletion() {}
  export async function logout() { currentUser = null; notify(null); }
`;

const mapsModule = `
  class PlaceInput extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Test place">'; }
    get value() { return this.shadowRoot.querySelector('input').value; }
    set value(value) { this.shadowRoot.querySelector('input').value = value; }
  }
  customElements.define('gmp-place-autocomplete', PlaceInput);
  import fixtures from '/test/fixtures/destination-places.json?import';
  export const getMapsLoader = () => ({ importLibrary: async () => ({ Place: class {
    static async searchByText(request) { return { places: fixtures.filter(row => request.textQuery.startsWith(row.queryName + ' ')).map(row => row.place) }; }
  } }) });
`;

// Content scrolls inside ion-content, so the document never reports its overflow.
const contentOverflow = page => page.locator('ion-content:visible').evaluate(async content => {
  const scroller = await content.getScrollElement();
  return scroller.scrollWidth > scroller.clientWidth;
});

async function chooseCourseCity(page, city = 'seoul', country = 'KOR') {
  await page.locator(`button[data-course-country=${country}]`).click();
  await page.locator(`button[data-course-city=${city}]`).click();
}

test('코스는 나라와 도시를 고른 뒤 해당 도시만 표시하고 이전 단계로 돌아갈 수 있다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() {
      window.courseLoads = (window.courseLoads || 0) + 1;
      return { courses: ['Seoul', 'Busan', 'Tokyo', 'Paris', 'Venice'].map((city, index) => ({ id: 'city' + index, title: city + ' course', stops: [{name:'Walk',location:city,stayMinutes:60}] })), hasMore: false };
    }
    export async function getPublicCourse() { return null; }
  ` }));
  await page.goto('/courses');
  await expect(page.getByRole('heading', { name: '어느 나라의 코스를 볼까요?' })).toBeVisible();
  await expect(page.locator('home-courses,public-courses')).toHaveCount(0);
  expect(await page.evaluate(() => window.courseLoads || 0)).toBe(0);
  const draft = await page.evaluate(() => sessionStorage.getItem('currentFormData'));
  await page.locator('[data-course-country=KOR]').click();
  await expect(page.getByRole('heading', { name: '어느 도시가 끌리나요?' })).toBeVisible();
  await expect(page.locator('[data-course-city]')).toHaveCount(6);
  await expect(page.locator('home-courses,public-courses')).toHaveCount(0);
  await page.locator('[data-course-city=seoul]').click();
  await expect(page.getByRole('heading', { name: '둘러볼 코스', exact: true })).toBeVisible();
  await expect(page.locator('home-courses article')).toHaveCount(3);
  await page.locator('public-courses').scrollIntoViewIfNeeded();await expect(page.locator('public-courses article')).toHaveCount(1);
  await expect(page.locator('public-courses article')).toContainText('Seoul course');
  // One link per city, not one per card; the directory lists both curated and traveler routes.
  await expect(page.locator('home-courses article a, public-courses article a')).toHaveCount(0);
  await expect(page.locator('home-courses').getByRole('link',{name:'이 도시 코스 영어 페이지 보기'})).toHaveAttribute('href',/\/en\/routes#city-seoul$/);
  await page.screenshot({ path: testInfo.outputPath('courses-seoul-320.png'), fullPage: true });
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page.locator('public-courses')).toHaveCount(0);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await chooseCourseCity(page, 'tokyo', 'JPN');
  await expect(page.locator('home-courses article')).toHaveCount(3);
  await page.locator('public-courses').scrollIntoViewIfNeeded();await expect(page.locator('public-courses article')).toHaveCount(1);
  await expect(page.locator('public-courses article')).toContainText('Tokyo course');
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page.locator('[data-course-city]')).toHaveCount(2);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await chooseCourseCity(page, 'nice', 'FRA');
  await page.locator('public-courses').scrollIntoViewIfNeeded();
  await expect(page.locator('public-courses article')).toHaveCount(0);
  await expect(page.locator('public-courses')).toContainText('조건에 맞는 코스가 없습니다.');
  expect(await page.evaluate(() => sessionStorage.getItem('currentFormData'))).toBe(draft);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('코스·추천에서 고른 나라와 도시는 주소에 남아 뒤로가기와 새로고침에도 유지되고 Esc 로 페이지를 떠나지 않는다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function listPublicCourses() { return { courses: [], hasMore: false }; } export async function getPublicCourse() { return null; }' }));
  await page.goto('/home');
  await page.getByRole('button', { name: '코스 둘러보기' }).click();
  await chooseCourseCity(page);
  await expect(page).toHaveURL(/\/courses\?country=KOR&city=seoul$/);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '뒤로', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/courses\?country=KOR&city=seoul$/);
  await page.reload();
  await expect(page.locator('home-courses:visible')).toHaveAttribute('city', 'seoul');
  await page.goBack();
  await expect(page.locator('[data-course-city]:visible')).toHaveCount(6);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '어느 나라의 코스를 볼까요?' })).toBeVisible();
  await page.goForward();
  await page.goForward();
  await expect(page.locator('home-courses:visible')).toHaveAttribute('city', 'seoul');
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page).toHaveURL(/\/courses\?country=KOR$/);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page).toHaveURL(/\/courses$/);

  await page.goto('/recommend?country=JPN&city=seoul');
  await expect(page.locator('[data-recommend-city]')).toHaveCount(2);
  await page.goto('/recommend?country=nope');
  await expect(page.locator('[data-recommend-country=KOR]')).toBeVisible();
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=seoul]').click();
  await expect(page).toHaveURL(/\/recommend\?country=KOR&city=seoul$/);
  await page.reload();
  await expect(page.locator('[data-recommend-city]')).toHaveCount(0);
  await expect(page).toHaveURL(/city=seoul$/);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page.locator('[data-recommend-city]')).toHaveCount(6);
  await page.goBack();
  await expect(page).toHaveURL(/\/recommend\?country=nope$/);
  await expect(page.locator('[data-recommend-country=KOR]')).toBeVisible();
});

test('화면과 단계가 바뀌면 새 제목으로 포커스가 가고 탭 제목도 그 화면을 말한다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [{ id: 'walk1', ownerId: 'another-user', title: 'Palace walk', review: '', stops: [{ name: '경복궁', location: '경복궁, 서울 종로구', stayMinutes: 60 }] }], hasMore: false }; }
    export async function getPublicCourse() { return null; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/home');
  await expect(page).toHaveTitle('ComPasser');
  await page.getByRole('button', { name: '코스 둘러보기' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '어느 나라의 코스를 볼까요?' })).toBeFocused();
  await expect(page).toHaveTitle('코스 둘러보기 · ComPasser');
  await page.locator('[data-course-country=KOR]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '어느 도시가 끌리나요?' })).toBeFocused();
  await page.locator('[data-course-city=seoul]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '둘러볼 코스', exact: true })).toBeFocused();
  await expect(page).toHaveTitle('서울 · 코스 둘러보기 · ComPasser');
  const reviews = page.locator('public-courses:visible').getByRole('button', { name: /^여행자 후기 (보기·작성|닫기)/ });
  await reviews.focus();
  await page.keyboard.press('Enter');
  await expect(reviews).toHaveAttribute('aria-expanded', 'true');
  await expect(reviews).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: '어느 도시가 끌리나요?' })).toBeFocused();
  await expect(page).toHaveTitle('코스 둘러보기 · ComPasser');

  await page.goto('/recommend?country=KOR');
  await page.locator('[data-recommend-city=busan]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: '꼭 갈 장소', exact: true })).toBeFocused();
  await expect(page).toHaveTitle('부산 · 일정 만들기 · ComPasser');
  // Domain views keep their heading in a shadow root; route changes still land there.
  await page.getByRole('button', { name: '뒤로', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/recommend\?country=KOR$/);
  await expect(page.getByRole('button', { name: '뒤로', exact: true })).toBeFocused();
  await page.evaluate(() => window.navigate('/login'));
  await expect(page.locator('login-view:visible h1').first()).toBeFocused();
  await expect(page).toHaveTitle('로그인 · ComPasser');
  // Before the user does anything, even a redirect (guest deep link to trips → login) keeps the
  // starting focus. Playwright's Chromium reports earlier activity from the start, so the new tab
  // reports none, as a real browser does for a typed or pasted address.
  const fresh = await page.context().newPage();
  await fresh.addInitScript(() => Object.defineProperty(navigator, 'userActivation', { value: { hasBeenActive: false } }));
  await fresh.goto('/profile/trips');
  await expect(fresh).toHaveURL(/\/login\?next=/);
  await expect(fresh.locator('login-view:visible h1').first()).toBeVisible();
  await fresh.waitForTimeout(1200);
  expect(await fresh.evaluate(() => document.activeElement === document.body)).toBe(true);
  await page.goto('/no-such-page?lang=en');
  await expect(page).toHaveTitle('Page not found · ComPasser');
});

test('내 일정 카드는 제목에 도시가 없을 때 날짜 줄에 도시를 보여 주고, 이름을 바꾸면 다시 판단한다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") }));
  await page.route('**/src/lib/firestore-lazy.mjs', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function loadFirestore() { return { db: {}, doc: () => ({}), getDoc: async () => ({ exists: () => false }) }; }' }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const plan = id => ({ request: { destination: { id } }, days: [{ date: '2026-08-20', scheduleItems: [{ type: 'attraction', title: 'Walk' }] }] });
    export async function getUserItineraries() { return [
      { id: 'old', title: '8월 20일 · Walk', itineraryPlan: plan('tokyo') },
      { id: 'new', title: '서울 · 8월 20일 · Walk', itineraryPlan: plan('seoul') },
      { id: 'english', title: 'Busan · 08/20 · Walk', itineraryPlan: plan('busan') },
    ]; }
    export async function saveItinerary() {} export async function updateItinerary() {} export async function renameItinerary() {} export async function deleteItinerary() {}
    export async function createSharedItinerary() {}
    export async function loadItineraryDocument() {}
    export async function watchSharedItinerary() {}
  ` }));
  await page.goto('/profile/trips');
  const cards = page.locator('profile-view:visible .trip-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0).locator('.trip-city')).toHaveText('도쿄 · ');
  await expect(cards.nth(1).locator('.trip-city')).toHaveText('');
  await expect(cards.nth(2).locator('.trip-city')).toHaveText('');
  await cards.nth(0).locator('.btn-rename').click();
  // An empty name says why instead of silently keeping the old one.
  await cards.nth(0).locator('.rename-input').fill('  ');
  await cards.nth(0).locator('.btn-rename-save').click();
  await expect(cards.nth(0).locator('.rename-input')).toBeVisible();
  expect(await cards.nth(0).locator('.rename-input').evaluate(input => input.validationMessage)).toBe('여행 이름을 입력해 주세요.');
  await cards.nth(0).locator('.rename-input').fill('도쿄 첫 산책');
  await cards.nth(0).locator('.btn-rename-save').click();
  await expect(cards.nth(0).locator('.trip-title')).toHaveText('도쿄 첫 산책');
  await expect(cards.nth(0).locator('.trip-city')).toHaveText('');
});

test('알림은 화면 위쪽에 하나만 떠서 아래쪽 버튼도 위쪽 뒤로 버튼도 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courses');
  await page.evaluate(async () => {
    const { showErrorToast } = await import('/src/utils/toast.js');
    showErrorToast('첫 번째 오류');
    showErrorToast('두 번째 오류');
  });
  const toast = page.locator('#app-toast-container .app-toast');
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveText('두 번째 오류');
  // The container, not the toast: the toast slides in, so its box moves for 0.2s.
  const box = await page.locator('#app-toast-container').boundingBox();
  const back = await page.getByRole('button', { name: '뒤로', exact: true }).boundingBox();
  expect(box.y).toBeLessThan(844 / 4);
  expect(box.y).toBeGreaterThanOrEqual(back.y + back.height);
});

test('영문 코스에서 QR·주소를 확인하고 숙소 출발지와 필수 방문지를 로그인까지 유지한다', async ({ page }, testInfo) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async value => { window.copiedAddress = value; };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/routes/curated-seoul');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Seoul');
  // Curated stops have no checked menu data, so the page no longer says 'Not checked' for each one.
  await expect(page.getByText('English menu: Not checked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy local address' }).first().click();
  expect(await page.evaluate(() => window.copiedAddress)).toContain('서울');
  // The share box's status line is far away, so the tapped button itself says it worked.
  await expect(page.locator('.copy-address').first()).toHaveText('Copied');
  // A second tap inside the 2 s does not leave the button stuck on 'Copied'.
  await page.locator('.copy-address').first().click();
  await expect(page.locator('.copy-address').first()).toHaveText('Copy local address', { timeout: 5000 });
  expect(await page.locator('.qr').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const qrResponse = await page.request.get('/en/routes/curated-seoul/qr.svg?download=1');
  expect(qrResponse.headers()['content-disposition']).toContain('attachment');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('english-route-mobile.png'), fullPage: true });
  await page.getByLabel('Start near your accommodation (optional)').fill('My hostel near Seoul Station');
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await expect(page.locator('login-view h1').last()).toHaveText('Log in');
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('Your places in Seoul (2) are still here. Log in to keep planning.');
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.startLocation).toBe('My hostel near Seoul Station');
  expect(draft.endLocation).toBe('');
  expect(draft.anchorSchedules).toHaveLength(2);
  expect(draft.anchorSchedules.every(stop => stop.flexible && !stop.time && !stop.endTime)).toBe(true);
  expect(draft.anchorSchedules[0].name).toBe('Gyeongbokgung Palace');
  await page.reload();
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/preference\/1$/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')).startLocation)).toBe(draft.startLocation);
});

test('영문 루트 페이지는 PNG QR을 내려받고, 다크 모드를 따르고, /en 오타 주소를 영어로 안내한다', async ({ page }) => {
  await page.goto('/en/routes/curated-seoul');
  await page.getByRole('link', { name: 'Start planning' }).click();
  await expect(page).toHaveURL(/#plan$/);
  await expect(page.getByLabel('Start near your accommodation (optional)')).toBeInViewport();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download QR (PNG)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('compasser-curated-seoul.png');
  const bytes = await (await import('node:fs/promises')).readFile(await file.path());
  expect([...bytes.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await background()).toBe('rgb(18, 18, 17)');
  // The theme chosen in the app wins over the system setting, as in the app.
  await page.evaluate(() => localStorage.setItem('theme', 'light'));
  await page.reload();
  expect(await background()).toBe('rgb(244, 244, 241)');
  await page.goto('/en');
  await expect(page).toHaveURL(/\/en\/routes$/);
  const typo = await page.goto('/en/rout');
  expect(typo.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'We could not find this page' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('영문 루트 목록은 도시로 바로 이동하고 카드 어디를 눌러도 그 루트가 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/routes');
  await expect(page).toHaveTitle('Short travel routes for your first days in a new city | ComPasser');
  await page.getByRole('navigation', { name: 'Cities' }).getByRole('link', { name: 'Tokyo', exact: true }).click();
  await expect(page).toHaveURL(/#city-tokyo$/);
  const tokyo = page.locator('#city-tokyo');
  await expect(tokyo.getByRole('heading', { name: 'Tokyo', exact: true })).toBeInViewport();
  // The route line, not only the title link, opens the route: the link's overlay takes a real click there.
  const line = await tokyo.locator('.card p').first().boundingBox();
  await page.mouse.click(line.x + line.width / 2, line.y + line.height / 2);
  await expect(page).toHaveURL(/\/en\/routes\/curated-tokyo$/);
  await expect(page.getByText('浅草寺', { exact: true })).toHaveAttribute('lang', 'ja');
  await expect(page.getByRole('link', { name: 'Open in Google Maps' }).first()).toHaveAttribute('href', /google\.com\/maps\/search/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('영문 여행자 코스 가져오기 실패는 로그인으로 보내지 않고 다시 시도할 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function listPublicCourses() { return { courses: [], hasMore: false }; } export async function getPublicCourse() { return null; }' }));
  await page.goto('/home?course=removedRoute&lang=en');
  await expect(page.getByRole('status').filter({ hasText: 'This route was not found or is not public.' })).toBeVisible();
  await expect(page).toHaveURL(/course=removedRoute/);
});

test('공개 코스 편집은 출처 없는 방문 정보를 거부하고 승인한 영문·작성자 정보만 전달한다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") }));
  await page.route('**/src/lib/firestore-lazy.mjs', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function loadFirestore() { return { db: {}, doc: () => ({}), getDoc: async () => ({ exists: () => false }) }; }' }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function getUserItineraries() { return [{ id: 'route1', title: 'My private trip', itineraryPlan: { days: [{ scheduleItems: [
      { type: 'departure', title: 'Hotel', location: 'Private hotel address' },
      { type: 'attraction', title: 'Museum', location: 'Seoul museum', duration: 90 },
      { type: 'dining', title: 'Cafe', location: 'Seoul cafe', duration: 60 }
    ] }] } }]; }
    export async function saveItinerary() {} export async function updateItinerary() {} export async function renameItinerary() {} export async function deleteItinerary() {}
    export async function createSharedItinerary() {}
    export async function loadItineraryDocument() {}
    export async function watchSharedItinerary() {}
  ` }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function getPublicCourse() { return null; }
    export async function publishCourse(id, data) { window.publishedRoute = data; }
    export async function unpublishCourse() {}
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
  ` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile/trips');
  const profile = page.locator('profile-view:visible');
  await profile.getByRole('button', { name: '코스 공개·관리' }).click();
  const editor = profile.locator('.public-course-editor');
  await editor.getByLabel('공개 코스 제목 (여행 날짜·숙소 정보 제외)').fill('박물관 오후');
  await editor.getByLabel('영문 코스 제목 (선택)').fill('Museum afternoon');
  await editor.getByLabel('공개 작성자 이름·채널명 (선택)').fill('Travel creator');
  await editor.getByLabel('원본 영상·게시물 링크 (선택)').fill('https://example.com/video');
  const details = editor.locator('details').first();
  await details.locator('summary').click();
  await details.getByLabel('영어 메뉴', { exact: true }).selectOption('available');
  await editor.getByRole('button', { name: '이 코스 공개하기' }).click();
  await expect(editor.getByRole('status')).toContainText('올바른 출처 URL');
  expect(await page.evaluate(() => window.publishedRoute)).toBeUndefined();
  await details.getByLabel('영문 장소명 (선택)').fill('Museum');
  await details.getByLabel('확인한 출처 URL').fill('https://example.com/menu');
  await details.getByLabel('확인 날짜').fill('2020-01-01');
  await editor.getByRole('button', { name: '이 코스 공개하기' }).click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await expect(editor.getByRole('link', { name: '영문 코스·공유·QR 보기' })).toHaveAttribute('href', /\/en\/routes\/route1$/);
  const published = await page.evaluate(() => window.publishedRoute);
  expect(published.stops).toHaveLength(2);
  expect(published.stops[0].visitorInfo.englishMenu).toBe('available');
  expect(published.creditName).toBe('Travel creator');
  expect(JSON.stringify(published)).not.toContain('Private hotel');
  expect(await editor.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});

test('공유 URL은 직접 열리고, 보호 화면은 로그인 후 원래 주소로 돌아온다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.goto('/share/abc123');
  await expect(page.locator('.ionic-desktop-schedule')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/share\/abc123$/);

  await page.goto('/profile/security');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fsecurity$/);
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/profile\/security$/);
});

const missingItineraryStore = `
  export async function readPrivateStopNote() {} export async function writePrivateStopNote() {}
  export async function loadItineraryDocument() { return null; }
  export async function saveItinerary() {} export async function updateItinerary() {} export async function renameItinerary() {} export async function deleteItinerary() {}
  export async function createSharedItinerary() {}
  export async function getUserItineraries() { return []; }
  export function watchSharedItinerary() { return () => {}; }
`;

test('느린 연결에서 앱 코드가 오기 전에도 불러오는 중임을 보여 준다', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/src/prototype/ionic-shell.jsx', async route => { await held; await route.continue(); });
  await page.goto('/home', { waitUntil: 'commit' });
  await expect(page.getByRole('status').filter({ hasText: '불러오는 중…' })).toBeVisible();
  await expect(page.getByText('Loading…', { exact: true })).toBeHidden();
  release();
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeVisible();
  await expect(page.locator('.boot')).toHaveCount(0);
});

test('홈 밖 화면의 코드가 늦게 오면 불러오는 중을 보이고, 도착하면 새 제목으로 포커스가 간다', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/src/prototype/ionic-screens.jsx', async route => { await held; await route.continue(); });
  await page.goto('/home');
  await expect(page.locator('.travel-globe svg path')).toHaveCount(177);
  await page.getByRole('button', { name: '코스 둘러보기' }).focus();
  await page.keyboard.press('Enter');
  // Ionic hides the old page after 300 ms of waiting; the loader under it must then show, not a blank outlet.
  await expect(page.getByRole('status').filter({ hasText: 'ComPasser' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeHidden();
  release();
  await expect(page.getByRole('heading', { name: '어느 나라의 코스를 볼까요?' })).toBeFocused();
  await expect(page.locator('.boot')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeVisible();
  await expect(page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)')).toHaveCount(1);
});

test('느린 공유 링크는 시트에 불러오는 중을 보여 주고, 없는 일정에는 지도를 받지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const getMapsLoader = () => ({ importLibrary: async () => { window.mapsLibraries = (window.mapsLibraries || 0) + 1; return {}; } });
  ` }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore.replace(
    'export async function loadItineraryDocument() { return null; }',
    'export async function loadItineraryDocument() { await new Promise(resolve => { window.releaseDocument = resolve; }); return null; }') }));
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await page.goto('/share/abc123');
  await expect(sheet.getByRole('status').filter({ hasText: '일정을 불러오는 중…' })).toBeVisible();
  // Still said while the read itself is pending, not only while the views load.
  await expect.poll(() => page.evaluate(() => typeof window.releaseDocument)).toBe('function');
  await expect(sheet.locator('itinerary-view').getByRole('status').filter({ hasText: '일정을 불러오는 중…' })).toBeVisible();
  await page.evaluate(() => window.releaseDocument());
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await expect(sheet.getByRole('status').filter({ hasText: '일정을 불러오는 중…' })).toBeHidden();
  expect(await page.evaluate(() => window.mapsLibraries || 0)).toBe(0);
  await expect(page.locator('map-view').getByText('Loading Map...')).toHaveCount(0);
  await expect(page.locator('map-view #loading-overlay')).toHaveAttribute('aria-hidden', 'true');
});

test('오프라인이 되어도 이미 불러온 여행자 코스를 보여 주고, 다시 연결되면 스스로 다시 불러온다', async ({ page }) => {
  // Offline, Firebase Auth can take long to report its state (CI showed it); the review panel must not wait for it.
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace(
    'setTimeout(() => callback(currentUser), 0);', 'if (navigator.onLine) setTimeout(() => callback(currentUser), 0);') }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const offline = () => { if (!navigator.onLine) throw new Error('Failed to get documents from server'); };
    export async function listPublicCourses() { offline(); window.courseLoads = (window.courseLoads || 0) + 1;
      return { courses: [{ id: 'walk1', ownerId: 'another-user', title: 'Palace walk', review: '', stops: [{ name: '경복궁', location: '경복궁, 서울 종로구', stayMinutes: 60 }] }], hasMore: false }; }
    export async function getPublicCourse() { return null; }
    export async function listCourseReviews() { offline(); return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { offline(); return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible');
  await expect(courses.getByText('Palace walk')).toBeVisible();
  // The installed app has every chunk precached; the dev server does not, so open and close the
  // panel once online, through the app's own import, before going offline.
  const toggle = courses.getByRole('button', { name: /^여행자 후기 (보기·작성|닫기)/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await expect(courses.locator('course-reviews')).toHaveCount(0);
  await page.context().setOffline(true);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-course-city=seoul]').click();
  await expect(courses.getByText('오프라인이라 이미 불러온 코스를 보여 주고 있어요.', { exact: false })).toBeVisible();
  await expect(courses.getByText('Palace walk')).toBeVisible();
  await expect(courses.getByRole('button', { name: '다시 시도' })).toHaveCount(0);
  await courses.getByRole('button', { name: '여행자 후기 보기·작성' }).click();
  await expect(courses.locator('course-reviews').getByRole('status')).toHaveText('오프라인이에요. 연결되면 다시 불러올게요.');
  const loads = await page.evaluate(() => window.courseLoads);
  await page.context().setOffline(false);
  await expect.poll(() => page.evaluate(() => window.courseLoads)).toBe(loads + 1);
  await expect(courses.getByText('오프라인이라', { exact: false })).toHaveCount(0);
  await expect(courses.getByText('Palace walk')).toBeVisible();
  // The re-rendered list opens the review panel the user had open, and it loads now.
  await expect(courses.locator('course-reviews')).toContainText('아직 여행자 후기가 없습니다.');
});

test('결과 화면 모듈을 받지 못하면 불러오는 중 대신 다시 불러오기를 보여 준다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/ui/itinerary-view.js', route => route.abort());
  await page.goto('/share/abc123');
  const schedule = page.locator('.ionic-desktop-schedule');
  await expect(schedule.getByRole('alert')).toContainText('화면을 불러오지 못했습니다');
  await expect(schedule.getByRole('button', { name: '화면 다시 불러오기' })).toBeVisible();
  await expect(schedule.getByRole('status').filter({ hasText: '일정을 불러오는 중…' })).toHaveCount(0);
});

test('휴대폰 결과 시트는 결과 화면에서는 닫히지 않고, 화면을 떠나면 다음 화면을 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await page.goto('/share/abc123');
  await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(modal => modal.dismiss())).toBe(false);
  // A new trip starts where home's 일정 만들기 does.
  await sheet.getByRole('button', { name: '새 일정 만들기' }).click();
  await expect(page).toHaveURL(/\/recommend$/);
  await expect(sheet).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(/\/share\/abc123$/);
  await expect(sheet).toBeVisible();
});

test('휴대폰과 넓은 화면을 두 번 오가도 결과 시트에 일정이 다시 채워진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await page.goto('/share/abc123');
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  // Tablet rotation: the sheet unmounts at 900px+ without Ionic's dismiss events.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.ionic-desktop-schedule').getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
});

test('휴대폰 결과 시트는 오프라인에서 돌아와도 일정이 다시 채워진다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await page.goto('/share/abc123');
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText('오프라인 읽기 전용', { exact: false })).toBeVisible();
  await page.context().setOffline(false);
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  // Crossing 900px while offline still leaves the right layout once back online.
  await page.context().setOffline(true);
  await expect(page.getByText('오프라인 읽기 전용', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().setOffline(false);
  await expect(page.locator('.ionic-desktop-schedule').getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
});

test('알 수 없는 주소는 로그인 대신 찾을 수 없음 화면을 보여준다', async ({ page }) => {
  await page.goto('/unknown-page');
  await expect(page).toHaveURL(/\/unknown-page$/);
  await expect(page.getByText('주소를 확인해 주세요.')).toBeVisible();
  // The page is not a dead end: it leads home and keeps the language and theme switches.
  const notFound = page.locator('.ion-page:visible');
  await expect(notFound.getByRole('button', { name: 'English' })).toBeVisible();
  await expect(notFound.getByRole('button', { name: /다크 모드|라이트 모드/ })).toBeVisible();
  await notFound.getByRole('link', { name: '홈으로' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toHaveCount(0);

  // Unknown profile tabs and malformed trip IDs are not trips to sign in for, and say so in the heading and tab title.
  for (const path of ['/profile/unknown', '/share/abc-def', '/view/abc-def']) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('.ion-page:visible h1')).toHaveText('페이지를 찾을 수 없습니다');
    await expect(page).toHaveTitle('페이지를 찾을 수 없습니다 · ComPasser');
  }

  // A trailing slash opens the same screen instead of a page that never becomes active.
  // The redirect must not change the shell's hook count between renders, which React reports as a page error.
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/courses/?country=JPN');
  await expect(page).toHaveURL(/\/courses\?country=JPN$/);
  await expect(page.locator('.ion-page:visible h1')).not.toHaveText('');
  await page.goto('/profile/trips/');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Ftrips$/);
  await expect(page.locator('.ion-page:visible h1')).not.toHaveText('');
  expect(errors).toEqual([]);
});

test('게스트를 로그인으로 보낼 때 주소의 쿼리도 돌아올 곳에 남긴다', async ({ page }) => {
  await page.goto('/profile/personal?tab=trips');
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fpersonal%3Ftab%3Dtrips$/);
  await page.goto('/plan?review=1');
  await expect(page).toHaveURL(/\/login\?next=%2Fplan%3Freview%3D1$/);
});

test('로그인 복원이 늦어도 한국 추천 목록은 표시되고 선택 없이 진행할 수 있다', async ({ page }) => {
  const delayedAuth = authModule.replace('setTimeout(() => callback(currentUser), 0);', '').concat(`
    window.restoreDiscoveryAuth = () => {
      currentUser = { uid: 'test-user', emailVerified: true, providerData: [] };
      notify(currentUser);
    };
  `);
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: delayedAuth }));
  await page.route('**/src/domains/planner/services/discovery-saves.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function loadSavedDiscoveryIds(userId) {
      window.savedDiscoveryUser = userId;
      return ['forest'];
    }
    export async function setDiscoveryPlaceSaved() {}
  ` }));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=seoul]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(6);
  await expect(page.locator('home-recommendations')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '장소 선택 없이 다음', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.savedDiscoveryUser)).toBeUndefined();
  await page.evaluate(() => window.restoreDiscoveryAuth());
  await expect.poll(() => page.evaluate(() => window.savedDiscoveryUser)).toBe('test-user');
});

test('게스트도 추천 장소를 선택하지 않고 로그인 후 취향 선택으로 이동한다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=busan]').click();
  await page.getByRole('button', { name: '장소 선택 없이 다음', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('부산 여행 계획은 그대로 있어요. 로그인하면 이어서 일정을 만들어요.');
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/preference\/1$/);
  const draft = await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.read());
  expect(draft.destination).toMatchObject({ id: 'busan', country: 'KOR' });
  expect(draft.anchorSchedules).toEqual([]);
});

test('한국 recommend와 destination은 동일한 검색창과 장소 목록 스타일을 사용한다', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({contentType:'text/javascript',body:`
    customElements.define('gmp-place-autocomplete',class extends HTMLElement {constructor(){super();this.attachShadow({mode:'open'}).innerHTML='<input aria-label="Place search" style="width:100%;min-height:44px">';}});
    export const getMapsLoader=()=>({importLibrary:async()=>({})});
  `}));
  for (const width of [390,1280]) {
    await page.setViewportSize({ width, height: 900 });
    const layouts=[];
    for (const path of ['/recommend','/destination']) {
      await page.goto(path);
      if(path==='/recommend') {
        await page.locator('[data-recommend-country=KOR]').click(); await page.locator('[data-recommend-city=seoul]').click();
      } else {
        await page.evaluate(async()=> (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
        await page.reload(); await page.locator('[data-destination-country=KOR]').click(); await page.getByRole('button',{name:'서울',exact:true}).click();
      }
      await expect(page.getByRole('heading',{name:'꼭 갈 장소',exact:true})).toBeVisible();
      await expect(page.locator('gmp-place-autocomplete')).toBeVisible();
      await expect(page.locator('.flow-place-row summary')).toHaveText(['경복궁서울','서울숲서울','선유도공원서울','서촌 한옥마을서울','남산서울타워서울','북촌한옥마을서울']);
      await expect(page.getByRole('button',{name:'장소 선택 없이 다음',exact:true})).toBeEnabled();
      await expect(page.locator('home-recommendations')).toHaveCount(0);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
      layouts.push(await page.locator('.flow-place-row').evaluateAll(rows=>rows.map(row=>{const rect=row.getBoundingClientRect();return {width:rect.width,height:rect.height};})));
      await page.screenshot({path:testInfo.outputPath(`${path.slice(1)}-seoul-${width}.png`),fullPage:true});
    }
    expect(layouts[0]).toEqual(layouts[1]);
  }
});

test('장소 단계는 담은 장소와 다음 버튼이 어디서나 닿고, 빈 입력으로 담으면 이름을 입력하라고만 안내한다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule.replace('static async searchByText(request) {', 'static async searchByText(request) { window.lookups = (window.lookups || 0) + 1;') }));
  const reachable = locator => locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return box.top >= 0 && box.bottom <= window.innerHeight && box.height >= 44 && (hit === element || element.contains(hit));
  });
  for (const [width, height] of [[390, 667], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto('/destination');
    await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
    await page.reload();
    await page.locator('[data-destination-country=KOR]').click();
    await page.getByRole('button', { name: '서울', exact: true }).click();

    await page.getByRole('button', { name: '꼭 갈 장소로 담기', exact: true }).click();
    await expect(page.locator('.flow-page [role=alert]')).toHaveText('장소 이름을 입력해 주세요.');
    expect(await page.evaluate(() => window.lookups || 0)).toBe(0);
    await page.locator('gmp-place-autocomplete input').fill('경복');
    await expect(page.locator('.flow-page [role=alert]')).toHaveCount(0);
    await page.getByRole('button', { name: '꼭 갈 장소로 담기', exact: true }).click();
    await expect(page.locator('.flow-page [role=alert]')).toHaveText('장소를 확인하지 못했습니다. 검색에서 다시 선택해 주세요.');
    await page.locator('gmp-place-autocomplete input').blur();

    const next = page.locator('.flow-primary');
    await expect.poll(() => reachable(next)).toBe(true);
    const lastRow = page.locator('.flow-place-row').last();
    await lastRow.locator('button').focus();
    await expect.poll(() => reachable(lastRow.locator('button'))).toBe(true);
    await page.locator('.flow-place-row').first().locator('button').click();
    await expect(page.locator('.flow-place-chip')).toHaveCount(1);
    await expect.poll(() => reachable(page.locator('.flow-place-chip'))).toBe(true);
    await expect.poll(() => reachable(next)).toBe(true);
    await expect(next).toHaveText(/1/);
    await expect.poll(() => contentOverflow(page)).toBe(false);
  }
});

test('장소 단계 하단 바는 안전 영역을 피하고, 목록이 아래로 펼쳐지는 폭에서 검색 중에는 풀리며, 포커스를 가리지 않고 칩 포커스 링이 잘리지 않는다', async ({ page }) => {
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule }));
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, bottom: 34, right: 0 } });
  await page.goto('/destination');
  await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
  await page.reload();
  await page.locator('[data-destination-country=KOR]').click();
  await page.getByRole('button', { name: '서울', exact: true }).click();
  const bar = page.locator('.flow-place-actions');
  const next = page.locator('.flow-primary');
  expect((await next.boundingBox()).y + (await next.boundingBox()).height).toBeLessThanOrEqual(844 - 34);

  // At 450px and below Google opens its own full-screen list, and closing it leaves focus in the box:
  // the bar stays pinned so Next is not lost (seen on an iPhone 17 simulator and a Galaxy S25 Edge).
  await expect(bar).toHaveCSS('position', 'sticky');
  await page.locator('gmp-place-autocomplete input').focus();
  await expect(bar).toHaveCSS('position', 'sticky');
  await page.locator('gmp-place-autocomplete input').blur();
  // Wider, Google drops its list under the box, so the bar steps aside while typing.
  await page.setViewportSize({ width: 600, height: 844 });
  await page.locator('gmp-place-autocomplete input').focus();
  await expect(bar).toHaveCSS('position', 'static');
  await page.locator('gmp-place-autocomplete input').blur();
  await expect(bar).toHaveCSS('position', 'sticky');
  await page.setViewportSize({ width: 390, height: 844 });

  const rows = page.locator('.flow-place-row > button');
  const rowCount = await rows.count();
  for (let index = 0; index < 6; index++) {
    await rows.nth(index).click();
    await expect(page.locator('.flow-place-chip')).toHaveCount(index + 1);
  }
  // Focus from the top of the page: a control already in the scrollport but under the bar must still come clear of it.
  for (let index = 0; index < rowCount; index++) {
    const row = rows.nth(index);
    await page.locator('ion-content:visible').evaluate(async content => { (await content.getScrollElement()).scrollTop = 0; });
    await row.focus();
    await expect.poll(() => row.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === element || element.contains(hit);
    }), `row ${index}`).toBe(true);
  }

  // Keyboard focus shows the real ring: the scroll box must not clip it on the first column or the last line.
  const chips = page.locator('.flow-place-chip');
  await next.focus();
  for (let index = 5; index >= 0; index--) {
    await page.keyboard.press('Shift+Tab');
    const clip = await chips.nth(index).evaluate(element => {
      const style = getComputedStyle(element);
      const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
      const box = element.getBoundingClientRect();
      const area = element.parentElement.getBoundingClientRect();
      return { focused: document.activeElement === element, ring, left: box.left - ring - area.left, bottom: area.bottom - box.bottom - ring };
    });
    expect(clip.focused).toBe(true);
    expect(clip.ring).toBeGreaterThan(0);
    expect(clip.left).toBeGreaterThanOrEqual(0);
    expect(clip.bottom).toBeGreaterThanOrEqual(0);
  }

  // However many picks, the chips scroll inside the bar instead of growing it over the page.
  await page.locator('.flow-place-chips').evaluate(area => { for (let index = 0; index < 12; index++) area.append(area.firstElementChild.cloneNode(true)); });
  expect((await bar.boundingBox()).height).toBeLessThanOrEqual(210);
});

test('장소 단계 하단 바는 화면 맨 아래까지 닿고, 끝까지 스크롤해도 마지막 내용을 가리지 않는다', async ({ page }) => {
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/destination');
  await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
  await page.reload();
  await page.locator('[data-destination-country=KOR]').click();
  await page.getByRole('button', { name: '서울', exact: true }).click();
  const bar = page.locator('.flow-place-actions');
  const barBottom = () => bar.evaluate(element => element.getBoundingClientRect().bottom);
  await expect.poll(barBottom).toBe(844);

  await page.locator('ion-content:visible').evaluate(async content => { const scroll = await content.getScrollElement(); scroll.scrollTop = scroll.scrollHeight; });
  await expect.poll(barBottom).toBe(844);
  const lastRow = await page.locator('.flow-place-row').last().boundingBox();
  expect(lastRow.y + lastRow.height).toBeLessThanOrEqual((await bar.boundingBox()).y + 1);
});

test('화면 높이가 아주 낮으면 상단과 하단 바를 풀어 내용과 포커스를 가리지 않는다', async ({ page }) => {
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule }));
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto('/destination');
  await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
  await page.reload();
  await page.locator('[data-destination-country=KOR]').click();
  await page.getByRole('button', { name: '서울', exact: true }).click();
  const rows = page.locator('.flow-place-row > button');
  for (let index = 0; index < 6; index++) {
    await rows.nth(index).click({ timeout: 5000 });
    await expect(page.locator('.flow-place-chip')).toHaveCount(index + 1);
  }
  await rows.nth(2).focus();
  await expect.poll(() => rows.nth(2).evaluate(element => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === element || element.contains(hit);
  })).toBe(true);
  await expect(page.locator('.flow-place-actions')).toHaveCSS('position', 'static');
  await expect(page.locator('.ionic-page-nav:visible')).toHaveCSS('position', 'static');
  // An ordinary landscape phone keeps both bars.
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.locator('.flow-place-actions')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.ionic-page-nav:visible')).toHaveCSS('position', 'sticky');
});

test('지도 라이브러리를 못 불러오면 없는 입력창에 이름을 입력하라고 하지 않는다', async ({ page }) => {
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const getMapsLoader = () => ({ importLibrary: async () => { throw new Error('offline'); } });" }));
  await page.goto('/destination');
  await page.evaluate(async () => (await import('/src/domains/planner/services/planner-draft.mjs')).plannerDraftStore.clear());
  await page.reload();
  await page.locator('[data-destination-country=KOR]').click();
  await page.getByRole('button', { name: '서울', exact: true }).click();
  const alert = page.locator('.flow-page [role=alert]');
  const unavailable = '지금은 장소 검색을 쓸 수 없습니다. 연결을 확인하고 새로고침해 주세요.';
  await expect(alert).toHaveText(unavailable);
  await page.getByRole('button', { name: '꼭 갈 장소로 담기', exact: true }).click();
  await expect(alert).toHaveText(unavailable);
});

test('화면 밖으로 스크롤해도 뒤로 버튼이 닿고 내용을 가리지 않으며 헤더와 겹치지 않는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") }));
  await page.setViewportSize({ width: 390, height: 667 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, left: 0, bottom: 0, right: 0 } });
  for (const [theme, attribute] of [['다크 모드', 'dark'], ['라이트 모드', 'light']]) {
    await page.goto('/');
    await page.getByRole('button', { name: theme }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', attribute);
    for (const route of ['/recommend', '/courses', '/destination', '/plan', '/profile/trips']) {
      await page.evaluate(path => window.navigate(path), route);
      const pageRoot = page.locator('ion-router-outlet > .ion-page:not(.ion-page-hidden)').last();
      const nav = pageRoot.locator('.ionic-page-nav');
      await expect(nav).toBeVisible();
      const state = await nav.evaluate(async element => {
        const content = element.closest('ion-content');
        content.insertAdjacentHTML('beforeend', '<div data-spacer style="height:3000px"></div><button data-target>x</button><div data-spacer style="height:3000px"></div>');
        const scroller = await content.getScrollElement();
        scroller.scrollTop = 1500;
        await new Promise(requestAnimationFrame);
        const control = element.querySelector('button, a');
        const box = control.getBoundingClientRect();
        const bar = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        const result = {
          scrolled: scroller.scrollTop > 0,
          controlTop: box.top,
          barTop: bar.top,
          hit: control === hit || control.contains(hit),
          height: box.height,
          background: getComputedStyle(element).backgroundColor,
          overflow: scroller.scrollWidth <= scroller.clientWidth,
        };
        const target = content.querySelector('[data-target]');
        target.scrollIntoView();
        await new Promise(requestAnimationFrame);
        result.targetGap = target.getBoundingClientRect().top - element.getBoundingClientRect().bottom;
        content.querySelectorAll('[data-spacer], [data-target]').forEach(node => node.remove());
        scroller.scrollTop = 0;
        return result;
      });
      expect(state.scrolled, route).toBe(true);
      expect(state.barTop, route).toBeLessThanOrEqual(0);
      expect(state.controlTop, route).toBeGreaterThanOrEqual(47);
      expect(state.hit, route).toBe(true);
      expect(state.height, route).toBeGreaterThanOrEqual(44);
      expect(state.background, route).toMatch(/^rgb\(/);
      expect(state.overflow, route).toBe(true);
      expect(state.targetGap, route).toBeGreaterThanOrEqual(0);
    }
  }
  await page.goto('/nowhere');
  const notFound = page.locator('.ionic-page-nav:visible');
  await expect(page.locator('ion-header:visible')).toHaveCount(1);
  await expect(notFound).toHaveCSS('position', 'static');
});

test('언어와 화면 모드가 모든 Ionic 화면에서 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(page.getByRole('heading', { name: 'AI plans your trip, day by day' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.locator('.ionic-settings button').first()).toHaveCSS('background-color', 'rgb(26, 26, 25)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'AI plans your trip, day by day' })).toBeVisible();
  await page.goto('/login');
  await expect(page.locator('login-view h1').last()).toHaveText('Log in');
  await page.goto('/share/abc123');
  await expect(page.locator('.ionic-desktop-schedule .ionic-settings')).toBeVisible();
  await page.locator('.ionic-desktop-schedule').getByRole('button', { name: 'Light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('손님도 화면 설정의 언어 버튼으로 언어를 바꾸고 ?lang=ko 주소로 한국어를 연다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  // The English route page's "Build your trip" opens the app in English.
  await page.goto('/home?lang=en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.getByRole('heading', { name: '날짜별 여행 일정, AI가 짜 드려요' })).toBeVisible();
  expect((await page.getByRole('button', { name: '다크 모드', exact: true }).boundingBox()).x).toBeGreaterThan(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/login');
  await expect(page.locator('login-view h1').last()).toHaveText('로그인');
  // A plain visit to the login page needs no reason line.
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveCount(0);
  const privacy = page.locator('login-view a[data-i18n="authPrivacyLink"]').last();
  await expect(privacy).toHaveText('개인정보처리방침');
  await expect(privacy).toHaveAttribute('href', 'https://hackerton-48w.pages.dev/privacy');
  await expect(privacy).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('login-view h1').last()).toHaveText('Log in');
  await expect(privacy).toHaveText('Privacy Policy (English translation below the Korean)');
  await page.goto('/join');
  const joinPrivacy = page.locator('join-view a[data-i18n="authPrivacyLink"]').last();
  await expect(joinPrivacy).toHaveText('Privacy Policy (English translation below the Korean)');
  await expect(joinPrivacy).toHaveAttribute('href', 'https://hackerton-48w.pages.dev/privacy');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/home?lang=ko');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  // Only the two app languages come from the address bar.
  await page.goto('/home?lang=constructor');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  expect(await page.evaluate(() => localStorage.getItem('compasser_lang'))).toBe('ko');
});

test('인증 결과 화면은 언어를 바꿔도 결과 문구를 유지한다', async ({ page }) => {
  await page.goto('/verify');
  const title = page.locator('verify-view #title-text').last();
  await expect(title).toHaveText('유효하지 않은 요청');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(title).toHaveText('Invalid request');
});

test('로그인 사용자는 탭을 바꾸고 브라우저 뒤로 가기로 돌아온다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true }"),
  }));
  await page.goto('/home');
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await page.locator('ion-tab-button[tab=trips]').click();
  await expect(page).toHaveURL(/\/profile\/trips$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
});

test('추천 장소와 코스는 각각의 화면에서 선택하고 로그인 후에도 선택한 필수 방문지를 유지한다', async ({ page }, testInfo) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=seoul]').click();
  const cards = page.locator('.flow-place-list');
  await expect(cards.locator('.flow-place-row')).toHaveCount(6);
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await expect(cards.locator('.flow-place-row').nth(1).locator('summary')).toHaveText('Seoul ForestSeoul');
  await page.screenshot({ path: testInfo.outputPath('recommendations-mobile.png'), fullPage: true });

  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('home-courses:visible');
  await expect(courses.locator('article')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('courses-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=seoul]').click();
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('ko'));
  await expect(cards.locator('.flow-place-row').nth(1).locator('summary')).toHaveText('서울숲서울');
  await page.screenshot({ path: testInfo.outputPath('recommendations-desktop.png'), fullPage: true });
  await page.evaluate(async()=> (await import('/src/utils/i18n.js')).setLang('en'));
  await cards.locator('.flow-place-row').nth(1).locator('button').click();
  await expect(cards.locator('.flow-place-row').nth(1).locator('button')).toHaveAttribute('aria-pressed','true');
  await page.locator('.flow-primary').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await page.reload();
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/preference\/1$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')).anchorSchedules[0]?.location?.displayName))
    .toBe('서울숲');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')).startLocation)).toBe('');
  const preference = page.locator('preference-view:visible');
  await preference.locator('[data-date-type=today]').click();
  await preference.locator('[data-duration="1"]').click();
  await preference.locator('#next-step-btn').click();
  await expect(page).toHaveURL(/\/preference\/2$/);
  await page.getByRole('button', { name: 'Continue without a travel style' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('travel-form .anchor-item .anchor-name').last()).toHaveValue('서울숲');
  await expect(page.locator('travel-form .anchor-item .anchor-location input').last()).toHaveValue('서울숲');
  expect(await page.locator('travel-form .anchor-item .anchor-location').last().evaluate(element => element.selectedPlace?.placeId)).toBe('ChIJ5zJtW3GlfDURH3JA5u66uXI');

  await page.goto('/courses');
  await chooseCourseCity(page, 'busan');
  await courses.locator('button[data-course=curated-busan]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const courseDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(courseDraft.anchorSchedules.slice(-2).map(anchor => anchor.name)).toEqual(['Haeundae Beach', 'Dongbaekseom Island']);
  expect(courseDraft.anchorSchedules.slice(-2).every(anchor => anchor.flexible && !anchor.time)).toBe(true);
});

test('다른 도시를 둘러보거나 다른 도시 코스를 담으면 이전 도시의 필수 방문지와 섞이지 않는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: mapsModule }));
  const draft = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=seoul]').click();
  await page.locator('.flow-place-row').nth(1).locator('button').click();
  await expect(page.locator('.flow-place-chip')).toHaveText(['서울숲 ×']);
  // The official guide link in a place's details is a finger-sized target, not a 22px line of text.
  await page.locator('.flow-place-row').nth(1).locator('summary').click();
  const guide = page.locator('.flow-place-row').nth(1).getByRole('link');
  expect((await guide.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.getByRole('button', { name: '뒤로', exact: true }).click();
  await page.locator('[data-recommend-country=JPN]').click();
  await page.locator('[data-recommend-city=tokyo]').click();
  await expect(page.locator('.flow-place-row')).toHaveCount(3);
  await expect(page.locator('.flow-place-chip')).toHaveCount(0);
  expect((await draft()).destination.id).toBe('seoul');
  await page.locator('.flow-place-row').first().locator('button').click();
  // The chip uses the row's name on a Korean screen; the stored anchor keeps the name the AI and geocoder use.
  await expect(page.locator('.flow-place-chip')).toHaveText(['센소지 ×']);
  expect((await draft()).destination.id).toBe('tokyo');
  expect((await draft()).anchorSchedules[0].name).toBe('Sensō-ji');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.locator('.flow-place-chip')).toHaveText(['Sensoji Temple ×']);
  await page.getByRole('button', { name: '한국어', exact: true }).click();

  await page.goto('/courses');
  await chooseCourseCity(page);
  await page.locator('home-courses:visible button[data-course=curated-seoul]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  expect((await draft()).destination).toMatchObject({ id: 'seoul', country: 'KOR' });
  expect((await draft()).anchorSchedules.map(anchor => anchor.name)).toEqual(['경복궁', '서촌 한옥마을']);
});

test('같은 탭에서 영문 코스를 여러 개 담으면 마지막 코스의 도시·장소·출발지만 남는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  for (const [id, start] of [['curated-tokyo', 'Hotel in Asakusa'], ['curated-seoul', '']]) {
    await page.goto(`/en/routes/${id}`);
    await page.getByLabel('Start near your accommodation (optional)').fill(start);
    await page.getByRole('link', { name: 'Plan with these places' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  }
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.destination).toMatchObject({ id: 'seoul', country: 'KOR' });
  expect(draft.anchorSchedules.map(stop => stop.name)).toEqual(['Gyeongbokgung Palace', 'Seochon Hanok Village']);
  expect(draft.startLocation).toBe('');
});

test('같은 도시 영문 코스를 이어 담으면 빈 출발지 칸이 기존 출발지를 지우지 않는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  for (const [id, start] of [['curated-seoul', 'Myeongdong Station'], ['curated-seoul-2', '']]) {
    await page.goto(`/en/routes/${id}`);
    await page.getByLabel('Start near your accommodation (optional)').fill(start);
    await page.getByRole('link', { name: 'Plan with these places' }).click();
    await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  }
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.destination).toMatchObject({ id: 'seoul' });
  expect(draft.startLocation).toBe('Myeongdong Station');
});

test('새 탭에서 같은 도시 영문 코스를 담아도 저장해 둔 초안의 장소와 출발지가 남는다', async ({ page }) => {
  // Real Firebase settles after the home screen mounts; the saved draft is restored only then.
  const slowAuth = authModule.replace('setTimeout(() => callback(currentUser), 0);', 'setTimeout(() => callback(currentUser), 500);');
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: slowAuth }));
  await page.goto('/en/routes/curated-seoul');
  await page.getByLabel('Start near your accommodation (optional)').fill('Myeongdong Station');
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  // A new tab shares localStorage but starts with an empty sessionStorage.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/en/routes/curated-seoul-2');
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('compasser.planner.v1')).draft);
  expect(saved.startLocation).toBe('Myeongdong Station');
  expect(saved.anchorSchedules.map(stop => stop.name)).toEqual(['Gyeongbokgung Palace', 'Seochon Hanok Village', 'Bukchon Hanok Village']);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')))).toEqual(saved);
});

test('빈 출발지는 앱이 이어 쓸 저장 사본의 도시를 기준으로 지우거나 남긴다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.goto('/en/routes/curated-seoul-2');
  // This tab still holds Seoul, but another tab saved Busan last; the app restores that saved copy.
  await page.evaluate(() => {
    const draft = (id, name, startLocation) => ({ destination: { id, country: 'KOR', name }, startLocation, anchorSchedules: [] });
    sessionStorage.setItem('currentFormData', JSON.stringify(draft('seoul', 'Seoul, South Korea', 'Myeongdong Station')));
    localStorage.setItem('compasser.planner.v1', JSON.stringify({ owner: null, draft: draft('busan', 'Busan, South Korea', 'Haeundae Beach') }));
  });
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('compasser.planner.v1')).draft);
  expect(saved.destination).toMatchObject({ id: 'seoul' });
  expect(saved.startLocation).toBe('');
});

test('영문 페이지에서 다른 도시의 여행자 코스를 담으면 그 코스 도시로 바뀐다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function getPublicCourse(id) { return id === 'travelerSeoul' ? { ownerId: 'another-user', title: 'Palace walk', review: '', stops: [
      { name: '경복궁', location: '경복궁, 서울 종로구', stayMinutes: 60 }, { name: '북촌', location: '북촌, 서울 종로구', stayMinutes: 60 }
    ] } : null; }
  ` }));
  await page.goto('/home?course=curated-tokyo&lang=en');
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await page.goto('/home?course=travelerSeoul&lang=en');
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.destination).toMatchObject({ id: 'seoul', country: 'KOR' });
  expect(draft.anchorSchedules.map(stop => stop.name)).toEqual(['경복궁', '북촌']);
});

test('공개 여행자 코스를 가져오면 장소가 필수 방문지로 이어진다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [{ id: 'route1', title: 'A quiet afternoon', review: 'Easy to walk', stops: [
      { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 },
      { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 }
    ] }], hasMore: false }; }
    export async function getPublicCourse() { return null; }
  ` }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible');
  await courses.scrollIntoViewIfNeeded();
  await expect(courses.getByText('A quiet afternoon')).toBeVisible();
  await expect(courses.getByText('Easy to walk')).toBeVisible();
  await courses.getByRole('button', { name: '이 코스로 일정 만들기' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('서울에서 고른 장소 2곳은 그대로 있어요. 로그인하면 이어서 일정을 만들어요.');
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.anchorSchedules.map(stop => stop.name)).toEqual(['Museum', 'Cafe']);
  expect(draft.anchorSchedules.every(stop => stop.flexible && !stop.time)).toBe(true);
  expect(draft.startLocation).toBe('');
  expect(draft.destination).toMatchObject({ id: 'seoul', country: 'KOR' });
});

test('공개 코스가 없으면 게스트가 자기 코스를 공개하는 흐름으로 갈 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function listPublicCourses() { return { courses: [], hasMore: false }; } export async function getPublicCourse() { return null; }' }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible');
  await courses.scrollIntoViewIfNeeded();
  await courses.getByRole('button', { name: '내 일정에서 코스 공개하기' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Ftrips$/);
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('내 일정과 프로필은 로그인해야 볼 수 있어요.');
});

test('게스트가 내 일정·프로필 탭을 누르면 로그인 화면이 이유를 말한다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.goto('/home');
  await page.locator('ion-tab-button[tab=trips]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Ftrips$/);
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('내 일정과 프로필은 로그인해야 볼 수 있어요.');
  await page.goBack();
  await page.locator('ion-tab-button[tab=profile]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Fpersonal$/);
  await expect(page.locator('.ionic-auth-reason:visible')).toHaveText('내 일정과 프로필은 로그인해야 볼 수 있어요.');
});

test('로그아웃하면 프로필에 남지 않고 홈이 보인다', async ({ page }) => {
  // Native logout keeps working after Firebase has already reported the sign-out.
  const signedIn = authModule
    .replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };")
    .replace('export async function logout() { currentUser = null; notify(null); }', 'export async function logout() { currentUser = null; notify(null); await new Promise(resolve => setTimeout(resolve, 500)); }');
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: signedIn }));
  await page.goto('/home');
  await page.locator('ion-tab-button[tab=profile]').click();
  await expect(page.locator('profile-view[data-active]')).toBeVisible();
  await page.evaluate(() => window.navigate('/profile/security'));
  await page.locator('profile-view[data-active] #security.active #btn-logout').click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator('profile-view:visible')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '일정 만들기', exact: true })).toBeVisible();
});

test('이메일로 가입해도 게스트가 고른 여행 계획이 남는다', async ({ page }) => {
  const signUpModule = authModule
    .replace('export async function signUpWithEmail() {}', "export async function signUpWithEmail() { notify({ uid: 'new-user', providerData: [{ providerId: 'password' }], emailVerified: false }); await new Promise(resolve => setTimeout(resolve, 50)); notify(null); }")
    .replace('export async function logout() {', "export async function logout({ keepLocalData = false } = {}) { if (!keepLocalData) { localStorage.removeItem('compasser.planner.v1'); sessionStorage.removeItem('currentFormData'); sessionStorage.removeItem('userPreference'); }");
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: signUpModule }));
  await page.goto('/recommend');
  await page.locator('[data-recommend-country=KOR]').click();
  await page.locator('[data-recommend-city=busan]').click();
  await page.getByRole('button', { name: '장소 선택 없이 다음', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await page.locator('login-view #go-to-join').last().click();
  await expect(page).toHaveURL(/\/join\?next=%2Fpreference%2F1$/);
  // Login and join both show this line for a moment while the pages swap; read the join page's own.
  await expect(page.locator('ion-router-outlet > .ion-page', { has: page.locator('join-view') }).locator('.ionic-auth-reason')).toHaveText('부산 여행 계획은 그대로 있어요. 로그인하면 이어서 일정을 만들어요.');
  await page.locator('join-view #email-input').last().fill('new@example.com');
  await page.locator('join-view #password-input').last().fill('password');
  await page.locator('join-view #email-signup-btn').last().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('compasser.planner.v1') || 'null')?.draft?.destination?.id)).toBe('busan');
  await expect(page.locator('ion-router-outlet > .ion-page', { has: page.locator('login-view') }).locator('.ionic-auth-reason')).toHaveText('부산 여행 계획은 그대로 있어요. 로그인하면 이어서 일정을 만들어요.');
});

test('여행자 코스 카드는 체류시간을 보여 주고, 빈 소개 칸이 없으며, 후기 토글 이름이 상태를 따른다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [
      { id: 'noNote', ownerId: 'other', title: 'No note', review: '', stops: [{ name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 }, { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 }] },
      { id: 'withNote', ownerId: 'other', title: 'With note', review: 'Easy to walk', stops: [{ name: 'Park', location: 'Seoul Park', stayMinutes: 60 }, { name: 'Market', location: 'Seoul Market', stayMinutes: 60 }] },
    ], hasMore: false }; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function getPublicCourse() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible');
  const card = courses.locator('article', { hasText: 'No note' });
  await expect(card.locator('.duration')).toHaveText('예상 체류 2시간 30분 (이동 제외)');
  await expect(card.locator('.review')).toHaveCount(0);
  await expect(courses.locator('article', { hasText: 'With note' }).locator('.review')).toHaveText('Easy to walk');

  const toggle = card.locator('button[aria-expanded]');
  await expect(toggle).toHaveText('여행자 후기 보기·작성');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(toggle).toHaveText('여행자 후기 닫기');
  await expect(toggle).toHaveAttribute('aria-label', '여행자 후기 닫기: No note');
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toHaveText('여행자 후기 보기·작성');
  await expect(toggle).toHaveAttribute('aria-label', '여행자 후기 보기·작성: No note');
  await expect(toggle).toBeFocused();
});

test('공개 코스를 검색하고 여행자 경험 후기를 작성·수정·삭제한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    let mine = null;
    export async function listPublicCourses() { return { courses: [{ id: 'reviewRoute', ownerId: 'another-user', title: 'Museum afternoon', review: '', stops: [
      { name: 'Museum', location: 'Seoul Museum', stayMinutes: 90 }, { name: 'Cafe', location: 'Seoul cafe', stayMinutes: 60 }
    ] }], hasMore: false }; }
    export async function listCourseReviews() { return { reviews: mine ? [mine] : [], hasMore: false }; }
    export async function getMyCourseReview() { return mine; }
    export async function getPublicCourse() { return null; }
    export async function saveCourseReview(course, input) { mine = { ...input, userId: 'test-user', walkingKm: Number(input.walkingKm), spentWon: Number(input.spentWon), visitMinutes: Number(input.visitMinutes) }; }
    export async function deleteCourseReview() { mine = null; }
  ` }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible'); await courses.scrollIntoViewIfNeeded();
  await expect(courses.getByText('Museum afternoon')).toBeVisible();
  await expect(courses.locator('select[name=city]')).toHaveCount(0);
  await courses.locator('input[name=search]').fill('missing');
  await expect(courses.locator('article')).toHaveCount(0);
  await courses.locator('input[name=search]').fill('museum');
  await courses.locator('select[name=duration]').selectOption('short');
  await expect(courses.locator('article')).toHaveCount(1);
  await courses.getByRole('button', { name: '여행자 후기 보기·작성' }).click();
  const reviews = courses.locator('course-reviews');
  await reviews.getByRole('button', { name: '로그인하고 후기 쓰기' }).click();
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/courses\?country=KOR&city=seoul&review=reviewRoute$/);
  await reviews.locator('input[name=visitDate]').fill('2020-01-01');
  await reviews.locator('input[name=walkingKm]').fill('3.5');
  await reviews.locator('input[name=spentWon]').fill('20000');
  await reviews.locator('input[name=visitMinutes]').fill('120');
  await reviews.locator('textarea').fill('박물관은 시간이 더 필요했어요.');
  await reviews.getByRole('button', { name: '후기 공개하기' }).click();
  await page.locator('#app-confirm-host').getByRole('button', { name: '후기 공개하기' }).click();
  await expect(reviews.locator('section .comment')).toHaveText('박물관은 시간이 더 필요했어요.');
  await reviews.screenshot({ path: testInfo.outputPath('traveler-review-mobile.png') });
  await reviews.locator('textarea').fill('수정한 후기');
  await reviews.getByRole('button', { name: '내 후기 수정하기' }).click();
  await page.locator('#app-confirm-host').getByRole('button', { name: '후기 공개하기' }).click();
  await expect(reviews.locator('section .comment')).toHaveText('수정한 후기');
  await reviews.getByRole('button', { name: '내 후기 삭제', exact: true }).click();
  await page.locator('#app-confirm-host').getByRole('button', { name: '삭제', exact: true }).click();
  await expect(reviews.locator('section')).toHaveCount(0);
});

test('공개 코스와 후기를 신고하고, 차단한 작성자의 글은 다시 열어도 숨긴다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/content-reports.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function reportContent(report) { (window.__reports ||= []).push(report); }
  ` }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const stops = [{ name: 'Gate', location: 'Seoul', stayMinutes: 60 }, { name: 'Cafe', location: 'Seoul', stayMinutes: 60 }];
    export async function listPublicCourses() { return { courses: [
      { id: 'spamRoute', ownerId: 'spammer', title: 'Spam walk', review: '', stops },
      { id: 'goodRoute', ownerId: 'another-user', title: 'Good walk', review: '', stops },
    ], hasMore: false }; }
    export async function listCourseReviews(course) { return { reviews: course.id === 'goodRoute' ? [
      { id: 'goodRoute_troll', userId: 'troll', visitDate: '2026-10-04', comment: 'Rude words', walkingKm: null, spentWon: null, visitMinutes: null },
      { id: 'goodRoute_friend', userId: 'friend', visitDate: '2026-10-05', comment: 'Lovely', walkingKm: null, spentWon: null, visitMinutes: null },
    ] : [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function getPublicCourse() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses');
  await chooseCourseCity(page);
  const courses = page.locator('public-courses:visible');
  const confirm = page.locator('#app-confirm-host');
  const good = courses.locator('article', { hasText: 'Good walk' });
  await good.getByRole('button', { name: '여행자 후기 보기·작성' }).click();
  let reviews = good.locator('course-reviews');
  // Signed out, a reader can still hide an author but reporting needs an account.
  await expect(reviews.getByRole('button', { name: '후기 작성자 차단' })).toHaveCount(2);
  await expect(reviews.getByRole('button', { name: '후기 신고' })).toHaveCount(0);
  await reviews.getByRole('button', { name: '로그인하고 후기 쓰기' }).click();
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  reviews = courses.locator('article', { hasText: 'Good walk' }).locator('course-reviews');
  const troll = reviews.locator('section', { hasText: 'Rude words' });
  await troll.getByRole('button', { name: '후기 신고' }).click();
  await confirm.getByRole('button', { name: '신고', exact: true }).click();
  await expect(troll.getByRole('status')).toHaveText('신고가 접수됐어요. 운영자가 검토할게요.');
  // A block must not wipe a review the reader is typing.
  await reviews.locator('textarea').fill('작성 중인 후기');
  await troll.getByRole('button', { name: '후기 작성자 차단' }).click();
  await confirm.getByRole('button', { name: '차단', exact: true }).click();
  await expect(reviews.locator('section')).toHaveCount(1);
  await expect(reviews.locator('textarea')).toHaveValue('작성 중인 후기');
  await expect(reviews.locator('section')).toContainText('Lovely');
  const spam = courses.locator('article', { hasText: 'Spam walk' });
  await spam.getByRole('button', { name: '여행자 후기 보기·작성' }).click();
  await spam.locator('course-reviews').getByRole('button', { name: '코스 신고' }).click();
  await confirm.getByRole('button', { name: '신고', exact: true }).click();
  await spam.locator('course-reviews').getByRole('button', { name: '코스 작성자 차단' }).click();
  await confirm.getByRole('button', { name: '차단', exact: true }).click();
  await expect(courses.locator('article', { hasText: 'Spam walk' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__reports)).toEqual([
    { kind: 'review', targetId: 'goodRoute_troll', authorId: 'troll', text: 'Rude words' },
    { kind: 'course', targetId: 'spamRoute', authorId: 'spammer', text: 'Spam walk' },
  ]);
  await page.reload();
  await expect(courses.locator('article', { hasText: 'Good walk' })).toBeVisible();
  await expect(courses.locator('article', { hasText: 'Spam walk' })).toHaveCount(0);
});

test('후기 지출은 국내 코스만 원으로 표시하고 해외 코스는 잘못된 통화 기호를 붙이지 않는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const stops = city => [{ name: 'Gate', location: city, stayMinutes: 60 }, { name: 'Cafe', location: city, stayMinutes: 60 }];
    export async function listPublicCourses() { return { courses: [
      { id: 'seoulRoute', ownerId: 'another-user', title: 'Seoul walk', review: '', stops: stops('Seoul') },
      { id: 'tokyoRoute', ownerId: 'another-user', title: 'Tokyo walk', review: '', stops: stops('Tokyo') },
    ], hasMore: false }; }
    // Old review shape: only spentWon, no currency field.
    export async function listCourseReviews() { return { reviews: [{ visitDate: '2026-10-04', comment: 'Nice', walkingKm: null, spentWon: 20000, visitMinutes: null }], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function getPublicCourse() { return null; }
    export async function saveCourseReview() {}
    export async function deleteCourseReview() {}
  ` }));
  const panel = async (city, country) => {
    await page.goto('/courses');
    await chooseCourseCity(page, city, country);
    const courses = page.locator('public-courses:visible');
    await courses.getByRole('button', { name: '여행자 후기 보기·작성' }).click();
    const reviews = courses.locator('course-reviews');
    await expect(reviews.locator('section')).toHaveCount(1);
    await reviews.getByRole('button', { name: '로그인하고 후기 쓰기' }).click();
    await page.locator('login-view #email-input').last().fill('test@example.com');
    await page.locator('login-view #password-input').last().fill('password');
    await page.locator('login-view #email-login-btn').last().click();
    await expect(reviews.locator('input[name=spentWon]')).toBeVisible();
    return reviews;
  };
  const seoul = await panel('seoul', 'KOR');
  await expect(seoul.locator('section p').first()).toHaveText('지출: ₩20,000');
  await expect(seoul.locator('label', { has: page.locator('input[name=spentWon]') })).toHaveText('실제 지출 (원, 선택)');
  const tokyo = await panel('tokyo', 'JPN');
  await expect(tokyo.locator('section p').first()).toHaveText('지출: 20,000');
  await expect(tokyo.locator('label', { has: page.locator('input[name=spentWon]') })).toHaveText('실제 지출 (선택)');
});

test('일정 생성 결과가 Ionic 지도·시트 화면으로 이어진다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true }"),
  }));
  await page.route('**/src/domains/planner/services/gemini-optimizer.js', route => route.fulfill({
    contentType: 'text/javascript', body: `
      export async function getGenerationCredits() { return 1; }
      export async function generateOptimizedItinerary() {
        return { days: [{ day: 1, date: '2026-09-27', scheduleItems: [
          { type: 'departure', title: '광화문', time: '09:00', location: '광화문' },
          { type: 'arrival', title: '경복궁', time: '10:00', location: '경복궁' },
        ] }] };
      }
    `,
  }));
  await page.goto('/plan');
  await page.locator('travel-form:visible').first().evaluate(element => {
    element.dispatchEvent(new CustomEvent('generate-itinerary', { detail: {}, bubbles: true, composed: true }));
  });
  await expect(page).toHaveURL(/\/view$/);
  await expect(page.locator('ion-modal.ionic-result-sheet')).toBeVisible();
  await expect(page.locator('itinerary-view')).toBeVisible();
  await expect(page.locator('itinerary-view #next-stop')).toBeVisible();
  await expect(page.locator('itinerary-view #next-stop-title')).toHaveText('경복궁');
  // The default sheet height must already show the start of the day, and the map must frame above the sheet.
  const firstStop = await page.locator('itinerary-view #timeline-container .schedule-card').first().boundingBox();
  const saveBar = await page.locator('itinerary-view #actions-primary').boundingBox();
  expect(firstStop.y + 40).toBeLessThanOrEqual(saveBar.y);
  const insets = await page.locator('map-view').evaluate(map => ({ padding: map.getFrameInsets(), height: map.getBoundingClientRect().height }));
  expect(insets.padding.bottom).toBeGreaterThan(insets.height * 0.62);
  expect(insets.padding.top).toBeGreaterThan(44);
  // Rotating refits the route; otherwise it stays framed for the old shape.
  await page.locator('map-view').evaluate(map => { map.reframe = () => { window.__reframed = true; }; });
  const portrait = page.viewportSize();
  await page.setViewportSize({ width: 800, height: 390 });
  await expect.poll(() => page.evaluate(() => window.__reframed === true)).toBe(true);
  await page.setViewportSize(portrait);
  await expect(page.locator('ion-modal.ionic-result-sheet itinerary-view').getByRole('heading', { level: 1 })).toContainText('2026-09-27');
  await page.screenshot({ path: testInfo.outputPath('result-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.ionic-desktop-schedule')).toBeVisible();
  await expect(page.locator('.ionic-result-desktop map-view')).toBeVisible();
  await expect(page.locator('.ionic-desktop-schedule itinerary-view #timeline-container')).toContainText('경복궁');
  await expect(page.locator('.ionic-desktop-schedule itinerary-view #timeline-container')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('result-desktop.png'), fullPage: true });
});

test('작은 폰에서도 홈의 두 진입 버튼이 탭 바 위에 보이고, 지구본 자동 회전은 처음 만지면 멈춘다', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/home');
  const buttons = page.locator('.ionic-home-links button');
  await expect(buttons).toHaveCount(2);
  const tabBar = await page.locator('ion-tab-bar').boundingBox();
  for (const box of await buttons.evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON()))) {
    expect(box.bottom).toBeLessThanOrEqual(tabBar.y);
  }
  const globe = page.locator('.globe-stage svg');
  await expect(globe).toBeVisible();
  // Vertical swipes over the globe scroll the page; horizontal drags still turn it.
  expect(await globe.evaluate(element => getComputedStyle(element).touchAction)).toBe('pan-y');
  const toggle = page.locator('.globe-stage .globe-auto');
  await expect(toggle).toHaveAttribute('aria-label', '자동 회전 멈추기');
  const turned = () => globe.locator('path[data-country=CHN]').getAttribute('d');
  const before = await turned();
  await expect.poll(turned).not.toBe(before);
  // The first touch anywhere ends the intro turn, so taps no longer wait behind it.
  await page.locator('.ionic-home h1').click();
  await expect(toggle).toHaveAttribute('aria-label', '자동 회전 시작');
  const stopped = await turned();
  await page.waitForTimeout(300);
  expect(await turned()).toBe(stopped);
  // Rotation the user switches back on keeps going.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', '자동 회전 멈추기');
  await expect.poll(turned).not.toBe(stopped);
});

test('지구본의 작은 여행지는 44px 이상 탭 영역의 표시로 고를 수 있고, 뒷면에서는 숨는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/home');
  const globe = page.locator('.globe-stage svg');
  await expect(globe.locator('path')).toHaveCount(177);
  await page.locator('.ionic-home h1').click();
  await expect(page.locator('.globe-auto')).toHaveAttribute('aria-label', '자동 회전 시작');
  for (const code of ['SGP', 'KOR', 'TWN']) await expect(globe.locator(`.globe-marker[data-country=${code}]`)).toHaveCount(1);
  const marker = globe.locator('.globe-marker[data-country=SGP]');
  await marker.scrollIntoViewIfNeeded();
  const box = await marker.boundingBox();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  // Singapore is not in the 110m map at all, so this ring is its only spot on the globe; 22 px each way is 44 px.
  // Borneo to the east and Cambodia to the north keep their own land (see the neighbour test), so only the sea sides reach that far; the dot claims 10 px all round.
  for (const [dx, dy] of [[-22, 0], [0, 22], [10, 0], [0, -10]]) {
    expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.dataset.country, [x + dx, y + dy])).toBe('SGP');
  }
  await page.mouse.click(x - 20, y);
  await expect(page.locator('.globe-selection strong')).toHaveText('싱가포르');
  await page.locator('.globe-selection button').click();
  await expect(page).toHaveURL(/destination$/);
  await expect(page.locator('[data-city=singapore], [data-destination-city=singapore]').or(page.getByRole('button', { name: '싱가포르', exact: true })).first()).toBeVisible();
  // The same country stays one button away for keyboards and screen readers, and a turned globe hides the marker.
  await page.goto('/recommend');
  await expect(page.getByRole('button', { name: '싱가포르' })).toBeVisible();
  await page.goto('/home');
  await expect(globe.locator('.globe-marker[data-country=SGP]')).toHaveCount(1);
  await globe.focus();
  for (let turn = 0; turn < 15; turn += 1) await page.keyboard.press('ArrowRight');
  await expect(globe.locator('.globe-marker[data-country=SGP]')).toHaveCount(0);
});

test('지구본 표시의 탭 영역은 이웃 나라를 가리지 않고 바다에서만 넓어진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home');
  const globe = page.locator('.globe-stage svg');
  await expect(globe.locator('path')).toHaveCount(177);
  await globe.scrollIntoViewIfNeeded();
  // The same projection the globe starts with; the page maps its units to screen pixels.
  const projection = geoOrthographic().scale(128).translate([130, 130]).rotate([-127, -30, 0]);
  const hit = place => globe.evaluate((svg, [x, y]) => {
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return document.elementFromPoint(point.x, point.y)?.dataset.country;
  }, projection(place));
  const expected = [
    ['JPN', [130.4, 33.6]], ['JPN', [132.5, 34.4]], ['JPN', [135.5, 34.7]], ['JPN', [135.8, 35.0]], ['JPN', [136.9, 35.2]], ['JPN', [139.7, 35.7]],
    ['VNM', [106.7, 10.8]], ['THA', [100.5, 7.0]], ['MYS', [110.3, 1.55]], ['IDN', [98.7, 3.6]],
    ['KOR', [127, 37.5]], ['KOR', [131, 37.5]], ['TWN', [121, 23.7]], ['TWN', [123.5, 23]], ['SGP', [103.82, 1.35]], ['SGP', [106, 5]],
  ];
  const found = [];
  for (const [, place] of expected) found.push(await hit(place));
  expect(found).toEqual(expected.map(([code]) => code));
  // A real tap on Osaka picks Japan.
  const box = await globe.boundingBox();
  const [x, y] = projection([135.5, 34.7]);
  await page.mouse.click(box.x + x * box.width / 260, box.y + y * box.height / 260);
  await expect(page.locator('.globe-selection strong')).toHaveText('일본');
});

test('홈은 일정 만들기와 코스 둘러보기 두 진입 버튼을 제공하고 새 일정 바로가기는 없다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/home');
  const preview = page.locator('.travel-globe');
  await expect(preview).toBeVisible();
  await expect(preview.locator('svg path')).toHaveCount(177);
  const actions = page.locator('.ionic-home-links');
  await expect(actions.locator('.ionic-home-new')).toHaveCount(0);
  await expect(actions.locator('button')).toHaveCount(2);
  await expect(actions.locator('button')).toHaveText(['일정 만들기', '코스 둘러보기']);
  const desktop = await actions.locator('button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().top));
  expect(new Set(desktop).size).toBe(1);
  await expect(page.locator('.ionic-home-links a[href="/en/routes"]')).toHaveCount(0);
  await expect(page.getByText('한국 여행 영문 코스 둘러보기',{exact:true})).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await actions.locator('button').evaluateAll(buttons => buttons.map(button => { const box = button.getBoundingClientRect(); return { top: box.top, width: box.width }; }));
  expect(mobile[0].top).toBe(mobile[1].top);
  expect(Math.abs(mobile[0].width-mobile[1].width)).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
  await actions.getByRole('button', { name: '일정 만들기', exact: true }).click();
  await expect(page).toHaveURL(/\/recommend$/);
});

test('기존 /home?review= 링크는 /courses?review= 로 리다이렉트된다', async ({ page }) => {
  await page.goto('/home?review=route123');
  await expect(page).toHaveURL(/\/courses\?review=route123$/);
  await expect(page.getByRole('heading', {name: '어느 나라의 코스를 볼까요?'})).toBeVisible();
  await chooseCourseCity(page);
  await expect(page.locator('public-courses:visible')).toBeVisible();
});

test('여행자 후기 링크는 그 공개 코스의 나라·도시를 고르고 후기 창을 연다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse(id) { return id === 'reviewRoute' ? { ownerId: 'another-user', title: 'Temple morning', review: '', stops: [
      { name: 'Sensoji', location: '浅草寺, Tokyo', stayMinutes: 60 }, { name: 'Tower', location: '東京タワー, Tokyo', stayMinutes: 60 }
    ] } : id === 'brokenRoute' ? Promise.reject(new Error('offline'))
      : id === 'elsewhereRoute' ? { ownerId: 'another-user', title: 'Village walk', review: '', stops: [{ name: 'A', location: 'Somewhere', stayMinutes: 60 }] } : null; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  // A landscape phone: the panel must still be on screen once it attaches, even when its code is slow.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.route('**/course-reviews.js*', async route => { await new Promise(resolve => setTimeout(resolve, 400)); await route.continue(); });
  await page.goto('/courses?review=reviewRoute&lang=en');
  const courses = page.locator('public-courses:visible');
  await expect(page.getByRole('heading', { name: 'Explore short routes', exact: true })).toBeVisible();
  await expect(courses.getByRole('button', { name: 'Close traveler reviews', expanded: true })).toBeVisible();
  await expect(courses.locator('course-reviews').getByRole('heading', { name: 'Traveler experience reviews' })).toBeInViewport();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-course-city]')).toHaveCount(2);
  await page.goto('/courses?review=missingRoute');
  await expect(page.getByRole('heading', { name: 'Choose a country to browse routes', exact: true })).toBeVisible();
  await expect(page.locator('public-courses')).toHaveCount(0);
  // The picker no longer appears silently: the link says why it did not open the route.
  await expect(page.getByRole('status').filter({ hasText: 'This route was not found or is not public.' })).toBeVisible();
  // Picking a country and coming back clears it.
  await page.locator('[data-course-country=KOR]').click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-course-country=KOR]')).toBeVisible();
  await expect(page.getByText('This route was not found or is not public.')).toHaveCount(0);
  // A public course outside the catalogue cities is not called 'not found or not public'.
  await page.goto('/courses?review=elsewhereRoute');
  await expect(page.locator('[data-course-country=KOR]')).toBeVisible();
  await expect(page.getByText('This route was not found or is not public.')).toHaveCount(0);
  await page.goto('/courses?review=brokenRoute');
  await expect(page.getByRole('status').filter({ hasText: 'This route cannot be opened right now.' })).toBeVisible();
});

test('사라진 후기 링크는 알리고 주소에서 review 를 빼며, 목록 밖 도시의 코스도 알린다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse(id) { return id === 'brokenRoute' ? Promise.reject(new Error('offline'))
      : id === 'elsewhereRoute' ? { ownerId: 'another-user', title: 'Village walk', review: '', stops: [{ name: 'A', location: 'Somewhere', stayMinutes: 60 }] } : null; }
  ` }));
  const missing = '이 코스를 찾을 수 없거나 공개되어 있지 않아요.';
  // No extra history entry: Back from the cleaned address leaves /courses.
  await page.goto('/home');
  await page.goto('/courses?review=missingRoute');
  await expect(page.getByRole('status').filter({ hasText: missing })).toBeVisible();
  await expect(page).toHaveURL(/\/courses$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
  // An address that already has the city (reload, post-login return) stays on the list and says so too.
  await page.goto('/courses?country=KOR&city=seoul&review=missingRoute');
  await expect(page.getByRole('status').filter({ hasText: missing })).toBeVisible();
  await expect(page).toHaveURL(/\/courses\?country=KOR&city=seoul$/);
  await expect(page.locator('public-courses:visible')).toBeVisible();
  // The course exists, so its link is not 'gone': it keeps review and names the real reason.
  await page.goto('/courses?review=elsewhereRoute');
  await expect(page.getByRole('status').filter({ hasText: '이 코스의 도시는 아직 둘러보기 목록에 없어 여기서 열 수 없어요.' })).toBeVisible();
  await expect(page).toHaveURL(/review=elsewhereRoute/);
  await page.goto('/courses?review=elsewhereRoute&lang=en');
  await expect(page.getByRole('status').filter({ hasText: "This route's city isn't in the browse list yet, so it can't be opened here." })).toBeVisible();
  // A failed lookup may work on reload, so the link stays.
  await page.goto('/courses?review=brokenRoute');
  await expect(page.getByRole('status').filter({ hasText: 'This route cannot be opened right now.' })).toBeVisible();
  await expect(page).toHaveURL(/review=brokenRoute/);
});

test('주소의 도시가 코스의 도시와 다르면 후기 링크는 코스의 도시로 옮겨 후기 창을 연다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse(id) { return id === 'reviewRoute' ? { ownerId: 'another-user', title: 'Temple morning', review: '', stops: [
      { name: 'Sensoji', location: '浅草寺, Tokyo', stayMinutes: 60 }, { name: 'Tower', location: '東京タワー, Tokyo', stayMinutes: 60 }
    ] } : id === 'elsewhereRoute' ? { ownerId: 'another-user', title: 'Village walk', review: '', stops: [{ name: 'A', location: 'Somewhere', stayMinutes: 60 }] }
      : id === 'bothRoute' ? { ownerId: 'another-user', title: 'Station lunch', review: '', stops: [{ name: '서울깍두기', location: '부산광역시 중구', stayMinutes: 60 }] } : null; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  // A course the current city's list also shows keeps that city, even if another city matches first.
  await page.goto('/courses?country=KOR&city=busan&review=bothRoute');
  await expect(page.locator('public-courses:visible').getByRole('button', { name: /^여행자 후기 닫기/, expanded: true })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/city=busan&review=bothRoute/);
  await page.goto('/courses?country=KOR&city=seoul&review=reviewRoute');
  await expect(page).toHaveURL(/country=JPN&city=tokyo&review=reviewRoute/);
  await expect(page.locator('public-courses:visible').getByRole('button', { name: /^여행자 후기 닫기/, expanded: true })).toBeVisible();
  // A course outside the catalogue cities says so instead of leaving the Seoul list silent.
  await page.goto('/courses?country=KOR&city=seoul&review=elsewhereRoute');
  await expect(page.getByRole('status').filter({ hasText: '이 코스의 도시는 아직 둘러보기 목록에 없어 여기서 열 수 없어요.' })).toBeVisible();
});

test('후기 링크 정리는 URLSearchParams.size 가 없는 WebKit 에서도 나머지 주소를 지킨다', async ({ page }) => {
  await page.addInitScript(() => { delete URLSearchParams.prototype.size; });
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse() { return null; }
  ` }));
  await page.goto('/courses?country=KOR&city=seoul&review=missingRoute');
  await expect(page.getByRole('status').filter({ hasText: '이 코스를 찾을 수 없거나' })).toBeVisible();
  await expect(page).toHaveURL(/\/courses\?country=KOR&city=seoul$/);
});

test('후기 링크 안내는 내용보다 먼저 자리 잡은 알림 영역에 나타나고 한국어 단어를 끊지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse() { await new Promise(resolve => { window.releaseReview = resolve; }); return null; }
  ` }));
  await page.goto('/courses?review=missingRoute');
  const notice = page.locator('section.flow-page > p[role=status]');
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveText('');
  await notice.evaluate(element => { window.noticeElement = element; });
  await page.waitForFunction(() => window.releaseReview);
  await page.evaluate(() => window.releaseReview());
  await expect(notice).toHaveText('이 코스를 찾을 수 없거나 공개되어 있지 않아요.');
  expect(await notice.evaluate(element => [element === window.noticeElement, getComputedStyle(element).wordBreak])).toEqual([true, 'keep-all']);
});

test('도시가 있는 주소에서 후기 조회가 실패하면 목록 위에 연결 오류를 띄우지 않고 review 를 지킨다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse() { throw new Error('offline'); }
  ` }));
  const failed = page.waitForEvent('console', message => message.text().includes('Review course unavailable'));
  await page.goto('/courses?country=KOR&city=seoul&review=brokenRoute');
  await failed;
  await expect(page.locator('public-courses:visible')).toBeVisible();
  await expect(page.locator('section.flow-page > p[role=status]')).toHaveText('');
  await expect(page).toHaveURL(/review=brokenRoute/);
});

test('여행자 코스는 후기 패널에서 그 코스의 공유 페이지로 갈 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const course = { id: 'late19', ownerId: 'another-user', title: 'Seoul late', review: '', stops: [{ name: 'A', location: 'Seoul', stayMinutes: 60 }] };
    export async function listPublicCourses() { return { courses: [course], hasMore: false }; }
    export async function getPublicCourse() { return course; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {}
    export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses?country=KOR&city=seoul');
  const card = page.locator('public-courses article');
  await expect(card.getByRole('link')).toHaveCount(0);
  await card.getByRole('button', { name: /^여행자 후기 보기·작성: / }).click();
  const link = card.getByRole('link', { name: '이 코스 영어 페이지 보기' });
  await expect(link).toHaveAttribute('href', /\/en\/routes\/late19$/);
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('후기 링크의 코스 조회가 늦게 끝나도 사용자가 먼저 고른 도시를 바꾸지 않는다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [], hasMore: false }; }
    export async function getPublicCourse() {
      await new Promise(resolve => setTimeout(resolve, 1500));
      return { ownerId: 'another-user', title: 'Temple morning', review: '', stops: [{ name: 'Sensoji', location: '浅草寺, Tokyo', stayMinutes: 60 }] };
    }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses?review=reviewRoute');
  await chooseCourseCity(page);
  await page.waitForTimeout(2000);
  await expect(page.locator('home-courses:visible')).toHaveAttribute('city', 'seoul');
});

test('여행자 코스 후기 창은 휴대폰을 가로로 들어도, 태블릿과 데스크톱에서도 목록 폭을 쓴다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    const course = id => ({ id, ownerId: 'another-user', title: 'Palace walk ' + id, review: '', stops: [
      { name: '경복궁', location: '경복궁, 서울 종로구', stayMinutes: 60 }, { name: '북촌', location: '북촌, 서울 종로구', stayMinutes: 60 }
    ] });
    export async function listPublicCourses() { return { courses: ['reviewRoute', 'second', 'third'].map(course), hasMore: false }; }
    export async function getPublicCourse(id) { return id === 'reviewRoute' ? course(id) : null; }
    export async function listCourseReviews() { return { reviews: [], hasMore: false }; }
    export async function getMyCourseReview() { return null; }
    export async function saveCourseReview() {} export async function deleteCourseReview() {}
  ` }));
  await page.goto('/courses?review=reviewRoute');
  const courses = page.locator('public-courses:visible');
  const panel = courses.locator('course-reviews');
  await expect(panel).toBeVisible();
  for (const [width, height] of [[390, 844], [844, 390], [932, 430], [768, 1024], [1280, 900]]) {
    await page.setViewportSize({ width, height });
    const [cardsWidth, panelWidth] = await Promise.all([courses.boundingBox(), panel.boundingBox()].map(box => box.then(b => b.width)));
    expect(panelWidth).toBeGreaterThan(cardsWidth * 0.8);
  }
});


test('로그인·가입 칸은 보이는 이름표가 있고 Enter 로 제출되며 화면 제목은 h1 이다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.goto('/join');
  const join = page.locator('join-view:visible');
  await expect(join.getByRole('heading', { level: 1, name: '회원가입' })).toBeVisible();
  await expect(join.getByLabel('이메일 주소')).toHaveAttribute('required', '');
  await expect(join.getByLabel('비밀번호', { exact: true })).toHaveAttribute('required', '');
  // The '로그인' link is a real link: it takes keyboard focus and Enter follows it.
  await join.getByRole('link', { name: '로그인', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/join');

  await page.goto('/login?next=%2Fprofile%2Fsecurity');
  const login = page.locator('login-view:visible');
  await expect(login.getByRole('heading', { level: 1, name: '로그인' })).toBeVisible();
  await expect(login.getByText('이메일 주소', { exact: true })).toBeVisible();
  await login.getByLabel('이메일 주소').fill('test@example.com');
  await login.getByLabel('비밀번호').fill('password');
  await expect(login.getByText('이메일 주소', { exact: true })).toBeVisible();
  await login.getByLabel('비밀번호').press('Enter');
  await expect(page).toHaveURL(/\/profile\/security$/);
});

test('화면마다 main 은 하나이고 탭 아이콘은 이름 없는 그림으로 읽히지 않으며 탭 바 포커스가 보인다', async ({ page }) => {
  for (const path of ['/', '/courses', '/recommend', '/destination']) {
    await page.goto(path);
    await expect(page.locator('.ion-page:visible').first()).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);
  }
  await page.goto('/');
  await expect(page.locator('ion-tab-bar ion-icon')).toHaveCount(3);
  await expect(page.locator('ion-tab-bar ion-icon:not([aria-hidden="true"])')).toHaveCount(0);
  await page.locator('ion-tab-button').first().locator('a').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement.shadowRoot.activeElement).outlineStyle)).toBe('solid');
  // The back arrow is decoration; the button is read as just '뒤로'.
  await page.goto('/courses');
  await expect(page.getByRole('button', { name: '뒤로', exact: true })).toBeVisible();
});

test('코스 카드의 버튼과 링크는 코스 이름으로 구별되고 휴대폰에서 누르기 충분히 크다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses() { return { courses: [{ id: 'one', title: 'Seoul course', stops: [{name:'Walk',location:'Seoul',stayMinutes:60}] }, { id: 'two', title: 'Seoul night', stops: [{name:'Walk',location:'Seoul',stayMinutes:60}] }], hasMore: false }; }
    export async function getPublicCourse() { return null; }
  ` }));
  await page.goto('/courses?country=KOR&city=seoul');
  await expect(page.locator('home-courses article')).toHaveCount(3);
  await page.locator('public-courses').scrollIntoViewIfNeeded();
  await expect(page.locator('public-courses article')).toHaveCount(2);
  const names = await page.locator('home-courses, public-courses').evaluateAll(hosts => hosts.flatMap(host =>
    [...host.shadowRoot.querySelectorAll('article a, article button')].map(el => el.getAttribute('aria-label') || el.textContent.trim())));
  expect(names.length).toBeGreaterThan(6);
  expect(new Set(names).size).toBe(names.length);
  await expect(page.locator('public-courses').getByRole('button', { name: '여행자 후기 보기·작성: Seoul night' })).toHaveCount(1);
  for (const link of await page.locator('home-courses a').all()) {
    expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
});

test('휴대폰 결과 시트는 이름이 있고 손잡이를 한국어로 말하며 지도의 뒤로 버튼을 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  await page.goto('/share/abc123');
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '일정 보기' })).toBeVisible();
  await expect(page.getByRole('button', { name: '일정 시트 크기 바꾸기' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Activate to adjust/ })).toHaveCount(0);
  // A missing trip says so as the page's heading and is announced.
  await expect(sheet.getByRole('heading', { level: 1, name: '일정을 찾을 수 없거나 접근 권한이 없습니다.' })).toBeVisible();
  await expect(sheet.locator('itinerary-view').getByRole('alert')).toContainText('일정을 찾을 수 없거나 접근 권한이 없습니다.');
  // The timeline's rail line belongs to stops, not to a notice card.
  expect(await sheet.locator('itinerary-view').evaluate(view => getComputedStyle(view.shadowRoot.getElementById('timeline-container'), '::before').display)).toBe('none');
  // A missing trip opens the sheet to full height. It then covers the map and Ionic traps focus there, so it is modal.
  await expect.poll(() => sheet.evaluate(modal => modal.getCurrentBreakpoint())).toBe(1);
  await expect(page.getByRole('dialog', { name: '일정 보기' })).toHaveAttribute('aria-modal', 'true');
  // The visual bar stays thin, but the sheet's whole top 44px band in the middle hits the handle.
  const handleAt = async (x, y) => sheet.evaluate((modal, point) => modal.shadowRoot.elementFromPoint(point.x, point.y)?.className, { x, y });
  const box = await page.locator('ion-modal.ionic-result-sheet .modal-handle').boundingBox();
  const top = box.y - 5;
  for (const [dx, dy] of [[0, 1], [0, 42], [-21, 1], [21, 42]]) expect(await handleAt(box.x + box.width / 2 + dx, top + dy)).toContain('modal-handle');
  // Below full height the map's Back stays usable beside the sheet, so the sheet does not tell screen readers everything else is inert.
  await page.getByRole('button', { name: '일정 시트 크기 바꾸기' }).click();
  await expect(page.getByRole('dialog', { name: '일정 보기' })).toHaveAttribute('aria-modal', 'false');
  const back = page.locator('.ionic-result-back:visible');
  expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'English' }).last().click();
  await expect(page.getByRole('dialog', { name: 'Itinerary' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resize itinerary sheet' })).toBeVisible();
});

test('좁은 휴대폰에서 시트 손잡이의 터치 영역이 언어 버튼을 가리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  await page.goto('/share/abc123');
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  for (const button of [sheet.getByRole('button', { name: 'English' }), sheet.getByRole('button', { name: /다크 모드|라이트 모드/ })]) {
    const box = await button.boundingBox();
    const hit = await sheet.evaluate((modal, point) => modal.shadowRoot.elementFromPoint(point.x, point.y)?.className || '', { x: box.x + 2, y: box.y + 2 });
    expect(hit).not.toContain('modal-handle');
  }
});

test('찾을 수 없음 화면의 위쪽 뒤로 버튼도 휴대폰에서 44px 이상이다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/no-such-page');
  const back = page.locator('.ion-page:visible ion-back-button');
  await expect(back).toBeVisible();
  expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test('빈 내 일정 목록에서 바로 새 일정을 시작할 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") }));
  await page.route('**/src/lib/firestore-lazy.mjs', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function loadFirestore() { return { db: {}, doc: () => ({}), getDoc: async () => ({ exists: () => false }) }; }' }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  await page.goto('/profile/trips');
  const profile = page.locator('profile-view:visible');
  await expect(profile.getByText('저장된 일정이 없습니다.', { exact: false })).toBeVisible();
  // The message and the button switch language together.
  await page.locator('.ion-page:visible').getByRole('button', { name: 'English', exact: true }).click();
  await expect(profile.getByRole('button', { name: 'Create a new itinerary' })).toBeVisible();
  await expect(profile.getByText('저장된 일정이 없습니다.', { exact: false })).toHaveCount(0);
  await page.locator('.ion-page:visible').getByRole('button', { name: '한국어', exact: true }).click();
  await profile.getByRole('button', { name: '새 일정 만들기' }).click();
  // The same entry as home's 일정 만들기.
  await expect(page).toHaveURL(/\/recommend$/);
});

test('여행자 코스 목록은 불러오는 중을 말하고, 검색 결과 수를 알리고, 더 불러올 코스가 있을 때만 그 안내를 한다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function listPublicCourses(options) {
      await new Promise(resolve => { window.releaseCourses = resolve; });
      return { courses: ['Palace walk', 'Market night'].map((title, index) => ({ id: 'c' + index, title, stops: [{ name: title, location: 'Seoul', stayMinutes: 60 }] })), hasMore: window.moreCourses === true };
    }
    export async function getPublicCourse() { return null; }
  ` }));
  await page.goto('/courses?country=KOR&city=seoul');
  const courses = page.locator('public-courses:visible');
  await expect(courses.getByText('여행자 코스를 불러오는 중…')).toBeVisible();
  await expect(courses.getByText('공개 상태 확인 중…')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => typeof window.releaseCourses)).toBe('function');
  await page.evaluate(() => window.releaseCourses());
  const status = courses.getByRole('status');
  await expect(status).toHaveText('코스 2개');
  await expect(courses).not.toContainText('더 많은 코스는 아래에서 불러오세요.');
  await courses.getByRole('searchbox').fill('없는 장소');
  await expect(status).toHaveText('조건에 맞는 코스가 없습니다.');
  await courses.getByRole('button', { name: '조건 초기화' }).click();
  await expect(status).toHaveText('코스 2개');
  await expect(courses.getByRole('searchbox')).toHaveValue('');
  await expect(courses.getByRole('button', { name: '조건 초기화' })).toBeHidden();
  // The button hid itself, so keyboard focus moves to the search, not the page body.
  await expect(courses.getByRole('searchbox')).toBeFocused();
  // A city with no traveler routes has nothing to clear, so no reset button.
  await page.goto('/courses?country=KOR&city=busan');
  await expect.poll(() => page.evaluate(() => typeof window.releaseCourses)).toBe('function');
  await page.evaluate(() => window.releaseCourses());
  await expect(courses.getByRole('status')).toHaveText('조건에 맞는 코스가 없습니다.');
  await expect(courses.getByRole('button', { name: '조건 초기화' })).toBeHidden();
  await page.goto('/courses?country=KOR&city=seoul');
  // With another page to load, the hint points to the load-more button that is there.
  await page.reload();
  await expect.poll(() => page.evaluate(() => typeof window.releaseCourses)).toBe('function');
  await page.evaluate(() => { window.moreCourses = true; window.releaseCourses(); });
  await expect(courses).toContainText('더 많은 코스는 아래에서 불러오세요.');
  await expect(courses.getByRole('button', { name: '코스 더 불러오기' })).toBeVisible();
});

test('영어 앱은 코스 목록 아래 링크 하나로 그 도시의 공유용 영문 페이지 목록을 연다', async ({ page }) => {
  await page.goto('/courses?country=KOR&city=seoul&lang=en');
  await expect(page.locator('home-courses article')).toHaveCount(3);
  await expect(page.locator('home-courses article a')).toHaveCount(0);
  const link = page.locator('home-courses').getByRole('link', { name: 'Browse shareable route pages' });
  await expect(link).toBeVisible();
  const [color, ink] = await link.evaluate(a => [getComputedStyle(a).color, getComputedStyle(a.getRootNode().host).color]);
  expect(color).toBe(ink);
  await link.click();
  await expect(page).toHaveURL(/\/en\/routes#city-seoul$/);
  await expect(page.getByRole('heading', { name: 'Seoul', exact: true })).toBeInViewport();
});

test('없는 공유 일정은 빈 지도 없이 안내 카드가 화면을 차지하고 그 안에 뒤로 버튼이 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: missingItineraryStore }));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/share/abc123');
  const aside = page.locator('.ionic-desktop-schedule');
  await expect(aside.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await expect(page.locator('.ionic-map-content:visible')).toHaveCount(0);
  expect((await aside.boundingBox()).width).toBeGreaterThan(1200);
  await aside.getByRole('button', { name: '뒤로', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/share/abc123');
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await expect(sheet.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await expect.poll(() => sheet.evaluate(modal => modal.getCurrentBreakpoint())).toBe(1);
  await expect(sheet.getByRole('button', { name: '뒤로', exact: true })).toBeVisible();
});

test('여러 날 일정의 결과 화면도 h1 제목이 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true }"),
  }));
  await page.route('**/src/domains/planner/services/gemini-optimizer.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function getGenerationCredits() { return 1; }
    export async function generateOptimizedItinerary() {
      const day = (n, date) => ({ day: n, date, scheduleItems: [
        { type: 'departure', title: '광화문', time: '09:00', location: '광화문' }, { type: 'arrival', title: '경복궁', time: '10:00', location: '경복궁' } ] });
      return { days: [day(1, '2026-09-27'), day(2, '2026-09-28')] };
    }
  ` }));
  await page.goto('/plan');
  await page.locator('travel-form:visible').first().evaluate(element => {
    element.dispatchEvent(new CustomEvent('generate-itinerary', { detail: {}, bubbles: true, composed: true }));
  });
  await expect(page).toHaveURL(/\/view$/);
  const heading = page.locator('ion-modal.ionic-result-sheet itinerary-view').getByRole('heading', { level: 1 });
  await expect(heading).toContainText('2026-09-27');
  await expect(heading).toContainText('2026-09-28');
});

test('영문 페이지 스크립트가 오기 전에 누른 출발지도, 다른 계정의 저장 사본이 있어도 게스트의 출발지가 남는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  // The plan link stays inert until the page script attaches its handler.
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/route-page.js*', async route => { await held; await route.continue(); });
  await page.goto('/en/routes/curated-seoul', { waitUntil: 'commit' });
  await expect(page.getByRole('link', { name: 'Plan with these places' })).toHaveAttribute('aria-disabled', 'true');
  release();
  await expect(page.getByRole('link', { name: 'Plan with these places' })).not.toHaveAttribute('aria-disabled', /./);
  // Another account signed in on this device earlier and left its saved copy.
  await page.evaluate(() => localStorage.setItem('compasser.planner.v1', JSON.stringify({ owner: 'old-user', draft: {
    destination: { id: 'seoul', country: 'KOR', name: 'Seoul, South Korea' }, startLocation: 'Old hotel', anchorSchedules: [{ day: 1, name: 'Old pick', location: 'Old pick' }] } })));
  await page.getByLabel('Start near your accommodation (optional)').fill('Myeongdong Station');
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.startLocation).toBe('Myeongdong Station');
  expect(draft.anchorSchedules.map(stop => stop.name)).not.toContain('Old pick');
  // A start left over from an earlier import that never finished does not reach a route for another city.
  await page.goto('/en/routes/curated-busan');
  await page.evaluate(() => sessionStorage.setItem('compasser.routeStart', 'Stale hotel'));
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const busan = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(busan.destination).toMatchObject({ id: 'busan' });
  expect(busan.startLocation).toBe('');
  expect(await page.evaluate(() => sessionStorage.getItem('compasser.routeStart'))).toBeNull();
});

test('a city picked on the globe before sign-in restores keeps the signed-in draft', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/src/domains/auth/services/firebase-auth.js', async route => {
    await held;
    await route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") });
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('compasser.planner.v1', JSON.stringify({ owner: 'test-user', draft: { startLocation: 'Kept start' } }));
    }
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('svg .globe-marker[data-country=KOR]').click();
  await page.locator('.globe-selection button').click();
  await expect(page.getByRole('status').filter({ hasText: '불러오는' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  release();
  await expect(page).toHaveURL(/\/destination$/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('compasser.planner.v1')));
  expect(saved.owner).toBe('test-user');
  expect(saved.draft.startLocation).toBe('Kept start');
  expect(saved.draft.country).toBe('KOR');
});

test('/destination shows a draft restored after it mounted', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule
    .replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };")
    .replace('setTimeout(() => callback(currentUser), 0);', 'setTimeout(() => callback(currentUser), 1500);') }));
  await page.addInitScript(() => localStorage.setItem('compasser.planner.v1', JSON.stringify({ owner: 'test-user', draft: { country: 'KOR', destinationStage: 'city' } })));
  await page.goto('/destination');
  await expect(page.getByRole('heading', { name: '어느 나라로 떠날까요?', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '어느 도시가 끌리나요?', exact: true })).toBeVisible();
});

test('a failed auth download offers a reload and keeps the owner draft', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.abort());
  await page.addInitScript(() => localStorage.setItem('compasser.planner.v1', JSON.stringify({ owner: 'test-user', draft: { startLocation: 'Kept start' } })));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('화면을 불러오지 못했습니다');
  await expect(page.getByRole('button', { name: '화면 다시 불러오기' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('compasser.planner.v1')));
  expect(saved.owner).toBe('test-user');
  expect(saved.draft.startLocation).toBe('Kept start');
});

async function openUnsavedDraft(page, waitForShare = '', waitForSave = '') {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true };") }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function readPrivateStopNote() {} export async function writePrivateStopNote() {}
    export async function saveItinerary() { ${waitForSave} return 'saved1'; }
    export async function createSharedItinerary() { window.shares = (window.shares || 0) + 1; ${waitForShare} return 'public1'; }
    export async function getUserItineraries() { return []; } export async function updateItinerary() {} export async function renameItinerary() {} export async function deleteItinerary() {}
    export async function loadItineraryDocument() { return { itineraryPlan: { days: [] }, access: 'shared' }; }
    export async function watchSharedItinerary() { return () => {}; }
  ` }));
  await page.route('**/src/domains/planner/services/gemini-optimizer.js', route => route.fulfill({
    contentType: 'text/javascript', body: `
      export async function getGenerationCredits() { return 1; }
      export async function generateOptimizedItinerary() {
        return { days: [{ day: 1, date: '2026-09-27', scheduleItems: [
          { type: 'departure', title: '광화문', time: '09:00', location: '광화문' },
          { type: 'arrival', title: '경복궁', time: '10:00', location: '경복궁' },
        ] }] };
      }
    `,
  }));
  await page.goto('/plan');
  await page.locator('travel-form:visible').first().evaluate(element => {
    element.dispatchEvent(new CustomEvent('generate-itinerary', { detail: {}, bubbles: true, composed: true }));
  });
  await expect(page).toHaveURL(/\/view$/);
  await expect(page.locator('itinerary-view:visible .schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  return page.locator('itinerary-view:visible #share-itinerary-btn');
}

test('저장 안 한 일정을 공유하면 링크가 만들어질 때까지 주소와 공유 버튼이 그대로다', async ({ page }) => {
  const share = await openUnsavedDraft(page, "await new Promise(done => { window.finishShare = done; });");
  await share.click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await page.waitForFunction(() => window.shares === 1);
  await expect(page).toHaveURL(/\/view$/);
  await expect(share).toBeDisabled();
  await page.evaluate(() => window.finishShare());
  await expect(page).toHaveURL(/\/view\/saved1$/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/share/public1');
  expect(await page.evaluate(() => window.shares)).toBe(1);
});

test('복사가 실패한 뒤 주소가 바뀌어도 다시 공유하면 같은 링크를 쓴다', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    let failures = 1;
    navigator.clipboard.writeText = text => (failures-- > 0 ? Promise.reject(new Error('denied')) : write(text));
  });
  const share = await openUnsavedDraft(page);
  await share.click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await expect(page).toHaveURL(/\/view\/saved1$/);
  await expect(page.locator('itinerary-view:visible .schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await expect(page.locator('itinerary-view:visible #share-itinerary-btn')).toBeEnabled();
  await page.locator('itinerary-view:visible #share-itinerary-btn').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/share/public1');
  await expect(page.locator('#app-confirm-host .confirm-ok')).toHaveCount(0);
  expect(await page.evaluate(() => window.shares)).toBe(1);
});

const failingItineraryStore = missingItineraryStore.replace(
  'export async function loadItineraryDocument() { return null; }',
  `export async function loadItineraryDocument() {
    window.loads = (window.loads || 0) + 1;
    await window.holdLoad;
    if (window.failLoads === 'missing') return null;
    if (window.failLoads === 'empty') return { access: 'shared', itineraryPlan: { days: [] } };
    if (window.failLoads !== false) throw new Error('unavailable');
    return { access: 'shared', itineraryPlan: { days: [{ day: 1, date: '2026-09-27', scheduleItems: [
      { type: 'departure', title: '광화문', time: '09:00', location: '광화문' },
      { type: 'arrival', title: '경복궁', time: '10:00', location: '경복궁' },
    ] }] } };
  }`);

test('공유 일정을 못 불러오면 다시 시도할 수 있고 실패해도 버튼에 초점이 남는다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const view = page.locator('itinerary-view:visible');
  const retry = view.getByRole('button', { name: '다시 시도' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect.poll(() => page.evaluate(() => window.loads)).toBe(2);
  await expect(retry).toBeFocused();
  await page.evaluate(() => { window.failLoads = false; });
  await retry.click();
  await expect(view.locator('.schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect.poll(() => view.evaluate(element => element.shadowRoot.activeElement?.id)).toBe('timeline-container');
});

test('다시 불러오기에 성공하면 데스크톱 지도가 돌아오고 읽기 전용 일정에 편집 버튼이 없다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'reader', email: 'r@example.com', emailVerified: true }") }));
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const view = page.locator('itinerary-view:visible');
  await expect(view.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.locator('.ionic-result-missing')).toHaveCount(1);
  await page.evaluate(() => { window.failLoads = false; });
  await view.getByRole('button', { name: '다시 시도' }).click();
  await expect(view.locator('.schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await expect(page.locator('.ionic-result-missing')).toHaveCount(0);
  await expect(page.locator('.ionic-result-edit')).toHaveCount(0);
});

test('공유 일정 오류 화면은 연결이 돌아오면 스스로 다시 불러온다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const view = page.locator('itinerary-view:visible');
  await expect(view.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await page.evaluate(() => { window.failLoads = false; window.dispatchEvent(new Event('online')); });
  await expect(view.locator('.schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
});

test('다른 화면으로 떠난 뒤 연결이 돌아와도 숨은 오류 화면은 다시 불러오지 않는다', async ({ page }) => {
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  await expect(page.locator('itinerary-view:visible').getByRole('button', { name: '다시 시도' })).toBeVisible();
  await page.evaluate(() => window.navigate('/courses'));
  await expect(page).toHaveURL(/\/courses$/);
  const before = await page.evaluate(() => window.loads);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.loads)).toBe(before);
  await expect(page).toHaveURL(/\/courses$/);
});

test('찾을 수 없음 화면은 제목을 한 번만 말하고 뒤로 버튼에 키보드 초점이 보인다', async ({ page }) => {
  await page.goto('/no-such-page');
  const screen = page.locator('.ion-page:visible');
  await expect(screen.getByText('페이지를 찾을 수 없습니다')).toHaveCount(1);
  await expect(screen.locator('ion-title')).toHaveText('ComPasser');
  await page.keyboard.press('Tab');
  const outline = () => page.evaluate(() => {
    const button = document.querySelector('.ion-page:not(.ion-page-hidden) ion-back-button')?.shadowRoot?.querySelector('button');
    return button?.matches(':focus-visible') ? getComputedStyle(button).outlineStyle : null;
  });
  await expect.poll(async () => { const value = await outline(); if (!value) await page.keyboard.press('Tab'); return value; }).toBe('solid');
});

test('휴대폰에서 다시 불러오기에 성공하면 시트가 보통 높이로 돌아온다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await expect.poll(() => sheet.evaluate(modal => modal.getCurrentBreakpoint())).toBe(1);
  await page.evaluate(() => { window.failLoads = false; });
  await sheet.locator('itinerary-view').getByRole('button', { name: '다시 시도' }).click();
  await expect(sheet.locator('.schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await expect.poll(() => sheet.evaluate(modal => modal.getCurrentBreakpoint())).toBe(0.62);
});

test('다른 곳에 갔다 돌아온 휴대폰 시트도 실패와 복구를 화면에 알린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/courses');
  await page.evaluate(() => { window.failLoads = false; window.navigate('/share/abc123'); });
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  await expect(sheet.locator('.schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await page.evaluate(() => window.navigate('/courses'));
  await expect(page).toHaveURL(/\/courses$/);
  await page.evaluate(() => { window.failLoads = true; });
  await page.goBack();
  await expect(sheet.locator('itinerary-view').getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect.poll(() => sheet.evaluate(modal => modal.getCurrentBreakpoint())).toBe(1);
});

test('다시 시도 중 사용자가 옮겨 간 곳의 초점을 뺏지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const view = page.locator('itinerary-view:visible');
  await expect(view.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await page.evaluate(() => { window.holdLoad = new Promise(done => { window.releaseLoad = done; }); });
  await view.getByRole('button', { name: '다시 시도' }).click();
  const theme = page.getByRole('button', { name: /다크 모드|라이트 모드/ }).first();
  await theme.focus();
  await page.evaluate(() => window.releaseLoad());
  await expect(view.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(theme).toBeFocused();
});

test('다시 시도한 일정이 없으면 복구로 치지 않고 초점을 잃지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const view = page.locator('itinerary-view:visible');
  await expect(view.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await page.evaluate(() => { window.failLoads = 'missing'; });
  await view.getByRole('button', { name: '다시 시도' }).click();
  await expect(view.getByRole('button', { name: '새 일정 만들기' })).toBeVisible();
  await expect.poll(() => view.evaluate(element => element.shadowRoot.activeElement?.id)).toBe('timeline-container');
  await expect(page.locator('.ionic-result-missing')).toHaveCount(1);
});

test('다시 시도한 일정의 내용이 비어 있으면 복구로 치지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/src/domains/itinerary/services/firestore-service.js', route => route.fulfill({ contentType: 'text/javascript', body: failingItineraryStore }));
  await page.goto('/share/abc123');
  const retry = page.locator('itinerary-view:visible').getByRole('button', { name: '다시 시도' });
  await expect(retry).toBeVisible();
  await page.evaluate(() => { window.failLoads = 'empty'; });
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.locator('.ionic-result-missing')).toHaveCount(1);
});

test('저장 중 다른 화면으로 떠났다면 연결 안내를 띄우지 않는다', async ({ page }) => {
  await openUnsavedDraft(page, '', 'await new Promise(done => { window.finishSave = done; });');
  const save = page.locator('itinerary-view:visible #save-itinerary-btn');
  await save.click();
  await expect(save).toBeDisabled();
  await page.evaluate(() => {
    window.history.pushState({}, '', '/elsewhere');
    window.dispatchEvent(new Event('offline'));
    window.history.replaceState({}, '', '/view');
  });
  await expect(page.getByText('연결이 불안정해요', { exact: false })).toHaveCount(0);
  await page.evaluate(() => window.finishSave());
  await expect(page).toHaveURL(/\/view\/saved1$/);
});

test('저장 중 연결이 끊기면 알려 주고, 다시 연결되어 끝나면 저장한 일정으로 간다', async ({ page }) => {
  await openUnsavedDraft(page, '', 'await new Promise(done => { window.finishSave = done; });');
  const save = page.locator('itinerary-view:visible #save-itinerary-btn');
  await save.click();
  await expect(save).toBeDisabled();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('연결이 불안정해요', { exact: false })).toBeVisible();
  await expect(save).toBeDisabled();
  await page.evaluate(() => window.finishSave());
  await expect(page).toHaveURL(/\/view\/saved1$/);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('연결이 불안정해요', { exact: false })).toHaveCount(0);
});

test('초안을 저장해 주소가 바뀌어도 되돌리기가 남고, 빈 /view에는 초안이 없다', async ({ page }) => {
  await openUnsavedDraft(page);
  await page.locator('itinerary-view:visible').evaluate(view => view.state.editDayItems(0, view.state.current.plan.days[0].scheduleItems.slice(0, 1), { undo: true }));
  await page.locator('itinerary-view:visible #save-itinerary-btn').click();
  await expect(page).toHaveURL(/\/view\/saved1$/);
  await expect(page.locator('itinerary-view:visible #undo-deletion-btn')).toBeVisible();
  const entries = await page.evaluate(() => JSON.parse(sessionStorage.getItem('compasser.itineraries.v1')).entries.map(entry => entry.source.kind));
  expect(entries).toEqual(['private']);
  await page.goto('/view');
  await expect(page).toHaveURL(/\/view\/saved1$/);
});

test('결과 화면은 여행 전체를 캘린더 파일(.ics)로 내려받는다', async ({ page }) => {
  await openUnsavedDraft(page);
  const view = page.locator('itinerary-view:visible');
  const download = page.waitForEvent('download');
  await view.getByRole('button', { name: '캘린더에 추가 (.ics)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('compasser-trip.ics');
  const ics = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
  const stops = await view.evaluate(element => element.state.current.plan.days
    .flatMap(day => day.scheduleItems).filter(item => /^\d\d:\d\d$/.test(item.time || '') && item.title).length);
  expect(stops).toBeGreaterThan(0);
  expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  expect(ics.split('BEGIN:VEVENT').length - 1).toBe(stops);
  await expect(page.getByText('캘린더 파일을 내려받았어요', { exact: false })).toBeVisible();
});

test('복사가 실패하고 새로고침해도 다시 공유하면 같은 링크를 쓴다', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = text => {
      if (sessionStorage.getItem('copyFailed')) return write(text);
      sessionStorage.setItem('copyFailed', '1');
      return Promise.reject(new Error('denied'));
    };
  });
  const share = await openUnsavedDraft(page);
  await share.click();
  await page.locator('#app-confirm-host .confirm-ok').click();
  await expect(page).toHaveURL(/\/view\/saved1$/);
  await page.reload();
  await expect(page.locator('itinerary-view:visible .schedule-title').filter({ hasText: '경복궁' })).toBeVisible();
  await page.locator('itinerary-view:visible #share-itinerary-btn').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('/share/public1');
  await expect(page.locator('#app-confirm-host .confirm-ok')).toHaveCount(0);
  expect(await page.evaluate(() => window.shares)).toBeUndefined();
});

test('결과 화면만 어둡고, 그 화면에서 누른 테마 토글이 강제를 푼다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUnsavedDraft(page);
  const root = page.locator('html');
  const statusBar = page.locator('meta[name="theme-color"]');
  // At phone width the result settings live in the sheet; going back re-presents it while the previous page leaves.
  const sheet = page.locator('ion-modal.ionic-result-sheet');
  const toggle = sheet.locator('.ionic-settings button:not([lang])');
  await expect(root).toHaveAttribute('data-route-theme', 'dark');
  await expect(statusBar).toHaveAttribute('content', '#121211');
  await expect(toggle).toHaveText('라이트 모드');
  await page.evaluate(() => window.navigate('/profile/trips'));
  await expect(root).not.toHaveAttribute('data-route-theme', /./);
  await expect(statusBar).toHaveAttribute('content', '#FFFFFF');
  await page.goBack();
  await expect(root).toHaveAttribute('data-route-theme', 'dark');
  await expect(sheet).toBeVisible();
  await expect(toggle).toHaveText('라이트 모드');
  await toggle.click();
  await expect(root).not.toHaveAttribute('data-route-theme', /./);
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(statusBar).toHaveAttribute('content', '#FFFFFF');
  await expect(toggle).toHaveText('다크 모드');
});

test('/ 다음 /home 으로 가면 숨은 / 페이지는 코스를 다시 가져오지 않는다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function getPublicCourse() { window.courseLookups = (window.courseLookups || 0) + 1; return null; }
  ` }));
  await page.goto('/');
  await page.locator('.ionic-home h1:visible').waitFor();
  // Ionic keeps both home pages mounted; the hidden '/' page must not answer the /home address.
  await page.evaluate(() => window.navigate('/home?course=travelerSeoul'));
  await expect(page.getByRole('status').filter({ hasText: '이 코스를 찾을 수 없거나' })).toHaveCount(1);
  expect(await page.evaluate(() => window.courseLookups)).toBe(1);
  await expect(page.locator('.ionic-home-settings button[lang=en]:visible')).toHaveCount(1);
});
