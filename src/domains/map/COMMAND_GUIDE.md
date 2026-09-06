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

## 언어 규칙
- **언어는 값이 아니라 함수로 주입합니다**: `new GeocodingService(loader, { getLanguage })`. 사용자가 도중에 언어를 바꿀 수 있으므로 생성 시점의 값을 붙잡아 두면 토글 후에도 옛 언어로 요청이 나갑니다.
- **알려진 한계**: Maps JS API 의 `language` 는 로드 시점에 굳습니다. 언어를 도중에 바꾸면 지도 라벨은 페이지를 새로 열기 전까지 이전 언어로 남고, 타임라인의 장소 이름(`resolvedName`)만 즉시 따라갑니다. 로더는 `map-view` 와 `travel-form` 이 같은 인스턴스를 공유하므로 언어를 인자로 받지 않습니다.
- **`region` 은 항상 `KR`**: PRD 상 한국 여행 한정 서비스입니다. 언어만 바뀌고 지역은 바뀌지 않습니다.
- **표기 체계가 다른 이름은 오매칭으로 판정하지 않습니다**: 한글("경복궁")과 로마자("Gyeongbokgung Palace")가 맞붙으면 같은 곳이라도 글자가 겹치지 않습니다. 판단은 `itinerary-resolved-place.mjs` 의 `isComparableName()` 에 있습니다.

## UI 렌더링 규칙 
- **마커 렌더링 색상 규칙**: 
  - `AnchorSchedule` 일 경우 보라색 핀으로 렌더링.
  - 리스트의 첫 번째 장소일 경우 초록색 핀으로 렌더링.
  - 나머지 일반 장소는 파란색 핀으로 렌더링.
- **TransitInfo 전달**: 라우팅 결과물(거리, 소요시간)은 전역 이벤트 버스(`transit-info-ready`)를 통해 다른 컴포넌트(예: Timeline)로 전달될 수 있지만, Map 도메인이 소비자의 형태를 알아서는 안 됩니다.
- **비동기 결과 식별**: `render-map-route`의 `detail`은 `{ plan, context }`입니다. `plan`에는 선택한 하루의 스냅샷이 들어가고, 지도는 `context`를 해석하거나 변경하지 않고 결과에 그대로 돌려줍니다. 결과는 `transit-info-ready: { context, routes }`, `places-resolved: { context, places }`, `transit-unavailable: { context, reason }`입니다.
- **이전 요청 무효화**: 새 요청, `cancel-map-route`, `clearMap()`, 컴포넌트 해제는 이전 렌더링을 무효화합니다. SDK 로딩·지오코딩·각 경로 응답 뒤에는 최신 요청인지 확인한 다음 마커/경로선/로딩 상태/결과 이벤트를 변경합니다. 이미 시작한 외부 API 호출은 끝날 수 있지만, 오래된 결과를 화면에 반영해서는 안 됩니다.
