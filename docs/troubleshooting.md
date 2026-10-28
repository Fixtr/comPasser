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

### 16. 🛡️ 안정적인 AI 파이프라인 (Fault-Tolerant AI Architecture)
외부 AI 서버의 장애 상황에서도 서비스가 멈추지 않도록 강력한 안정성 확보 로직이 구축되어 상용 서비스 수준의 신뢰성을 제공합니다.
- **모델별 재시도**: 기본 모델의 호출 또는 응답 검증이 실패하면 백업 모델을 한 번 호출합니다.
- **Fast Fail & 즉시 모델 폴백**: 기본 모델 호출이 실패하거나 응답이 불완전하면 백업 모델(`gemini-3.5-flash-lite`)로 재시도합니다.
- **실패하면 가짜 일정 없이 오류**: 두 모델 모두 실패하면 대체 일정을 만들지 않고, 입력을 그대로 둔 채 오류를 보여 줍니다. 호출 자체가 실패했을 때는 같은 입력으로 '다시 시도'할 수 있습니다.

### 17. ⚡ 극한의 속도 최적화 (Extreme Performance Optimization)
- **지능형 다이나믹 로딩**: 대기 시간 동안 지루함을 방지하는 순환형 텍스트 UI를 통해 체감 대기 시간을 줄였습니다.
- **완벽한 병렬 처리 (Parallel Execution)**: 구글 맵스 지오코딩 및 경로 계산 로직을 순차 방식에서 `Promise.all` 기반의 병렬 방식으로 개편하여 로딩 속도를 5배 이상 개선했습니다.
- **초기화 락(Init Lock) 패턴**: 병렬 요청 시 SDK 중복 로드를 방지하는 싱글톤 초기화 아키텍처를 도입하여 자원 낭비를 최소화했습니다.

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

---

---

## [속도 최적화] 로딩 속도 극한의 최적화 및 병렬 처리 시스템 구축

**이슈 발행:** 2026-04-10
**관련 컴포넌트:** `GeminiOptimizer` (`src/domains/planner/services/gemini-optimizer.js`), `MapView` (`src/domains/map/ui/map-view.js`), `GeocodingService`, `RoutingService`

### 1. 증상 (병목 현상)
- **Gemini API 지연:** 503 에러 발생 시 기존의 재시도(Retry) 로직이 총 7초 이상 대기한 후 모델을 전환하여 사용자 이탈 유발.
- **지도 렌더링 폭포수(Waterfall) 현상:** 10개 이상의 장소를 지오코딩하고 경로를 계산할 때, 요청이 순차적으로(직렬) 발생하여 전체 지도를 그리는 데 수십 초 소요.
- **지루한 로딩 UX:** 긴 대기 시간 동안 고정된 메시지만 노출되어 사용자가 앱이 멈춘 것으로 오해함.

### 2. 해결 방법 (3단계 최적화)

1. **[UX] 다이나믹 로딩 UI 적용:**
   - 긴 생성 시간(10~30초) 동안 사용자 지루함을 해소하기 위해 3초 간격으로 회전하는 상태 메시지 큐 시스템 도입.
   - `try-finally` 블록을 통해 타이머를 안전하게 정리하여 메모리 누수 방지.

2. **[속도] Gemini API Fast Fail (즉시 우회):**
   - 429(할당량 초과)뿐만 아니라 503(서버 부하), "High demand", "overloaded" 에러 감지 시 재시도 루프를 즉시 탈출하도록 수정.
   - 백업 모델은 현재 `gemini-3.5-flash-lite`이며, 기본 모델 호출 실패 시 재시도한다.

3. **[속도] 구글 맵스 지오코딩 및 경로 병렬화:**
   - **병렬 요청 전환:** `GeocodingService`와 `map-view.js`의 `for` 루프(순차 await)를 `.map()`과 `Promise.all()` 기반의 병렬 아키텍처로 전면 개편.
   - **초기화 락(Initialization Lock) 패턴:** 수십 개의 병렬 요청이 동시에 발생할 때 구글 맵스 SDK 초기화(`importLibrary`)가 중복 실행되는 Race Condition을 방지하기 위해 `initPromise`를 활용한 싱글톤 초기화 로직 도입.
   - **결과:** 네트워크 탭의 계단식 요청이 수직 기둥 형태로 변화하며 렌더링 속도 500% 이상 향상.

---

## Cloudflare Pages SPA 라우팅 및 MIME type ('text/html') 에러

**이슈 발행:** 2026-04-13
**관련 서비스:** Cloudflare Pages, Vite

