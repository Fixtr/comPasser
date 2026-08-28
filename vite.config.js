import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  // GEMINI_ 접두사는 제거되었습니다. Gemini API 키는 Secret Manager 에만 존재하며
  // `generateItinerary` Cloud Function 에서만 사용됩니다. 여기에 다시 추가하면
  // 키가 브라우저 번들에 그대로 노출됩니다.
  envPrefix: ['VITE_'],

  build: {
    rollupOptions: {
      output: {
        // 전체가 단일 청크(670KB+)라 배포할 때마다 브라우저가 Firebase SDK까지
        // 통째로 다시 받아야 했다. 자주 바뀌는 앱 코드와 거의 바뀌지 않는
        // 벤더 코드를 갈라 두면 재배포 시 앱 청크만 무효화되고, 첫 로드에서도
        // 청크들을 병렬로 받을 수 있다.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // 동적 import 로만 쓰는 것은 여기서 묶지 않는다.
          // 이름을 붙여 주면 그 청크가 "이 이름을 쓰는 모든 코드"의 것이
          // 되어, 첫 화면에서 불리는 코드와 한 덩어리가 된다. 실제로
          // 캡처 엔진(html2canvas-pro)이 catch-all 'vendor' 로 들어가는
          // 바람에 첫 로드 preload 목록이 3.4KB → 254KB 로 불었다.
          // undefined 를 돌려주면 Rollup 이 알아서 별도 async 청크로 뗀다.
          if (id.includes('html2canvas')) return undefined;

          // `@capacitor-firebase/authentication` 도 마찬가지다 — 네이티브
          // 로그인에서만 동적으로 받는다. 그런데 이 경로 안에는 문자열
          // `firebase/auth` 가 그대로 들어 있어("@capacitor-firebase/
          // authentication") 아래 vendor-auth 규칙에 걸린다. 실제로 걸려서
          // 첫 로드 청크가 124KB → 174KB 로 불었다. firebase 규칙보다
          // **먼저** 걸러 낸다.
          if (id.includes('@capacitor-firebase')) return undefined;

          // Firestore 는 저장/조회 화면에서만, Functions 는 일정 생성에서만
          // 쓰이므로 인증과 분리해 두면 캐시 무효화 범위가 좁아진다.
          //
          // `re2js` 는 firebase 11 부터 `@firebase/firestore` 가 끌어오는
          // 정규식 엔진이다(144KB). 이름이 `firebase` 를 안 담고 있어 아래
          // catch-all 'vendor' 로 떨어지는데, 그 청크는 **첫 로드에서
          // preload 된다**(idb 가 거기 있고 인증이 그것을 쓴다). 실제로
          // 10 → 12 업그레이드 직후 preload 목록이 3.4KB → 147KB 로 불었다.
          // 쓰는 쪽과 같은 청크로 보내면 저장 화면에 들어간 사람만 받는다.
          if (id.includes('@firebase/firestore') || id.includes('firebase/firestore') || id.includes('re2js')) return 'vendor-firestore';
          if (id.includes('@firebase/functions') || id.includes('firebase/functions')) return 'vendor-functions';
          if (id.includes('@firebase/auth') || id.includes('firebase/auth')) return 'vendor-auth';
          if (id.includes('@firebase') || id.includes('firebase')) return 'vendor-firebase-core';
          if (id.includes('@googlemaps')) return 'vendor-maps';
          return 'vendor';
        }
      }
    }
  }
});
