// S7 설정(결정 52) — 2D 화면은 기능 이름만(결정 81 B2 ①): 연결된 앱 · AI 연결 · 실행 환경 · 게시 확인 · 알림 · 데이터.
// 비유 이름(열쇠함 · 전력실 …)은 3D 시설 이름에만 남는다. 주소(#/settings/keys …)는 그대로 둔다.
import { act, aiName, api, go, html, platformLabel, SOURCE_URL, usd, useApi, useEffect, useState, when } from '../lib.js';
import { FacLock, hasFac } from '../facility.js';
import { BudgetCard, RunsVerify } from '../agentops.js';
import { THEMES, getTheme, setTheme } from '../theme.js';
import { ic } from '../icons.js';

const ROOMS = [
  ['keys', 'key', '연결된 앱', '저장 · 알림 · 게시에 쓰는 앱'], ['power', 'bolt', 'AI 연결 · 사용 한도', '팀이 일할 때 쓰는 AI와 한도'], ['building', 'computer', '실행 환경', '어디서 돌아가는지 · 매주 시작 예약'],
  ['approval', 'stamp', '게시 확인', '밖으로 나가기 전에 확인하는 방식'], ['mail', 'bell', '알림', '무엇을 어디로 알릴지'], ['storage', 'data', '데이터', '저장 위치 · 내보내기'],
];
const GROUP = { save: '저장', notify: '알림', publish: '게시', image: '이미지' };
const ST = { connected: '연결됨', needs_reauth: '다시 연결 필요', error: '오류', disconnected: '연결 안 됨' };

/** 손볼 곳 — 설정 맨 위 알림 상자(예전 메모지 · 테이프 장식은 없앰, brand.md D5) */
function Notice({ state, conns }) {
  const notes = [];
  for (const c of conns ?? []) {
    if (c.status === 'needs_reauth' || c.status === 'error') notes.push([`${c.label}: ${ST[c.status]}${c.lastError ? ` — ${c.lastError}` : ''}`, 'keys']);
    if (c.expiresAt && Date.parse(c.expiresAt) - Date.now() < 7 * 86400000 && c.status === 'connected') notes.push([`${c.label} 연결이 ${when(c.expiresAt)}에 끝나요 — 미리 다시 연결해 주세요`, 'keys']);
  }
  if (state.ai.status.state !== 'ready') notes.push([`AI 연결: ${state.ai.status.detail}`, 'power']);
  if (!state.publish.live) notes.push(['지금은 연습 게시예요 — 승인해도 밖으로 올리지 않아요', 'approval']);
  if (!state.schedule.weekly) notes.push(['매주 일을 자동으로 시작하는 예약이 없어요 — 실행 환경에서 정해요', 'building']);
  if (!notes.length) return null;
  return html`<div class="card notice"><b>손볼 곳 ${notes.length}개</b><ul>${notes.map(([t, room]) => html`<li><a href=${`#/settings/${room}`}>${t}</a></li>`)}</ul></div>`;
}

