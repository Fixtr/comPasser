# 검사 실행 안내

## 최초 준비

Node.js 24와 Java JDK 21 이상을 사용한다. 브라우저·에뮬레이터는 최초 실행 시 내려받으며, 운영 Firebase 로그인이나 API 키는 필요 없다.

```sh
npm ci
npm ci --prefix functions
npm run test:browser:install
java -version
```

Linux에서 브라우저 시스템 라이브러리까지 설치해야 하면 `npm run test:browser:install -- --with-deps`를 사용한다. 이 설치 명령은 다른 도구가 사용하는 기존 테스트 브라우저 캐시를 자동 삭제하지 않는다.

## 평소 실행

| 명령 | 검사 범위 |
| --- | --- |
| `npm test` | 빠른 단위·계약 검사. 서버 콜백과 클라이언트 오류 처리 격리 검사 포함 |
| `npm run build` | 실제 Vite 빌드 가능 여부 |
| `npm run test:browser` | 기존 브라우저 시나리오 전체, 6개 독립 실행 묶음 |
| `npm run test:emulator` | 실제 Auth·Firestore 에뮬레이터, 서버 탈퇴 처리·HTTP 호출·보안 규칙 |
| `npm run check` | 위 네 단계를 순서대로 실행. 하나라도 실패하면 즉시 실패로 종료 |

브라우저 세부 항목만 재실행하려면 예를 들어 `npm run test:browser -- --grep "planner"`를 사용한다. 실행 순서가 필요한 생성→저장/공유→프로필 흐름은 하나의 테스트 안에서 순차 실행한다. 다른 묶음은 새 브라우저 컨텍스트에서 시작한다.

## 안전성과 재현성

- 브라우저는 전용 로컬 서버 `127.0.0.1:4183`을 자동으로 열고 종료한다. 해당 포트를 이미 쓰고 있으면 다른 서버를 재사용하지 않고 실패한다. 개발 중인 4173 포트 서버는 건드리지 않는다.
- 검사 서버는 `.env`와 기존 `VITE_` 환경 설정을 읽지 않는다. 카카오 테스트용 더미 키만 넣고 인증·AI·DB·지도·공유 전달 등 외부 경계를 대체한다. 외부 HTTP는 가로채며 WebSocket과 서비스 워커도 차단한다. 개인 브라우저 프로필은 사용하지 않는다.
- 고정된 검사 날짜(2026-09-13), 한국어와 서울 시간대를 사용한다. 날짜 입력의 과거 판정은 안정화하되 로딩·애니메이션 타이머는 정상적으로 흐르게 한다.
- 기존 MCP용 콜백 파일을 CLI가 그대로 실행한다. 수동 도구에서 계속 쓸 수 있지만 자동 실행에는 Codex나 MCP 연결이 필요 없다. 새 콜백은 `test/browser/smoke.spec.mjs`에도 등록한다.
- 서버 검사는 `demo-hackerton-deletion`만 사용한다. Auth 19099, Firestore 18080(보조 WebSocket 18150), 허브 14400, 로깅 14500 포트를 사용하며 모두 loopback에 바인딩한다. 기존 `firebase.json`과 운영 배포 설정은 바꾸지 않는다.
- 에뮬레이터 테스트는 SDK를 초기화하기 전에 명시적인 가상 프로젝트와 로컬 호스트 설정을 확인한다. 검사 명령이 시작·종료를 관리하며 실패해도 종료 코드가 전달된다. 계정/일정 생성·삭제는 가상 프로젝트에서만 발생한다.

## 실패 기록

- 브라우저: `playwright-report/index.html`에 단계별 결과, `test-results/browser/`에 실행별 PNG 및 실패 시 화면/trace를 남긴다. `npx --no-install playwright show-report`로 HTML 보고서를 열 수 있다.
- 에뮬레이터: 콘솔의 실패 테스트와 `firestore-debug.log`를 확인한다.
- 산출물은 Git에서 제외한다. 브라우저를 재실행하면 이전 실행 보고서가 갱신되므로 필요한 증거는 별도로 보관한다.

## GitHub 자동 검사

`.github/workflows/checks.yml`은 PR, `main` 푸시, 수동 실행에 대해 기본 검사/빌드·브라우저·에뮬레이터의 세 작업을 실행한다. Node 24, Java 21, 잠금 파일과 버전이 고정된 검사 도구를 사용한다. 공식 GitHub 작업도 커밋 해시로 고정했다.

저장소 읽기 권한만 사용하며 배포 자격 증명이나 비밀 환경 변수를 전달하지 않는다. 브라우저 보고서와 실패한 에뮬레이터 로그는 7일간 보관한다. 원격 푸시 전에는 GitHub에서 실행되지 않는다.

이 설정은 **검사만** 한다. 기존 Cloudflare 자동 배포와 독립적이므로 검사 실패가 배포나 병합을 자동 차단하지는 않는다. 병합 필수 검사/배포 순서 변경은 별도 저장소·운영 설정 작업이다.

## 검증 범위 밖

운영 OAuth·실제 Gemini 응답 품질·지도 정확도·실제 메시지 전송·실제 계정 삭제·Android/iOS 실기기는 검증하지 않는다. 이미지 검사는 실제 캡처와 DOM/픽셀 조건 검사이며 모든 화면의 스크린샷 회귀 비교는 아니다.

참고: [Playwright 서버 자동 실행](https://playwright.dev/docs/test-webserver), [검사 시계](https://playwright.dev/docs/clock), [Firebase 에뮬레이터 실행](https://firebase.google.com/docs/emulator-suite/install_and_configure).
