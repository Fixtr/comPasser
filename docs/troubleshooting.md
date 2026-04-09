# 트러블슈팅 (Troubleshooting)

## 구버전 일정 데이터 라우팅 및 렌더링 실패 오류 (Silent Failure)

**이슈 발행:** 2026-04-04
**관련 컴포넌트:** `ItineraryView` (`src/domains/itinerary/ui/itinerary-view.js`), Router (`src/app/main.js`)

### 1. 증상
- `/view/:id` 페이지 진입 시 화면이 렌더링되지 않으며 하얗게 뻗는 현상(Silent Failure) 발생.
- 3월 31일, 4월 2일 등 과거에 생성된 일정 항목 클릭(조회) 시 발생하며, 콘솔에 명확한 에러 로그조차 출력되지 않아 추적이 어려움.
- SPA 라우팅 환경에서 명시적인 컴포넌트 마운트 및 렌더링 호출 누락 발생.

### 2. 원인
1. **데이터 스키마의 구조적 불일치:**
   - **신버전 데이터:** `data.itineraryPlan.days`
   - **구버전 데이터:** 루트에 `data.days`가 존재하여 최신 스키마를 따르는 렌더링 함수(`showResults`)가 배열을 찾지 못하고 종료되거나 크래시 발생.
2. **SPA 라우터 렌더링 사이클 유실:**
   - 주소가 변경될 때마다 `ItineraryView`를 다시 마운트하거나 강제로 `loadItineraryById`를 실행해야 했으나, 단순히 컴포넌트 내부의 생명주기(`connectedCallback`)에만 의존하여 발생. 기존의 DOM 인스턴스가 렌더링 트리거를 수신하지 못함.

### 3. 해결 
1. **정규화(Normalization) 헬퍼 함수 및 호환성 강화:**
   - 원본 데이터를 스키마 버전과 무관하게 신규 스키마 포맷으로 래핑(Wrapping)해 주는 `normalizeData` 헬퍼 함수를 적용하여 렌더링 로직의 충돌을 방어함.
   - 데이터 손실로 `scheduleItems`가 비어있더라도 화면이 크래시되지 않고 시각적 오류 UI 박스가 노출되게 개선.
2. **라우터 (main.js) 명시적 호출 개선 및 catch 적용:**
   - 동적 파라미터 감지 시 DOM에 마운트된 객체에 능동적으로 `loadItineraryById(docId)` 신호를 발동.
   - 전역 비동기 Promise 에러 캡처(`unhandledrejection`) 이벤트를 추가하여 사각지대에 누락된 에러를 감지.

---

## Gemini API 503 Service Unavailable 및 429 Too Many Requests 에러로 인한 일정 생성 마비(단일 장애점, SPOF) 현상

**이슈 발행:** 2026-04-07
**관련 컴포넌트:** `GeminiOptimizer` (`src/domains/planner/services/gemini-optimizer.js`), `PlannerView` (`src/domains/planner/ui/planner-view.js`)

### 1. 증상
- 구글 AI 서버에 트래픽이 몰릴 때, 일정 생성 요청이 즉시 실패 처리되며 "AI를 통한 일정 생성에 실패했습니다"라는 에러 UI가 사용자에게 노출됨.
- 서비스 이용자가 급증하는 특정 시간대에 AI 일정 생성 기능이 완전히 마비되는 현상 발생.

### 2. 원인
- **외부 API 의존성 리스크:** 외부 API(Gemini)의 일시적인 서버 불안정(503) 및 요청 한도 초과(429) 시 별도의 재시도 로직이 없어 즉시 장애로 이어짐.
- **SPOF (Single Point of Failure):** `gemini-2.5-flash` 모델 하나에만 의존하고 있어, 해당 모델 서버에 문제가 생길 경우 서비스 전체 기능이 정지됨.

### 3. 해결 (Fault Tolerance 도입)
1. **Exponential Backoff (지수 백오프):**
   - API 호출 실패 시 즉시 포기하지 않고 1초, 2초, 4초 대기 후 최대 3회 자동 재시도하는 로직을 구현하여 일시적인 네트워크/서버 불안정을 극복함.