function Keys({ conns, state }) {
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({});
  const cur = conns.find((c) => c.app === sel);
  useEffect(() => { if (cur) setForm(Object.fromEntries(cur.fields.map((f) => [f.key, f.value]))); }, [sel]);
  const save = () => {
    const config = {}, secret = {};
    for (const f of cur.fields) (f.secret ? secret : config)[f.key] = form[f.key] ?? '';
    act(() => api('POST', `/api/connections/${cur.app}`, { config, secret }), cur.app === 'gdocs' ? '저장했어요 — 이제 “Google로 연결”을 눌러요' : '연결했어요');
  };
  const google = async () => { const r = await act(() => api('GET', '/api/oauth/google/start')); if (r?.url) window.open(r.url, '_blank', 'noopener'); };
  return html`<div class="keys">
    <div class="hooks">${Object.entries(GROUP).map(([g, label]) => html`<div class="hook"><h3>${label}</h3><div class="row">
      ${conns.filter((c) => c.group === g).map((c) => html`<button class=${`tagkey st-${c.status}${sel === c.app ? ' on' : ''}`} onClick=${() => setSel(c.app)}>
<b>${c.label}</b><small>${ST[c.status]}${c.status === 'needs_reauth' || c.status === 'error' ? ' !' : ''}</small></button>`)}</div></div>`)}</div>
    ${cur ? html`<div class="card keydetail stack">
      <div class="row"><h2>${cur.label}</h2><span class=${`pill st-${cur.status}`}>${ST[cur.status]}</span>${cur.account && html`<span class="muted">${cur.account}</span>`}</div>
      <p class="note">${cur.how}</p>
      ${cur.oauth && html`<p class="note">리디렉션 URI: <code>${cur.oauth.redirectUri}</code></p>`}
      ${cur.fields.map((f) => html`<label class="f">${f.label}<input class="in" type=${f.secret ? 'password' : 'text'} value=${form[f.key] ?? ''} placeholder=${f.secret && f.saved ? '저장됨(바꿀 때만 입력)' : f.placeholder ?? ''} onInput=${(e) => setForm({ ...form, [f.key]: e.target.value })}/>${f.help && html`<small class="muted">${f.help}</small>`}</label>`)}
      ${cur.expiresAt && html`<p class="note">토큰 만료: ${when(cur.expiresAt)}</p>`}
      ${cur.affected > 0 && html`<p class="note">이 연결을 쓰는 예약·실패 ${cur.affected}건</p>`}
      <p class="honest">연결은 게시 승인이 아니에요. 연결을 해제해도 이미 만든 외부 문서·게시물은 지우지 않아요. 비밀값은 암호화해 저장하고 화면에 다시 보여주지 않아요.</p>
      <div class="row"><button class="btn pri" onClick=${save}>${cur.status === 'connected' ? '저장·다시 확인' : '연결'}</button>
        ${cur.app === 'gdocs' && html`<button class="btn" onClick=${google}>Google로 연결</button>`}
        ${cur.status !== 'disconnected' && html`<button class="btn" onClick=${() => act(() => api('POST', `/api/connections/${cur.app}/test`), cur.app === 'slack' ? '테스트 알림을 보냈어요' : '연결을 확인했어요')}>${cur.app === 'slack' ? '테스트 알림' : '연결 확인'}</button>`}
        <span class="sp"></span>${cur.status !== 'disconnected' && html`<button class="btn danger" onClick=${() => act(() => api('DELETE', `/api/connections/${cur.app}`), '연결을 해제했어요')}>연결 해제</button>`}</div>
      ${(cur.app === 'ghost' || cur.app === 'wordpress') && html`<label class="f">블로그 게시 대상<select class="in" value=${state.publish.blogTarget ?? ''} onChange=${(e) => act(() => api('POST', '/api/settings/publish', { blogTarget: e.target.value || null }))}>
        <option value="">연결된 것 자동</option><option value="ghost">Ghost</option><option value="wordpress">WordPress</option></select></label>`}
    </div>` : html`<p class="empty">앱을 누르면 연결을 관리할 수 있어요.</p>`}
  </div>`;
}

function Power({ state }) {
  const ai = state.ai;
  const total = state.employees.reduce((a, e) => a + e.usageWeek.runs, 0);
  return html`<div class="stack">
    <div class="gauge card"><h3>이번 주 사용</h3><b>${ai.quota.usedPct !== null ? `${ai.quota.usedPct}%` : `${ai.usageWeek.runs}회`}</b>
      <p class="note">${ai.quota.note}${ai.usageWeek.costUsd ? ` · API 환산 ${usd(ai.usageWeek.costUsd)}(추정, 실제 청구액 아님)` : ''}${ai.weeklyBudgetUsd !== null ? ` · 주간 상한 ${usd(ai.weeklyBudgetUsd)}` : ''}</p>
      <div class="shares">${state.employees.map((e) => html`<span><b>${e.name}</b> ${total ? Math.round((e.usageWeek.runs / total) * 100) : 0}%</span>`)}</div></div>
    <div class="gens">${ai.options.map((o) => html`<button class=${`gen${o.id === ai.id ? ' on' : ''}`} onClick=${() => act(() => api('POST', '/api/ai', { provider: o.id }), 'AI 연결을 바꿨어요')}><span class="lamp"></span><b>${aiName(o)}</b>
      <small>${o.id === ai.id ? `${{ ready: '켜져 있어요', needs_login: '로그인이 필요해요', unavailable: '쓸 수 없어요', unknown: '확인이 필요해요' }[ai.status.state]} — ${ai.status.detail}` : '쓰지 않음 — 누르면 바꿔요'}</small></button>`)}
      <div class="gen off"><span class="lamp"></span><b>Codex 구독</b><small>나중에 연결할 수 있어요</small></div>
      <div class="gen off"><span class="lamp"></span><b>API 키(쓴 만큼 내는 방식)</b><small>나중에 연결할 수 있어요</small></div></div>
    ${ai.policy && html`<p class="note">${ai.policy}</p>`}
    <div class="plate">${ic('lock')} 고정 안전 규칙 — 한도에 닿으면 그 업무만 쉬어요. 다른 AI로 자동 전환하거나 추가 과금하지 않아요.</div>
    <${BudgetCard} employees=${state.employees} />
    <${RunsVerify} />
    <div class="row"><button class="btn sm" onClick=${() => act(() => api('GET', '/api/ai/status'), '다시 확인했어요')}>연결 다시 확인</button><a class="btn sm quiet" href="#/company/employees">직원마다 AI 정하기</a></div>
    ${hasFac(state, 'power') ? html`<${UsageLog} />` : html`<${FacLock} state=${state} fkey="power" />`}
  </div>`;
}

