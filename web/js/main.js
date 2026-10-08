import { ApiError, act, aiName, api, bus, connectLive, go, html, loadMeta, render, useApi, useEffect, useLive, useRoute, useState } from './lib.js';
import { Onboarding } from './screens/onboarding.js';
import { Office } from './screens/office.js';
import { Decisions } from './screens/decisions.js';
import { Work } from './screens/work.js';
import { Company } from './screens/company.js';
import { Settings } from './screens/settings.js';
import { ReturnSummary } from './screens/summary.js';
import { startTimekeeper } from './timekeeper.js';
import { ic } from './icons.js';

// 메뉴 세 개(결정 87) — 사무실 · 확인할 것 · 문서. 회사 · 설정은 회사 이름을 누르면 나오는 메뉴 뒤로
const MENU = [
  { key: 'office', label: '사무실', icon: 'office' },
  { key: 'decisions', label: '확인할 것', icon: 'decisions' },
  { key: 'docs', label: '문서', icon: 'note' },
];
const MORE = [
  { key: 'company', label: '회사', icon: 'company', note: '직원 · 회사 지식 · 사업 설계도' },
  { key: 'settings', label: '설정', icon: 'settings', note: 'AI 연결 · 사용 한도 · 화면 밝기' },
];
/** 옛 주소 → 새 자리(결정 87). #/work/… · #/content/… 는 문서, 문서 하나(#/work/docs/:id)는 그 문서를 연다. #/decisions/… 는 그대로 확인할 것 */
function resolve(route) {
  const [menu, ...rest] = route;
  if (menu === 'work' || menu === 'content') return ['docs', rest[0] === 'board' ? 'week' : rest[0], rest[1]];
  return [menu, ...rest];
}

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (await act(() => api('POST', '/api/login', { password: pw }))) onDone();
  };
  return html`<div class="login"><form class="card stack" onSubmit=${submit}>
    <h1>Agent Office</h1><p class="sub">사무실 소유자 비밀번호를 입력해 주세요.</p>
    <input class="in" type="password" autofocus value=${pw} onInput=${(e) => setPw(e.target.value)} placeholder="비밀번호"/>
    <button class="btn pri big">들어가기</button></form></div>`;
}

function LiveBadge() {
  const live = useLive();
  useEffect(() => { document.body.classList.toggle('stale', !live.on); }, [live.on]);
  const t = live.lastOk ? `${String(live.lastOk.getHours()).padStart(2, '0')}:${String(live.lastOk.getMinutes()).padStart(2, '0')}:${String(live.lastOk.getSeconds()).padStart(2, '0')}` : '없음';
  return html`<span class=${`live ${live.on ? 'on' : 'off'}`} title=${live.on ? '서버와 실시간 연결됨' : '연결이 끊겼어요 — 화면은 마지막으로 확인한 상태예요'}><i></i>${live.on ? '실시간 연결됨' : `끊김 · 마지막 확인 ${t}`}</span>`;
}

/** 회사 이름 메뉴 — 회사 · 설정 · AI 연결 · 일시정지 · 실시간 연결(옛 위 줄 상태 칩 · 왼쪽 기둥 아래를 옮김) */
function CompanyMenu({ state, current, onClose }) {
  const ai = state.ai, paused = state.runner.paused;
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    const c = (e) => { if (!e.target.closest('.co-menu, .co-btn')) onClose(); };
    addEventListener('keydown', k); addEventListener('pointerdown', c);
    return () => { removeEventListener('keydown', k); removeEventListener('pointerdown', c); };
  }, []);
  return html`<div class="co-menu" role="menu">
    ${MORE.map((m) => html`<a role="menuitem" class=${`co-item${current === m.key ? ' on' : ''}`} href=${`#/${m.key}`} onClick=${onClose}>${ic(m.icon, 18)}<span><b>${m.label}</b><small>${m.note}</small></span></a>`)}
    <a role="menuitem" class="co-item" href="#/settings/power" onClick=${onClose}><i class=${`dot st-${ai.status.state}`}></i><span><b>${aiName(ai)}</b><small>${ai.status.state === 'ready' ? '연결됨' : ai.status.detail}${ai.quota.usedPct !== null ? ` · 이번 주 한도 ${ai.quota.usedPct}% 썼어요` : ''}</small></span></a>
    <button role="menuitem" class="co-item" onClick=${() => { act(() => api('POST', '/api/pause', { paused: !paused }), paused ? '다시 시작해요' : '새 업무 시작을 멈췄어요'); onClose(); }}>${ic(paused ? 'play' : 'pause', 18)}<span><b>${paused ? '다시 시작' : '일시정지'}</b><small>${paused ? '지금 멈춤 — 직원들이 새 업무를 시작하지 않아요' : '하던 일만 마무리하고 새 업무는 시작하지 않아요'}</small></span></button>
    <div class="co-foot"><${LiveBadge} /></div>
  </div>`;
}

