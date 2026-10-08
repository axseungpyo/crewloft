// 회원가입 · 로그인 · 비밀번호 찾기 · 재설정 · 이메일 확인 · 임시 구글 로그인(결정 74)
import { api, html, useEffect, useState } from '../lib.js';
import { BRAND, Header, nav, nextOf } from './common.js';

const G = html`<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

/** 왼쪽 안내(넓은 화면) + 오른쪽 양식 */
function Shell({ me, children }) {
  return html`<div class="site"><${Header} me=${me} /><div class="auth">
    <aside class="auth-side"><p class="eyebrow">${BRAND}</p><h2>창업, 혼자 시작해도<br/>팀이 있어요.</h2>
      <p>사업을 설명하면 매니저가 설계도를 짜고, AI 팀이 조사 · 계획 · 준비를 나눠 맡아요.</p>
      <ul><li>첫 주에 사업 진단 + 이번 달 실행 계획</li><li>밖으로 나가는 일은 대표님 확인 뒤에만</li><li>언제든 데이터를 내보내고 그만둘 수 있어요</li></ul></aside>
    <main class="auth-main"><div class="auth-card">${children}</div></main></div></div>`;
}

/** 로컬 모드 — 계정 없이 쓰므로 양식은 미리보기로만 */
const LocalNote = ({ me }) => me?.mode === 'local' && html`<div class="formok">지금은 <b>로컬 모드</b>라 계정 없이 바로 써요. 이 화면은 공개 서비스의 미리보기예요 — <a href="/">내 사무실 열기 →</a></div>`;

function useForm(init) {
  const [v, setV] = useState(init), [err, setErr] = useState({}), [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  // 자동 완성처럼 여러 칸이 한꺼번에 바뀌어도 앞 값을 잃지 않게 함수형으로 바꾼다
  const set = (k) => (e) => { const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setV((cur) => ({ ...cur, [k]: val })); setErr((cur) => ({ ...cur, [k]: null })); setMsg(null); };
  const run = async (fn) => { if (busy) return; setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg(e.message || '잠시 뒤 다시 해 주세요'); } finally { setBusy(false); } };
  return { v, set, err, setErr, busy, msg, setMsg, run };
}

function Password({ value, onInput, error, label = '비밀번호', auto = 'current-password', hint }) {
  const [show, setShow] = useState(false);
  return html`<label class="field"><span>${label}</span><div class="pw"><input class="in" type=${show ? 'text' : 'password'} autocomplete=${auto} value=${value} onInput=${onInput} aria-invalid=${error ? 'true' : 'false'} />
    <button type="button" onClick=${() => setShow(!show)} aria-label=${show ? '비밀번호 숨기기' : '비밀번호 보기'}>${show ? '숨기기' : '보기'}</button></div>
    ${error ? html`<small class="err">${error}</small>` : hint && html`<small class="note">${hint}</small>`}</label>`;
}

const GoogleButton = ({ me, label }) => html`<button type="button" class="gbtn" disabled=${me?.mode === 'local'} onClick=${() => nav(`/auth/google?next=${encodeURIComponent(nextOf())}`)}>${G}${label}</button>`;

export function Signup({ me }) {
  const f = useForm({ email: '', password: '', agree: false });
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.v.email.trim())) er.email = '이메일 주소를 확인해 주세요';
    if (f.v.password.length < 8) er.password = '8자 이상으로 정해 주세요';
    if (!f.v.agree) er.agree = '동의가 필요해요';
    if (Object.keys(er).length) { f.setErr(er); return; }
    f.run(async () => { await api('POST', '/api/account/signup', f.v); nav(nextOf()); });
  };
  const full = me?.mode === 'accounts' && me.canSignup === false;
  return html`<${Shell} me=${me}><h1>무료로 시작</h1><p class="sub">1분이면 가입하고 바로 사업을 소개할 수 있어요.</p>
    <${LocalNote} me=${me} />
    ${full && html`<div class="formerr">지금은 한 서버에 계정 하나만 만들 수 있어요(계정별 사무실 준비 중) — <a href="/login">로그인하기</a></div>`}
    <${GoogleButton} me=${me} label="Google로 시작하기" />
    <div class="or">또는 이메일로</div>
    <form class="stack" onSubmit=${submit} novalidate>
      <label class="field"><span>이메일</span><input class="in" type="email" autocomplete="email" value=${f.v.email} onInput=${f.set('email')} aria-invalid=${f.err.email ? 'true' : 'false'} />${f.err.email && html`<small class="err">${f.err.email}</small>`}</label>
      <${Password} value=${f.v.password} onInput=${f.set('password')} error=${f.err.password} auto="new-password" hint="8자 이상" />
      <label class="agree"><input type="checkbox" checked=${f.v.agree} onChange=${f.set('agree')} /><span><a href="/terms" target="_blank">이용약관</a>과 <a href="/privacy" target="_blank">개인정보 처리방침</a>에 동의해요(필수)${f.err.agree ? html` — <b style="color:var(--bad-text)">${f.err.agree}</b>` : ''}</span></label>
      ${f.msg && html`<div class="formerr">${f.msg}</div>`}
      <button class="btn pri submit" disabled=${f.busy || me?.mode === 'local' || full}>${f.busy ? '가입하는 중…' : '가입하기'}</button>
    </form>
    <div class="links"><span>이미 계정이 있나요?</span><a href=${`/login${location.search}`}>로그인</a></div><//>`;
}

