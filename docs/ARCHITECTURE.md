# System Architecture

> 📌 **ComPasser 시스템 아키텍처** · 상단의 영문 섹션은 AI 하네스 규칙 검증 및 시스템 경계 요약이며, 하단은 상세 설계 및 핵심 알고리즘(한국어)입니다.

---

## 1. Architecture Overview & Boundaries (English)

### 1.1. Overview
ComPasser is built as a serverless web and mobile application utilizing a unified Ionic React Shell (`ionic-shell.html` + `src/prototype/ionic-shell.jsx`) combined with Web Components core, Capacitor, and `--cp-*` flat design tokens. It fully adopts Domain-Driven Design (DDD).

### 1.2. Domain Structure
1. `auth/`: Firebase Google/Email/Social Auth, Profile management.
2. `planner/`: Normalizes form constraints, uses Gemini 2.5 Flash Lite to generate itineraries, and deterministically enforces route boundaries and anchors.
3. `itinerary/`: Renders timeline UI and AI generated `top3Recommendations`.
4. `profile/`: Account settings, saved trips, and identity verification.
5. `map/`: Google Maps JS API for viewing, deep linking for Navigation.

### 1.3. Flow & Integration Layer
`User -> Vite App (Web/PWA/Capacitor) -> Firebase Auth -> Firestore Database`
`Planner UI -> plannerRequest normalization -> dailyData -> [Cloud Function: generateItinerary] sanitize -> prompt -> Gemini 2.5 -> deterministic constraint enforcement (client) -> Itinerary UI -> Map View`

> **Secret boundary**: The Gemini API key lives only in Secret Manager and is read by the `generateItinerary` callable function. Vite `envPrefix` is restricted to `VITE_`, so no LLM key is ever bundled. The client sends structured constraints, never a raw prompt, and the function requires an authenticated caller.

### 1.4. Planner constraint boundary
- `travel-form.js` owns input collection and emits the flat, save-compatible `plannerRequest`.
- `planner-constraints.mjs` converts flat and legacy request shapes into canonical per-day `dailyData`.
- `gemini-optimizer.js` builds the prompt only from canonical constraints.
- Gemini output is untrusted for hard constraints: departure, destination, times, and anchors are reconciled before rendering or persistence.

---

## 2. 시스템 상세 아키텍처 (Detailed Architecture)

### 2.1. 개요 (Overview)
외국인 방문객을 위한 '이벤트(Anchor) 중심 AI 여행 일정 추천 웹 서비스'입니다.
이 문서는 시스템의 주요 아키텍처, 기술 스택, 그리고 핵심 로직인 동선 최적화 알고리즘에 대해 설명합니다.

### 2.2. 기술 스택 (Tech Stack)
본 프로젝트는 시스템 권장 환경(`GEMINI.md`) 및 `--cp-*` 디자인 토큰 계약을 준수하여 가볍고 빠른 Web Component와 Baseline 웹 표준 기술, 그리고 개발 및 프로덕션 배포 일원화를 위한 **Ionic React Shell** 아키텍처를 채택하고 있습니다.

*   **Frontend**: 
    *   **단일 Ionic Shell 구조**: 개발 환경(`npm run dev`)과 웹(Cloudflare Pages)/앱(Capacitor) 배포 환경 모두 **Ionic React Shell (`ionic-shell.html`)**로 일원화하여 로컬과 배포 사이의 시각적·동작적 괴리를 제거. Web Components 기반 도메인 UI 자산은 그대로 호환 마운트. (레거시 검증용 설정은 `vite.legacy.config.js`로 분리 보존)
    *   **플랫 디자인 토큰 (`--cp-*`)**: 모든 색상은 `html2canvas` 캡처 호환성을 위해 hex 기반으로 선언되며, `oklch`, `color-mix`, `box-shadow`, `gradient`는 계약 테스트로 전면 금지됩니다. UI는 무채색, 색상은 지도 핀 규칙에만 한정됩니다.
    *   Vite를 기본 개발 서버 및 번들러로 활용하여 HMR 및 통합 빌드 지원.
