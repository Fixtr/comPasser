# Product Requirements Document (PRD)

> 📌 **ComPasser 제품 요구사항 정의서** · 상단의 영문 섹션은 AI 하네스 및 스코프 크리프 방지용 가드레일이며, 하단은 상세 기능 기획(한국어)입니다.
>
> 2026-11-23에 현재 코드 기준으로 낡은 서술을 고쳤다. 지원 지역, 화면 구성, 인증, 보안 규칙, 디자인 토큰이 대상이다.
>
> 2026-11-24에 최종 코드 기준으로 다시 맞췄다. 길찾기, 여행 당일 출발 안내, 읽기 모드, 홈 도시 검색, 분석 수집, 보안 규칙 서술이 대상이다.

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
  - Hybrid Map Strategy (Google Maps as Viewer; the directions button opens a Naver/Kakao link popup for trips in Korea and a Google Maps route directly for trips elsewhere).
  - Multi-language (i18n) support (ko/en).
  - User Preference Flow (Theme, Budget, Companion, Pace).
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
  - **해외 도시 여행**: 길찾기 버튼이 Google Maps 경로를 바로 연다. 네이버 지도 / 카카오맵 창은 한국 여행에서만 뜬다.
- 특정 공연, 페스티벌, 스포츠 경기 등 반드시 참석해야 하는 일정이 있는 여행객
- 효율적인 동선 구성에 어려움을 겪거나 시간을 절약하고 싶은 여행객

## 4. Core Features (핵심 기능 요구사항)

### 4.1. 멀티 데이 AI 동선 최적화 (Multi-day Optimization)
- **최대 3박 4일 확장**: 기존 당일치기 일정 생성을 넘어, 최대 3박 4일(4일)까지의 연속된 여행 일정을 한 번에 생성할 수 있습니다.
- **일자별 개별 시간 설정**: 전체 일정에 대한 전역 시간뿐만 아니라 `[일자별로 시간 다르게 설정하기]` 토글을 통해 Day 1부터 Day N까지의 시작/종료 시간을 개별적으로 커스텀할 수 있습니다.
- **앵커 일정 (Opt-in UX)**: 기본 입력 폼에서는 숨겨져 있고, 사용자가 원할 때만 추가한다. 상세 설정(`/plan`)에는 버튼이 두 개다. `[예약한 일정 추가하기]`는 시작·종료 시간을 바로 적는 항목을, `[꼭 갈 장소 추가하기]`는 `방문 시간 자동 배치`가 켜진 항목을 만든다. 자동 배치 항목이 하나라도 있으면 둘째 버튼은 `[꼭 갈 장소 더 추가하기]`로 바뀐다. 여행지 단계(`/destination`)에서 담은 장소도 같은 목록에 들어온다. 항목마다 `방문 시간 자동 배치`를 켜고 꺼서 둘 사이를 바꿀 수 있다.
- **자동 배치는 앱이 한다**: `방문 시간 자동 배치` 항목은 AI에 보내기 전에 앱이 이동 시간과 영업시간을 보고 빈 시간에 넣는다. 같은 날 같은 장소 항목은 하나로 합친다. 넣을 자리가 없으면 사유(시간 부족, 영업시간, 경로 확인 불가)를 알리고 생성하지 않는다. 앵커는 하루 10개까지다.
- **멀티 데이 앵커 타겟팅**: 다일차 여행이면 필수 일정이 몇 일차(Day N)인지 지정한다. 앱이 그 일차에 일정을 직접 넣는다. AI에는 그 일정의 이름·장소·시간을 비워 둘 구간으로 알리고, 그 장소는 주변 추천을 찾을 기준 위치로도 쓴다. AI는 앵커 항목을 만들지 않는다.
- **날짜별 탭 UI**: 생성된 멀티 데이 일정은 타임라인 상단의 날짜 탭(Day 1, Day 2...)을 통해 간편하게 전환하며 확인할 수 있습니다.
- **경로 경계 무결성**: 각 Day의 첫 일정은 사용자가 입력한 출발 장소/시작 시간과, 마지막 일정은 도착 장소/종료 시간과 일치한다. AI는 그 사이의 선택 방문만 생성하고, 출발·도착·앵커 항목은 앱이 입력값 그대로 넣는다.
- **Anchor 무결성**: 필수 일정의 일차, 시작/종료 시간 및 장소는 추천 일정 생성 결과보다 우선하며 임의 변경할 수 없습니다.

### 4.2. 글로벌 다국어(i18n) 시스템
- 한국어(ko)와 영어(en)를 지원하며, 언어를 바꾸면 페이지 새로고침 없이 UI 텍스트가 바로 바뀐다. 일정 화면의 날짜 탭과 카드는 새 언어로 다시 그리되 지도 경로는 다시 요청하지 않는다.
- 기본 언어는 한국어이고 브라우저 언어는 따르지 않는다. 주소에 `?lang=en` 또는 `?lang=ko`가 있으면 그 언어로 열고, 고른 언어는 `localStorage`(`compasser_lang`)에 남아 다음 방문에도 유지된다. 클라이언트는 프롬프트가 아니라 언어 값만 보내고, AI 생성 문구의 언어는 서버가 그 값으로 정한다.

