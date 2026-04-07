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
