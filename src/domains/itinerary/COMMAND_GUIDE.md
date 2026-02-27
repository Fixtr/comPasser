# Itinerary Domain 규칙 및 네이밍 컨벤션 (Ubiquitous Language)

## 핵심 원칙
- **도메인 역할**: 생성된 일정 정보(`ItineraryPlan`)를 시간 순서대로 렌더링하는 역할만 전담합니다 (Timeline View).
- **의존성 분리**: 지도가 어떻게 생겼는지 파악하거나, 일정표를 생성하는 과정은 관여하지 않습니다. 주어진 데이터를 표출하는 것에만 집중합니다.

## 용어 사전 (Ubiquitous Language)
- **ScheduleItem**: 타임라인에 그려지는 개별 방문 일정 항목.
- **ItineraryPlan**: 타임라인을 그리기 위한 전체 스케줄 구조체.
- **Overview**: 타임라인 이외에 전체 날짜, 테마 등 요약 정보를 나타내는 영역.

## 구조 규칙
- `transit-info-ready`와 같은 전역 이벤트를 리스닝하여 타임라인 사이의 이동 시간 정보를 채우는 것은 허용되나, Map 도메인과 직접 import 하여 결속되지 않도록 주의합니다.