### 1. 증상
- 배포 후 메인 페이지(`/`)는 잘 나오지만, 상세 페이지(`/view/:id`)로 직접 접속하거나 새로고침하면 빈 화면이 뜨며 콘솔에 다음과 같은 에러 발생:
  - `Failed to load resource: the server responded with a status of 404`
  - `Refused to apply style from '.../assets/index-XXXX.css' because its MIME type ('text/html') is not a supported stylesheet MIME type.`

### 2. 원인
1.  **SPA 라우팅 미설정**: Cloudflare Pages는 기본적으로 정적 서버이므로, `/view/123` 같은 경로로 접속 시 해당 이름의 파일이나 폴더를 찾습니다. 없으면 404를 반환하는데, SPA에서는 모든 경로를 `index.html`로 보내주어야 합니다.
2.  **상대 경로 설정 문제**: Vite 설정에서 `base`가 `./`(상대 경로)로 되어 있으면, `/view/:id` 같은 중첩 경로에서 자원을 불러올 때 현재 경로를 기준으로 찾게 됩니다 (예: `/view/assets/...`). 서버는 이 경로에서 자원을 못 찾아 `index.html`을 반환하게 되고, 브라우저는 HTML 파일을 CSS/JS로 인식하려다 MIME 타입 에러를 뱉게 됩니다.

### 3. 해결 
1.  **Vite base 경로 수정**: `vite.config.js`에서 `base: './'`를 `base: '/'` (절대 경로)로 수정하여 어떤 경로에서든 루트 기준으로 자원을 참조하게 합니다.
2.  **Cloudflare Redirects 설정**: `public/_redirects` 파일을 생성하고 `/* /index.html 200` 내용을 추가하여, 서버가 찾지 못하는 모든 요청을 SPA의 진입점인 `index.html`로 리다이렉트하도록 설정합니다.

---

## 공유 링크 접속 시 일정 데이터 로드 실패 (Cross-Collection Fetch Error)

**이슈 발행:** 2026-04-13
**관련 서비스:** Firestore, `ItineraryView`

### 1. 증상
- 카카오톡 등으로 공유받은 링크(`/view/:id`)로 접속 시, 콘솔에 `No such itinerary document!` 또는 `permission-denied` 에러가 출력되며 일정을 불러오지 못함.
- 작성자 본인은 잘 보이지만, 링크를 받은 제3자는 볼 수 없는 현상 발생.

### 2. 원인
- **조회 로직의 편향성**: `/view/:id` 진입 시 호출되는 `getItineraryById` 함수가 로그인한 사용자의 개인 소유물인 `itineraries` 컬렉션만 우선적으로 조회함.
- **권한 모델 충돌**: 공유 링크는 누구나 접근 가능한 `shared_itineraries` 컬렉션의 ID를 사용하지만, 코드에서는 이를 프라이빗 공간(`itineraries`)에서 찾으려 했기 때문에 데이터가 없거나 보안 규칙에 의해 차단됨.

### 3. 해결
1.  **하이브리드 패치(Hybrid Fetch) 로직 도입**: `src/domains/itinerary/services/firestore-service.js`의 `getItineraryById`를 수정하여, 프라이빗 조회가 실패하거나 권한 에러가 발생할 경우 즉시 공용 공유 컬렉션(`shared_itineraries`)을 교차 조회하는 Fallback 메커니즘을 구현함.
2.  **UX 강화 (Fallback UI)**: 데이터가 정말로 없거나 권한이 없는 경우, 단순히 무한 로딩이나 빈 화면을 보여주는 대신 "일정을 찾을 수 없거나 접근 권한이 없습니다"라는 안내와 함께 메인으로 복귀할 수 있는 버튼이 포함된 전용 에러 뷰를 제공하도록 `ItineraryView`를 개선함.



---

## AI의 환각(Hallucination) 현상으로 인한 데이터 불일치 및 비현실적 경로 생성 이슈

**이슈 발행:** 2026-04-15
**관련 컴포넌트:** `GeminiOptimizer` (`src/domains/planner/services/gemini-optimizer.js`), `ItineraryView`

### 1. 증상
- AI가 본문 설명에서는 "지하철로 20분"이라고 하고, 하단 데이터 시트에는 "버스 45분"이라고 적는 등 데이터 불일치 발생.
- 마을버스를 타고 70km를 가라는 등 물리적으로 불가능하거나 비상식적인 경로 추천.
- "근처 식당을 이용하세요"와 같은 무책임하고 모호한 장소 추천으로 실용성 저하.

