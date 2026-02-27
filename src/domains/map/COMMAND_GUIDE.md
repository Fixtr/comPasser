# Map Domain 규칙 및 네이밍 컨벤션 (Ubiquitous Language)

## 핵심 원칙
- **도메인 분리**: 이 도메인은 '지도 렌더링', '좌표 변환', '경로 탐색'에만 관여합니다. 전체 여행 일정(`ItineraryPlan`)이나 이벤트 추가 로직(`Planner`)은 알 필요가 없습니다.

## 용어 사전 (Ubiquitous Language)
- **Geocoding (지오코딩)**: 텍스트 주소나 장소 이름을 위경도 좌표(`LatLng`)로 변환하는 행위.
- **Routing (라우팅 / 경로 탐색)**: 두 좌표 사이의 이동 경로 데이터를 가져오는 행위. (UI에서 선을 그리는 데이터 제공).
- **TransitRoute**: 대중교통 경로.
- **WalkingRoute**: 도보 경로.
- **ScheduleItem**: 마커로 표시할 대상 (이전의 'event'를 대체).
- **AnchorSchedule**: 반드시 도착해야 하는 핵심 일정 마커.

## 아키텍처 규칙
- **UI 종속성 분리**: 길찾기 API(DirectionsService)나 지오코딩 API(Geocoder) 호출 코드를 절대로 `map-view.js` (UI) 안에 혼재시키지 마십시오.
- **Service 레이어**: 구글 지도 API 통신은 반드시 `services/geocoding-service.js` 와 `services/routing-service.js` 를 통해서만 이루어져야 합니다.
- **의존성 방향**: UI -> Service (O), Service -> UI (X). Service 모듈은 DOM에 직접 접근하거나 상태를 조작해선 안 됩니다.

## UI 렌더링 규칙 
- **마커 렌더링 색상 규칙**: 
  - `AnchorSchedule` 일 경우 보라색 핀으로 렌더링.
  - 리스트의 첫 번째 장소일 경우 초록색 핀으로 렌더링.
  - 나머지 일반 장소는 파란색 핀으로 렌더링.
- **TransitInfo 전달**: 라우팅 결과물(거리, 소요시간)은 전역 이벤트 버스(`transit-info-ready`)를 통해 다른 컴포넌트(예: Timeline)로 전달될 수 있지만, Map 도메인이 소비자의 형태를 알아서는 안 됩니다.
