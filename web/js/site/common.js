// 공개 화면 공통 — 이름(가칭) · 머리글 · 바닥글 · 이동
import { html, SOURCE_URL } from '../lib.js';

/** 서비스 이름은 가칭 — 사용자가 추후 결정(2026-10-04) */
export const BRAND = 'Agent Office';
export const nav = (to) => { location.href = to; };
export const nextOf = () => { const n = new URLSearchParams(location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/app'; };

export function Header({ me }) {
  const local = me?.mode === 'local';
  return html`<header class="s-head"><div class="wrap">
    <a class="s-logo" href=${local ? '/home' : '/'}><i>AO</i><span>${BRAND} <small>가칭</small></span></a>
    <nav class="s-nav"><a href="/home#how">어떻게 돌아가나</a><a href="/home#samples">첫 주 결과물</a><a href="/home#pricing">요금</a><a href="/home#faq">자주 묻는 질문</a></nav>
    <span class="sp"></span>
    ${me?.account ? html`<a class="btn pri" href="/app">내 사무실 열기</a>`
      : html`<a class="btn" href="/login">로그인</a><a class="btn pri" href="/signup">무료로 시작</a>`}
  </div></header>
  ${local && html`<div class="localbar">지금은 <b>로컬 모드</b>예요 — 계정 없이 바로 써요. 이 화면들은 공개 서비스의 미리보기예요. <a href="/">내 사무실 열기 →</a></div>`}`;
}

export function Footer() {
  return html`<footer class="s-foot"><div class="wrap"><span>© ${new Date().getFullYear()} ${BRAND}(가칭)</span><a href="/terms">이용약관</a><a href="/privacy">개인정보 처리방침</a><a href=${SOURCE_URL} target="_blank" rel="noopener">소스 코드(AGPL-3.0)</a><span class="sp"></span><span>대표님 확인 없이 밖으로 나가는 일은 없어요.</span></div></footer>`;
}