### 2. 원인
- **프롬프트 제약 부족**: AI에게 자유도를 너무 많이 부여하여, 데이터 필드 간의 상호 검증 로직이 프롬프트 수준에서 결여됨.
- **비용 데이터 누락**: 실존하지 않는 0원 처리나 빈칸 발생.

### 3. 해결 
1. **강력한 프롬프트 규칙(Anti-Hallucination) 도입**:
   - `description`과 `transitInfo` 필드의 100% 일치 강제.
   - 상세 환승 경로(`[A역 -> B역 -> C역]`) 포맷 지정 및 중간 과정 명시 필수화.
2. **상세 장소 추천 스키마**: 
   - 모호한 답변 금지 및 동선 근처 실존 장소(식당/카페)를 평점과 함께 3~5개 구체적으로 나열하도록 프롬프트 고도화.
3. **물리적 한계 설정**: 실제 한국 지리 데이터를 기반으로 한 이동 수단 및 시간 계산을 명시적으로 요구.

---

## 도보 및 이동 거리 부재 시 불필요한 초록색 교통 안내 박스 노출 이슈

**이슈 발행:** 2026-04-15
**관련 컴포넌트:** `ItineraryView` (`src/domains/itinerary/ui/itinerary-view.js`)

### 1. 증상
- 한 장소에서 다른 장소로 이동이 없거나, 바로 옆 건물로 도보 이동하는 경우에도 거대하고 눈에 띄는 '초록색 대중교통 안내 박스'가 렌더링되어 UI의 흐름을 방해함.

### 2. 원인
- 구글 맵스 경로 데이터가 존재하기만 하면 무조건 렌더링하도록 설정된 맹목적 UI 로직.

### 3. 해결 
- **조건부 렌더링(Conditional Rendering)**: `renderTransitInfo` 함수 내부에서 `mode`가 `WALKING`이거나, `duration`이 0~1분 내외인 경우, 혹은 이동 거리가 유의미하지 않은 경우 `display: none` 처리를 통해 UI 노이즈를 완벽하게 제거함.

---

## AI 일정 생성 시 '이동 시간'과 '총 소요 시간'의 논리적 모순 (Time Paradox)

**이슈 발행:** 2026-04-17
**관련 컴포넌트:** `GeminiOptimizer` (`src/domains/planner/services/gemini-optimizer.js`)

### 1. 증상
- 일정 카드에서 전체 소요 시간(예: 30분)보다 그 장소까지의 이동 시간(예: 46분)이 더 길게 표시되는 물리적 모순 발생.
- 사용자가 실제 체류 시간과 이동 시간을 구분하기 어려워 UX 혼란 가중.

### 2. 원인
- **AI의 수학적 계산 오류**: Gemini가 `duration` 필드를 생성할 때 이전 장소에서의 `transitInfo` 내 예상 소요 시간을 고려하지 않고 독립적으로 생성함.
- **프롬프트 가이드 부재**: 이동 시간과 체류 시간의 합산 관계에 대한 명시적인 제약 조건이 없었음.

### 3. 해결
- **Time Logic Rule 도입**: 시스템 프롬프트에 "Schedule Item의 duration은 반드시 transitInfo에 명시된 이동 시간보다 크거나 같아야 한다"는 수학적 규칙을 삽입.
- **UI 병기 로직**: `itinerary-view.js`에서 정규식을 통해 `transitInfo` 내의 시간 정보를 파싱하고, 이를 전체 duration 옆에 `(이동시간: O분)` 형태로 별도 노출하여 시간 사용의 투명성을 확보함.

---

## 식당/카페 추천 정보의 UI 가독성 저하 및 데이터 뭉뚱그림 현상

**이슈 발행:** 2026-04-17
**관련 컴포넌트:** `GeminiOptimizer`, `ItineraryView` (`src/domains/itinerary/ui/itinerary-view.js`)

### 1. 증상
- `localTip` 필드 안에 "현지 팁"과 "추천 식당 리스트"가 텍스트 줄바꿈으로만 섞여 있어, UI 상에서 '💡 현지 팁:' 라벨 아래에 모든 정보가 섞여 출력됨.
- 정보의 소제목 구분이 안 되어 사용자가 추천 리스트를 인지하기 어려움.

### 2. 원인
- **단일 필드 의존**: 하나의 데이터 필드(`localTip`)에 성격이 다른 두 종류의 정보(팁, 추천 리스트)를 함께 담으려 시도함.

