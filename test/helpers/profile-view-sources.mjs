import { readFileSync } from 'node:fs';

/** 프로필 화면을 이루는 소스 파일. 화면 클래스가 마지막에 와야 이어 붙여 실행할 수 있다. */
export const PROFILE_VIEW_FILES = [
  'src/domains/profile/ui/profile-public-course.js',
  'src/domains/profile/ui/profile-template.js',
  'src/domains/profile/ui/profile-trips.js',
  'src/domains/profile/ui/profile-trip-duplicate.js',
  'src/domains/profile/ui/profile-security.js',
  'src/domains/profile/ui/profile-view.js',
];

/** 화면을 이루는 파일을 전부 이어 붙인 소스. */
export const readProfileViewSource = () => PROFILE_VIEW_FILES
  .map(file => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')).join('\n');
