// 화면 밝기(결정 81 B3) — 기본은 컴퓨터 설정을 따르고, 설정에서 밝게 · 어둡게를 직접 고를 수 있다.
// 2D 화면에만 적용된다. 3D 조명 · 하늘은 지금처럼 사무실 시간대를 따른다.
// 고른 값은 이 브라우저에만 남는다(index.html · site.html 머리의 짧은 스크립트가 첫 그림 전에 읽는다).
const KEY = 'ao-theme';
export const THEMES = [['system', '컴퓨터 설정 따름'], ['light', '밝게'], ['dark', '어둡게']];

export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch { return 'system'; }
}

export function setTheme(t) {
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  try { if (t === 'light' || t === 'dark') localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch { /* 저장소를 못 쓰면 이번만 */ }
}