### 3. 해결
- **스키마 분리 (Schema Split)**: AI 응답 JSON 구조에 `top3Recommendations` 필드를 신설하여 추천 리스트만 따로 분리해서 받도록 개선.
- **독립 UI 렌더링**: 프론트엔드에서 `localTip`과 `top3Recommendations`를 별도의 DOM 요소로 분리하고, 일정 타입(Dining/Cafe)에 맞는 아이콘(🍽️/☕)을 동적으로 할당하여 시각적 인지도를 극대화함.
- **데이터 품질 강화**: "평 방문 권장" 등 영양가 없는 텍스트 생성을 프롬프트 상으로 엄격히 금지함.
---

## 추천 리스트 UI 고도화 및 데이터 스키마 진화 (Schema Evolution)

**이슈 발행:** 2026-04-17
**관련 컴포넌트:** `GeminiOptimizer`, `ItineraryView` (`src/domains/itinerary/ui/itinerary-view.js`)

### 1. 증상
- AI가 추천하는 주변 맛집/카페 Top 3 리스트가 단순 텍스트(`1. 장소명(평점)`)로만 나열되어 있어, 사용자가 각 장소의 상세 정보를 확인하거나 길을 찾기 위해 다시 검색해야 하는 번거로움 발생.
- 맵 뷰어와 타임라인 간의 정보 연동성이 낮아 실제 이동 시의 활용도가 떨어짐.

### 2. 원인
- **데이터 구조의 한계**: 기존 스키마가 `top3Recommendations`를 단일 문자열 필드로 정의하고 있어, 개별 장소에 대한 URL(리뷰, 길찾기 등) 정보를 구조적으로 담을 수 없었음.
- **UI 인터랙션 부재**: 단순 텍스트 출력 위주의 렌더링 로직으로 인해 버튼이나 링크와 같은 액션 요소 배치가 불가능했음.

### 3. 해결
1.  **스키마 고도화 (JSON Schema Evolution)**:
    - `top3Recommendations`를 `SchemaType.STRING`에서 `SchemaType.ARRAY` of `OBJECT`로 변경.
    - 각 객체에 `name`, `rating`, `reviewUrl`, `directionUrl` 필드를 강제하여 데이터 확장성 확보.
2.  **지능형 프롬프트 주입**:
    - AI가 각 추천 장소의 구글 맵 리뷰 페이지(`maps/search`)와 길찾기(`maps/dir`) 딥링크를 자동으로 생성하도록 시스템 지시사항 강화.
3.  **버튼형 UI 구현**:
    - 프론트엔드에서 고도화된 객체 배열을 순회하며 각 장소별로 **[리뷰보기]** 및 **[길찾기]** 버튼을 인라인으로 렌더링.
    - 네이티브 앱 및 외부 지도 브라우저 연동을 위해 `target="_blank"` 및 딥링크 최적화 적용.
4.  **하위 호환성 유지**:
    - 기존에 생성된 문자열 기반 데이터도 정상적으로 표시될 수 있도록 `Array.isArray` 체크 및 조건부 렌더링 로직(Fallback)을 적용하여 서비스 연속성 유지.
---

## [iOS/Mobile] 투명 오버레이 및 showPicker API를 이용한 네이티브 달력 호출 버그

**이슈 발행:** 2026-05-08
**관련 컴포넌트:** `PreferenceView` (`src/domains/planner/ui/preference-view.js`)

### 1. 증상
- iOS 사파리 및 일부 모바일 브라우저에서 `input type="date"` 요소가 커스텀 스타일(투명 처리 등)로 인해 클릭이 무시되거나, 네이티브 달력 팝업이 뜨지 않는 현상 발생.
- 유저가 날짜 칩을 클릭해도 반응이 없어 서비스 진입이 불가능한 치명적 UX 장애.

### 2. 원인
- **이벤트 전파 차단**: 상위 요소의 `pointer-events` 설정이나 투명한 레이아웃 겹침으로 인해 실제 `input` 요소에 클릭 이벤트가 도달하지 못함.
- **API 미지원**: 구형 브라우저에서 `input.showPicker()` 메서드를 지원하지 않아 프로그래밍 방식의 호출이 실패함.

### 3. 해결
- **투명 오버레이 패턴**: `input` 요소를 화면상에는 보이지 않게 하되, 레이아웃 상으로는 날짜 선택 영역을 완전히 덮도록 배치하여 터치 이벤트를 100% 수신하게 함.
- **showPicker 폴백**: `typeof input.showPicker === 'function'` 체크를 통해 최신 API를 우선 호출하고, 실패 시 `input.click()`으로 폴백하여 모든 모바일 환경에서 네이티브 달력이 뜨도록 보장함.

---

## [Data Logic] JS Date 객체를 이용한 월말/연말 날짜 계산 및 타임존 밀림 현상 방지

