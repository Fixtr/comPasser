# ComPasser (컴패서)

ComPasser는 1~4일 여행 일정을 만드는 한국어·영어 여행 플래너입니다. 여행 날짜, 출발·도착 장소, 꼭 방문할 곳을 입력하면 Gemini가 일정을 제안하고 Google Maps가 장소와 이동 경로를 표시합니다.

- 홈에서는 도시별 장소와 코스를 둘러보고, 로그인하면 다가오는 저장 일정을 볼 수 있습니다.
- 결과 화면에서는 일정 순서와 방문 시간을 수정하고, 이동 경로를 확인하거나 방문한 장소를 체크할 수 있습니다.
- 개인 일정은 계정에 저장하며, 오프라인 열람용 사본을 기기에 둘 수 있습니다. 캘린더 파일과 이미지로 내보낼 수도 있습니다.
- `/share/:id`는 일정의 읽기 전용 사본을 보여 줍니다. 링크를 아는 사람은 로그인 없이 볼 수 있습니다. 새 공유 링크는 원본을 수정해도 같은 내용을 보여 주고, 원본을 삭제하면 열리지 않습니다. 이전 공유 링크의 예외는 [공유 규칙](src/domains/itinerary/COMMAND_GUIDE.md)을 참고하세요.
- Google·카카오·네이버 로그인과 이메일 가입을 지원합니다. 공개 코스와 후기에는 신고와 작성자 차단 기능이 있습니다.

## 로컬 실행

Node.js 24로 웹과 함수 의존성을 설치합니다. 실제 Firebase와 지도를 쓰려면 `.env.example`을 `.env`에 복사한 뒤 해당 개발 환경의 `VITE_*` 설정을 채웁니다. 서버 전용 키 설정은 [배포 가이드](docs/DEPLOY.md)를 참고하세요.

```sh
npm ci
npm ci --prefix functions
npm run dev
```

전체 검사는 Java JDK 21 이상과 Playwright 브라우저가 필요합니다. 검사에서는 운영 API 키 없이 격리된 브라우저와 Firebase 에뮬레이터를 사용합니다. [검사 실행 안내](docs/TESTING.md)

```sh
npm run test:browser:install
npm run check
```

## 코드 위치

| 위치 | 역할 |
| --- | --- |
| `ionic-shell.html`, `src/prototype/`, `src/app/` | Ionic React 셸, 화면 라우팅과 로그인 가드 |
| `src/domains/{auth,planner,itinerary,map,profile}/` | 도메인별 서비스와 Web Components 화면 |
| `functions/`, `firestore.rules` | Firebase 호출 함수, 일정 생성과 생성권, 데이터 접근 규칙 |
| `public/`, `src/server/` | 정적 파일과 서비스 워커, 영어 공개 코스 페이지 |
| `android/`, `ios/` | Capacitor 네이티브 앱 |

변경하려는 도메인의 `COMMAND_GUIDE.md`에서 데이터 계약과 검증 방법을 확인하세요. [도메인 문서 안내](docs/COMMAND_GUIDE.md) · [시스템 구조](docs/ARCHITECTURE.md) · [데이터 스키마](docs/Schema.md)

## 빌드와 배포

`npm run build`는 웹 번들을 `dist/`에 만들고, `npm run cap:sync`는 웹 번들을 빌드해 Android와 iOS 프로젝트에 반영합니다. 로컬 네이티브 실행에는 `npm run cap:run:android`와 `npm run cap:run:ios`를 사용합니다. [앱 출시 가이드](docs/PLAY_STORE.md)

GitHub Actions는 `main` 검사 통과 후 웹을 Cloudflare Pages에 배포합니다. Firebase 함수와 규칙은 별도로 배포합니다. [배포 가이드](docs/DEPLOY.md) · [검증과 변경 이력](docs/history/)
