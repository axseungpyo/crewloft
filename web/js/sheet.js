// 아래에서 올라오는 시트(결정 87) — 사무실 말풍선 · 확인할 것 줄 · 문서 줄이 모두 이 시트 하나로 열린다.
// 카드 상자 없이 면 하나 + 선 · 여백. 손잡이 · 닫기 · Esc로 닫는다. 사무실 위에서는 가림막 없이(3D를 계속 만질 수 있게), 목록 화면에서는 가림막과 함께
import { html, useEffect } from './lib.js';
import { ic } from './icons.js';

export function BottomSheet({ title, sub, onClose, children, scrim = false, cls = '' }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape' && !e.target.closest?.('textarea, input')) onClose(); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  const sheet = html`<section class=${`bsheet ${cls}`} role="dialog" aria-label=${title}>
    <button class="bs-grip" onClick=${onClose} aria-label="닫기"></button>
    <header class="bs-h"><h2>${title}</h2>${sub && html`<span class="bs-sub">${sub}</span>`}<button class="icon-btn bs-x" onClick=${onClose} aria-label="닫기">${ic('x', 18)}</button></header>
    ${children}
  </section>`;
  return scrim ? html`<div class="bs-scrim" onClick=${(e) => e.target === e.currentTarget && onClose()}>${sheet}</div>` : sheet;
}

/** 시트 안 한 덩이 — 위 선 하나로 나눈다 */
export const Sec = ({ children, cls = '' }) => html`<div class=${`bs-sec ${cls}`}>${children}</div>`;

/** 이미 끝난 일 한 줄(체크 + 글) */
export const Was = ({ children }) => html`<p class="bs-was">${ic('check', 16)}<span>${children}</span></p>`;

/** 상태 = 아이콘 + 낱말 + 색(배지 바탕 없이) */
export const StWord = ({ st, word, title }) => html`<span class=${`pill bare st-${st}`} title=${title ?? ''}>${word}</span>`;
