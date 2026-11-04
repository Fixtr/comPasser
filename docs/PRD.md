# Product Requirements Document (PRD)

> 📌 **ComPasser 제품 요구사항 정의서** · 상단의 영문 섹션은 AI 하네스 및 스코프 크리프 방지용 가드레일이며, 하단은 상세 기능 기획(한국어)입니다.

---

## 1. Scope & Guardrails (MVP Non-Goals)

### 1.1. Project Overview
- **Project:** ComPasser (컴패서)
- **Target User:** Anyone traveling in South Korea (locals and foreigners).
- **Core Value Proposition:** Fill empty time slots around fixed schedules ('Anchor Events') with optimal travel routes.

### 1.2. Scope (MVP)
- **Included:** 
  - Google Auth & Email Auth via Firebase.
  - Anchor-based itinerary generation using Gemini 2.5 Flash Lite.
  - Exact preservation of user-selected departure, destination, day boundary times, and Anchor schedules through deterministic validation.
  - Hybrid Map Strategy (Google Maps as Viewer, Local Deep Linking (Naver/Kakao) for Navigation).
  - Multi-language (i18n) support (ko/en).
  - User Preference Flow (Theme, Budget).
  - PWA & Capacitor support for native mobile apps (iOS/Android).
  - Serverless architecture leveraging Firebase (Firestore/Auth).
  - Single app shell: the Ionic React shell (`ionic-shell.html` + `src/prototype/ionic-shell.jsx`) is the entry for web, PWA and Capacitor; domain UIs are Web Components mounted inside it.

### 1.3. 🚫 Non-Goals (Strictly Excluded to prevent Scope Creep)
- **NO Custom Payment Infrastructure:** Absolutely no PG integrations beyond simple affiliate redirect linking.
- **NO Social Network Features:** No user-to-user following, social feeds, or in-app messaging.
- **NO Heavy Full-Stack Frameworks:** Avoid heavy SSR frameworks (e.g., Next.js). A lightweight client-side Ionic React shell hosts the Web Components domain UIs.
- **NO Real-time Collaborative Editing:** Itinerary sharing is read-only for guests.
- **NO Server-side Rendering (SSR) framework:** The app UI stays Client-Side Rendered (CSR) + Firebase. Only the public English route pages (`/en/routes`, `sitemap.xml`, `robots.txt`) are rendered by a small Cloudflare Pages Worker (`src/server/public-routes-worker.mjs`) from public Firestore data. The same Worker only rewrites the app shell's preview tags for `/share/<id>` (catalogue city and day count).

---

## 2. Product Overview (제품 상세 개요)
**제품명**: ComPasser (컴패서)  
**한 줄 소개**: "한국을 여행하는 사람들을 위한 AI 기반 다국어 로컬 동선 최적화 플래너"

ComPasser는 복잡하고 피곤한 여행 동선 설계와 시간 계산을 AI 기술과 정교한 지도 시스템으로 해결해 주는 지능형 웹 애플리케이션입니다. 사용자의 '필수 방문지(Anchor)'를 중심으로 빈 시간을 계산하여 최적화된 동선과 장소를 추천합니다.

## 3. Target Audience (타겟 고객)
- **한국을 여행하는 모든 사람 (내/외국인 모두 포함)** 
  - **외국인 관광객**: 다국어 UI와 구글맵 기반 시각화로 낯선 한국 도시에서도 직관적 동선 파악 가능
  - **내국인 여행객**: 네이버 지도 / 카카오맵 딥링크로 익숙한 로컬 네비게이션 앱에서 바로 길찾기 실행 가능
- 특정 공연, 페스티벌, 스포츠 경기 등 반드시 참석해야 하는 일정이 있는 여행객
- 효율적인 동선 구성에 어려움을 겪거나 시간을 절약하고 싶은 여행객

## 4. Core Features (핵심 기능 요구사항)