/** AI 연결 장비 Lv2 — 최근 AI 실행 기록 */
function UsageLog() {
  const rows = useApi('/api/usage/log').data ?? [];
  return html`<div class="card usage-log"><h3>AI 사용 기록 <small class="muted">최근 ${rows.length}건 · AI 연결 장비 레벨 2</small></h3>
    <table><thead><tr><th>언제</th><th>누가</th><th>무엇</th><th>종류</th><th>토큰</th><th>API 환산</th></tr></thead><tbody>
    ${rows.map((u) => html`<tr><td>${when(u.at)}</td><td>${u.who ?? '—'}</td><td>${u.what}</td><td>${u.kind}</td><td>${u.tokens ?? '—'}</td><td>${u.costUsd != null ? `${usd(u.costUsd)}${u.estimated ? '(추정)' : ''}` : '—'}</td></tr>`)}
    ${!rows.length && html`<tr><td colspan="6" class="muted">아직 기록이 없어요.</td></tr>`}</tbody></table>
    <p class="note">견본 AI는 토큰 · 비용을 재지 않아요. 구독 한도 %는 AI 프로그램이 알려 주지 않아 적지 않아요.</p></div>`;
}

function Building({ state, s }) {
  const [day, setDay] = useState(state.schedule.weekly?.weekday ?? 1);
  const [time, setTime] = useState(state.schedule.weekly ? `${String(state.schedule.weekly.hour).padStart(2, '0')}:${String(state.schedule.weekly.minute).padStart(2, '0')}` : '09:00');
  const [pw, setPw] = useState('');
  const [pub, setPub] = useState(s.appPublicBase ?? '');
  const [media, setMedia] = useState(s.mediaPublicBase ?? '');
  return html`<div class="stack">
    <div class="places"><div class="card place on"><b>${ic('computer')} 이 컴퓨터</b><small>실행 중 · ${s.host}:${s.port} · 화면을 닫아도 이 컴퓨터가 켜져 있으면 일해요</small></div>
      <div class="card place"><b>${ic('cloud')} 내 서버(VPS)</b><small>아직 준비 중이에요. 옮기는 방법은 docs/tech/vps-deployment.md에 있어요.</small></div></div>
    <div class="card stack"><h3>매주 일 시작 예약</h3><div class="row"><select class="in" style="width:auto" value=${day} onChange=${(e) => setDay(Number(e.target.value))}>${['월', '화', '수', '목', '금', '토', '일'].map((d, i) => html`<option value=${i + 1}>${d}요일</option>`)}</select>
      <input class="in" style="width:auto" type="time" value=${time} onInput=${(e) => setTime(e.target.value)}/>
      <button class="btn pri sm" onClick=${() => { const [h, m] = time.split(':').map(Number); act(() => api('POST', '/api/schedule', { weekday: day, hour: h, minute: m }), '예약했어요'); }}>예약하기</button>
      ${state.schedule.weekly && html`<button class="btn sm quiet" onClick=${() => act(() => api('DELETE', '/api/schedule'), '예약을 껐어요')}>끄기</button>`}</div>
      <p class="note">${state.schedule.text ? `${state.schedule.text} — 다음은 ${when(state.schedule.nextRunAt)}` : '아직 예약이 없어요'}. 컴퓨터가 꺼져 있던 동안 놓친 예약은 다시 켜질 때 한 번만 해요.</p></div>
    <div class="card stack"><h3>전체 일시정지</h3><p class="note">새 업무를 시작하지 않아요. 진행 중인 업무만 마무리해요.</p>
      <button class="btn" onClick=${() => act(() => api('POST', '/api/pause', { paused: !state.runner.paused }))}>${state.runner.paused ? html`${ic('play')} 다시 시작` : html`${ic('pause')} 일시정지`}</button></div>
    <div class="card stack"><h3>로그인 비밀번호</h3><p class="note">${s.authEnabled ? '켜져 있어요 — 화면을 열 때 비밀번호가 필요해요.' : '꺼져 있어요 — 이 컴퓨터에서만 열 수 있어요. 밖에서 들어오는 서버(VPS)에서는 꼭 켜 주세요.'}</p>
      <div class="row"><input class="in" type="password" style="max-width:240px" placeholder="8자 이상" value=${pw} onInput=${(e) => setPw(e.target.value)}/><button class="btn sm" onClick=${() => act(() => api('POST', '/api/auth/password', { password: pw }), '비밀번호를 정했어요')}>비밀번호 정하기</button>
        ${s.authEnabled && html`<button class="btn sm quiet" onClick=${() => act(() => api('POST', '/api/auth/password', { password: null }), '비밀번호를 껐어요')}>끄기</button>`}</div></div>
    <div class="card stack"><h3>공개 주소(선택)</h3><p class="note">Slack 알림의 링크와 Google 연결이 돌아올 앱 주소, Threads 이미지에 필요한 공개 미디어 주소예요. 이 컴퓨터에서만 쓰면 비워 두세요.</p>
      <label class="f">앱 주소<input class="in" value=${pub} onInput=${(e) => setPub(e.target.value)} placeholder="https://office.example.com"/></label>
      <label class="f">공개 미디어 주소<input class="in" value=${media} onInput=${(e) => setMedia(e.target.value)} placeholder="https://office.example.com"/></label>
      <div class="row end"><button class="btn sm" onClick=${() => act(() => api('POST', '/api/settings/public', { appPublicBase: pub, mediaPublicBase: media }), '저장했어요')}>저장</button></div></div>
  </div>`;
}

