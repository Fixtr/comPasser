# 🧭 Compasser (컴패서)
"복잡한 여행 동선과 시간 계산, 이제 AI와 지도에게 맡기세요!"

Compasser는 사용자가 꼭 가고 싶은 필수 장소(Anchor)만 입력하면, Google Gemini AI가 빈 시간의 동선을 최적화하여 채워주고 Google Maps API가 지도 위에 생생하게 경로를 그려주는 지능형 스마트 여행 플래너입니다.

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
- 결과 화면에서 다시 입력 폼으로 자연스럽게 돌아갈 수 있는 **뒤로 가기(Back Navigation)** 버튼도 완벽 지원합니다.

### 6. 📂 내 일정 저장 및 관리 (Firebase Firestore)
- 생성된 마음에 드는 일정을 계정에 연동하여 안전하게 저장할 수 있습니다.
- 언제든 내 일정 모달창에서 원클릭으로 다시 지도로 불러오거나 휴지통 아이콘을 눌러 손쉽게 삭제 관리할 수 있습니다.

### 7. 🌍 완벽한 다국어(i18n) 지원
- 한국어(ko)와 영어(en)를 동시에 지원하는 Dictionary 모듈 기반 아키텍처를 도입했습니다.
- 상단 **언어 토글 토글** 버튼 조작 시 페이지 새로고침 없이 즉각적으로 UI 텍스트는 물론, Gemini AI 프롬프트까지 다이내믹하게 언어가 변경되어 생성됩니다.
- 대중교통 노선(예: 4212번 버스 / Bus 4212)까지 번역 포맷을 적용하여 디테일한 사용자 경험을 제공합니다.

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