function Shell({ state }) {
  const route = useRoute();
  const [menu, ...rest] = resolve(route);
  const [more, setMore] = useState(false);
  const current = MENU.some((m) => m.key === menu) || MORE.some((m) => m.key === menu) ? menu : 'office';
  const n = state.counts.decisions;
  let screen;
  if (current === 'office') screen = html`<${Office} state=${state} />`;
  if (current === 'decisions') screen = html`<${Decisions} state=${state} id=${rest[0]} />`;
  if (current === 'docs') screen = html`<${Work} state=${state} tab=${rest[0]} sub=${rest[0] === 'docs' ? rest[1] : undefined} />`;
  if (current === 'company') screen = html`<${Company} state=${state} tab=${rest[0]} id=${rest[1]} />`;
  if (current === 'settings') screen = html`<${Settings} state=${state} room=${rest[0]} />`;
  // 사무실에서 '사무실'을 한 번 더 누르면 보기 도구를 편다
  const navClick = (e, key) => { if (key === 'office' && current === 'office') { e.preventDefault(); document.dispatchEvent(new CustomEvent('ao-office-tools')); } };
  return html`<div class=${`shell on-${current}`}>
    <header class="topbar">
      <div class="co"><button class="co-btn" onClick=${() => setMore(!more)} aria-expanded=${more} aria-haspopup="menu" title="회사 · 설정 · AI 연결 · 일시정지">
        <b>${state.office?.name ?? 'Agent Office'}</b><span>${state.cycle?.label ?? '이번 주 일 전'}${state.runner.paused ? ' · 멈춤' : ''} <i class="chev" aria-hidden="true"></i></span></button>
        ${more && html`<${CompanyMenu} state=${state} current=${current} onClose=${() => setMore(false)} />`}</div>
      <nav class="nav3" aria-label="메뉴">
        ${MENU.map((m) => html`<a class=${`nav3-i${m.key === current ? ' on' : ''}`} href=${`#/${m.key}`} aria-current=${m.key === current ? 'page' : undefined} onClick=${(e) => navClick(e, m.key)}>
          <span class="ic" aria-hidden="true">${ic(m.icon, 22)}</span><span class="lb">${m.label}</span>${m.key === 'decisions' && n > 0 ? html`<b class="n" title=${`대표님 차례 ${n}개`}>${n}</b>` : ''}</a>`)}
      </nav>
    </header>
    <main class="screen">${screen}</main>
    <${ReturnSummary} state=${state} />
  </div>`;
}

function App() {
  const [authNeeded, setAuthNeeded] = useState(false);
  const shell = useApi(authNeeded ? null : '/api/state');
  // 계정 모드면 로그인 화면으로(로그인 뒤 돌아올 곳을 함께), 로컬 모드면 소유자 비밀번호(결정 74)
  useEffect(() => bus.on('auth', () => fetch('/api/account/me').then((r) => r.json()).then((m) => {
    if (m.mode === 'accounts') location.href = `/login?next=${encodeURIComponent(location.pathname + location.hash)}`; else setAuthNeeded(true);
  }).catch(() => setAuthNeeded(true))), []);
  useEffect(() => { const es = connectLive(); return () => es.close(); }, [authNeeded]);
  if (authNeeded || (shell.error instanceof ApiError && shell.error.status === 401)) return html`<${Login} onDone=${() => { setAuthNeeded(false); location.reload(); }} />`;
  if (!shell.data) return html`<div class="boot">${shell.error ? html`<p>서버에 연결하지 못했어요: ${shell.error.message}</p>` : html`<p class="muted">사무실 불러오는 중…</p>`}</div>`;
  const state = shell.data;
  if (state.onboarding !== 'done') return html`<${Onboarding} state=${state} />`;
  return html`<${Shell} state=${state} />`;
}

// 이름표 표(/api/meta)를 먼저 읽는다 — 못 읽어도(로그인 전 등) 기본값으로 그린다
loadMeta().finally(() => render(html`<${App} />`, document.getElementById('root')));
startTimekeeper(); // 대표가 들인 시간(결정 72)
window.addEventListener('keydown', (e) => {
  if (e.altKey && /^[1-3]$/.test(e.key)) go(MENU[Number(e.key) - 1].key);
});