### 4.3. 하이브리드 지도 연동 전략 (Hybrid Map Strategy)
지도의 역할을 **뷰어(Viewer)**와 **네비게이터(Navigator)**로 철저히 분리합니다.
- **뷰어 (Google Maps)**: 전체 동선을 다국어로 한눈에 보여주는 시각적 현황판. 일정 카드의 **[리뷰 보기]** 링크는 그 장소의 Google 지도 페이지를 새 창으로 연다. 숙소가 정해지지 않은 항목과 아직 확인되지 않은 추천 장소에는 리뷰·길찾기 버튼을 보여주지 않는다.
- **네비게이터 (여행지별 길찾기)**: 일정 카드와 휴대폰 `다음 목적지` 패널의 **[길찾기]** 버튼은 여행지 국가에 따라 다르게 동작한다. 한국 일정은 네이버 지도 / 카카오맵 검색 링크를 담은 창을 연다(창 문구는 한국어·영어를 따른다). 한국 밖 일정은 창 없이 그 장소까지의 Google Maps 경로를 바로 연다. 목적지는 장소 이름이고, 저장된 Google 장소 ID가 있으면 함께 넘긴다. 요청 정보가 없는 옛 일정은 한국으로 취급한다.
- **구간 보기**: 지도 위쪽의 넘기기 줄(`이전 구간`·`다음 구간`·`전체 보기`)로 그날의 이동 구간을 하나씩 본다. 고른 구간만 진하게 보이고 지도 범위가 그 구간에 맞춰진다. 일정표 이동 카드의 **[지도에서 보기]** 버튼과 여행 당일 출발 안내도 같은 구간을 연다(휴대폰에서 일정 시트가 전체 높이면 기본 높이로 내려 지도를 보여준다). 이미 그린 경로만 쓰므로 지도 API 요청은 늘지 않는다. 같은 장소 안 이동처럼 선이 없는 구간은 고를 수 없다.
- **구간 경로 확인**: 일정표의 이동 카드를 누르면 그 구간(출발·도착 좌표, 대중교통 또는 도보)이 Google Maps 길찾기로 열린다. 여행지 국가와 관계없이 Google Maps를 쓴다. 추천 Top 3의 길찾기 링크도 같다.
- **장소 검색 범위**: `/destination`의 꼭 갈 장소 검색은 선택한 여행지의 국가로 제한한다(`includedRegionCodes`). `/plan` 폼과 장소 바꾸기의 검색창에는 이 제한이 걸려 있지 않다.
- **초기화(Reset)**: 상세 설정(`/plan`)의 `초기화` 버튼은 상세 입력(출발·도착 장소와 시간, 숙소, 항공편, 꼭 갈 장소)만 비운다. 여행지, 날짜, 테마·예산·동행·속도는 그대로 두고 화면도 `/plan`에 머문다.

### 4.4. 화면 구성과 라우팅 (Ionic React Router)
- Ionic React 셸(`src/prototype/ionic-shell.jsx`)의 라우터가 화면 이동을 맡는다. 경로는 `/`·`/home`, `/destination`, `/recommend`, `/courses`, `/login`, `/join`, `/verify`, `/preference/1`, `/preference/2`, `/plan`, `/view`, `/view/:id`, `/share/:id`, `/profile`(`/trips`, `/personal`, `/security`), `/account-deletion-status`다. `/preference`는 `/preference/1`로 보내고, 표에 없는 주소나 형식이 틀린 일정 주소는 `찾을 수 없음` 화면을 보여준다. 하단 탭(홈 `/home`, 내 일정 `/profile/trips`, 프로필 `/profile/personal`)은 홈과 프로필 화면에서만 보인다.
- **일정 작성 흐름**: 나라 → 도시 → 꼭 갈 장소(`/destination`) → 날짜(`/preference/1`) → 테마·예산(`/preference/2`) → 상세 설정(`/plan`) → 생성 전 최종 확인.
  - 홈의 `일정 만들기`는 `/recommend`에서, 지구본에서 나라를 고르면 `/destination`에서 시작한다.
  - **홈 도시 검색**: 홈의 `지원 도시 검색`에서 도시를 고르면 나라·도시 단계를 건너뛰고 `/destination`의 장소 단계에서 시작한다. 검색은 도시 이름의 단어 첫머리를 맞추며 한글은 조합 중인 글자도 찾는다(붓 → 부산). 일치하는 도시가 없으면 `전체 지원 도시 보기`로 `/recommend`를 연다.
  - **도시 변경 확인**: 초안에는 도시가 하나만 들어간다. 홈 검색에서 다른 도시를 고르면 이전 도시에 담아 둔 내용(꼭 갈 장소, 숙소, 날짜별 출발·마무리 장소, 최종 도착지)이 지워지므로, 지워질 내용이 있을 때는 `도시를 바꿀까요?` 창에서 `바꾸기`를 눌러야 바뀐다. 취소하면 초안은 그대로다.
  - **주소에 남는 선택**: `/recommend`와 `/courses`는 고른 나라와 도시를 주소(`?country=…&city=…`)에 둔다. 뒤로 가기는 한 단계씩 올라가고 새로고침해도 선택이 유지된다. `/recommend`에서 둘러보는 도시는 장소를 담거나 다음 단계로 넘어갈 때에만 초안에 저장한다.
  - **상태 유지**: 작성 중인 초안은 `plannerDraftStore`가 `sessionStorage`에 저장하고 `localStorage`를 복구용으로 쓴다. `/plan` 전 단계에서는 단계 이동과 브라우저 뒤로 가기에도 입력값이 남는다. 로그인한 사용자가 `/plan`을 벗어나려 하면(뒤로 가기 포함) 나가기 확인 창이 뜨고, 나가면 초안을 지운다. `/plan`에서 탭을 닫거나 새로고침해도 초안을 버린다. `/plan`에서 여행지·날짜·취향을 고치러 다녀오는 이동은 예외다. 생성 중이면 나가기 대신 생성 중단을 묻는다.
  - **네비게이션 가드**: Step 1 정보가 없는 상태에서 URL로 Step 2에 직접 접근 시 자동으로 Step 1로 리다이렉트하는 보안 로직을 구현했습니다.
  - **진행 표시**: 작성 화면 상단에 단계 진행 표시를 둔다(`step-progress.js`).
