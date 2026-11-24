// Hangul syllables are compared as the keys that type them, so a half-composed syllable still matches:
// 붓 (ㅂㅜㅅ) is on the way to 부산 (ㅂㅜㅅㅏㄴ), 성 to 서울 and 우 to 워싱턴.
const INITIAL = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const MEDIAL = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const FINAL = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const keys = word => [...word].map(letter => {
  const code = letter.charCodeAt(0) - 0xAC00;
  return code < 0 || code > 11171 ? letter : INITIAL[Math.floor(code / 588)] + MEDIAL[Math.floor(code % 588 / 28)] + FINAL[code % 28];
}).join('');
const words = text => String(text ?? '').normalize('NFC').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(keys);

/**
 * Cities whose name (from `nameOf(city)`) starts with `query` at the beginning of any word, ignoring case,
 * spaces and punctuation. Names that match from their first word come first; otherwise the list order is kept.
 */
export function searchCities(query, cities, nameOf) {
  const typed = words(query).join('');
  if (!typed) return [];
  const rank = city => {
    const name = words(nameOf(city));
    const at = name.findIndex((_, index) => name.slice(index).join('').startsWith(typed));
    return at < 0 ? 2 : Math.min(at, 1);
  };
  return cities.map(city => [rank(city), city]).filter(([order]) => order < 2).sort((a, b) => a[0] - b[0]).map(([, city]) => city);
}
