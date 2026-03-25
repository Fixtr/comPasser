# 🧭 Compasser (컴패서)
"한국을 여행하는 사람들을 위한 AI 기반 다국어 로컬 동선 최적화 플래너"

Compasser는 한국을 여행하는 모든 사람(내/외국인 모두 포함)을 위해, 복잡한 여행 동선과 시간 계산을 AI와 지도가 알아서 해결해 주는 지능형 스마트 여행 플래너입니다. 사용자가 꼭 가고 싶은 필수 방문지(Anchor)만 입력하면, Google Gemini AI가 빈 시간의 동선을 최적화해 채워주고 Google Maps API가 지도 위에 생생하게 경로를 그려줍니다.

## ✨ 핵심 기능 (Key Features)

### 1. 🔐 보안 및 개인화: Firebase Google 로그인
- **간편 로그인**: 사용자는 추가적인 회원가입 절차 없이 Google 계정으로 3초 만에 로그인하여 서비스를 이용할 수 있습니다.
- **인증 라우팅**: 로그인하지 않은 사용자는 서비스 소개가 담긴 랜딩 페이지(`login-view`)만 볼 수 있도록 보호되며, 인증을 완료한 후 메인 기능에 접근할 수 있습니다.

### 2. 🤖 Gemini AI 기반 맞춤형 일정 자동 생성
- **다이내믹 일정 폼**: 하루의 시작/종료 장소를 지정하고, 반드시 방문해야 하는 '앵커 일정(Anchor Schedule)'을 원하는 만큼 `+`, `-` 버튼으로 자유롭게 추가할 수 있습니다.
- **스마트 빈칸 채우기**: 앵커 일정 사이의 붕 뜨는 시간과 동선을 AI가 분석하여, 최적의 맛집, 카페, 명소를 추천하고 완벽한 하루 일정을 완성합니다.

### 3. 📍 구글 맵 기반 다중 구간 스마트 길찾기
- **구간별 분할 렌더링 (Point-to-Point)**: `A ➔ B`, `B ➔ C` 등 구간마다 독립적인 길찾기를 수행하여 전체 동선을 하나의 지도 위에 직관적으로 시각화합니다.
- **대중교통 & 도보 완벽 지원**: 대중교통(Transit) 경로를 똑똑하게 안내하며, 너무 가까운 거리는 도보 이동으로 간주하여 점선(Dashed Line)으로 자연스럽게 이어줍니다.

### 4. ⏱️ 사용자 친화적 타임라인 UI
- 일정이 진행되는 순서대로 번호가 매겨진 타임라인을 제공합니다.
- 일정과 일정 사이의 이동 수단과 소요 시간(예: 도보 10분, 대중교통 15분)을 직관적인 카드로 표시하여 길 위에서 버리는 시간을 최소화합니다.

### 5. 🎭 3단계 뷰 트랜지션 (View Transition) UX
- 폼 입력(Phase 1) ➔ AI 분석 로딩(Phase 2) ➔ 결과 확인(Phase 3)으로 이어지는 3단계 화면 전환을 통해, 사용자가 스크롤 없이도 전체 화면에서 매끄러운 경험을 할 수 있습니다.
- 결과 화면에서 다시 입력 폼으로 자연스럽게 돌아갈 수 있는 **두 가지 방식의 내비게이션(Back Navigation)** 버튼을 지원합니다.
  - **[← 이전 화면으로]**: 변경사항 없이 단순하게 이전 폼 화면으로 되돌아갑니다.
  - **[일정 수정하기 ✏️]**: 생성된 일정의 원본 데이터를 빈 폼에 역추적하여 **자동으로 채워주는(Auto-fill)** 스마트 수정 기능을 지원합니다.
- **깜빡임 없는 (Flicker-free) UX**: 화면 전환 시 History API 기반의 Navigation First 패턴과 `requestAnimationFrame`, `sessionStorage`를 활용하여 데이터 로드와 DOM 업데이트를 완벽히 분리, 60fps에 달하는 쾌적한 화면 전환을 제공합니다.