- **중첩 라우팅(/profile/:tab)**: 마이페이지는 `/profile/personal`, `/profile/personal?tab=trips`, `/profile/security` 주소로 탭 상태를 URL과 동기화한다. 하단 탭 `내 일정`의 `/profile/trips`는 탭 메뉴 없이 일정 목록만 보여준다.
- **동적 파라미터 라우팅 (/view/:id)**: 정규식을 통해 고유 ID를 파싱하고 브라우저 새로고침 시에도 Firestore에서 일정을 즉시 복원하는 아키텍처를 구현했습니다.
- **결과 화면 구성**: 폭 900px 이상에서는 일정표와 지도를 나란히 보여준다. 휴대폰에서는 지도 위에 일정 시트를 올리며 높이는 30%·62%·100% 세 단계(기본 62%)다. 오프라인이거나 `?offline=1`로 열면 지도 없이 저장해 둔 일정 사본을 보여준다.
- **Deep Linking**: 고유 URL을 통해 본인 혹은 타인의(권한 허용 시) 일정을 외부에서 즉시 접근할 수 있도록 동선을 고도화했습니다.
- **마이페이지 통합 관리**: 전용 `/profile` 경로에서 개인정보, 여정 히스토리, 계정 보안을 한곳에서 관리한다. 한 단 레이아웃이고 위쪽 가로 탭(개인정보, 내 여행 일정, 보안)으로 전환한다.
  - **URL 동기화**: 탭을 누르면 셸 라우터가 주소를 바꿔 브라우저 뒤로 가기와 딥 링크(Deep Link)를 지원한다.
  - **Firestore 개인정보 연동**: `users/{uid}`에는 생년월일(`birthday`)만 읽고 쓴다. Firestore 규칙도 그 필드만 허용한다.
  - **본인인증은 없다**: 포트원(PortOne) 본인인증 UI는 폐기했다. 과거 데이터의 `isVerified`는 신원 증명으로 취급하지 않는다(`src/domains/profile/COMMAND_GUIDE.md`).
  - **인라인 수정 UI**: `window.prompt`를 배제하고, 리스트 항목 내에서 즉각적으로 변화하는 인라인 에디팅 폼을 적용했습니다.
  - **안정성 강화**: 
    - 신규 유저가 초기 데이터 없이 프로필에 진입할 때 발생하던 무한 로딩 이슈를 방지하는 Fallback 로직을 탑재했습니다.
    - **마이페이지 네비게이션 충돌 해결**: 마이페이지의 '내 여행 일정' 리스트에서 일정을 조회할 때, 더 이상 사용하지 않는 레거시 온보딩 모달("나만의 스마트한 여행 일정 만들기")이 렌더링되어 이벤트 버블링 및 비정상적인 라우팅(/plan 강제 이동)을 유발하던 문제 해결. 해당 레거시 코드를 전면 삭제하여 뷰어(/view/:id)로의 진입 안정성 100% 확보.
- **다시 만들기**: 생성에 성공하면 초안은 비워진다. 결과 화면의 `이 조건으로 다시 만들기`는 일정에 저장된 입력값을 되살려 `/plan`을 연다(수정 권한이 있는 일정만). 저장하지 않은 결과(`/view`)에서 화면의 `뒤로` 버튼을 누르면 확인 창을 띄우고, 나가면 입력값을 되살린다. 브라우저·기기의 뒤로 가기에는 이 확인이 없고 입력값도 되살리지 않는다.
- **온보딩 모달은 없다**: `/plan` 진입 시 띄우던 튜토리얼 모달은 삭제했다.

