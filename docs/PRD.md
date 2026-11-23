# Product Requirements Document (PRD)

> 📌 **ComPasser 제품 요구사항 정의서** · 상단의 영문 섹션은 AI 하네스 및 스코프 크리프 방지용 가드레일이며, 하단은 상세 기능 기획(한국어)입니다.
>
> 2026-11-23에 현재 코드 기준으로 낡은 서술을 고쳤다. 지원 지역, 화면 구성, 인증, 보안 규칙, 디자인 토큰이 대상이다.

---

## 1. Scope & Guardrails (MVP Non-Goals)

### 1.1. Project Overview
- **Project:** ComPasser (컴패서)
- **Target User:** Travelers planning day-by-day trips in the 24 supported cities across 11 countries (6 of them in South Korea), in Korean or English.
- **Core Value Proposition:** Fill empty time slots around fixed schedules ('Anchor Events') with optimal travel routes.

### 1.2. Scope (MVP)
- **Included:** 
  - Google Auth & Email Auth via Firebase. The web app also offers Kakao and Naver login; the native app offers Google only (`available-logins.mjs`).
  - Anchor-based itinerary generation using the Gemini models listed in `GEMINI_MODELS` (`functions/index.js`; `gemini-2.5-flash-lite` and `gemini-3.5-flash-lite` as of 2026-11-23).
  - Exact preservation of user-selected departure, destination, day boundary times, and Anchor schedules through deterministic validation.
  - Hybrid Map Strategy (Google Maps as Viewer, Local Deep Linking (Naver/Kakao) for Navigation).
  - Multi-language (i18n) support (ko/en).
  - User Preference Flow (Theme, Budget).
  - PWA & Capacitor support for native mobile apps (iOS/Android).
  - Serverless architecture leveraging Firebase (Firestore/Auth).
  - Single app shell: the Ionic React shell (`ionic-shell.html` + `src/prototype/ionic-shell.jsx`) is the entry for web, PWA and Capacitor; domain UIs are Web Components mounted inside it.

### 1.3. 🚫 Non-Goals (Strictly Excluded to prevent Scope Creep)
- **NO Custom Payment Infrastructure:** Absolutely no PG integrations beyond simple affiliate redirect linking.
- **NO Social Network Features:** No user-to-user following, social feeds, or in-app messaging. Public courses with reviews, content reports and author blocking exist; they are not a follow, feed or messaging system.
- **NO Heavy Full-Stack Frameworks:** Avoid heavy SSR frameworks (e.g., Next.js). A lightweight client-side Ionic React shell hosts the Web Components domain UIs.
- **NO Real-time Collaborative Editing:** Itinerary sharing is read-only for guests.
- **NO Server-side Rendering (SSR) framework:** The app UI stays Client-Side Rendered (CSR) + Firebase. Only the public English route pages (`/en/routes`, `sitemap.xml`, `robots.txt`) are rendered by a small Cloudflare Pages Worker (`src/server/public-routes-worker.mjs`) from public Firestore data. The same Worker only rewrites the app shell's preview tags for `/share/<id>` (catalogue city and day count).

---

## 2. Product Overview (제품 상세 개요)
**제품명**: ComPasser (컴패서)  
**한 줄 소개**: "꼭 갈 장소와 약속 시간을 중심으로 날짜별 동선을 짜 주는 AI 다국어 여행 플래너"

ComPasser는 복잡하고 피곤한 여행 동선 설계와 시간 계산을 AI 기술과 정교한 지도 시스템으로 해결해 주는 지능형 웹 애플리케이션입니다. 사용자의 '필수 방문지(Anchor)'를 중심으로 빈 시간을 계산하여 최적화된 동선과 장소를 추천합니다.

## 3. Target Audience (타겟 고객)
- **지원 도시를 여행하는 사람** (11개국 24개 도시. 한국 6곳, 미국 7곳, 일본·프랑스 각 2곳, 대만·태국·베트남·싱가포르·이탈리아·스페인·영국 각 1곳)
  - **외국인 관광객**: 한국어·영어 UI와 구글맵 기반 시각화로 낯선 도시에서도 동선을 파악할 수 있다.
  - **한국 내 여행**: 네이버 지도 / 카카오맵 링크로 익숙한 지도 앱에서 바로 길찾기를 연다.
- 특정 공연, 페스티벌, 스포츠 경기 등 반드시 참석해야 하는 일정이 있는 여행객
- 효율적인 동선 구성에 어려움을 겪거나 시간을 절약하고 싶은 여행객

## 4. Core Features (핵심 기능 요구사항)

