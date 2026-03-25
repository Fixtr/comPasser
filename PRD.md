# Product Requirements Document (PRD)

## 1. Product Overview (제품 개요)
**제품명**: Compasser (컴패서)  
**한 줄 소개**: "한국을 여행하는 사람들을 위한 AI 기반 다국어 로컬 동선 최적화 플래너"

Compasser는 복잡하고 피곤한 여행 동선 설계와 시간 계산을 AI 기술과 정교한 지도 시스템으로 해결해 주는 지능형 웹 애플리케이션입니다. 사용자의 '필수 방문지(Anchor)'를 중심으로 빈 시간을 계산하여 최적화된 동선과 장소를 추천합니다.

## 2. Target Audience (타겟 고객)
- **한국을 여행하는 모든 사람 (내/외국인 모두 포함)** 
- 특정 공연, 페스티벌, 스포츠 경기 등 반드시 참석해야 하는 일정이 있는 여행객
- 효율적인 동선 구성에 어려움을 겪거나 시간을 절약하고 싶은 여행객

## 3. Core Features (핵심 기능 요구사항)

### 3.1. 앵커 기반 AI 동선 최적화 (Anchor-based Optimization)
- 사용자가 원하는 필수 일정(Anchor Schedule)을 입력하면, 이를 기점으로 앞뒤 빈 시간에 알맞은 추천 장소와 최적화된 동선을 Google Gemini AI가 설계하여 반환합니다.

### 3.2. 글로벌 다국어(i18n) 시스템
- 한국어(ko)와 영어(en)를 지원하며, 언어 토글 시 페이지 새로고침이나 DOM 및 이벤트 리스너 파괴 없이 즉각적으로 UI 텍스트와 AI 프롬프트가 동적으로 변경됩니다.

### 3.3. 인터랙티브 지도 및 타임라인 UI
- **구글 맵 렌더링**: '대중교통'과 '도보(단거리 점선 처리)'를 완벽히 연동 및 분리하여 시각화하며, 진행 방향을 명확히 알 수 있도록 **보라색 화살표**를 추가했습니다.
- **UI 사용성 제한**: 장소 검색(Autocomplete)을 대한민국(KR)으로 엄격하게 제한하여 사용자 혼란을 방지하고 정확도를 높였습니다.
- **초기화(Reset)**: 폼 입력 전체를 즉시 비우고 처음부터 다시 단계를 밟을 수 있는 강력한 리셋 버튼을 제공합니다.

### 3.4. 3-Page Architecture (SPA & Paged Routing)
- `#page-home` (로그인), `#page-plan` (계획 설계), `#page-view` (결과 및 지도)의 3단계 화면으로 완벽하게 분리된 바닐라 JS 해시 라우팅을 지원합니다.
- View 화면에서 Plan 화면으로 되돌아가도 기존에 입력한 폼 데이터가 날아가지 않는 **상태 유지 기능(Seamless Editor)**이 적용되어 지속적인 수정과 재생성이 가능합니다.

### 3.5. 데이터 분석 추적 (Google Analytics 4)
- **맞춤 이벤트 로깅**: 핵심 사용자 액션(AI 일정 생성, 일정 저장, 카카오톡 공유, 언어 전환 등) 발생 시 `trackEvent` 커스텀 유틸리티를 통해 사용자 인터랙션을 세밀하게 수집합니다.
- **가상 페이지 뷰**: History API 기반의 SPA 네비게이션 시 전환되는 가상 페이지 뷰(Virtual Page View)를 추적합니다.

### 3.6. 모바일 웹앱 설치 (PWA) 지원
- Web App Manifest(`manifest.json`)와 Service Worker(`sw.js`) 연동을 통해 사용자가 앱을 홈 화면에 직접 설치(Add to Home Screen)할 수 있도록 지원합니다.
- 동적 테마 색상(theme-color)과 규격화된 앱 아이콘(192x192, 512x512)을 적용하여 스마트폰 바탕화면에서도 이질감 없는 네이티브 앱 수준의 모바일 사용성을 확보했습니다.

## 4. Security & Access Control (보안 및 접근 제어)

### 4.1. 환경 변수(.env) 기반 설정 관리
- **민감 정보 분리**: GA4 측정 ID(`VITE_GA_MEASUREMENT_ID`), Firebase 설정값, Google Maps API 키 등을 코드베이스에서 하드코딩하지 않고 `.env` 환경 변수로 분리 관리하여 Git 유출을 원천 차단합니다. (`.gitignore` 적용)
- **템플릿 공유**: 협업을 위한 `.env.example` 파일을 별도로 구성하여 안전한 환경 설정을 지원합니다.

### 4.2. Firebase 인증 및 인앱 브라우저 방어
- Google 계정을 활용한 OAuth 로그인을 기본으로 지원합니다.
- 카카오톡, 라인 등 인앱 브라우저(WebView)에서 Google 로그인 시도 시 발생하는 `disallowed_useragent` 에러 403을 방지하기 위해:
  - **안드로이드**: Chrome Intent scheme을 이용해 외부 브라우저(Chrome)로 즉시 강제 리다이렉션.
  - **iOS**: Apple 정책상 강제 리다이렉션이 불가능하므로 사파리 등 외부 브라우저를 켜도록 유도하는 맞춤형 안내 모달 제공.

### 4.2. 데이터베이스 보안 규칙 (Firestore Security Rules)
- **공유용 데이터 (`shared_itineraries`)**: 카카오톡 등으로 공유된 링크를 타고 접속한 누구든 읽기 권한을 가지도록 `read: if true` 적용.
- **개인 보관용 데이터 (`itineraries`)**: 사용자가 개인 계정에 직접 보관한 일정은 철저하게 `read, write: if request.auth != null && request.auth.uid == resource.data.userId` 규칙으로 보호.

## 5. Technical Stack
- **Frontend**: Vite, Vanilla JS (ES Modules)
- **APIs**: Google Maps JS API, Google Gemini API
- **Backend/Auth**: Firebase Auth, Firebase Firestore