*   **Backend & DB**:
    *   **Firebase**: Firestore (인프라 및 사용자 일정 데이터베이스), Cloud Functions (LLM 프롬프트 생성 및 외부 API 라우팅).
    *   서버리스 생태계를 통해 API 키 노출 방지 및 빠른 백엔드 구현.
    *   **Gemini 키 격리**: LLM 호출은 전적으로 `generateItinerary` Cloud Function 에서 수행되며, 키는 Secret Manager(`defineSecret`)에만 존재합니다. Vite `envPrefix` 는 `VITE_` 만 허용하므로 브라우저 번들에는 키가 포함되지 않습니다. 클라이언트는 프롬프트가 아니라 구조화된 제약 조건만 전송하고, 서버는 이를 sanitize(일수 최대 4일 / 앵커 10개 / 문자열 200자, theme·budget 화이트리스트)한 뒤 프롬프트를 구성합니다. 함수는 인증된 사용자만 호출할 수 있습니다.
*   **AI Engine & Map API**:
    *   **AI (LLM)**: Google Gemini API 기반으로 자연어 일정 생성.
    *   **Maps API**: Google Maps Platform (Maps JS API, Places API, Directions API).
*   **Mobile Framework**:
    *   **Capacitor**: 웹 프로젝트를 iOS/Android 네이티브 앱으로 패키징하고, Safe Area 처리 및 네이티브 플러그인(Keyboard, Splash Screen 등) 연동을 담당합니다.
    *   **Web-to-Native Bridge**: 전용 라우팅 최적화를 통해 웹의 기능을 손상시키지 않고 앱 환경에서 구동되도록 합니다.

### 2.3. 핵심 로직: 이벤트 중심(Anchor-based) 일정 최적화
단순히 일수별로 유명 지역 위주로 추천하는 기존 서비스들과 달리, 사용자의 가장 중요한 '고정 이벤트(Anchor Event)' 제약을 최우선 변수(Axis)로 삼아 일정을 채워나가는 프롬프트 및 로직 파이프라인입니다.

1.  **사용자 제약 조건 수집 (Constraints Input)**:
    *   여행 기간, 일자별 시작/종료 시간, 출발지 및 도착지.
    *   **Anchor Event 상세 정보**: 일정 및 장소 (예: 특정일 19:00, K-pop 콘서트).
    *   선호도: 예산 스펙트럼(Budget-Balance-Flex), 외국인 친화적(영어 메뉴 등).
2.  **요청 정규화 (Constraint Normalization)**:
    *   `travel-form`이 생성한 평면형 `plannerRequest`를 `planner-constraints.mjs`에서 일자별 `dailyData`로 변환합니다.
    *   전역/일자별 시간, 출발지, 도착지 및 `anchorSchedules`를 Day N 단위로 결합하며 구버전 `dailyData`도 하위 호환합니다.
3.  **지리적/시간적 중심(Gravity Center) 및 타임라인 설정**:
    *   Anchor Event 전/후 이동 시간을 타임박스(Timebox)에서 미리 차감(Block)합니다.
    *   해당 이벤트가 있는 날은 해당 지역(예: 홍대, 송파)을 목적지 클러스터로 묶어 주변 일정으로만 채우도록 Gravity Center 가중치를 부여합니다.
4.  **후보 장소 필터링 (Place Generation)**:
    *   Google Places API를 통해 Anchor 지역 중심의 후보군(식당, 명소)을 사전 Fetch 합니다.
5.  **AI(LLM) 동선 구성 (Optimization)**:
    *   제약 조건, 사용자 페르소나, 후보 장소를 시스템 프롬프트(System Prompt)에 주입합니다.
    *   LLM 프롬프트 디자인: "오후 7시 이벤트 참석에 늦지 않도록 동선을 구성하되, 오전/오후 시간대별로 묶어 체류 시간 및 이동 경로를 예측한 JSON 형식의 스케쥴을 반환하라."
6.  **결과 제약 보정 (Deterministic Guardrail)**:
    *   LLM의 지시 준수 여부와 관계없이 첫 일정은 입력한 출발지/시작 시간, 마지막 일정은 입력한 도착지/종료 시간으로 보정합니다.
    *   누락되거나 변경된 Anchor는 원래 시간·장소로 복구한 뒤 시간순으로 정렬합니다.
7.  **렌더링 (Map Presentation)**:
    *   LLM 이 반환한 최적 스케쥴을 Directions API로 경로(Polyline) 계산하여 프론트엔드의 Map View Web Component 에 그립니다.
