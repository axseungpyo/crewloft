// 공개 화면(결정 74) — 주소(pathname)로 화면을 고른다. 홈 · 회원가입 · 로그인 · 비밀번호 · 이메일 확인 · 임시 구글 로그인 · 약관 · 404
import { html, render, useEffect, useState } from '../lib.js';
import { Home } from './home.js';
import { Forgot, GoogleMock, Login, Reset, Signup, Verify } from './auth.js';
import { Privacy, Terms } from './docs.js';
import { Footer, Header } from './common.js';

function NotFound({ me }) {
  return html`<div class="site"><${Header} me=${me} /><div class="nf"><div><b>404</b><h1>페이지를 찾을 수 없어요</h1><p class="sub">주소가 바뀌었거나 잘못 입력됐을 수 있어요.</p>
    <div class="row"><a class="btn" href="/home">홈으로</a><a class="btn pri" href=${me?.mode === 'local' ? '/' : '/app'}>내 사무실</a></div></div></div><${Footer} /></div>`;
}

const PAGES = { '/': Home, '/home': Home, '/login': Login, '/signup': Signup, '/forgot': Forgot, '/reset': Reset, '/verify': Verify, '/auth/google': GoogleMock, '/terms': Terms, '/privacy': Privacy };

function Site() {
  const [me, setMe] = useState(null);
  useEffect(() => { fetch('/api/account/me').then((r) => r.json()).then(setMe).catch(() => setMe({ mode: 'local' })); }, []);
  const Page = PAGES[location.pathname] ?? NotFound;
  return html`<${Page} me=${me} />`;
}

render(html`<${Site} />`, document.getElementById('root'));