### 6. 📂 내 일정 저장 및 관리 (Firebase Firestore)
- 생성된 마음에 드는 일정을 계정에 연동하여 안전하게 저장할 수 있습니다.
- 언제든 내 일정 모달창에서 원클릭으로 다시 지도로 불러오거나 휴지통 아이콘을 눌러 손쉽게 삭제 관리할 수 있습니다.
- **자연스러운 불러오기**: 모달에서 저장된 일정을 선택하면 폼 화면이 사라지고 자연스럽게 지도와 결과 화면이 나타나며 기존 일정을 복원합니다.

### 7. 🌍 완벽한 다국어(i18n) 지원
- 한국어(ko)와 영어(en)를 동시에 지원하는 시스템을 갖추었습니다.
- 상단 **언어 토글** 버튼 조작 시 페이지 새로고침 없이, 기존 문서 DOM과 이벤트 리스너를 파괴하지 않는 안전한 텍스트 업데이트 로직이 적용되어 UI와 AI 프롬프트가 동적으로 전환됩니다.

### 8. 🛡️ 인앱 브라우저(WebView) 방어 로직
- 카카오톡 등 앱 내장 브라우저에서 Google 로그인 시 발생하는 403(`disallowed_useragent`) 에러를 방지합니다.
- 안드로이드에서는 Chrome Intent를 활용해 외부 브라우저로 강제 리다이렉션하며, iOS에서는 사파리 외부 실행을 유도하는 맞춤형 안내 모달을 제공합니다.

### 9. 🗺️ 지도 및 UI 사용성 개선
- **경로 방향성 강화**: 지도 위에 그려지는 경로상에 보라색 화살표를 시각화하여 이동 방향을 명확히 안내합니다.
- **검색 지역 최적화**: 구글 맵스 장소 검색 자동완성(Autocomplete)의 범위를 한국(KR)으로 제한하여 불필요한 해외 검색 결과를 차단했습니다.
- **즉시 초기화**: 입력 폼 전체를 한 번에 초기화(Reset)할 수 있는 버튼을 추가해 사용 편의성을 극대화했습니다.

### 10. 🔒 데이터베이스 보안 규칙 (Security Rules) 분리 적용
- **공유용 데이터(`shared_itineraries`)**: 카카오톡 등으로 공유된 단축 URL 접근 시 누구나 읽을 수 있도록 읽기 권한을 전체 허용했습니다.
- **개인 보관용 데이터(`itineraries`)**: 사용자가 개인 계정에 저장한 일정은 철저히 로그인한 본인만 접근(CRUD)할 수 있도록 보안 규칙을 엄격하게 분리했습니다.

### 11. 📊 데이터 분석 및 로깅 (Google Analytics 4)
- **사용자 행동 추적 (Custom Events)**: AI 일정 생성(`generate_itinerary_click`), 일정 저장(`save_itinerary_click`), 카카오톡 공유(`share_kakao_click`), 다국어 전환(`change_language`) 등 핵심 인터랙션을 세밀하게 추적합니다.
- **SPA 가상 페이지 뷰**: 바닐라 JS의 History API 네비게이션(popstate)을 감지하여 리로드 없이 화면이 변경되어도 정확하게 `page_view` 이벤트를 GA4로 전송합니다.
- **보안/환경 변수 분리**: GA4 측정 ID(`VITE_GA_MEASUREMENT_ID`) 등 주요 설정값은 코드에 직접 노출하지 않고 `.env` 파일로 주입시켜 관리하며 Git 저장소 공유를 원천 차단했습니다.