**이슈 발행:** 2026-05-08
**관련 컴포넌트:** `PreferenceView`, `TravelForm`

### 1. 증상
- 멀티 데이 일정 생성 시, 31일에서 1일로 넘어가는 시점에 날짜가 중복되거나(2026-04-30 ~ 2026-04-30) 하루가 누락되는 버그 발생.
- 한국 표준시(KST) 환경에서 `toISOString()` 사용 시 UTC 기준으로 변환되면서 날짜가 어제 날짜로 찍히는 타임존 밀림 현상.

### 2. 원인
- **참조 복사(Mutation)**: `new Date()` 객체를 반복문 안에서 공유하여 날짜를 더할 때 원본 데이터가 변질됨.
- **UTC 변환 오차**: `toISOString()`은 항상 UTC 시간을 기준으로 하므로, 한국(GMT+9) 오전 시간에 생성된 날짜는 문자열 변환 시 어제로 표시됨.

### 3. 해결
- **독립 객체 생성**: 반복문 내부에서 `new Date(startDate.getTime())`를 통해 매번 완전히 독립된 복사본을 생성하여 연쇄적인 Mutation을 방지함.
- **로컬 타임 포맷터**: `toISOString()` 대신 `getFullYear`, `getMonth`, `getDate`를 직접 조합하는 `getLocalDateString` 유틸리티를 구현하여 타임존에 관계없이 유저가 선택한 로컬 날짜를 문자열로 보존함.

---

## [SPA Lifecycle] 라우터 캐싱으로 인한 데이터 미갱신 문제를 커스텀 이벤트와 리렌더링 강제화로 해결

**이슈 발행:** 2026-05-08
**관련 컴포넌트:** `TravelForm` (`src/domains/planner/ui/travel-form.js`), `main.js`

### 1. 증상
- `/preference`에서 기간을 수정하고 뒤로 가기 후 다시 `/plan`으로 진입해도 상단 배지와 폼 데이터가 이전 선택값으로 고정되어 있는 현상.
- 사용자가 데이터가 바뀌지 않은 것으로 오해하여 중복 수정을 반복함.

### 2. 원인
- **컴포넌트 재사용(Caching)**: SPA 라우터가 성능을 위해 이미 생성된 DOM 객체를 재사용하며, 이 과정에서 `connectedCallback`이 다시 호출되지 않아 초기화 로직이 누락됨.

### 3. 해결
- **IntersectionObserver 도입**: `travel-form` 컴포넌트 자체에 가시성 감지 옵저버를 부착하여, 라우터에 의해 화면에 표시되는 순간(`isIntersecting`)을 감지.
- **강제 리페치(Refresh)**: 화면 노출 시점에 `refreshFromStorage()`를 호출하여 `sessionStorage`의 최신 데이터를 읽어오고 `renderPreferenceBadges()`를 강제로 재실행하여 UI 동기화 100% 달성.

---

## [Planner Contract] 입력한 출발지·도착지·Anchor와 다른 일정이 생성되는 문제

**이슈 해결:** 2026-06-28
**관련 컴포넌트:** `TravelForm`, `GeminiOptimizer`, `planner-constraints.mjs`

### 1. 증상
- 신라호텔을 출발지, 인천공항을 도착지로 입력해도 결과가 서울숲 등 전혀 다른 장소에서 시작하거나 끝남.
- 입력한 필수 방문 일정이 결과에서 누락될 수 있음.

### 2. 원인
- `travel-form.js`는 `startLocation`, `endLocation`, `anchorSchedules`를 가진 평면형 요청을 생성했지만, `gemini-optimizer.js`는 `dailyData[].startLocation`, `dailyData[].endLocation`, `dailyData[].anchors`만 읽고 있었음.
- 결과적으로 핵심 제약이 Gemini 프롬프트에서 빠졌고, 프롬프트 지시를 검증하는 후처리도 없었음.

### 3. 해결
1. `normalizePlannerRequest()`로 평면형/레거시 요청을 일자별 `dailyData`로 통합.
2. 정규화된 출발지, 도착지, 시간 및 Anchor만 사용해 프롬프트 생성.
3. `enforcePlannerConstraints()`로 AI 응답의 첫/마지막 지점과 Anchor를 원래 입력값에 맞게 결정적으로 보정.
4. 문자열과 Google Place 객체를 동일하게 처리하도록 장소명 추출 로직 통합.
5. 단일/다일 일정, AI 제약 위반, 중복 방지를 자동 테스트로 검증.

### 4. 회귀 검증

```bash
npm test
npm run build
```
