# ARCHITECTURE

## 1. 개요 (Overview)
외국인 방문객을 위한 '이벤트(Anchor) 중심 AI 여행 일정 추천 웹 서비스'입니다.
이 문서는 시스템의 주요 아키텍처, 기술 스택, 그리고 핵심 로직인 동선 최적화 알고리즘에 대해 설명합니다.

## 2. 기술 스택 (Tech Stack)
본 프로젝트는 시스템 권장 환경(`GEMINI.md`)을 철저히 준수하여 무거운 프레임워크(예: Next.js, React)를 배제하고 가볍고 빠른 Web Component와 Baseline 웹 표준 기술을 사용하여 구축됩니다. 프레임워크가 없어도 모던하고 아름다운 UI를 구현합니다.

*   **Frontend**: 
    *   초기 구동 속도와 캡슐화를 극대화하기 위한 **Vanilla JS (ES Modules) + Web Components**.
    *   최신 CSS 기능 (CSS Variables, Container Queries, `:has` 선택자, OKLCH 등 최신 Color Spaces) 전면 사용.
    *   Vite를 개발 서버로 활용하여 HMR(Hot Module Replacement) 지원.
*   **Backend & DB**:
    *   **Firebase**: Firestore (인프라 및 사용자 일정 데이터베이스), Cloud Functions (LLM 프롬프트 생성 및 외부 API 라우팅).
    *   서버리스 생태계를 통해 API 키 노출 방지 및 빠른 백엔드 구현.
*   **AI Engine & Map API**:
    *   **AI (LLM)**: Google Gemini API (또는 OpenAI API) 기반으로 자연어 일정 생성.
    *   **Maps API**: Google Maps Platform (Maps JS API, Places API, Directions API).
*   **Mobile Framework**:
    *   **Capacitor**: 웹 프로젝트를 iOS/Android 네이티브 앱으로 패키징하고, Safe Area 처리 및 네이티브 플러그인(Keyboard, Splash Screen 등) 연동을 담당합니다.
    *   **Web-to-Native Bridge**: 전용 라우팅 최적화를 통해 웹의 기능을 손상시키지 않고 앱 환경에서 구동되도록 합니다.

## 3. 핵심 로직: 이벤트 중심(Anchor-based) 일정 최적화
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