### 4.5. 데이터 분석 추적 (Google Analytics 4)
- **맞춤 이벤트 로깅**: `trackEvent`(`src/utils/analytics.js`)가 `gtag`가 있을 때 이벤트를 보낸다. 이벤트는 11개다: `page_view`, `generate_itinerary_click`, `save_itinerary_click`, `share_kakao_click`, `navigate_map_click`(`map_service`: google·naver·kakao. 일정 카드와 `다음 목적지` 패널의 [길찾기]에서만 보낸다. 이동 카드의 구간 경로와 추천 Top 3 길찾기 링크는 기록하지 않는다), `home_recommendation_select`(`place_ids`: 추천 장소 ID), `public_course_copy`, `curated_course_copy`(`city`: 도시 ID), `departure_card_shown`(`state`: 출발 안내 상태. 카드가 보일 때만 보내고, 열려 있는 화면에서 일정·일차·상태가 바뀔 때만 다시 보낸다. 1분마다의 갱신으로는 다시 보내지 않지만 일정 화면을 다시 열면 다시 보낸다), `edit_mode_toggle`(편집을 켤 때만), `leg_focus_open`(`opened_from`: timeline·departure_card·map_stepper). 장소 이름과 일정 ID는 어떤 이벤트에도 싣지 않는다.
- **웹에서만 수집한다**: 웹 빌드는 `VITE_GA_MEASUREMENT_ID`가 있을 때만 `gtag.js`를 불러온다. iOS·Android 앱(Capacitor)은 분석을 수집하지 않는다고 신고했으므로 측정 ID가 있어도 불러오지 않는다. 스크립트가 차단되거나 오프라인이어도 앱은 그대로 동작한다.
- **측정 ID를 등록하기 전에는 수집하지 않는다**: 배포 빌드는 측정 ID를 GitHub 저장소 변수 `VITE_GA_MEASUREMENT_ID`에서 받는다. 이 변수를 등록하기 전에는 `gtag`가 만들어지지 않아 페이지 뷰와 이벤트 모두 아무것도 보내지 않는다. 변수가 실제로 등록됐는지는 코드로 알 수 없으므로, 이 문서는 수집이 시작됐다고 적지 않는다.
- **주소는 가려서 보낸다**: 자동 페이지 뷰는 끄고 셸이 화면 이동마다 `page_view`를 직접 보낸다. 주소는 경로 모양만 남긴다(`/view/:id`, `/share/:id`처럼 ID를 가리고 쿼리 문자열과 해시는 버리며, 경로 표에 없는 주소는 `/not-found`). 이후 이벤트에도 실제 주소가 실리지 않게 `page_location`·`page_referrer`를 가린 값으로 덮어쓴다. 외부에서 들어온 경우 리퍼러는 출처(origin)만 남긴다.
- **등록 전 필수 설정**: 변수를 등록하기 전에 GA4 관리 > 데이터 스트림 > 향상된 측정에서 `브라우저 기록 이벤트 기반 페이지 변경`과 `이탈 클릭`(양식 상호작용, 사이트 검색 포함)을 꺼야 한다. 코드로는 끌 수 없고, 켜 두면 실제 주소와 장소 이름이 담긴 네이버·카카오 링크가 가림 없이 전송된다. 첫 배포 뒤 DebugView에서 ID와 장소 이름이 없는지 확인한다(`.github/workflows/checks.yml` 주석).
- **고지**: 개인정보처리방침(`public/privacy.html`, 2026-11-25 시행본)은 Google Analytics를 웹 브라우저에서만 수집하고 앱에서는 수집하지 않는다고 알린다. 수집 항목은 가린 화면 조회 경로와 화면 제목, 들어오기 직전 사이트의 도메인, 기능 사용 이벤트(홈 추천 장소 ID, 고른 도시, 지도 서비스 종류 등)이며 장소 이름과 일정·코스 ID는 보내지 않는다고 적는다. 이벤트에 새 값을 실으면 방침과 `test/privacy-policy.test.mjs`를 함께 고친다.