### 4.1. 멀티 데이 AI 동선 최적화 (Multi-day Optimization)
- **최대 3박 4일 확장**: 기존 당일치기 일정 생성을 넘어, 최대 3박 4일(4일)까지의 연속된 여행 일정을 한 번에 생성할 수 있습니다.
- **일자별 개별 시간 설정**: 전체 일정에 대한 전역 시간뿐만 아니라 `[일자별로 시간 다르게 설정하기]` 토글을 통해 Day 1부터 Day N까지의 시작/종료 시간을 개별적으로 커스텀할 수 있습니다.
- **앵커 일정 (Opt-in UX)**: 불필요한 마찰을 줄이기 위해 기본 입력 폼에서는 숨겨져 있으며, 사용자가 원할 때만 `[+ 필수 방문 일정 추가하기]`를 통해 추가할 수 있습니다.
- **멀티 데이 앵커 타겟팅**: 다일차 여행일 경우 필수 일정이 몇 일차(Day N) 일정인지 지정할 수 있어 AI가 정확한 날짜에 일정을 배치합니다.
- **날짜별 탭 UI**: 생성된 멀티 데이 일정은 타임라인 상단의 날짜 탭(Day 1, Day 2...)을 통해 간편하게 전환하며 확인할 수 있습니다.
- **경로 경계 무결성**: 각 Day의 첫 일정은 사용자가 입력한 출발 장소/시작 시간과 일치하고, 마지막 일정은 도착 장소/종료 시간과 일치해야 합니다. AI가 이를 누락하거나 변경하더라도 후처리 계층에서 원래 입력값으로 보정합니다.
- **Anchor 무결성**: 필수 일정의 일차, 시작/종료 시간 및 장소는 추천 일정 생성 결과보다 우선하며 임의 변경할 수 없습니다.

### 4.2. 글로벌 다국어(i18n) 시스템
- 한국어(ko)와 영어(en)를 지원하며, 언어 토글 시 페이지 새로고침이나 DOM 및 이벤트 리스너 파괴 없이 즉각적으로 UI 텍스트와 AI 프롬프트가 동적으로 변경됩니다.

### 4.3. 하이브리드 지도 연동 전략 (Hybrid Map Strategy)
지도의 역할을 **뷰어(Viewer)**와 **네비게이터(Navigator)**로 철저히 분리합니다.
- **뷰어 (Google Maps)**: 전체 동선을 다국어로 한눈에 보여주는 시각적 현황판. 장소 카드의 **[📍 리뷰 보기]** 버튼과 연동하여 상세 정보 아카이브 역할 수행.
- **네비게이터 (한국 최적화 딥링크)**: 일정 카드의 **[🗺️ 길찾기]** 버튼을 통해 유저 스마트폰의 **네이버 지도 / 카카오맵**을 직접 실행. (버튼 위치 기반 Fixed Positioning 팝업 UI로 접근성 최적화 완료)
- **UI 사용성 제한**: 장소 검색(Autocomplete)을 대한민국(KR)으로 엄격하게 제한하여 사용자 혼란을 방지하고 정확도를 높였습니다.
- **초기화(Reset)**: 폼 입력 전체를 즉시 비우고 처음부터 다시 단계를 밟을 수 있는 강력한 리셋 버튼을 제공합니다.

### 4.4. 8-Page Architecture (SPA & Dynamic Routing)
- `#page-home` (랜딩), `#page-login` (로그인), `#page-join` (회원가입), `#page-plan` (계획 설계), `#page-view` (결과), `#page-verify` (이메일 인증), `#page-profile` (마이페이지 & 중첩 탭), `#page-preference` (취향/기간 선택 스텝)의 화면으로 분리된 바닐라 JS 라우팅을 지원합니다.
- **2단계 위저드(Wizard) UI**: 
  - `/preference/1` (날짜/기간) -> `/preference/2` (테마/예산) 단계별 구조로 고도화.
  - **상태 유지**: `sessionStorage`를 활용하여 단계 이동 및 브라우저 '뒤로 가기' 시에도 기존 입력값이 증발하지 않도록 복구 로직을 적용했습니다.
  - **네비게이션 가드**: Step 1 정보가 없는 상태에서 URL로 Step 2에 직접 접근 시 자동으로 Step 1로 리다이렉트하는 보안 로직을 구현했습니다.
  - **진행 인디케이터**: 상단에 Step 1/2 표시와 실시간 프로그레스 바를 배치하여 직관적인 피드백을 제공합니다.