function Approval({ state }) {
  const p = state.publish;
  const setPolicy = (patch) => act(() => api('POST', '/api/settings/publish', { policy: { ...p.policy, ...patch } }), '게시 확인 방식을 바꿨어요');
  const toggleAuto = (c) => {
    const on = p.policy.autoPlatforms.includes(c);
    if (!on && !window.confirm(`${platformLabel(c)} 게시물을 확인 없이 바로 승인할까요? 재게시·공개 범위 확대·결제는 그래도 항상 확인해요.`)) return;
    setPolicy({ autoPlatforms: on ? p.policy.autoPlatforms.filter((x) => x !== c) : [...p.policy.autoPlatforms, c] });
  };
  return html`<div class="stack">
    <div class="stamps">
      <button class=${`stamp${p.policy.mode === 'per_post' ? ' on' : ''}`} onClick=${() => setPolicy({ mode: 'per_post' })}><b>게시물마다 확인</b><small>기본값 — 하나씩 원문을 보고 승인해요</small></button>
      <button class=${`stamp${p.policy.mode === 'weekly' ? ' on' : ''}`} onClick=${() => setPolicy({ mode: 'weekly' })}><b>한 주 묶어서 확인</b><small>이번 주 게시물을 모아서 봐요 — 승인은 원문을 본 뒤 하나씩</small></button>
      <div class=${`stamp${p.policy.autoPlatforms.length ? ' on' : ''}`}><b>미리 허용한 곳은 바로 승인</b><small>대표님이 켠 곳만 확인 없이 승인해요</small>
        <div class="row">${['blog', 'threads', 'linkedin'].map((c) => html`<label class="row note"><input type="checkbox" checked=${p.policy.autoPlatforms.includes(c)} onChange=${() => toggleAuto(c)}/>${platformLabel(c)}</label>`)}</div></div></div>
    <div class=${`card live${p.live ? ' on' : ''}`}><div class="row"><div><h3>실제 게시</h3><p class="note">${p.live ? '켜져 있어요 — 승인한 게시물이 예약한 시각에 실제로 올라가요.' : '연습 게시 중이에요 — 승인해도 밖으로 올리지 않고 기록만 남겨요.'}</p></div><span class="sp"></span>
      <button class=${`btn ${p.live ? '' : 'pri'}`} onClick=${() => { if (p.live || window.confirm('실제 게시를 켤까요? 승인된 게시물이 연결된 계정에 공개로 올라가요.')) act(() => api('POST', '/api/settings/publish', { live: !p.live })); }}>${p.live ? '연습 게시로 되돌리기' : '실제 게시 켜기'}</button></div></div>
    <div class="card"><h3>게시 시간표</h3>${Object.entries(p.timetable).map(([k, slots]) => html`<p class="note"><b>${platformLabel(k)}</b> ${slots.map((s) => `${'월화수목금토일'[s.day - 1]} ${s.time}`).join(' · ')}</p>`)}
      <p class="note">이번 주 일이 이미 시작돼 시각이 지났으면 오늘 · 내일부터 하루씩 띄워 잡아요. 승인하기 전에 확인할 것에서 시각을 바꿀 수 있어요.</p></div>
    <p class="honest">다시 올리기 · 공개 범위 넓히기 · 결제 · 추가 채용은 이 설정과 상관없이 늘 대표님이 확인해요.</p>
  </div>`;
}