2. **Model Fallback (백업 모델 우회):**
   - 1순위 모델(`gemini-2.5-flash`)이 최종 실패할 경우, 즉시 2순위 백업 모델(`gemini-1.5-flash`)로 우회하여 요청하도록 안전망을 구축하여 서비스 연속성을 확보함.
3. **UX 개선 (재시도 피드백):**
   - 재시도 돌입 시 로딩 화면 텍스트를 "서버 연결 지연으로 재시도 중입니다..."로 변경하여 사용자에게 현재 상황을 투명하게 안내하고 이탈을 방지함.

---

## 카카오/네이버 소셜 로그인 (Custom Token) 연동 및 권한 관련 이슈

**이슈 발행:** 2026-04-09
**관련 컴포넌트:** `LoginView` (`src/domains/auth/ui/login-view.js`), `main.js`, `verifySocialToken` (Firebase Functions)

### 이슈 1: 카카오 로그인 `window.Kakao.Auth.login is not a function` 에러
- **원인:** 카카오 SDK v2부터 팝업 방식(`login`)이 공식 지원 중단되고 리다이렉트(`authorize`) 방식 위주로 개편됨. 그러나 SPA 환경에서 리다이렉트 시 앱 상태가 초기화되어 사용자 경험이 저하되는 문제 발생.
- **해결:** `index.html`에 삽입된 카카오 SDK를 v1.43.1로 다운그레이드하여 팝업 기반 인증을 안정적으로 유지하고 SPA 상태 이탈 방지.

### 이슈 2: Cloud Functions 호출 시 CORS 에러 및 `internal` 에러
- **원인:** Firebase `onCall` (v2) 사용 시 브라우저에서 보낸 Preflight(OPTIONS) 요청이 적절히 처리되지 않거나 백엔드에서 거부됨.
- **해결:** 함수 타입을 `onRequest` (v1 아키텍처)로 변경하고, `cors({ origin: true })` 미들웨어를 사용하여 모든 도메인에서의 호출 및 OPTIONS 요청을 명시적으로 허용.

### 이슈 3: 함수 타입 변경 배포 에러 (`Changing from a callable function to an HTTPS function is not allowed`)
- **원인:** 이름이 같은 기존 `onCall` 함수를 `onRequest` 함수로 덮어쓰려 할 때 발생하는 Firebase CLI의 안전 정책.
- **해결:** `firebase functions:delete verifySocialToken` 명령어로 기존 배포된 함수 인스턴스를 수동 삭제한 후, 신규 타입의 함수를 재배포하여 충돌 해결.

### 이슈 4: 커스텀 토큰 발급 권한 에러 (`iam.serviceAccounts.signBlob denied`)
- **원인:** Firebase Admin SDK가 커스텀 토큰을 서버에서 생성할 때 사용하는 서비스 계정(Default Service Account)에 '기기 서명' 및 '토큰 생성'에 필요한 권한이 부족하여 발생.
- **해결:** Google Cloud IAM 콘솔에서 해당 프로젝트의 서비스 계정에 **서비스 계정 토큰 생성자(Service Account Token Creator)** 역할을 직접 추가 부여하여 권한 문제 해결.

### 이슈 5: 소셜 로그인 성공 후 메인 화면 진입 시 강제 로그아웃 튕김 현상
- **원인:** `main.js`의 전역 인증 감지 로직이 이메일/비밀번호 가입자를 위한 `emailVerified` 체크를 수행하는데, 인증 프로세스가 다른 소셜 로그인 유저까지 이를 맹목적으로 체크하여 강제 로그아웃시키는 로직이 작동함.
- **해결:** 유저 객체의 `providerData` 배열을 순회하여 `providerId`가 `password`인 경우에만 이메일 인증을 요구하고, 소셜 로그인 유저(Kakao, Naver, Google 등)는 인증 여부와 상관없이 통과시키는 조건부 예외 처리(Bypass) 로직 적용.