- **중첩 라우팅(/profile/:tab)**: 마이페이지 내부에 `/personal`, `/trips`, `/security` 서브 경로를 도입하여 각 탭의 상태를 URL과 동기화했습니다.
- **동적 파라미터 라우팅 (/view/:id)**: 정규식을 통해 고유 ID를 파싱하고 브라우저 새로고침 시에도 Firestore에서 일정을 즉시 복원하는 아키텍처를 구현했습니다.
- **Deep Linking**: 고유 URL을 통해 본인 혹은 타인의(권한 허용 시) 일정을 외부에서 즉시 접근할 수 있도록 동선을 고도화했습니다.
- **마이페이지 통합 관리**: 전용 `/profile` 경로 및 중첩 라우팅을 통해 개인정보, 여정 히스토리, 계정 보안을 한곳에서 관리할 수 있는 Google 스타일의 2-Column 레이아웃을 제공합니다.
  - **URL 동기화**: 탭 전환 시 History API를 통해 URL이 즉시 업데이트되어 브라우저 뒤로 가기 및 딥 링크(Deep Link)를 완벽히 지원합니다.
  - **Firestore 개인정보 연동 (Phase 1)**: `users/{uid}` 구조를 통해 휴대전화, 생년월일 등 확장된 프로필 데이터를 저장 및 동기화합니다.
  - **실제 서비스 수준의 본인인증 (PortOne/KG이니시스)**: 포트원 V1 SDK와 KG이니시스 채널을 연동하여 실제 한국 웹 서비스 표준인 '본인인증(PASS/통신사)' 흐름을 구현했습니다.
    - **절차**: [📱 본인인증] 버튼 클릭 -> PG 통합인증 팝업 -> 성공 시 번호 입력 인라인 폼 -> Firestore 저장(`phoneNumber`, `isVerified: true`).
    - **시각적 피드백**: 인증 완료 시 리스트 옆에 **(인증완료 ✅)** 뱃지를 표시합니다.
  - **인라인 수정 UI**: `window.prompt`를 배제하고, 리스트 항목 내에서 즉각적으로 변화하는 인라인 에디팅 폼을 적용했습니다.
  - **안정성 강화**: 
    - 신규 유저가 초기 데이터 없이 프로필에 진입할 때 발생하던 무한 로딩 이슈를 방지하는 Fallback 로직을 탑재했습니다.
    - **마이페이지 네비게이션 충돌 해결**: 마이페이지의 '내 여행 일정' 리스트에서 일정을 조회할 때, 더 이상 사용하지 않는 레거시 온보딩 모달("나만의 스마트한 여행 일정 만들기")이 렌더링되어 이벤트 버블링 및 비정상적인 라우팅(/plan 강제 이동)을 유발하던 문제 해결. 해당 레거시 코드를 전면 삭제하여 뷰어(/view/:id)로의 진입 안정성 100% 확보.
- **상태 유지 기능(Seamless Editor)**: View 화면에서 Plan 화면으로 되돌아가도 기존에 입력한 폼 데이터가 날아가지 않으며, 지속적인 수정과 재생성이 가능합니다.
- **온보딩 모달**: `/plan` 페이지 최초 진입 시 유저에게 서비스 이용법을 안내하는 튜토리얼 모달을 제공하며, `localStorage`를 통해 중복 노출을 방지합니다.

### 4.5. 데이터 분석 추적 (Google Analytics 4)
- **맞춤 이벤트 로깅**: 핵심 사용자 액션(AI 일정 생성, 일정 저장, 카카오톡 공유, 언어 전환 등) 발생 시 `trackEvent` 커스텀 유틸리티를 통해 사용자 인터랙션을 세밀하게 수집합니다.
- **가상 페이지 뷰**: History API 기반의 SPA 네비게이션 시 전환되는 가상 페이지 뷰(Virtual Page View)를 추적합니다.

### 4.6. 모바일 웹앱 설치 (PWA) 지원
- Web App Manifest(`manifest.json`)와 Service Worker(`sw.js`) 연동을 통해 사용자가 앱을 홈 화면에 직접 설치(Add to Home Screen)할 수 있도록 지원합니다.
- 동적 테마 색상(theme-color)과 규격화된 앱 아이콘(192x192, 512x512)을 적용하여 스마트폰 바탕화면에서도 이질감 없는 네이티브 앱 수준의 모바일 사용성을 확보했습니다.