function Mail({ s, conns }) {
  const slackConn = conns.find((c) => c.app === 'slack');
  const [kinds, setKinds] = useState(s.notify.kinds ?? []);
  const KINDS = [['decision', '결정 요청(밖으로 나가는 것만 하나씩 · 나머지는 한 주 요약으로)'], ['reconnect', '다시 연결 필요'], ['task', '업무 실패 · 한도'], ['unknown', '게시 결과 확인 필요'], ['failed', '게시 · 저장 실패'], ['published', '게시 끝'], ['cycle', '한 주 마무리']];
  return html`<div class="stack">
    <div class="card"><h3>채널</h3><p class="note">알림은 Slack으로, 승인은 앱의 확인할 것에서 해요. Slack: <b>${slackConn ? ST[slackConn.status] : '연결 안 됨'}</b> <a href="#/settings/keys">연결된 앱에서 연결하기</a></p></div>
    <div class="card stack"><h3>무엇을 알릴까요</h3><div class="row">${KINDS.map(([k, l]) => html`<label class="row note"><input type="checkbox" checked=${kinds.includes(k)} onChange=${() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])}/>${l}</label>`)}</div>
      <p class="note">같은 종류는 ${s.notify.batchSeconds ?? 20}초 안에 묶어 한 번에 보내요(임시 기본값).</p>
      <div class="row end"><button class="btn sm pri" onClick=${() => act(() => api('POST', '/api/settings/notify', { kinds }), '알림 설정을 저장했어요')}>저장</button></div></div>
  </div>`;
}

function Storage({ state, s }) {
  const [armed, setArmed] = useState(false);
  return html`<div class="stack">
    <div class="card"><h3>데이터 위치</h3><p class="note"><code>${s.dataDir}</code> — 기록·결과물은 이 컴퓨터의 SQLite 파일 하나에 있어요. 연결 토큰은 암호화돼 있어요. 백업은 터미널에서 <code>agent-office backup</code>.</p></div>
    <div class="card row"><div><h3>내보내기</h3><p class="note">기록 · 결과물 · 배운 것 · 회사 지식을 JSON 파일로 받아요(비밀값은 빼고).</p></div><span class="sp"></span><a class="btn" href="/api/export">내보내기</a></div>
    <div class="card row"><div><h3>오픈소스</h3><p class="note">AGPL-3.0 라이선스예요. 자유롭게 쓰고 고칠 수 있고, 고친 것을 다른 사람에게 서비스하면 고친 소스도 공개해야 해요.</p></div><span class="sp"></span><a class="btn" href=${SOURCE_URL} target="_blank" rel="noopener">소스 코드</a></div>
    ${state.server.allowReset && html`<div class="card row"><div><h3>모두 초기화(개발용)</h3><p class="note">모든 기록을 지우고 처음부터 시작해요.</p></div><span class="sp"></span>
      <button class="btn danger" onClick=${() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; } act(() => api('POST', '/api/dev/reset'), '초기화했어요').then(() => location.reload()); }}>${armed ? '한 번 더 누르면 지워져요' : '모두 초기화'}</button></div>`}
  </div>`;
}

/** 계정(결정 74) — 계정 모드일 때만 보인다 */
function Account() {
  const me = useApi('/api/account/me').data;
  if (me?.mode !== 'accounts' || !me.account) return null;
  const a = me.account;
  const out = (everywhere) => act(() => api('POST', '/api/account/logout', { everywhere })).then(() => { location.href = '/'; });
  return html`<div class="card account-card"><div class="row"><b>계정</b><span>${a.email}</span>
    ${a.google && html`<span class="pill">Google${a.hasPassword ? '' : '로 가입'}</span>`}${!a.emailVerified && html`<span class="pill st-me">이메일 확인 전</span>`}
    <span class="sp"></span><button class="btn sm" onClick=${() => out(false)}>로그아웃</button><button class="btn sm quiet" onClick=${() => out(true)}>모든 기기에서 로그아웃</button></div>
    <p class="note">비밀번호 바꾸기 · 탈퇴 · 계정별 사무실은 준비 중이에요. 데이터는 설정 › 데이터에서 내보낼 수 있어요.</p></div>`;
}