### 12. 📱 모바일 웹앱 설치 (PWA) 완벽 지원
- **홈 화면 추가**: Web App Manifest(`manifest.json`)와 Service Worker(`sw.js`) 연동을 통해 사용자가 터치 한 번으로 모바일 및 데스크탑 홈 화면에 바로가기 앱을 설치(Add to Home Screen)할 수 있습니다.
- **네이티브 앱 경험**: 모바일 사용성 강화를 위해 동적 테마 색상(theme-color)을 적용하고, 모바일 OS 표준에 맞춘 고해상도 규격 아이콘(192x192, 512x512)을 탑재하여 이질감 없는 사용 환경을 제공합니다.

### 13. 🎨 세련된 UI/UX 디자인 고도화 (Polishing)
- **폼 및 버튼 인터랙션 강화**: 입력 폼(`<input>`, 구글 맵 자동완성 등)과 핵심 버튼, 카드 UI에 포커스 및 호버 시 부드러운 메인 컬러 그림자(`box-shadow`)와 떠오르는 애니메이션(`translateY`)을 적용하여 반응성을 극대화했습니다.
- **모바일 반응형 여백 최적화**: 모바일 환경(max-width 768px 이하)에서 화면 좌우 여백(Padding)을 섬세하게 조절하여 답답함을 없애고 쾌적한 화면 비율을 유지합니다.
- **로딩 시각 효과**: AI가 일정을 분석하고 생성할 때 표시되는 안내 텍스트에 부드러운 펄스(Pulse) CSS 애니메이션을 추가하여 사용자의 대기 경험을 개선했습니다.

## 🏛️ 아키텍처 하이라이트: DDD & Vibe Coding 최적화
Compasser는 빠른 MVP 구현에 그치지 않고, AI 보조 코딩(Vibe Coding)의 효율성을 극대화하고 유지보수성을 높이기 위해 **도메인 주도 설계(DDD: Domain-Driven Design)** 아키텍처를 도입했습니다.

- **관심사의 분리 (Domain Separation)**: 코드를 화면 단위가 아닌 비즈니스 개념 단위로 분리했습니다.
  - 📁 `auth/`: Firebase Google Auth 기반의 사용자 인증 도메인 (랜딩 페이지 포함)
  - 📁 `planner/`: 사용자 폼 입력 및 Gemini AI 통신 도메인 (429 Error Handling 및 Debounce 적용)
  - 📁 `itinerary/`: 생성된 일정 데이터를 타임라인 UI로 렌더링하는 도메인 (기능 확장의 Gold Standard)
  - 📁 `map/`: Google Maps 렌더링, 지오코딩, 길찾기 서비스 로직 도메인
- **유비쿼터스 언어 (Ubiquitous Language)**: AI의 환각(Hallucination)을 방지하기 위해 `AnchorSchedule`, `TransitRoute`, `ItineraryPlan` 등 명확한 비즈니스 용어 사전을 정의하고 코드 전반에 강제했습니다.
- **컨텍스트 트리거 (Context Triggers)**: 각 도메인 폴더 최상단에 `COMMAND_GUIDE.md`를 배치하여, AI 및 협업 개발자가 해당 도메인의 비즈니스 규칙을 즉각적으로 파악할 수 있도록 설계했습니다.

## 🛠️ Tech Stack
- **Frontend**: Vite, Vanilla JS (ES6 Modules), HTML5/CSS3
- **API / Cloud**: 
  - Google Maps JavaScript API (Maps, Geocoding, Directions)
  - Google Gemini API (gemini-2.5-flash)
- **Deployment**: Cloudflare Pages

## 🚀 Getting Started (로컬 실행 방법)

1. 저장소를 클론합니다.
   ```bash
   git clone https://github.com/Fixtr/hackerton.git
   cd hackerton
   ```

2. 패키지를 설치합니다.
   ```bash
   npm install
   ```

3. 프로젝트 루트에 `.env` 파일을 생성하고 발급받은 API 키를 입력합니다.
   ```env
   VITE_MAPS_API_KEY=당신의_구글_맵_API_키
   GEMINI_API_KEY=당신의_제미나이_API_키
   ```

4. 개발 서버를 실행합니다.
   ```bash
   npm run dev
   ```