### 4.7. 세련된 UI/UX 및 일정 결과 화면 고도화
- **일정 요약 대시보드**: 총 장소, 소요 시간, 카테고리 태그 요약을 제공하여 여행 전체 흐름을 3초 안에 파악 가능하게 함.
- **이동 수단 시각화**: 텍스트 위주의 정보를 아이콘 기반의 컬러 뱃지 UI로 전환하여 모바일 가독성 확보.
- **지능형 실용 정보(Quick Info) 고도화**:
  - **데이터 구조화**: AI가 예상 비용, 운영 시간, 현지 팁을 개별 필드로 생성하도록 스키마 고도화.
  - **3단 레이아웃**: 💰, 🕐, 💡 아이콘을 활용한 멀티라인 UI를 통해 여행자에게 필요한 핵심 정보를 즉각적으로 제공.
  - **하위 호환성**: 신규/기존 데이터 포맷에 관계없이 안정적인 렌더링을 보장하는 Fallback 로직 구축.
- **플랫 & 무채색 디자인 시스템 (`--cp-*`)**: UI는 무채색 기반의 정갈한 타이포그래피와 1px 실선(`--cp-rule`), 0px(또는 9999px 알약) 테두리 반경을 적용하며, 그림자(`box-shadow: none`)와 그라디언트를 전면 배제합니다. 색상은 지도 마커 규칙(Anchor 보라, 시작 초록, 일반 파랑) 및 필수 상태 뱃지에만 제한적으로 사용하여 야외 시인성과 저사양 렌더 성능을 극대화합니다. 버튼 등 인터랙션은 translateY 들뜸 효과 대신 잉크 반전(`--cp-ink` 배경 / `--cp-surface` 텍스트)을 적용합니다.
- **안정적인 일정 이미지 내보내기 (Troubleshooting)**: `html2canvas` 라이브러리를 활용한 DOM 캡처 중, 최신 CSS 색상 함수(예: `oklch`, `color-mix`, `color(display-p3)`)를 파싱하지 못해 이미지 다운로드가 실패하는 렌더링 엔진 호환성 문제 발생. 이를 해결하기 위해 모든 디자인 토큰을 순수 hex로 통일하고, 캡처에 불필요한 UI 요소(버튼 등)를 `ignoreElements` 콜백과 임시 스타일 변환(Cleanup 로직 포함)을 통해 필터링하여 안정적인 이미지 내보내기 기능 복구 완료.

### 4.8. 로딩 대기 시간 활용 제휴 광고 배너 캐러셀 (Ad Banner Carousel)
- AI 일정 생성 대기 중 한국 여행 외국인 관광객 타겟의 가상 제휴 광고 배너를 3.5초 간격으로 자동 슬라이드합니다.
- **아키텍처 최적화 (관심사 분리)**: 메인 렌더링 로직에서 광고 데이터를 분리하여 `/src/config/ads.js`에서 관리합니다. 이를 통해 UI 업데이트 없이도 배너 속성 및 제휴 링크를 손쉽게 수정할 수 있는 확장성을 확보했습니다.
- `opacity`/`translateY` 기반 fade-in/out 애니메이션과 인디케이터 도트를 제공하며, 로딩 종료 시 `clearInterval`로 메모리 누수를 방지합니다.

### 💰 4.9. 제휴 마케팅 및 수익화 모델 (Monetization Pipeline)
- AI 대기 시간(평균 5~10초)을 활용한 로컬 서비스 CPS 수익 모델을 정식 도입했습니다.
- **4대 핵심 카테고리 연동**:
  - 통신: Airalo eSIM (심사 중)
  - 교통: Trip.com KTX/AREX (실결제 연동)
  - 액티비티: 마이리얼트립 롯데월드 (실결제 연동)
  - 투어: Klook 한복 대여 (심사 중)
- **개발 관리 유연성**: `src/config/ads.js` 파일을 통해 마케팅 성과에 따른 배너 실시간 교체가 가능한 구조입니다.

### 4.10. 모바일 앱 패키징 (iOS/Android Support)
- Capacitor를 활용하여 동일한 웹 소스 코드를 iOS 및 Android 네이티브 앱으로 패키징했습니다.
- **모바일 UX 최적화**: 
  - `viewport-fit=cover` 설정을 통한 노치 디자인 대응.
  - 전역 CSS에 `safe-area-inset` 여백을 적용하여 상단바 및 하단 바 간섭 방지.
  - 앱 전용 라우팅 보완: 초기 경로가 `/index.html`로 시작하는 앱 환경에서도 홈 화면이 즉시 렌더링되도록 개선.
