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
