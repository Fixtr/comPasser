# Planner Domain 규칙 및 네이밍 컨벤션 (Ubiquitous Language)

## 핵심 원칙
- **도메인 역할**: 사용자의 입력을 받아 AI를 호출하고, 완성된 일정표(`ItineraryPlan`)를 생성하는 역할만 담당합니다.
- **의존성 분리**: 모델을 생성하는 시점까지만 관여하며, 생성된 일정이 화면에 어떻게 렌더링될지(Map, Timeline)는 알 필요가 없습니다. 생성된 데이터는 전역 이벤트를 통해 전달합니다.

## 용어 사전 (Ubiquitous Language)
- **ItineraryPlan**: AI가 생성한 완성된 하루 이상의 전체 일정표 데이터.
- **AnchorSchedule**: 일정표를 생성할 때 반드시 지켜야 하는 고정 이벤트 (사용자가 폼에 입력하는 내용).
- **generate-itinerary**: 폼 제출 시 발생하는 이벤트 이름.

## 구조 규칙
- UI(`travel-form.js`)와 AI 호출 로직(`gemini-optimizer.js`)을 철저하게 분리합니다.
- `gemini-optimizer.js`는 순수 비즈니스 로직(Service)으로, DOM에 직접 접근하지 않습니다.