### 4.1. 멀티 데이 AI 동선 최적화 (Multi-day Optimization)
- **최대 3박 4일 확장**: 기존 당일치기 일정 생성을 넘어, 최대 3박 4일(4일)까지의 연속된 여행 일정을 한 번에 생성할 수 있습니다.
- **일자별 개별 시간 설정**: 전체 일정에 대한 전역 시간뿐만 아니라 `[일자별로 시간 다르게 설정하기]` 토글을 통해 Day 1부터 Day N까지의 시작/종료 시간을 개별적으로 커스텀할 수 있습니다.
- **앵커 일정 (Opt-in UX)**: 기본 입력 폼에서는 숨겨져 있고, 사용자가 원할 때만 `[꼭 갈 장소 추가하기]`로 추가한다. 여행지 단계(`/destination`)에서 담은 장소도 같은 목록에 들어온다. 항목마다 `방문 시간 자동 배치`를 끄면 시작·종료 시간을 고정할 수 있다.
- **멀티 데이 앵커 타겟팅**: 다일차 여행일 경우 필수 일정이 몇 일차(Day N) 일정인지 지정할 수 있어 AI가 정확한 날짜에 일정을 배치합니다.
- **날짜별 탭 UI**: 생성된 멀티 데이 일정은 타임라인 상단의 날짜 탭(Day 1, Day 2...)을 통해 간편하게 전환하며 확인할 수 있습니다.
- **경로 경계 무결성**: 각 Day의 첫 일정은 사용자가 입력한 출발 장소/시작 시간과 일치하고, 마지막 일정은 도착 장소/종료 시간과 일치해야 합니다. AI가 이를 누락하거나 변경하더라도 후처리 계층에서 원래 입력값으로 보정합니다.
- **Anchor 무결성**: 필수 일정의 일차, 시작/종료 시간 및 장소는 추천 일정 생성 결과보다 우선하며 임의 변경할 수 없습니다.

### 4.2. 글로벌 다국어(i18n) 시스템
- 한국어(ko)와 영어(en)를 지원하며, 언어 토글 시 페이지 새로고침이나 DOM 및 이벤트 리스너 파괴 없이 즉각적으로 UI 텍스트와 AI 프롬프트가 동적으로 변경됩니다.

### 4.3. 하이브리드 지도 연동 전략 (Hybrid Map Strategy)
지도의 역할을 **뷰어(Viewer)**와 **네비게이터(Navigator)**로 철저히 분리합니다.
- **뷰어 (Google Maps)**: 전체 동선을 다국어로 한눈에 보여주는 시각적 현황판. 장소 카드의 **[📍 리뷰 보기]** 버튼과 연동하여 상세 정보 아카이브 역할 수행.
- **네비게이터 (한국 최적화 링크)**: 일정 카드의 **[길찾기]** 버튼이 네이버 지도 / 카카오맵 검색 링크를 담은 창을 연다. 알려진 한계: 이 창은 여행지와 관계없이 두 지도만 보여주고 문구가 한국어로 고정돼 있다. 해외 도시 일정과 영어 화면에서는 쓸 수 없다(2026-11-23 확인).
- **장소 검색 범위**: 장소 검색(Autocomplete)은 선택한 여행지의 국가로 제한한다(`includedRegionCodes`).
- **초기화(Reset)**: 폼 입력 전체를 즉시 비우고 처음부터 다시 단계를 밟을 수 있는 강력한 리셋 버튼을 제공합니다.

### 4.4. 화면 구성과 라우팅 (Ionic React Router)
- Ionic React 셸(`src/prototype/ionic-shell.jsx`)의 라우터가 화면 이동을 맡는다. 경로는 `/`·`/home`, `/destination`, `/recommend`, `/courses`, `/login`, `/join`, `/verify`, `/preference/1`, `/preference/2`, `/plan`, `/view`, `/view/:id`, `/share/:id`, `/profile`(`/trips`, `/personal`, `/security`), `/account-deletion-status`다. 하단 탭은 홈, 내 일정, 프로필이다.
- **일정 작성 흐름**: 나라 → 도시 → 꼭 갈 장소(`/destination`) → 날짜(`/preference/1`) → 테마·예산(`/preference/2`) → 상세 설정(`/plan`) → 생성 전 최종 확인.
  - 홈의 `일정 만들기`는 `/recommend`에서, 지구본에서 나라를 고르면 `/destination`에서 시작한다.
  - **상태 유지**: 작성 중인 초안은 `plannerDraftStore`가 `sessionStorage`에 저장하고 `localStorage`를 복구용으로 쓴다. 단계 이동과 브라우저 뒤로 가기에도 입력값이 남는다.
  - **네비게이션 가드**: Step 1 정보가 없는 상태에서 URL로 Step 2에 직접 접근 시 자동으로 Step 1로 리다이렉트하는 보안 로직을 구현했습니다.
  - **진행 표시**: 작성 화면 상단에 단계 진행 표시를 둔다(`step-progress.js`).
