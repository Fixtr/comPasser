/** 공유 문서의 값은 HTML이 아니라 텍스트로만 표시한다. 속성에도 같은 함수를 쓴다. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

/** 문서에 들어 있는 링크는 절대 HTTP(S) 주소만 허용한다. */
export function safeHttpUrl(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}