/** 화면 밝기(결정 81 B3) — 컴퓨터 설정 따름 · 밝게 · 어둡게. 이 브라우저에만 저장 */
function ThemeCard() {
  const [t, setT] = useState(getTheme());
  const pick = (v) => { setTheme(v); setT(v); };
  return html`<div class="card theme-card"><div class="row"><b>화면 밝기</b><span class="sp"></span>
    <div class="tabs sm" role="radiogroup" aria-label="화면 밝기">${THEMES.map(([k, n]) => html`<button role="radio" aria-checked=${t === k} class=${t === k ? 'on' : ''} onClick=${() => pick(k)}>${n}</button>`)}</div></div>
    <p class="note">글자 · 카드 색만 바뀌어요. 3D 사무실의 조명 · 하늘은 지금처럼 사무실 시간대를 따라요.</p></div>`;
}

export function Settings({ state, room }) {
  const conns = useApi('/api/connections').data;
  const s = useApi('/api/settings').data;
  const cur = ROOMS.find((r) => r[0] === room);
  if (!conns || !s) return html`<div class="page"><p class="muted">불러오는 중…</p></div>`;
  const problems = conns.filter((c) => c.status === 'needs_reauth' || c.status === 'error').length;
  const linked = conns.filter((c) => c.status === 'connected').length;
  if (!cur) {
    return html`<div class="page settings"><div class="page-h"><h1>설정</h1></div>
      <${Account} />
      <${ThemeCard} />
      <${Notice} state=${state} conns=${conns} />
      <div class="facilities">${ROOMS.map(([key, icon, name, menu]) => {
        const summary = {
          keys: `${linked ? `${linked}개 연결됨` : '아직 연결한 앱이 없어요'}${problems ? ` · 손볼 곳 ${problems}개` : ''}`,
          power: `${aiName(state.ai)} · ${{ ready: '켜져 있어요', needs_login: '로그인이 필요해요', unavailable: '쓸 수 없어요', unknown: '확인이 필요해요' }[state.ai.status.state]}${state.counts.asleep ? ` · 잠든 업무 ${state.counts.asleep}건` : ''}`,
          building: `이 컴퓨터${state.runner.paused ? ' · 일시정지' : ' · 켜져 있어요'}${state.schedule.text ? ` · ${state.schedule.text}` : ''}`,
          approval: `${state.publish.policy.mode === 'weekly' ? '한 주 묶어서 확인' : '게시물마다 확인'} · ${state.publish.live ? '실제 게시' : '연습 게시'}`,
          mail: conns.find((c) => c.app === 'slack')?.status === 'connected' ? 'Slack 알림 켜짐' : 'Slack 연결 전 — 앱 안에서만 알려요',
          storage: '이 컴퓨터 · 내보내기',
        }[key];
        return html`<button class=${`facility f-${key}${problems && key === 'keys' ? ' warn' : ''}`} onClick=${() => go(`settings/${key}`)}><span class="ficon">${ic(icon, 24)}</span><b>${name}</b><small class="menu">${menu}</small><span class="fsum">${summary}</span></button>`;
      })}</div></div>`;
  }
  const [key, icon, name, menu] = cur;
  return html`<div class="page settings">
    <div class="room-h"><span class="ficon big">${ic(icon, 28)}</span><div><p class="eyebrow">설정</p><h1>${name}</h1><p class="note">${menu}</p></div><span class="sp"></span><a class="btn sm" href="#/settings">설정 전체</a></div>
    <div class="tabs room-tabs">${ROOMS.map(([k, , n]) => html`<button class=${k === key ? 'on' : ''} onClick=${() => go(`settings/${k}`)}>${n}</button>`)}</div>
    ${key === 'keys' && html`<${Keys} conns=${conns} state=${state} />`}
    ${key === 'power' && html`<${Power} state=${state} />`}
    ${key === 'building' && html`<${Building} state=${state} s=${s} />`}
    ${key === 'approval' && html`<${Approval} state=${state} />`}
    ${key === 'mail' && html`<${Mail} s=${s} conns=${conns} />`}
    ${key === 'storage' && html`<${Storage} state=${state} s=${s} />`}
  </div>`;
}