- **중첩 라우팅(/profile/:tab)**: 마이페이지 내부에 `/personal`, `/trips`, `/security` 서브 경로를 도입하여 각 탭의 상태를 URL과 동기화했습니다.
- **동적 파라미터 라우팅 (/view/:id)**: 정규식을 통해 고유 ID를 파싱하고 브라우저 새로고침 시에도 Firestore에서 일정을 즉시 복원하는 아키텍처를 구현했습니다.
- **Deep Linking**: 고유 URL을 통해 본인 혹은 타인의(권한 허용 시) 일정을 외부에서 즉시 접근할 수 있도록 동선을 고도화했습니다.
- **마이페이지 통합 관리**: 전용 `/profile` 경로 및 중첩 라우팅을 통해 개인정보, 여정 히스토리, 계정 보안을 한곳에서 관리할 수 있는 Google 스타일의 2-Column 레이아웃을 제공합니다.
  - **URL 동기화**: 탭 전환 시 History API를 통해 URL이 즉시 업데이트되어 브라우저 뒤로 가기 및 딥 링크(Deep Link)를 완벽히 지원합니다.
  - **Firestore 개인정보 연동**: `users/{uid}`에는 생년월일(`birthday`)만 읽고 쓴다. Firestore 규칙도 그 필드만 허용한다.
  - **본인인증은 없다**: 포트원(PortOne) 본인인증 UI는 폐기했다. 과거 데이터의 `isVerified`는 신원 증명으로 취급하지 않는다(`src/domains/profile/COMMAND_GUIDE.md`).
  - **인라인 수정 UI**: `window.prompt`를 배제하고, 리스트 항목 내에서 즉각적으로 변화하는 인라인 에디팅 폼을 적용했습니다.
  - **안정성 강화**: 
    - 신규 유저가 초기 데이터 없이 프로필에 진입할 때 발생하던 무한 로딩 이슈를 방지하는 Fallback 로직을 탑재했습니다.
    - **마이페이지 네비게이션 충돌 해결**: 마이페이지의 '내 여행 일정' 리스트에서 일정을 조회할 때, 더 이상 사용하지 않는 레거시 온보딩 모달("나만의 스마트한 여행 일정 만들기")이 렌더링되어 이벤트 버블링 및 비정상적인 라우팅(/plan 강제 이동)을 유발하던 문제 해결. 해당 레거시 코드를 전면 삭제하여 뷰어(/view/:id)로의 진입 안정성 100% 확보.
- **상태 유지 기능(Seamless Editor)**: View 화면에서 Plan 화면으로 되돌아가도 기존에 입력한 폼 데이터가 날아가지 않으며, 지속적인 수정과 재생성이 가능합니다.
- **온보딩 모달은 없다**: `/plan` 진입 시 띄우던 튜토리얼 모달은 삭제했다.

### 4.5. 데이터 분석 추적 (Google Analytics 4)
- **맞춤 이벤트 로깅**: `trackEvent`(`src/utils/analytics.js`)가 `gtag`가 있을 때 이벤트를 보낸다. 이벤트는 `generate_itinerary_click`, `save_itinerary_click`, `share_kakao_click`, `navigate_map_click`, `home_recommendation_select`, `public_course_copy`, `curated_course_copy`다.
- **현재 수집되지 않는다**: `gtag`를 불러오던 코드는 레거시 셸에만 있었고 셸을 Ionic으로 통합하면서 함께 빠졌다(`1b48eca`). 2026-11-23 운영 사이트에서 `gtag`가 없는 것을 확인했다. 이벤트 호출과 가상 페이지 뷰 모두 지금은 아무것도 보내지 않는다.

### 4.6. 모바일 웹앱 설치 (PWA) 지원
- Web App Manifest(`manifest.json`)와 Service Worker(`sw.js`) 연동을 통해 사용자가 앱을 홈 화면에 직접 설치(Add to Home Screen)할 수 있도록 지원합니다.
- 동적 테마 색상(theme-color)과 규격화된 앱 아이콘(192x192, 512x512)을 적용하여 스마트폰 바탕화면에서도 이질감 없는 네이티브 앱 수준의 모바일 사용성을 확보했습니다.

