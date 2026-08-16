import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  // GEMINI_ 접두사는 제거되었습니다. Gemini API 키는 Secret Manager 에만 존재하며
  // `generateItinerary` Cloud Function 에서만 사용됩니다. 여기에 다시 추가하면
  // 키가 브라우저 번들에 그대로 노출됩니다.
  envPrefix: ['VITE_'],
});
