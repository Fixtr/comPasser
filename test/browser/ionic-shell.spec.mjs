import { test, expect } from '@playwright/test';

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
  export async function requireRecentLoginForDeletion() {}
  export async function logout() { currentUser = null; notify(null); }
`;

test('영문 코스에서 QR·주소를 확인하고 숙소 출발지와 필수 방문지를 로그인까지 유지한다', async ({ page }, testInfo) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async value => { window.copiedAddress = value; };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/en/routes/curated-seoul');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Seoul');
  await expect(page.getByText('English menu: Not checked').first()).toBeVisible();
  await page.getByRole('button', { name: 'Copy local address' }).first().click();
  expect(await page.evaluate(() => window.copiedAddress)).toContain('서울');
  expect(await page.locator('.qr').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  const qrResponse = await page.request.get('/en/routes/curated-seoul/qr.svg?download=1');
  expect(qrResponse.headers()['content-disposition']).toContain('attachment');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('english-route-mobile.png'), fullPage: true });
  await page.getByLabel('Start near your accommodation (optional)').fill('My hostel near Seoul Station');
  await page.getByRole('link', { name: 'Plan with these places' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await expect(page.locator('login-view h2').last()).toHaveText('Log in');
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

test('영문 여행자 코스 가져오기 실패는 로그인으로 보내지 않고 다시 시도할 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function listPublicCourses() { return { courses: [], hasMore: false }; } export async function getPublicCourse() { return null; }' }));
  await page.goto('/home?course=removedRoute&lang=en');
  await expect(page.getByRole('status').filter({ hasText: 'This route is no longer public.' })).toBeVisible();
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
    export async function saveItinerary() {} export async function renameItinerary() {} export async function deleteItinerary() {}
    export async function deleteAllUserItineraries() {} export async function createSharedItinerary() {}
    export async function getSharedItinerary() {} export async function loadItineraryDocument() {}
    export async function watchSharedItinerary() {} export async function getItineraryById() {}
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

test('알 수 없는 주소는 로그인 대신 찾을 수 없음 화면을 보여준다', async ({ page }) => {
  await page.goto('/unknown-page');
  await expect(page).toHaveURL(/\/unknown-page$/);
  await expect(page.getByText('주소를 확인해 주세요.')).toBeVisible();
});

test('로그인 복원이 늦어도 장소 저장 정보를 자동으로 불러온다', async ({ page }) => {
  const delayedAuth = authModule.replace('setTimeout(() => callback(currentUser), 0);', "setTimeout(() => { currentUser = { uid: 'test-user', emailVerified: true, providerData: [] }; callback(currentUser); }, 500);");
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: delayedAuth }));
  await page.route('**/src/domains/planner/services/discovery-saves.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { getCurrentUser } from '../../auth/services/firebase-auth.js';
    export async function loadDiscoverySaves() {
      if (!getCurrentUser()) throw new Error('Auth restoration is still pending');
      return { statistics: { forest: { count: 2, updatedAt: Date.now() } }, saved: ['forest'] };
    }
  ` }));
  await page.goto('/recommend');
  const cards = page.locator('home-recommendations:visible');
  await cards.scrollIntoViewIfNeeded();
  await expect(cards.locator('button[data-save=forest]')).toBeEnabled();
  await expect(cards.locator('button[data-save=forest]')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.locator('#discover-popularity-status')).not.toContainText('지금 확인할 수 없습니다');
});