- **네이티브 성능**: Vite의 `base: './'` 빌드 설정을 통해 로컬 자산 경로 이슈를 해결하고 빠른 로딩 속도를 유지합니다.

## 5. Security & Access Control (보안 및 접근 제어)

### 5.1. 보안 강화 및 Route Guard
- **비정상 접근 차단**: 비로그인 사용자가 `/plan`, `/view`, `/profile` 등 인증이 필요한 경로에 직접 접근을 시도할 경우, 자동으로 홈/로그인 화면으로 리다이렉트하는 Route Guard가 적용되어 있습니다.
- **계정 탈퇴 안전장치**: 회원 탈퇴 시 즉시 삭제되지 않고, 커스텀 확인 모달을 통해 최종 승인을 거치는 2단계 보안 프로세스를 구현했습니다.

### 5.2. 환경 변수(.env) 기반 설정 관리
- **민감 정보 분리**: GA4 측정 ID(`VITE_GA_MEASUREMENT_ID`), Firebase 설정값, Google Maps API 키 등을 코드베이스에서 하드코딩하지 않고 `.env` 환경 변수로 분리 관리하여 Git 유출을 원천 차단합니다. (`.gitignore` 적용)
- **템플릿 공유**: 협업을 위한 `.env.example` 파일을 별도로 구성하여 안전한 환경 설정을 지원합니다.

### 5.3. 통합 인증 및 이메일 보안 시스템
- **통합 인증 에러 핸들링**: Firebase의 최신 에러 코드를 분석하여 유저가 이해하기 쉬운 한국어 알림창으로 변환 제공합니다. (invalid-credential 등 대응)
- **상태 초기화 보장**: 로그아웃 및 회원 탈퇴 시, 브라우저에 남은 폼 데이터와 튜토리얼 확인 내역을 즉각 삭제하여 보안 개인정보를 보호하고 다음 사용자의 세션 꼬임을 방지합니다.
- **소셜 인증 최적화**: 구글 로그인 시 이전 인증 정보를 활용한 자동 로그인(원클릭) 흐름을 원복하여 사용 편의성을 높였으며, 로그아웃 후 버튼 비활성화 버그를 수정했습니다.
- **실제 본인인증 테스트 환경 지원**: 다날(Danal) 대신 테스트 모드를 완벽하게 지원하는 **KG이니시스 통합인증(inicis_unified)** 채널을 연동하여 실제와 동일한 인증 팝업 흐름을 구현했습니다.
- **인앱 브라우저 방어**: 카카오톡 등 인앱 환경에서 Google 로그인 403 에러를 방지하기 위해 안드로이드(Intent) 및 iOS(안내 모달)별 맞춤 대응 로직이 적용되어 있습니다.

### 5.4. 데이터베이스 보안 규칙 (Firestore Security Rules)
- **공유용 데이터 (`shared_itineraries`)**: 카카오톡 등으로 공유된 링크를 타고 접속한 누구든 읽기 권한을 가지도록 `read: if true` 적용.
- **개인 보관용 데이터 (`itineraries`)**: 사용자가 개인 계정에 직접 보관한 일정은 철저하게 `read, write: if request.auth != null && request.auth.uid == resource.data.userId` 규칙으로 보호.

## 6. Technical Stack
- **Frontend Core**: Vite, React 19 + Ionic 9 shell, Web Components (ES Modules) for domain UIs
- **Mobile & App Shell**: Ionic React Shell (`ionic-shell.jsx`, `ionic-screens.jsx`), Capacitor (iOS/Android)
- **Design System**: `--cp-*` CSS 토큰 (순수 hex 기반, `oklch`/`color-mix`/`rgba` 금지, 1px 실선, 0/9999px radius, 0 shadow, 0 gradient)
- **APIs**: Google Maps JS API, Google Gemini API
- **네비게이션 딥링크**: 네이버 지도 / 카카오맵 / Google Maps URL Scheme
- **Backend/Auth**: Firebase Auth, Firebase Firestore, Cloud Functions