### 4.6. 모바일 웹앱 설치 (PWA) 지원
- Web App Manifest(`manifest.json`)와 Service Worker(`sw.js`) 연동을 통해 사용자가 앱을 홈 화면에 직접 설치(Add to Home Screen)할 수 있도록 지원합니다.
- 고정 테마 색상(theme-color, 흰색 #FFFFFF)과 규격화된 앱 아이콘(192x192, 512x512)을 적용하여 스마트폰 바탕화면에서도 이질감 없는 네이티브 앱 수준의 모바일 사용성을 확보했습니다.

### 4.7. 세련된 UI/UX 및 일정 결과 화면 고도화
- **일정 상단 요약**: 예상 비용 합계(`cost-summary`)를 일정표 위에 보여준다. 휴대폰 화면(899px 이하)에서는 다음 방문지 안내(`next-stop`)와 길찾기 버튼도 함께 보여준다. 총 장소·소요 시간·카테고리 태그를 모아 보여주던 요약 대시보드는 삭제했다.
- **여행 당일 출발 안내**: 일정을 수정할 수 있는 사용자(로그인한 소유자, 공유 링크 제외)가 여행 당일(여행지 현지 날짜) 일정을 열면 다음 확정 예약에 맞춘 권장 출발 시각을 카드로 보여준다. 출발 시각은 예약 시각에서 이동 시간과 여유 10분을 뺀 값이다. 이동 시간은 지도가 이미 잰 구간만 읽고 경로를 새로 요청하지 않는다. 상태는 여섯 가지다: 표시 안 함, 출발 시각 안내(`HH:MM 출발` · `○○에서 도보 18분 · 10분 전 도착`), `지금 출발하세요`(여유 N분), 늦음(`남은 일정 맞추기` 안내), `이동시간 확인 필요`, 남은 예약이 없을 때의 `다음 방문`. 지도가 잰 이동 수단을 알면 문구에 함께 적는다. 1분마다 갱신한다. 예약으로 가는 구간이 지도에 있으면 카드를 눌러 그 구간을 지도에서 연다. 휴대폰에서 `다음 목적지` 패널이 같은 예약을 가리키면 출발 안내를 그 패널에 합쳐 한 번만 보여준다.
- **읽기 모드와 편집 토글**: 일정 화면은 읽기 모드로 열린다. 수정 권한이 있는 사용자에게만 일정표 위에 `편집` 토글 하나를 보여주고, 켜야 편집 버튼이 나온다. 읽기 모드에서는 카드의 순서 이동·삭제·방문 시간 변경·장소 바꾸기·실내 대안 찾기 버튼, 일정 사이 추가 칸, 개인 메모 버튼, 시간 다시 계산·동선 개선·최근 변경 되돌리기를 숨긴다. 길찾기, 리뷰·공식 사이트 링크, 방문 완료, `남은 일정 맞추기`는 그대로 둔다. 안내가 가리키는 버튼은 예외로 남긴다: 비 예보 배너가 뜨면 방문 전 카드의 `실내 대안 찾기`가, 방문을 자동으로 뺐다는 안내가 뜨면 되돌리기가 읽기 모드에서도 보인다. 편집 상태는 그 일정에서만 유지되고 다른 일정을 열거나 새로 고치면 읽기 모드로 돌아간다. 저장한 개인 메모 글과 예약 링크는 읽기 모드에서도 카드에 보인다.
- **이동 수단 시각화**: 이동 수단을 아이콘과 라벨이 있는 무채색 칩으로 보여준다. 수단별 색은 쓰지 않는다(색은 지도 마커 규칙에만 쓴다).
- **지능형 실용 정보(Quick Info) 고도화**:
  - **데이터 구조화**: AI가 예상 비용, 운영 시간, 현지 팁을 개별 필드로 생성하도록 스키마 고도화.
  - **접힌 상세 정보**: 예상 비용, 영업시간, 현지 팁, 추천 Top 3는 카드의 `상세 정보`를 펼쳐야 보인다. 값이 없는 줄은 그리지 않는다.
  - **하위 호환성**: 신규/기존 데이터 포맷에 관계없이 안정적인 렌더링을 보장하는 Fallback 로직 구축.
- **플랫 & 무채색 디자인 시스템 (`--cp-*`)**: UI는 무채색 기반의 정갈한 타이포그래피와 1px 실선(`--cp-rule`), 기본 8px(`--cp-radius`) 테두리 반경을 적용하고 뱃지·칩만 알약 모양(`--cp-pill`)으로 두며, 그림자(`box-shadow: none`)와 그라디언트를 전면 배제합니다. 색상은 지도 마커 규칙(Anchor 보라, 시작 초록, 일반 파랑), 경고·오류 상태색, 로그인 버튼의 브랜드색에만 씁니다. 보라(`--cp-anchor`)는 시간이 고정된 예약을 뜻하며 항상 글자와 함께 씁니다: 일정 카드의 `확정` 배지(보라 글자와 테두리, 시간을 맡긴 꼭 갈 장소에는 없음), 여행 당일 출발 안내의 테두리와 첫 줄. 버튼은 translateY 들뜸 효과 대신 잉크 반전(`--cp-ink` 배경 / `--cp-surface` 텍스트)을 쓰고, 이렇게 채운 주 버튼은 화면마다 하나만 둡니다(홈은 평소 `일정 만들기`, 여행 당일에는 다가오는 여행 카드의 `오늘 일정 열기`, 일정 화면은 저장할 것이 있으면 저장). 나머지는 테두리 버튼이며, 이 규칙은 계약 테스트(`test/primary-button-contract.test.mjs`)가 지킵니다.
- **안정적인 일정 이미지 내보내기 (Troubleshooting)**: `html2canvas`가 최신 CSS 색상 함수(예: `oklch`, `color-mix`, `color(display-p3)`)를 읽지 못해 이미지 내보내기가 실패하던 문제가 있었다. 디자인 토큰을 hex로 통일했고(스크림 `--cp-scrim`만 예외), 화면을 그대로 찍는 대신 일정 데이터로 탑승권 모양의 티켓을 화면 밖에 따로 그려 캡처한다. 캡처용 복제 문서는 항상 밝은 테마로 고정하고 임시 요소는 캡처 직후 지운다. 만든 PNG는 기기의 공유 시트로 넘기고, 공유를 지원하지 않으면 파일로 내려받는다.

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

### 4.10. 2026년 10~11월에 추가된 기능 (요약, 11월 24일 작업 포함)
위 절들이 다루지 않는 기능이다. 절 번호가 붙은 항목은 그 절에 설명이 있다. 작업별 기록은 `blueprint.md`에 있다.
- 나라 → 도시 선택과 홈 지구본, 도시별 기본 추천 장소
- 홈의 지원 도시 검색과 도시 변경 확인 창(4.4)
- AI 장소 추천(`recommendPlaces`)과 관심사 선택
- 공개 코스 둘러보기, 후기, 신고, 작성자 차단
- 홈의 다가오는 여행 카드: 로그인한 사용자에게 가장 가까운 저장 일정 하나를 보여준다(`다가오는 여행 · D-n`, 당일 `D-day`, 여행 중 `여행 중 · n일차`). 버튼은 평소 `보기`이고, 여행 당일과 여행 중에는 `오늘 일정 열기`로 바뀌어 홈의 주 버튼이 된다. 이때 `일정 만들기`는 테두리 버튼으로 바뀐다. 오프라인에서는 저장해 둔 사본을 연다
- 여행 중 방문 완료 체크와 개인 메모. 저장한 메모 글과 예약 링크는 일정 카드에 바로 보이고, 메모 작성 버튼은 편집 모드에서 나온다
- 여행 당일 비 예보 배너와 실내 대안 찾기
- 남은 일정 맞추기(당일 재계획), 방문 시간 변경, 장소 바꾸기(뒤의 둘은 편집 모드에서 보인다)
- 오프라인 열람
- 캘린더 내보내기, 일정 이미지 내보내기, 다른 날짜로 복제
- 일일 생성 크레딧
- 숙소와 항공편 입력, 동행 선호
- 여행 당일 출발 안내(4.7), 일정 화면의 읽기 모드와 `편집` 토글(4.7)
- 지도 구간 보기와 `지도에서 보기`(4.3), 한국 밖 일정의 Google Maps 길찾기(4.3)
- 상세 설정의 `예약한 일정 추가하기`(4.1)
- 웹 전용 분석과 가린 페이지 경로(4.5)

## 5. Security & Access Control (보안 및 접근 제어)

### 5.1. 보안 강화 및 Route Guard
- **비정상 접근 차단**: 로그인 없이 열리는 경로는 홈, `/destination`, `/recommend`, `/courses`, `/login`, `/join`, `/verify`, `/share/:id`, `/account-deletion-status`다. 예전 공유 주소인 `/view/:id`도 비로그인으로 열리며, 이때는 공개 공유본만 조회한다. 그 밖의 경로(`/preference`, `/plan`, ID 없는 `/view`, `/profile`)에 비로그인 사용자가 들어오면 `/login`으로 보낸다. ID 형식이 맞지 않는 `/view/…`·`/share/…` 주소는 로그인 화면이 아니라 `찾을 수 없음` 화면을 보여준다(`src/app/route-decision.mjs`).
- **로그인 뒤 복귀**: `/login`으로 보낼 때 가려던 주소를 `next`에 담아 두고, 로그인하면 그 주소로 돌려보낸다. 돌아갈 수 있는 주소는 허용 목록(`getSafeReturnPath`)에 있는 내부 화면뿐이다. 로그인한 사용자가 `/login`·`/join`에 들어오면 `next`가 없을 때 `/plan`(선호 설정을 마친 경우) 또는 `/preference/1`로 보낸다.
- **인증 확정 전 대기**: 로그인 여부가 확정되기 전에는 보호 경로를 `/login`으로 보내지 않고 기다린다. 공개 경로는 인증 응답과 관계없이 바로 그린다.
- **계정 탈퇴 안전장치**: 탈퇴는 확인 창 → 최근 로그인 확인(로그인 후 60초 이내) → 서버 접수 순서로 진행한다. 최근 로그인이 아니면 삭제를 시작하지 않고 로그아웃시킨 뒤 로그인 화면으로 보내며, 로그인하면 보안 탭(`/profile/security`)으로 돌아온다. 삭제는 서버(`functions/account-deletion.js`)가 단계별로 수행하고, 클라이언트는 접수증으로 진행 상태를 조회한다. 삭제가 접수된 뒤에는 서버가 완료를 알려야 로그아웃한다. 다시 로그인한 뒤 탈퇴가 자동으로 이어지지 않으며 사용자가 다시 확인해야 한다.
- **계정 탈퇴 안전장치(서버 측)**: 60초 기준은 서버도 토큰의 `auth_time`으로 다시 확인한다. 탈퇴가 접수된 계정은 Firestore 규칙(`canWriteAccountData`)이 생성과 수정을 막고(자기 문서 삭제는 막지 않는다), 완료된 뒤에는 그 이후에 새로 로그인한 세션만 다시 쓸 수 있다.

### 5.2. 환경 변수(.env) 기반 설정 관리
- **설정값 분리**: 프론트엔드 설정(`VITE_` 접두사: Firebase 설정값, Google Maps API 키, GA4 측정 ID, 카카오·네이버 키)은 코드에 하드코딩하지 않고 환경 변수로 주입한다. 이 값들은 브라우저 번들에 포함되어 공개되는 것을 전제로 하며, 비밀이 아니다. 로컬에서는 `.env`(`.gitignore`로 제외)를, 운영 배포에서는 GitHub Actions의 secrets(Maps·Firebase)와 저장소 변수(`VITE_GA_MEASUREMENT_ID`)를 쓴다. 번들에 들어가지 않는 서버 전용 키(`GEMINI_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`)는 Secret Manager에 두고 Cloud Functions에서만 읽는다.
- **템플릿 공유**: `.env.example`에 프론트엔드 변수(`VITE_MAPS_API_KEY`, `VITE_FIREBASE_*` 6개, `VITE_GA_MEASUREMENT_ID`, `VITE_KAKAO_APP_KEY`, `VITE_NAVER_CLIENT_ID`, `VITE_PUBLIC_APP_URL`)와 서버 전용 `GEMINI_API_KEY`를 적어 둔다. 측정 ID가 비어 있으면 분석을 시작하지 않는다. 알려진 차이: 서버가 쓰는 `GOOGLE_MAPS_SERVER_KEY`와 `SEOUL_OPEN_API_KEY`는 예시 파일에 없고, 배포 워크플로의 빌드 단계는 카카오·네이버 키와 `VITE_PUBLIC_APP_URL`을 주입하지 않는다.
- **테스트 격리**: 브라우저 테스트 서버(`scripts/test-browser-server.mjs`)는 `VITE_` 환경 변수를 모두 지우고 고정된 테스트 값만 넣으며 `.env` 파일이 없는 폴더를 읽는다. 개발자나 운영의 `.env` 값이 테스트에 섞이지 않고, 측정 ID가 없으므로 테스트 중에는 분석 요청이 나가지 않는다.

### 5.3. 통합 인증 및 이메일 보안 시스템
- **통합 인증 에러 핸들링**: Firebase 에러 코드(`auth/invalid-credential`, `auth/user-not-found`, `auth/wrong-password`, `auth/too-many-requests`)와 이메일 미인증 상태를 화면 언어(한국어·영어)에 맞는 토스트 문구로 바꿔 보여준다. 그 밖의 오류는 로그인 화면의 오류 문구 자리에 표시한다.
- **상태 초기화 보장**: 로그아웃하면 작성 중인 초안, 오프라인 저장 일정, 선호 설정, 일정 목록 캐시를 이 기기에서 지운다. 탈퇴는 서버가 완료를 알린 뒤 같은 로그아웃을 거친다. 예외는 이메일 인증을 마치지 않은 가입 직후의 자동 로그아웃이다. 이때는 비로그인 상태에서 고른 장소와 초안을 남긴다.
- **소셜 로그인**: 웹은 구글(팝업), 카카오, 네이버 로그인을 제공한다. 카카오·네이버는 서버(`verifySocialToken`)가 토큰을 확인한다. 네이티브 앱은 구글만 제공하며 기기의 계정 선택창으로 로그인한다(`available-logins.mjs`). 네이티브 앱은 로그아웃하면 기기의 구글 계정 선택도 풀어, 다음 로그인 때 계정을 다시 고르게 한다.
- **인앱 브라우저 방어**: 카카오톡·라인·인스타그램·페이스북 등 인앱 브라우저에서는 로그인 화면 위에 외부 브라우저 안내 배너를 띄운다. 로그인 버튼을 누르면 안드로이드는 Chrome Intent로 외부 브라우저를 열고, iOS는 다른 브라우저로 여는 방법을 토스트로 안내한다(`src/utils/browser-utils.js`).
- **이메일 인증 필수**: 이메일로 가입하면 인증 메일을 보내고 바로 로그아웃한다. 인증을 마치기 전에는 로그인할 수 없고, Firestore 생성·수정과 일정 생성도 서버에서 거부한다(구글·카카오·네이버 로그인은 해당 없음).
- **비밀번호 재설정**: 로그인 화면에서 재설정 메일을 보낸다. 계정이 있든 없든 같은 안내를 보여 가입 여부를 드러내지 않는다. 인증 링크와 재설정 링크는 모두 `/verify` 화면에서 처리한다.

### 5.4. 데이터베이스 보안 규칙 (Firestore Security Rules)
- **공유용 데이터 (`shared_itineraries`)**: 링크를 아는 누구나 문서 하나를 조회(`get`)할 수 있다. 목록 조회는 안 된다. 새 공유본은 원본 개인 일정이 소유자에게 남아 있는 동안만 읽힌다. `sourceId`가 없는 예전 공유본은 원본과 관계없이 계속 읽힌다. 공유본은 원본 소유자만 만들 수 있고 만든 뒤에는 고치거나 지울 수 없다. 원본이 지워지면 내용이 없는 `shared_itinerary_status` 문서만 읽혀, 화면이 삭제된 일정과 네트워크 오류를 구분한다.
- **개인 보관용 데이터 (`itineraries`)**: 읽기와 삭제는 `request.auth != null && resource.data.userId == request.auth.uid`인 소유자만 할 수 있다. 생성은 `userId`, `itineraryPlan`, `title`(없거나 1~100자), `createdAt`(서버 시각)만 받는다. 수정은 소유자가 이름(`title`), 일정 내용(`itineraryPlan`), 개인 메모(`stopNotes`, 최대 200개)만 바꿀 수 있고 소유자와 저장 시각은 바꿀 수 없다. 개인 메모는 이 문서에만 저장되며 공유본에는 들어가지 않는다.
- **그 밖의 컬렉션**: `users`는 본인만 읽고 `birthday`만 쓸 수 있다. `public_courses`는 누구나 읽고, 자기 일정에서 만든 코스(장소 2~6곳)만 소유자가 쓰고 지운다. `course_reviews`는 공개 중인 코스의 후기만 공개되며 코스 작성자는 자기 코스에 후기를 쓸 수 없다. `content_reports`(신고)는 로그인 사용자가 만들기만 할 수 있다. `account_deletions`와 `discovery_saves`는 본인만 읽고, `discovery_popularity`는 누구나 읽으며 셋 다 서버만 쓴다.
- **공통 쓰기 조건**: 클라이언트의 생성·수정은 모두 `canWriteAccountData`를 통과해야 한다. 이메일 로그인은 인증을 마쳐야 하고, 탈퇴가 진행 중인 계정은 만들거나 고칠 수 없다. 삭제(개인 일정, 공개 코스, 후기)는 이 조건 없이 소유자 확인만 한다. 규칙에 없는 경로는 읽기·쓰기 모두 막는다.

## 6. Technical Stack
- **Frontend Core**: Vite 5, React 19 + Ionic 9 shell (React Router 6), Web Components (ES Modules) for domain UIs
- **Mobile & App Shell**: Ionic React Shell (`ionic-shell.jsx`, `ionic-screens.jsx`), Capacitor 8 (iOS/Android), 네이티브 구글 로그인은 `@capacitor-firebase/authentication`
- **주요 라이브러리**: `@googlemaps/js-api-loader`, `html2canvas-pro`(일정 이미지 내보내기), `d3-geo`·`topojson-client`(홈 지구본), `qrcode-generator`
- **품질 도구**: Oxlint, Node 내장 테스트 러너, Playwright, Firebase 에뮬레이터
- **Design System**: `--cp-*` CSS 토큰 (순수 hex 기반, `oklch`/`color-mix` 금지, 화면 스타일의 `rgba` 금지(스크림 토큰 `--cp-scrim`만 예외), 1px 실선, 8px radius와 알약 예외, 0 shadow, 0 gradient). 채운 주 버튼은 화면마다 하나만 두고, 보라색은 시간이 고정된 예약(`확정` 배지, 출발 안내)에만 글자와 함께 쓴다.
- **APIs**: Google Maps JS API(maps, marker, routes, places), Google Places API(New), Google Weather API, Google Gemini API, 서울 열린데이터 실시간 인구(혼잡도) API, 카카오·네이버 로그인 API
- **네비게이션 링크**: 한국 일정은 네이버 지도 / 카카오맵 검색 주소, 한국 밖 일정과 구간 경로 확인은 Google Maps 경로 주소(`/maps/dir/?api=1`). 모두 https 링크이며 앱 전용 URL 스킴은 쓰지 않는다.
- **Backend/Auth**: Firebase Auth, Firebase Firestore, Cloud Functions(Node.js 24, `firebase-functions` 7). Gemini 키와 서버용 Maps 키는 Secret Manager에만 두고 함수에서만 읽는다.
- **Analytics**: Google Analytics 4(gtag) 코드는 웹 빌드에만 들어 있다. Capacitor 앱은 스크립트를 불러오지 않고, 저장소 변수 `VITE_GA_MEASUREMENT_ID`를 등록하기 전에는 아무것도 수집하지 않는다(4.5).
- **Hosting**: Cloudflare Pages (`main` push 시 CI가 배포), Cloud Functions는 별도 배포
