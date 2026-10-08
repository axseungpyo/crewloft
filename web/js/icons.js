// 아이콘 — 브랜드 B(brand.md §3-3): 24칸 격자 · 2px 선 · 둥근 끝, 채움 없음. 이모지 아이콘을 대신한다.
// 직접 그린 모양이라 외부 라이선스가 없다. 새 아이콘도 이 파일에만 더한다.
import { html } from './lib.js';

export const ICONS = {
  // 왼쪽 막대
  office: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7.5h1.5M13.5 7.5H15M9 11.5h1.5M13.5 11.5H15M10 21v-4h4v4"/>',
  decisions: '<path d="M4 13 6.4 5.6A2 2 0 0 1 8.3 4.2h7.4a2 2 0 0 1 1.9 1.4L20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20"/>',
  work: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  company: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3a6.5 6.5 0 0 1 3.5 5.7"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  // 상태 · 표시
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M10.3 4.2 2.7 17.5a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7.5 5v14l11-7z"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  circle: '<circle cx="12" cy="12" r="7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.4M12 17h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  stamp: '<path d="M9.5 12.5V9a2.5 2.5 0 1 1 5 0v3.5"/><path d="M5 14.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V17H5zM6.5 20.5h11"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7.5 3v2.5c0 2.5 4.5 4 4.5 6.5 0-2.5 4.5-4 4.5-6.5V3M7.5 21v-2.5c0-2.5 4.5-4 4.5-6.5 0 2.5 4.5 4 4.5 6.5V21"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 1.5M10 2.5h4"/>',
  trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5V8a3 3 0 0 0 3 3M16 6.5h3V8a3 3 0 0 1-3 3M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  // 일 · 문서
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  checklist: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
  text: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  map: '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 11h10.6l2-8H6.3"/>',
  book: '<path d="M5 5a2 2 0 0 1 2-2h12v14H7a2 2 0 0 0-2 2z"/><path d="M5 19a2 2 0 0 0 2 2h12v-4"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l.9-4.1A8 8 0 1 1 20 12z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  send: '<path d="M21 3 10 14M21 3l-6.5 18-4.5-7-7-4.5z"/>',
  repeat: '<path d="M4 11a7 7 0 0 1 12.5-4.3L19 9M19 4v5h-5M20 13a7 7 0 0 1-12.5 4.3L5 15M5 20v-5h5"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  share: '<path d="M7 17 17 7M9 7h8v8"/>',
  thumb: '<path d="M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 2.6 2.3L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 6.9a2 2 0 0 1-2 1.8H7"/>',
  // 사무실 보기
  city: '<path d="M3 21h18M5 21V10h5v11M10 21V4h6v17M16 21v-8h4v8"/>',
  block: '<path d="M3 21h18M4.5 21v-7l3.5-3 3.5 3v7M12.5 21V9l3.5-3 3.5 3v12"/>',
  room: '<path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14 12h.01"/>',
  desk: '<path d="M3 8h18M5 8v12M19 8v12M13 8v6h6"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  pip: '<rect x="3" y="5" width="18" height="13" rx="2"/><rect x="12" y="11" width="6" height="4" rx="1"/>',
  rotL: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotR: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  build: '<path d="M9.5 4h5L19 19H5z"/><path d="M7.4 11.5h9.2M3 19.5h18"/>',
  // 설정
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M13.5 9.5l2 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  data: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  computer: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.6a4.5 4.5 0 0 1-.5 9.4z"/>',
  // 실적 자원(서버 /api/meta의 이모지 대신 열쇠 이름으로)
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1v.1h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.7 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r=".6"/><circle cx="10" cy="7.5" r=".6"/><circle cx="15" cy="7.5" r=".6"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 3 8 7 9.5 4-1.5 7-5.2 7-9.5V6z"/>',
  megaphone: '<path d="M3 10.5v3h4l9 5V5.5l-9 5z"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5M7 13.5 8.5 19.5H11"/>',
  nib: '<path d="m4 20 1-4L16 5l3 3L8 19z"/><path d="M14 20h6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  hash: '<path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18"/>',
};

/** 실적 자원 열쇠 → 아이콘 이름 */
export const RES_ICON = { insight: 'bulb', draft: 'pencil', design: 'palette', trust: 'shield', promo: 'megaphone', polish: 'nib', scene: 'film', keyword: 'hash' };

const attrs = (s) => `width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
/** 문자열 HTML(3D 이름표 · 마크다운)에 넣을 때 */
export const iconSvg = (n, s = 16) => `<svg class="ico" ${attrs(s)} aria-hidden="true">${ICONS[n] ?? ''}</svg>`;
/** 화면 조각에 넣을 때 — ${ic('check')} */
export const ic = (n, s = 16) => html`<svg class="ico" width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ICONS[n] ?? '' }}></svg>`;
export const resIc = (k, s = 14) => ic(RES_ICON[k] ?? 'dot', s);