### 4.7. 세련된 UI/UX 및 일정 결과 화면 고도화
- **일정 상단 요약**: 예상 비용 합계(`cost-summary`)와 다음 방문지 안내(`next-stop`)를 일정표 위에 보여준다. 총 장소·소요 시간·카테고리 태그를 모아 보여주던 요약 대시보드는 삭제했다.
- **이동 수단 시각화**: 텍스트 위주의 정보를 아이콘 기반의 컬러 뱃지 UI로 전환하여 모바일 가독성 확보.
- **지능형 실용 정보(Quick Info) 고도화**:
  - **데이터 구조화**: AI가 예상 비용, 운영 시간, 현지 팁을 개별 필드로 생성하도록 스키마 고도화.
  - **3단 레이아웃**: 예상 비용, 영업시간, 현지 팁을 아이콘과 함께 여러 줄로 보여준다.
  - **하위 호환성**: 신규/기존 데이터 포맷에 관계없이 안정적인 렌더링을 보장하는 Fallback 로직 구축.
- **플랫 & 무채색 디자인 시스템 (`--cp-*`)**: UI는 무채색 기반의 정갈한 타이포그래피와 1px 실선(`--cp-rule`), 기본 8px(`--cp-radius`) 테두리 반경을 적용하고 뱃지·칩만 알약 모양(`--cp-pill`)으로 두며, 그림자(`box-shadow: none`)와 그라디언트를 전면 배제합니다. 색상은 지도 마커 규칙(Anchor 보라, 시작 초록, 일반 파랑) 및 필수 상태 뱃지에만 제한적으로 사용하여 야외 시인성과 저사양 렌더 성능을 극대화합니다. 버튼 등 인터랙션은 translateY 들뜸 효과 대신 잉크 반전(`--cp-ink` 배경 / `--cp-surface` 텍스트)을 적용합니다.
- **안정적인 일정 이미지 내보내기 (Troubleshooting)**: `html2canvas` 라이브러리를 활용한 DOM 캡처 중, 최신 CSS 색상 함수(예: `oklch`, `color-mix`, `color(display-p3)`)를 파싱하지 못해 이미지 다운로드가 실패하는 렌더링 엔진 호환성 문제 발생. 이를 해결하기 위해 모든 디자인 토큰을 순수 hex로 통일하고, 캡처에 불필요한 UI 요소(버튼 등)를 `ignoreElements` 콜백과 임시 스타일 변환(Cleanup 로직 포함)을 통해 필터링하여 안정적인 이미지 내보내기 기능 복구 완료.

### 4.8. 광고 및 수익화 (현재 미운영)
- 로딩 화면 제휴 광고 배너 캐러셀과 결과 화면 AdSense 슬롯은 제품에 없습니다. 배너는 레거시 셸에서만 동작해 2026-10-07 이후 운영에서 빠졌고 복원하지 않기로 결정했습니다. AdSense 슬롯과 로더는 2026-10-21 삭제했습니다(`5bdbb64`).
- AdMob 보상형 광고는 일시 중지 상태입니다. 보상형 광고 단위(`ADMOB_REWARDED_AD_UNITS`)가 설정되지 않아 `adMobRewardCallback` 함수를 2026-10-21부터 배포하지 않습니다(`functions/index.js`).

### 4.9. 모바일 앱 패키징 (iOS/Android Support)
- Capacitor를 활용하여 동일한 웹 소스 코드를 iOS 및 Android 네이티브 앱으로 패키징했습니다.
- **모바일 UX 최적화**: 
  - `viewport-fit=cover` 설정을 통한 노치 디자인 대응.
  - 전역 CSS에 `safe-area-inset` 여백을 적용하여 상단바 및 하단 바 간섭 방지.
  - 앱 전용 라우팅 보완: 초기 경로가 `/index.html`로 시작하는 앱 환경에서도 홈 화면이 즉시 렌더링되도록 개선.
- **빌드 경로**: Vite `base`는 `/`이고 Capacitor의 `webDir`은 `dist`다.

### 4.10. 2026년 10~11월에 추가된 기능 (요약)
위 절들이 다루지 않는 기능이다. 작업별 기록은 `blueprint.md`에 있다.
- 나라 → 도시 선택과 홈 지구본, 도시별 기본 추천 장소
- AI 장소 추천(`recommendPlaces`)과 관심사 선택
- 공개 코스 둘러보기, 후기, 신고, 작성자 차단
- 홈의 다가오는 여행 카드
- 여행 중 방문 완료 체크와 개인 메모
- 여행 당일 비 예보 배너와 실내 대안 찾기
- 남은 일정 맞추기(당일 재계획), 방문 시간 변경, 장소 바꾸기
- 오프라인 열람
- 캘린더 내보내기, 일정 이미지 내보내기, 다른 날짜로 복제
- 일일 생성 크레딧
- 숙소와 항공편 입력, 동행 선호