test('장소 저장 집계는 저장·취소와 정렬에 반영되고 필수 방문지 선택과 독립적이다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule.replace('let currentUser = null;', "let currentUser = { uid: 'test-user', emailVerified: true, providerData: [] };") }));
  await page.route('**/src/domains/planner/services/discovery-saves.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export async function loadDiscoverySaves() { return { statistics: { forest: { count: 2, updatedAt: Date.now() } }, saved: [] }; }
    export async function setDiscoveryPlaceSaved(placeId, saved) { return { saved, count: saved ? 3 : 2, updatedAt: Date.now() }; }
  ` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recommend');
  const cards = page.locator('home-recommendations:visible');
  await cards.scrollIntoViewIfNeeded();
  await expect(cards.locator('button[data-save=forest]')).toBeEnabled();
  await cards.locator('button[data-save=forest]').click();
  await expect(cards.locator('button[data-save=forest]')).toHaveAttribute('aria-pressed', 'true');
  await expect(cards.locator('#forest-name').locator('..')).toContainText('이 장소를 저장한 계정 3개');
  await expect(cards.locator('#discover-plan')).toBeDisabled();
  await cards.locator('button[data-filter=popular]').click();
  await expect(cards.locator('article').first().locator('h3')).toHaveText('서울숲');
  await cards.locator('button[data-save=forest]').click();
  await expect(cards.locator('button[data-save=forest]')).toHaveAttribute('aria-pressed', 'false');
  await expect(cards.locator('#forest-name').locator('..')).toContainText('이 장소를 저장한 계정 2개');
});

test('언어와 화면 모드가 모든 Ionic 화면에서 유지된다', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(page.getByRole('heading', { name: 'Plan around what matters' })).toBeVisible();
  await page.getByRole('button', { name: 'Dark Mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.locator('.ionic-settings button').first()).toHaveCSS('background-color', 'rgb(26, 26, 25)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('heading', { name: 'Plan around what matters' })).toBeVisible();
  await page.goto('/login');
  await expect(page.locator('login-view h2').last()).toHaveText('Log in');
  await page.goto('/share/abc123');
  await expect(page.locator('.ionic-desktop-schedule .ionic-settings')).toBeVisible();
  await page.locator('.ionic-desktop-schedule').getByRole('button', { name: 'Light Mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('로그인 사용자는 탭을 바꾸고 브라우저 뒤로 가기로 돌아온다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true }"),
  }));
  await page.goto('/preference/1');
  await expect(page.locator('ion-tab-bar')).toBeVisible();
  await page.locator('ion-tab-button[tab=trips]').click();
  await expect(page).toHaveURL(/\/profile\/trips$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/preference\/1$/);
});

test('여행 취향을 고르면 기존 입력 화면으로 이어진다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({
    contentType: 'text/javascript', body: authModule.replace('let currentUser = null', "let currentUser = { uid: 'test-user', providerData: [], emailVerified: true }"),
  }));
  await page.goto('/preference/1');
  const preference = page.locator('preference-view');
  await preference.locator('[data-date-type=today]').click();
  await preference.locator('[data-duration="1"]').click();
  await preference.locator('#next-step-btn').click();
  await expect(page).toHaveURL(/\/preference\/2$/);
  const secondStep = page.locator('.ion-page.can-go-back preference-view');
  await secondStep.locator('#theme-grid [data-value=food]').click();
  await secondStep.locator('#budget-grid [data-value=standard]').click();
  await secondStep.locator('#submit-btn').click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('travel-form:visible').first()).toBeVisible();
  await expect(page.locator('travel-form:visible #travel-form')).toHaveCSS('display', 'grid');
});

test('추천 장소와 코스는 각각의 화면에서 선택하고 로그인 후에도 선택한 필수 방문지를 유지한다', async ({ page }, testInfo) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/map/services/google-maps-loader.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    class PlaceInput extends HTMLElement {
      constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<input aria-label="Test place">'; }
      get value() { return this.shadowRoot.querySelector('input').value; }
      set value(value) { this.shadowRoot.querySelector('input').value = value; }
    }
    customElements.define('gmp-place-autocomplete', PlaceInput);
    export const getMapsLoader = () => ({ importLibrary: async () => ({}) });
  ` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recommend');
  const cards = page.locator('home-recommendations:visible');
  await expect(cards.locator('article')).toHaveCount(3);
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await expect(cards.locator('#forest-name')).toHaveText('Seoul Forest');
  await page.screenshot({ path: testInfo.outputPath('recommendations-mobile.png'), fullPage: true });

  await page.goto('/courses');
  const courses = page.locator('home-courses:visible');
  await expect(courses.locator('article')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('courses-mobile.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/recommend');
  await page.getByRole('button', { name: '한국어로 변경' }).click();
  await expect(cards.locator('#forest-name')).toHaveText('서울숲');
  await page.screenshot({ path: testInfo.outputPath('recommendations-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Switch to English' }).click();
  await cards.locator('button[data-place=forest]').click();
  await cards.locator('#discover-plan').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  await page.reload();
  await page.locator('login-view #email-input').last().fill('test@example.com');
  await page.locator('login-view #password-input').last().fill('password');
  await page.locator('login-view #email-login-btn').last().click();
  await expect(page).toHaveURL(/\/preference\/1$/);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')).anchorSchedules[0]?.location))
    .toBe('Seoul Forest, 273 Ttukseom-ro, Seongdong-gu, Seoul');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')).startLocation)).toBe('');
  const preference = page.locator('preference-view:visible');
  await preference.locator('[data-date-type=today]').click();
  await preference.locator('[data-duration="1"]').click();
  await preference.locator('#next-step-btn').click();
  await expect(page).toHaveURL(/\/preference\/2$/);
  await page.getByRole('button', { name: 'Skip and plan right away →' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.locator('travel-form .anchor-item .anchor-name').last()).toHaveValue('Seoul Forest');
  await expect(page.locator('travel-form .anchor-item .anchor-location input').last()).toHaveValue('Seoul Forest, 273 Ttukseom-ro, Seongdong-gu, Seoul');

  await page.goto('/courses');
  await courses.locator('button[data-city=busan]').click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const courseDraft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(courseDraft.anchorSchedules.slice(-2).map(anchor => anchor.name)).toEqual(['Haeundae Beach', 'Dongbaekseom Island']);
  expect(courseDraft.anchorSchedules.slice(-2).every(anchor => anchor.flexible && !anchor.time)).toBe(true);
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
  const courses = page.locator('public-courses:visible');
  await courses.scrollIntoViewIfNeeded();
  await expect(courses.getByText('A quiet afternoon')).toBeVisible();
  await expect(courses.getByText('Easy to walk')).toBeVisible();
  await courses.getByRole('button', { name: '이 코스로 일정 만들기' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fpreference%2F1$/);
  const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('currentFormData')));
  expect(draft.anchorSchedules.map(stop => stop.name)).toEqual(['Museum', 'Cafe']);
  expect(draft.anchorSchedules.every(stop => stop.flexible && !stop.time)).toBe(true);
  expect(draft.startLocation).toBe('');
});

test('공개 코스가 없으면 게스트가 자기 코스를 공개하는 흐름으로 갈 수 있다', async ({ page }) => {
  await page.route('**/src/domains/auth/services/firebase-auth.js', route => route.fulfill({ contentType: 'text/javascript', body: authModule }));
  await page.route('**/src/domains/itinerary/services/public-course-service.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function listPublicCourses() { return { courses: [], hasMore: false }; } export async function getPublicCourse() { return null; }' }));
  await page.goto('/courses');
  const courses = page.locator('public-courses:visible');
  await courses.scrollIntoViewIfNeeded();
  await courses.getByRole('button', { name: '내 일정에서 코스 공개하기' }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile%2Ftrips$/);
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
  const courses = page.locator('public-courses:visible'); await courses.scrollIntoViewIfNeeded();
  await expect(courses.getByText('Museum afternoon')).toBeVisible();
  await courses.locator('select[name=city]').selectOption('busan');
  await expect(courses.locator('article')).toHaveCount(0);
  await courses.locator('select[name=city]').selectOption('seoul');
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
  await expect(page).toHaveURL(/\/courses\?review=reviewRoute$/);
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
  await page.screenshot({ path: testInfo.outputPath('result-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('.ionic-desktop-schedule')).toBeVisible();
  await expect(page.locator('.ionic-result-desktop map-view')).toBeVisible();
  await expect(page.locator('.ionic-desktop-schedule itinerary-view #timeline-container')).toContainText('경복궁');
  await expect(page.locator('.ionic-desktop-schedule itinerary-view #timeline-container')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: testInfo.outputPath('result-desktop.png'), fullPage: true });
});

test('홈에는 가벼운 미리보기 카드가 뜨고 추천 및 코스 상세로 연결된다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.goto('/home');
  const preview = page.locator('home-preview:visible');
  await expect(preview).toBeVisible();
  await expect(preview.locator('article')).toHaveCount(3);
  await expect(preview.locator('a[href="/recommend"]')).toBeVisible();
  await expect(preview.locator('a[href="/courses"]').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('home-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('home-mobile.png'), fullPage: true });
});

test('기존 /home?review= 링크는 /courses?review= 로 리다이렉트된다', async ({ page }) => {
  await page.goto('/home?review=route123');
  await expect(page).toHaveURL(/\/courses\?review=route123$/);
  await expect(page.locator('public-courses:visible')).toBeVisible();
});

