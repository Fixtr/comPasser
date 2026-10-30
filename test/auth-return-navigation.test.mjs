import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { getSafeReturnPath } from '../src/app/route-decision.mjs';

// 실제 화면의 이벤트 핸들러를 실행하되 DOM과 외부 인증만 작은 가짜로 대체한다.
function authView(file, className, search = '', { authError } = {}) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      style: {}, value: '', innerHTML: '', listeners: {},
      addEventListener(event, handler) { this.listeners[event] = handler; },
    });
    return elements.get(id);
  };
  const navigations = [];
  const signups = [];
  const toasts = [];
  const messages = new Map();
  const session = new Map();
  const location = { origin: 'https://app.example', pathname: '/login', search };
  const window = {
    location,
    navigate: (path) => navigations.push(path),
    open: () => ({ closed: false }),
    addEventListener: (event, handler) => messages.set(event, handler),
    removeEventListener: (event) => messages.delete(event),
  };
  const source = readFileSync(new URL(`../src/domains/auth/ui/${file}`, import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export default class', 'class')
    .replaceAll('import.meta.env', 'environment');
  const View = vm.runInNewContext(`${source}\n${className};`, {
    window, URL, URLSearchParams, getSafeReturnPath,
    HTMLElement: class {
      attachShadow() { this.shadowRoot = { getElementById: element }; }
    },
    customElements: { define() {} },
    sessionStorage: { getItem: (key) => session.get(key), setItem: (key, value) => session.set(key, value) },
    t: (key) => key, authStyles: '', icons: {},
    isInAppBrowser: () => false,
    environment: { VITE_NAVER_CLIENT_ID: 'test-client' },
    app: {}, getFunctions: () => ({}),
    httpsCallable: () => async () => ({ data: { customToken: 'test-token' } }),
    loadKakaoSdk: async () => ({ Auth: { login: ({ success }) => success({ access_token: 'test-token' }) } }),
    // 인증 성공 직후 전역 구독이 URL을 바꾼 상황을 재현한다.
    loginWithCustomToken: async () => { location.search = ''; },
    signUpWithEmail: async (...args) => { if (authError) throw authError; signups.push(args); location.search = ''; },
    loginWithEmail: async () => { if (authError) throw authError; },
    showToast: message => toasts.push(message), showErrorToast: message => toasts.push(message), showSuccessToast: message => toasts.push(message),
    setInterval: () => 1, clearInterval() {}, console,
  });
  const view = new View();
  if (file === 'verify-view.js') view.render();
  else view.setupListeners();
  return {
    location, navigations, messages, session, signups, toasts, element,
    input: (id, value) => { element(id).value = value; },
    click: (id) => element(id).listeners.click({ preventDefault() {} }),
    submit: (id) => element(id).listeners.submit({ preventDefault() {} }),
  };
}

test('로그인과 가입을 왕복해도 원래 공유 일정을 기억한다', async () => {
  const login = authView('login-view.js', 'LoginView');
  // SPA 화면은 처음부터 마운트되므로, 클릭할 때의 주소를 사용해야 한다.
  login.location.search = '?next=%2Fshare%2Fabc123';
  await login.click('go-to-join');
  assert.deepEqual(login.navigations, ['/join?next=%2Fshare%2Fabc123']);

  const join = authView('join-view.js', 'JoinView', '?next=%2Fshare%2Fabc123');
  await join.click('go-to-login');
  assert.deepEqual(join.navigations, ['/login?next=%2Fshare%2Fabc123']);
});

test('로그인·가입 링크에 외부 복귀 주소를 전달하지 않는다', async () => {
  const login = authView('login-view.js', 'LoginView', '?next=https%3A%2F%2Fevil.example');
  await login.click('go-to-join');
  assert.deepEqual(login.navigations, ['/join']);

  const join = authView('join-view.js', 'JoinView', '?next=%2F%2Fevil.example');
  await join.click('go-to-login');
  assert.deepEqual(join.navigations, ['/login']);
});

test('가입을 시작할 때 공유 복귀 주소를 메일 인증 서비스에 전달한다', async () => {
  const join = authView('join-view.js', 'JoinView');
  join.location.search = '?next=%2Fshare%2Fabc123';
  join.input('email-input', 'traveler@example.com');
  join.input('password-input', 'test-password');
  await join.submit('join-form');
  assert.deepEqual(join.signups, [['traveler@example.com', 'test-password', '/share/abc123']]);
  assert.equal(join.location.search, '');
});

test('가입 메일에 외부 목적지를 전달하지 않는다', async () => {
  const join = authView('join-view.js', 'JoinView', '?next=https%3A%2F%2Fevil.example');
  join.input('email-input', 'traveler@example.com');
  join.input('password-input', 'test-password');
  await join.submit('join-form');
  assert.deepEqual(join.signups, [['traveler@example.com', 'test-password', null]]);
});

test('카카오 인증 구독이 URL을 먼저 바꾸어도 일정으로 복귀한다', async () => {
  const login = authView('login-view.js', 'LoginView', '?next=%2Fshare%2Fabc123');
  await login.click('kakao-btn');
  assert.equal(login.location.search, '');
  assert.deepEqual(login.navigations, ['/share/abc123']);
});

test('카카오·네이버 재로그인도 삭제 실행 없이 계정 관리 화면으로 복귀한다', async () => {
  const kakao=authView('login-view.js','LoginView','?next=%2Fprofile%2Fsecurity');
  await kakao.click('kakao-btn');
  assert.deepEqual(kakao.navigations,['/profile/security']);
  const naver=authView('login-view.js','LoginView','?next=%2Fprofile%2Fsecurity');
  await naver.click('naver-btn');
  await naver.messages.get('message')({origin:naver.location.origin,data:{type:'NAVER_OAUTH',token:'test-token',state:naver.session.get('naver_oauth_state')}});
  assert.deepEqual(naver.navigations,['/profile/security']);
});

test('네이버 팝업을 기다리는 동안에도 로그인 시작 시의 목적지를 보존한다', async () => {
  const login = authView('login-view.js', 'LoginView', '?next=%2Fview%2FABC123');
  await login.click('naver-btn');
  await login.messages.get('message')({
    origin: login.location.origin,
    data: { type: 'NAVER_OAUTH', token: 'test-token', state: login.session.get('naver_oauth_state') },
  });
  assert.equal(login.location.search, '');
  assert.deepEqual(login.navigations, ['/view/ABC123']);
});

test('인증 화면에 전달된 안전한 복귀 주소는 로그인까지 이어진다', async () => {
  const direct = authView('verify-view.js', 'VerifyView', '?next=%2Fshare%2Fabc123');
  await direct.click('go-login-btn');
  assert.deepEqual(direct.navigations, ['/login?next=%2Fshare%2Fabc123']);

  const continueUrl = 'https://app.example/login?next=%2Fshare%2Fabc123';
  const nested = authView('verify-view.js', 'VerifyView', `?continueUrl=${encodeURIComponent(continueUrl)}`);
  await nested.click('go-login-btn');
  assert.deepEqual(nested.navigations, ['/login?next=%2Fshare%2Fabc123']);
});

test('인증 화면의 잘못된 복귀 주소는 무시한다', async () => {
  for (const search of ['?next=%2F%2Fevil.example', '?continueUrl=https%3A%2F%2Fevil.example', '?continueUrl=http%3A%2F%2F%5B']) {
    const view = authView('verify-view.js', 'VerifyView', search);
    await view.click('go-login-btn');
    assert.deepEqual(view.navigations, ['/login']);
  }
});

test('로그인·가입 결과 문구는 사전을 거쳐 영어 화면에서도 번역된다', async () => {
  const failure = code => Object.assign(new Error(code), { code });
  const login = authView('login-view.js', 'LoginView', '', { authError: failure('auth/wrong-password') });
  login.input('email-input', 'traveler@example.com');
  login.input('password-input', 'wrong');
  await login.submit('login-form');
  assert.deepEqual(login.toasts, ['loginWrongPassword']);

  const taken = authView('join-view.js', 'JoinView', '', { authError: failure('auth/email-already-in-use') });
  taken.input('email-input', 'traveler@example.com');
  taken.input('password-input', 'test-password');
  await taken.submit('join-form');
  assert.equal(taken.element('error-msg').textContent, 'joinEmailInUse');

  const joined = authView('join-view.js', 'JoinView');
  joined.input('email-input', 'traveler@example.com');
  joined.input('password-input', 'test-password');
  await joined.submit('join-form');
  assert.deepEqual(joined.toasts, ['joinVerificationSent']);
});