export function Login({ me }) {
  const f = useForm({ email: '', password: '' });
  const submit = (e) => {
    e.preventDefault();
    if (!f.v.email.trim() || !f.v.password) { f.setMsg('이메일과 비밀번호를 입력해 주세요'); return; }
    f.run(async () => { await api('POST', '/api/account/login', f.v); nav(nextOf()); });
  };
  return html`<${Shell} me=${me}><h1>다시 오셨네요</h1><p class="sub">로그인하면 하던 사무실로 바로 가요.</p>
    <${LocalNote} me=${me} />
    <${GoogleButton} me=${me} label="Google로 계속하기" />
    <div class="or">또는 이메일로</div>
    <form class="stack" onSubmit=${submit} novalidate>
      <label class="field"><span>이메일</span><input class="in" type="email" autocomplete="email" value=${f.v.email} onInput=${f.set('email')} /></label>
      <${Password} value=${f.v.password} onInput=${f.set('password')} />
      ${f.msg && html`<div class="formerr">${f.msg}</div>`}
      <button class="btn pri submit" disabled=${f.busy || me?.mode === 'local'}>${f.busy ? '로그인하는 중…' : '로그인'}</button>
      <p class="note">로그인은 30일 동안 유지돼요.</p>
    </form>
    <div class="links"><a href="/forgot">비밀번호를 잊었어요</a><a href=${`/signup${location.search}`}>회원가입</a></div><//>`;
}

/** 메일 발송 서비스가 정해지기 전 — 개발 환경에서만 보낸 링크를 보여 준다 */
function DevMail({ kind }) {
  const [mail, setMail] = useState(null);
  useEffect(() => { fetch('/api/account/outbox').then((r) => (r.ok ? r.json() : [])).then((list) => setMail(list.find((m) => m.kind === kind) ?? null)).catch(() => {}); }, []);
  return mail && html`<div class="devmail">개발용 — 메일 대신 여기 링크를 보여 줘요: <a href=${mail.link}>${location.origin}${mail.link}</a></div>`;
}

export function Forgot({ me }) {
  const f = useForm({ email: '' });
  const [sent, setSent] = useState(false);
  const submit = (e) => { e.preventDefault(); f.run(async () => { await api('POST', '/api/account/forgot', f.v); setSent(true); }); };
  return html`<${Shell} me=${me}><h1>비밀번호 찾기</h1><p class="sub">가입한 이메일로 재설정 링크를 보내 드려요(30분 동안 한 번).</p>
    <${LocalNote} me=${me} />
    ${sent ? html`<div class="formok">메일을 보냈어요. 가입된 이메일이면 곧 도착해요 — 스팸함도 확인해 주세요.</div><${DevMail} kind="reset" />`
      : html`<form class="stack" onSubmit=${submit} novalidate>
        <label class="field"><span>이메일</span><input class="in" type="email" autocomplete="email" value=${f.v.email} onInput=${f.set('email')} /></label>
        ${f.msg && html`<div class="formerr">${f.msg}</div>`}
        <button class="btn pri submit" disabled=${f.busy || me?.mode === 'local'}>${f.busy ? '보내는 중…' : '재설정 링크 보내기'}</button></form>`}
    <div class="links"><a href="/login">로그인으로</a></div><//>`;
}