## 5. Security & Access Control (보안 및 접근 제어)

### 5.1. 보안 강화 및 Route Guard
- **비정상 접근 차단**: 로그인 없이 열리는 경로는 홈, `/destination`, `/recommend`, `/courses`, `/login`, `/join`, `/verify`, `/share/:id`, `/account-deletion-status`다. 그 밖의 경로(`/preference`, `/plan`, `/view`, `/profile`)에 비로그인 사용자가 들어오면 `/login`으로 보낸다(`src/app/route-decision.mjs`).
- **계정 탈퇴 안전장치**: 탈퇴는 최근 로그인 확인(로그인 후 60초 이내, 아니면 다시 로그인) → 확인 창 → 서버 접수 순서로 진행한다. 삭제는 서버(`functions/account-deletion.js`)가 단계별로 수행하고, 클라이언트는 접수증으로 진행 상태를 조회한다. 서버가 완료를 알린 뒤에만 로그아웃한다. 다시 로그인한 뒤 탈퇴가 자동으로 이어지지 않으며 사용자가 다시 확인해야 한다.

### 5.2. 환경 변수(.env) 기반 설정 관리
- **민감 정보 분리**: GA4 측정 ID(`VITE_GA_MEASUREMENT_ID`), Firebase 설정값, Google Maps API 키 등을 코드베이스에서 하드코딩하지 않고 `.env` 환경 변수로 분리 관리하여 Git 유출을 원천 차단합니다. (`.gitignore` 적용)
- **템플릿 공유**: 협업을 위한 `.env.example` 파일을 별도로 구성하여 안전한 환경 설정을 지원합니다.

### 5.3. 통합 인증 및 이메일 보안 시스템
- **통합 인증 에러 핸들링**: Firebase의 최신 에러 코드를 분석하여 유저가 이해하기 쉬운 한국어 알림창으로 변환 제공합니다. (invalid-credential 등 대응)
- **상태 초기화 보장**: 로그아웃 및 회원 탈퇴 시, 브라우저에 남은 폼 데이터를 즉각 삭제하여 보안 개인정보를 보호하고 다음 사용자의 세션 꼬임을 방지합니다.
- **소셜 인증 최적화**: 구글 로그인 시 이전 인증 정보를 활용한 자동 로그인(원클릭) 흐름을 원복하여 사용 편의성을 높였으며, 로그아웃 후 버튼 비활성화 버그를 수정했습니다.
- **인앱 브라우저 방어**: 카카오톡 등 인앱 환경에서 Google 로그인 403 에러를 방지하기 위해 안드로이드(Intent) 및 iOS(안내 모달)별 맞춤 대응 로직이 적용되어 있습니다.

### 5.4. 데이터베이스 보안 규칙 (Firestore Security Rules)
- **공유용 데이터 (`shared_itineraries`)**: 링크를 아는 누구나 문서 하나를 조회(`get`)할 수 있다. 목록 조회는 안 된다. 새 공유본은 원본 개인 일정이 소유자에게 남아 있는 동안만 읽힌다.
- **개인 보관용 데이터 (`itineraries`)**: 읽기와 삭제는 `request.auth != null && resource.data.userId == request.auth.uid`인 소유자만 할 수 있다. 쓰기 조건은 `firestore.rules`에 따로 있다.

## 6. Technical Stack
- **Frontend Core**: Vite, React 19 + Ionic 9 shell, Web Components (ES Modules) for domain UIs
- **Mobile & App Shell**: Ionic React Shell (`ionic-shell.jsx`, `ionic-screens.jsx`), Capacitor (iOS/Android)
- **Design System**: `--cp-*` CSS 토큰 (순수 hex 기반, `oklch`/`color-mix` 금지, 화면 스타일의 `rgba` 금지(스크림 토큰 `--cp-scrim`만 예외), 1px 실선, 8px radius와 알약 예외, 0 shadow, 0 gradient)
- **APIs**: Google Maps JS API, Google Gemini API
- **네비게이션 딥링크**: 네이버 지도 / 카카오맵 / Google Maps URL Scheme
- **Backend/Auth**: Firebase Auth, Firebase Firestore, Cloud Functions
- **Hosting**: Cloudflare Pages (`main` push 시 CI가 배포), Cloud Functions는 별도 배포