export function Reset({ me }) {
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const f = useForm({ password: '', again: '' });
  const [done, setDone] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (f.v.password.length < 8) { f.setErr({ password: '8자 이상으로 정해 주세요' }); return; }
    if (f.v.password !== f.v.again) { f.setErr({ again: '두 비밀번호가 달라요' }); return; }
    f.run(async () => { await api('POST', '/api/account/reset', { token, password: f.v.password }); setDone(true); });
  };
  return html`<${Shell} me=${me}><h1>새 비밀번호 정하기</h1>
    ${!token ? html`<div class="formerr">링크가 올바르지 않아요 — <a href="/forgot">다시 요청하기</a></div>`
      : done ? html`<div class="formok">비밀번호를 바꿨어요. 다른 기기의 로그인은 모두 끊었어요.</div><a class="btn pri submit" href="/login">로그인하기</a>`
        : html`<form class="stack" onSubmit=${submit} novalidate>
          <${Password} label="새 비밀번호" value=${f.v.password} onInput=${f.set('password')} error=${f.err.password} auto="new-password" hint="8자 이상" />
          <${Password} label="한 번 더" value=${f.v.again} onInput=${f.set('again')} error=${f.err.again} auto="new-password" />
          ${f.msg && html`<div class="formerr">${f.msg} — <a href="/forgot">다시 요청하기</a></div>`}
          <button class="btn pri submit" disabled=${f.busy}>${f.busy ? '바꾸는 중…' : '비밀번호 바꾸기'}</button></form>`}<//>`;
}

export function Verify({ me }) {
  const token = new URLSearchParams(location.search).get('token') ?? '';
  const [st, setSt] = useState({ busy: true, err: null });
  useEffect(() => { api('POST', '/api/account/verify', { token }).then(() => setSt({ busy: false, err: null })).catch((e) => setSt({ busy: false, err: e.message })); }, []);
  return html`<${Shell} me=${me}><h1>이메일 확인</h1>
    ${st.busy ? html`<p class="sub">확인하는 중…</p>` : st.err ? html`<div class="formerr">${st.err}</div>` : html`<div class="formok">이메일을 확인했어요.</div><a class="btn pri submit" href="/app">내 사무실로</a>`}<//>`;
}

/** 구글 로그인 — 임시 계정 선택 화면. 실제 Google 연동(OpenID Connect)은 Google 앱을 등록한 뒤(H3) */
export function GoogleMock({ me }) {
  const f = useForm({ email: '', name: '' });
  const submit = (e) => { e.preventDefault(); f.run(async () => { await api('POST', '/api/account/google-mock', f.v); nav(nextOf()); }); };
  return html`<${Shell} me=${me}><div class="mock-google">
    <div class="row">${G}<b>Google 계정으로 계속</b></div>
    <div class="ribbon">임시 화면이에요 — 실제 Google 연동 전에 흐름만 확인해요. 비밀번호는 묻지 않고, Google에 아무것도 보내지 않아요.</div>
    <${LocalNote} me=${me} />
    <form class="stack" onSubmit=${submit} novalidate>
      <label class="field"><span>Google 이메일</span><input class="in" type="email" autocomplete="email" placeholder="you@gmail.com" value=${f.v.email} onInput=${f.set('email')} /></label>
      <label class="field"><span>이름(선택)</span><input class="in" value=${f.v.name} onInput=${f.set('name')} /></label>
      ${f.msg && html`<div class="formerr">${f.msg}</div>`}
      <button class="btn pri submit" disabled=${f.busy || me?.mode === 'local' || me?.google?.mock === false}>${f.busy ? '들어가는 중…' : '계속'}</button>
    </form>
    <a href="/login" class="note">취소하고 돌아가기</a></div><//>`;
}
