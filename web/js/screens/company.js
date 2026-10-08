// 회사 — [직원(S4) | 채용 | 책장·트로피(S8) | 연대기]
import { Portrait } from '../art.js';
import { Customizer } from '../customizer.js';
import { act, api, go, html, mins, roleDesc, roleFull, roleLabel, stWord, useApi, useState, when } from '../lib.js';
import { CandidatePicker } from './onboarding.js';
import { ic } from '../icons.js';
import { FacLock, download, hasFac } from '../facility.js';

/** 마일스톤 진열 Lv2 — 달성한 기록을 카드 이미지(1200×630)로 */
function saveMilestoneCard(office, m, totals) {
  const c = Object.assign(document.createElement('canvas'), { width: 1200, height: 630 }), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1200, 630); bg.addColorStop(0, '#1F3B2F'); bg.addColorStop(1, '#2E5A45'); g.fillStyle = bg; g.fillRect(0, 0, 1200, 630);
  g.strokeStyle = 'rgba(212,169,58,.55)'; g.lineWidth = 3; g.strokeRect(36, 36, 1128, 558);
  // 트로피
  g.fillStyle = '#D4A93A'; g.beginPath(); g.moveTo(980, 190); g.lineTo(1100, 190); g.quadraticCurveTo(1095, 300, 1040, 318); g.quadraticCurveTo(985, 300, 980, 190); g.fill();
  g.fillRect(1030, 316, 20, 54); g.fillRect(1000, 370, 80, 18); g.lineWidth = 9; g.strokeStyle = '#D4A93A';
  g.beginPath(); g.arc(975, 230, 26, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(1105, 230, 26, Math.PI * 1.5, Math.PI * 0.5); g.stroke();
  const font = (w, px) => `${w} ${px}px "Pretendard Variable", Pretendard, system-ui, sans-serif`;
  g.fillStyle = '#D4A93A'; g.font = font(700, 30); g.fillText('MILESTONE · 마일스톤 달성', 90, 130);
  g.fillStyle = '#FFFFFF'; g.font = font(800, 72); g.fillText(m.title.slice(0, 18), 90, 250);
  g.fillStyle = 'rgba(255,255,255,.82)'; g.font = font(500, 34); g.fillText(m.note.slice(0, 34), 90, 315);
  g.fillStyle = 'rgba(255,255,255,.65)'; g.font = font(500, 28);
  g.fillText(`끝낸 주 ${totals.cycles} · 게시 ${totals.published} · 배운 것 ${totals.rules} · 회사 지식 ${totals.knowledge}`, 90, 470);
  g.fillStyle = '#FFFFFF'; g.font = font(700, 36); g.fillText(office ?? '', 90, 540);
  g.fillStyle = 'rgba(255,255,255,.65)'; g.font = font(500, 28); g.fillText(m.at ? new Date(m.at).toLocaleDateString('ko-KR') : '', 90, 580);
  c.toBlob((b) => { const url = URL.createObjectURL(b); const a = Object.assign(document.createElement('a'), { href: url, download: `${(office ?? '회사').replace(/\s+/g, '-')}-${m.title.replace(/\s+/g, '-')}.png` }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
const STALE_DAYS = 30;

const RULE = { confirmed: '확정 · 적용 중', estimated: '추정 · 확정 전이라 적용 안 함', once: '이번만 · 규칙으로 저장 안 함', removed: '뗌' };
const CAT = { principle: '원칙', method: '업무 방식', lesson: '검토된 교훈' };
const TONE = { haeyo: '친근한 해요체', hamnida: '정중한 합니다체', banmal: '편한 반말' };

function Bars({ series }) {
  if (!series.length) return html`<p class="note">아직 처리된 게시 확인이 없어요.</p>`;
  const w = 26;
  return html`<svg class="bars" viewBox=${`0 0 ${series.length * (w + 8)} 90`} role="img" aria-label="주별 채택률">
    ${series.map((s, i) => html`<g><title>${s.label}: ${s.rate}% (${s.n}건)</title>
      <rect x=${i * (w + 8)} y=${80 - (s.rate / 100) * 70} width=${w} height=${Math.max(2, (s.rate / 100) * 70)} rx="4" style="fill: var(--ok)"/>
      <text x=${i * (w + 8) + w / 2} y="89" text-anchor="middle" font-size="7" style="fill: var(--ink-3)">${s.label.replace('월 ', '/').replace('주차', '')}</text></g>`)}</svg>`;
}

function RuleCard({ r }) {
  const [edit, setEdit] = useState(null);
  const call = (action, text) => act(() => api('POST', `/api/rules/${r.id}`, { action, text }));
  return html`<div class=${`rule r-${r.status}`}>
    ${edit === null ? html`<b>${r.text}</b>` : html`<textarea class="in" rows="2" value=${edit} onInput=${(e) => setEdit(e.target.value)}></textarea>`}
    <small>${RULE[r.status]} · 출처 ${r.source.kind === 'dm' ? '대화' : r.source.kind === 'revision' ? '수정 요청' : r.source.kind ?? '피드백'} ${r.source.feedbackIds?.length ?? 1}회 → 적용 ${r.appliedCount}회${r.knowledgeId ? ' · 회사 지식 후보' : ''}</small>
    <div class="row">${edit !== null ? html`<button class="btn sm pri" onClick=${() => { call('edit', edit); setEdit(null); }}>저장</button><button class="btn sm quiet" onClick=${() => setEdit(null)}>취소</button>`
      : html`${r.status === 'estimated' && html`<button class="btn sm decide" onClick=${() => call('confirm')}>확정</button>`}
        ${r.status === 'once' && html`<button class="btn sm" onClick=${() => call('always')}>앞으로도 적용으로 바꾸기</button>`}
        ${r.status !== 'removed' && html`<button class="btn sm" onClick=${() => setEdit(r.text)}>고치기</button><button class="btn sm quiet" onClick=${() => call('remove')}>떼기</button>`}
        ${r.status === 'removed' && html`<button class="btn sm" onClick=${() => call('restore')}>되돌리기</button>`}
        ${r.status === 'confirmed' && !r.knowledgeId && html`<button class="btn sm quiet" onClick=${() => act(() => api('POST', `/api/rules/${r.id}/promote`, {}), '회사 지식 후보로 올렸어요')}>회사 지식으로 제안</button>`}`}</div></div>`;
}

function Sheet({ id }) {
  const d = useApi(`/api/employees/${id}/sheet`).data;
  const [tab, setTab] = useState('board');
  const [filter, setFilter] = useState('all');
  const [style, setStyle] = useState(null);
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  const e = d.employee, m = d.metrics;
  const rules = d.rules.filter((r) => r.status !== 'removed');
  const estimated = d.rules.filter((r) => r.status === 'estimated').length;
  return html`<div class="sheet-grid">
    <aside class="sheet card">
      <div class="row"><${Portrait} look=${e.look} size=${72} role=${e.role} rank=${e.rank} /><div><h2>${e.name}</h2><p class="muted">${roleFull(e.role)} · ${e.rank}</p></div></div>
      ${(e.profile.pitch || e.profile.direction) && html`<p class="intro">“${e.profile.pitch ?? ''}” ${e.profile.direction ? html`<br/><small>면접 진단: ${e.profile.direction}</small>` : ''}</p>`}
      <p class="note">말투: ${TONE[e.style.tone.form]}${e.style.tone.emoji ? ' · 이모지 가끔' : ''} · 보고 ${e.style.report.detail === 'detail' ? '상세' : '한 줄'}</p>
      <div class="lv"><b>레벨 ${m.level}</b><small>${m.levelFormula}</small></div>
      <div class="meter"><span>경미 수정 이하 채택률</span><b>${m.adoption.rate === null ? '—' : `${m.adoption.rate}%`}</b><small>${m.adoption.formula} · ${m.adoption.ok}/${m.adoption.total}${m.adoption.sample ? ` · ${m.adoption.sample}` : ''}</small></div>
      <div class="meter"><span>배운 것(확정)</span><b>${m.rulesConfirmed}</b><small>수정 요청 ${m.revisions}회 · 완료 업무 ${m.tasksDone}건</small></div>
      ${d.promotion.next && html`<div class=${`promo${d.promotion.eligible ? ' ok' : ''}`}><b>${d.promotion.eligible ? `승급 제안: ${d.promotion.next}` : `다음 직급: ${d.promotion.next}`}</b><small>${d.promotion.reason}</small>
        ${d.promotion.eligible && html`<button class="btn sm decide" onClick=${() => act(() => api('POST', `/api/employees/${e.id}/promote`, {}), '승급했어요')}>승급하기(대표 결정)</button>`}</div>`}
      <label class="f">AI 연결<select class="in" value=${e.aiProvider ?? ''} onChange=${(ev) => act(() => api('POST', `/api/employees/${e.id}/ai`, { provider: ev.target.value || null }), 'AI 연결을 바꿨어요')}>
        <option value="">사무실 기본</option>${d.providers.map((p) => html`<option value=${p.id}>${p.label}</option>`)}</select></label>
      <p class="note">이번 주 실행 ${d.share.runs}회 · 팀 전체의 ${d.share.pct}% (팀이 한 구독 한도를 나눠 써요)</p>
      <div class="row"><button class="btn sm" onClick=${() => setStyle({ name: e.name, look: e.look, style: e.style })}>외형·말투·성향 다듬기</button><a class="btn sm quiet" href="#/office">사무실에서 말 걸기</a></div>
    </aside>
    <section class="col">
      <div class="tabs">${[['board', '보드'], ['manage', `배운 것 관리${estimated ? ` (${estimated})` : ''}`], ['journal', '성장 일지']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => setTab(k)}>${l}</button>`)}</div>
      ${tab === 'board' && html`<div class="col">
        <div class="pins">${rules.slice(0, 9).map((r) => html`<${RuleCard} key=${r.id} r=${r} />`)}${!rules.length && html`<p class="empty">아직 배운 것이 없어요. 확인할 것에서 고쳐 달라고 할 때 “앞으로도”를 고르거나 대화에서 규칙으로 저장하면 쌓여요.</p>`}</div>
        <div class="card"><h3>관계 · 수락된 인계만 집계</h3><div class="rel">${d.relations.map((r) => html`<span><b>${r.name}</b> ${r.role} · 인계 ${r.handoffs}회</span>`)}</div></div>
        <div class="card"><h3>주별 채택률${m.adoption.sample ? ' · 참고용' : ''}</h3><${Bars} series=${m.series} /></div></div>`}
      ${tab === 'manage' && html`<div class="col"><div class="row">${[['all', '전체'], ['confirmed', '확정'], ['estimated', '추정'], ['once', '이번만'], ['removed', '뗀 것']].map(([k, l]) => html`<button class=${`chip-opt${filter === k ? ' on' : ''}`} onClick=${() => setFilter(k)}>${l}</button>`)}</div>
        ${d.rules.filter((r) => (filter === 'all' ? r.status !== 'removed' : r.status === filter)).map((r) => html`<${RuleCard} key=${r.id} r=${r} />`)}</div>`}
      ${tab === 'journal' && html`<ol class="journal">${d.journal.map((j) => html`<li class=${`j-${j.type}`}><time>${when(j.at)}</time><span>${j.text}</span></li>`)}</ol>`}
    </section>
    ${style && html`<div class="drawer" onClick=${(ev) => ev.target.classList.contains('drawer') && setStyle(null)}><div class="drawer-b card wide">
      <div class="row"><h2>${e.name} 다듬기</h2><span class="sp"></span><button class="icon-btn" onClick=${() => setStyle(null)} aria-label="닫기">${ic('x', 18)}</button></div>
      <${Customizer} value=${style} onChange=${setStyle} subtitle=${`${e.rank} · ${roleFull(e.role)}`} />
      <div class="row end"><button class="btn pri" onClick=${async () => { await act(() => api('POST', `/api/employees/${e.id}/style`, style), '바꿨어요'); setStyle(null); }}>저장</button></div></div></div>`}
  </div>`;
}

/** 대표가 들인 시간 추이(결정 72 · 결정 53의 '내 개입 시간 추이') — 일한 시간은 줄고, 머문 시간은 애착 */
function OwnerTime() {
  const t = useApi('/api/time/summary').data;
  if (!t) return null;
  const max = Math.max(60, ...t.cycles.map((c) => c.work + c.stay));
  const diff = t.week.work - t.lastWeek.work;
  return html`<div class="card owner-time"><h3>${ic('timer')} 대표가 들인 시간 <small class="muted">${t.rule}</small></h3>
    <div class="ot-week"><div><small>이번 주 일한 시간</small><b>${mins(t.week.work)}</b><span class=${diff < 0 ? 'good' : ''}>${t.lastWeek.work ? `지난주 ${mins(t.lastWeek.work)} ${diff < 0 ? '↓ 줄었어요' : diff > 0 ? '↑' : ''}` : '지난주 기록 없음'}</span></div>
      <div><small>이번 주 사무실에 머문 시간</small><b>${mins(t.week.stay)}</b><span>지난주 ${mins(t.lastWeek.stay)}</span></div>
      <div><small>준비 시간(설정 · 처음 준비)</small><b>${mins(t.week.setup)}</b><span>누적 ${mins(t.all.setup)}</span></div></div>
    ${t.cycles.length > 0 && html`<div class="ot-bars">${t.cycles.map((c) => html`<div class="ot-bar" title=${`${c.label} — 일 ${mins(c.work)} · 머묾 ${mins(c.stay)}`}>
      <i class="w" style=${`height:${(c.work / max) * 100}%`}></i><i class="s" style=${`height:${(c.stay / max) * 100}%`}></i><small>${c.label.replace(/^\d+월 /, '')}</small></div>`)}</div>
      <p class="note"><span class="lg w"></span>일한 시간(결정 · 확인 · 대화 · 관리 — 줄어들수록 '맡겨두면 알아서'에 가까워요) <span class="lg s"></span>사무실에 머문 시간</p>`}
  </div>`;
}

function Library({ state }) {
  const d = useApi('/api/company').data;
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(null);
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  const active = d.knowledge.filter((k) => k.status === 'active');
  const cart = d.knowledge.filter((k) => k.status === 'candidate');
  const book = d.knowledge.find((k) => k.id === open);
  const match = (k) => !q || `${k.title} ${k.body} ${k.scope}`.includes(q);
  const kact = (id, action, extra = {}) => act(() => api('POST', `/api/knowledge/${id}`, { action, ...extra }));
  const kLv2 = hasFac(state, 'knowledge'), mLv2 = hasFac(state, 'milestones');
  // 지식 책장 Lv2 — 오래 확인 안 한 지식(30일)
  const stale = kLv2 ? active.filter((k) => !k.checkedAt || Date.now() - Date.parse(k.checkedAt) > STALE_DAYS * 86400000) : [];
  return html`<div class="lib">
    <div class="lib-main">
      <div class="row"><input class="in" style="max-width:280px" placeholder="책 찾기 — 제목·적용 범위" value=${q} onInput=${(e) => setQ(e.target.value)}/><span class="sp"></span>
        ${kLv2 && html`<button class="btn sm" title="지식 책장 레벨 2" onClick=${() => act(async () => { const r = await api('GET', '/api/knowledge/export'); download(r.filename, r.text); }, '회사 지식을 내려받았어요')}>${ic('download', 14)} 내보내기(.md)</button>`}
        <button class="btn sm" onClick=${() => setAdd({ category: 'principle', title: '', body: '', scope: '' })}>지식 직접 추가</button></div>
      ${!kLv2 && html`<${FacLock} state=${state} fkey="knowledge" />`}
      ${stale.length > 0 && html`<div class="card stale"><h3>점검할 지식 ${stale.length}건 <small class="muted">${STALE_DAYS}일 넘게 확인 안 함 · 지식 책장 레벨 2</small></h3>
        ${stale.slice(0, 6).map((k) => html`<div class="row"><span>${k.title}</span><small class="muted">${k.checkedAt ? `마지막 확인 ${when(k.checkedAt)}` : '확인한 적 없음'}</small><span class="sp"></span>
          <button class="btn sm" onClick=${() => kact(k.id, 'still_valid')}>아직 맞아요</button><button class="btn sm quiet" onClick=${() => setOpen(k.id)}>열기</button></div>`)}</div>`}
      ${Object.entries(CAT).map(([c, label]) => html`<div class="shelf"><h3>${label}</h3><div class="books">
        ${active.filter((k) => k.category === c).map((k) => html`<button class=${`book c-${c}${open === k.id ? ' on' : ''}${match(k) ? '' : ' dim'}`} onClick=${() => setOpen(k.id)} title=${k.body}>${k.title}</button>`)}
        ${!active.some((k) => k.category === c) && html`<span class="muted">아직 없어요</span>`}</div></div>`)}
      <div class="cart card"><h3>${ic('cart')} 검토 대기 수레 · ${cart.length}</h3>
        ${cart.map((k) => html`<div class="cand-k"><b>${k.title}</b><p>${k.body}</p>
          <p class="note">점검: ${k.check.advice} · 근거 ${k.check.evidence}${k.users ? ` · ${k.users}의 배운 것` : ''}</p>
          ${k.check.conflicts.map((c) => html`<div class="diff"><span>지금 원칙: ${c.title} — ${c.body}</span><span>새 후보: ${k.body}</span></div>`)}
          <div class="row"><button class="btn sm pri" onClick=${() => kact(k.id, 'activate')}>${k.check.conflicts.length ? '조건 나눠 저장' : '회사 지식으로 저장'}</button>
            <button class="btn sm" onClick=${() => kact(k.id, 'keep_rule')}>직원 규칙으로만 두기</button></div></div>`)}
        ${!cart.length && html`<p class="note">직원이 배운 것 중 팀 전체에 쓸 만한 것을 “회사 지식으로 제안”하면 여기에 와요. 확정 전에는 쓰지 않아요.</p>`}</div>
      <${OwnerTime} />
      <div class="trophies card"><h3>${ic('trophy')} 트로피 선반 · 실제 기록으로만</h3><div class="tro">
        ${d.milestones.map((m) => html`<div class=${`tr${m.achieved ? ' got' : ''}`}><b>${ic(m.achieved ? 'trophy' : 'circle')} ${m.title}</b><small>${m.achieved ? (m.at ? when(m.at) : '달성') : `${m.progress}/${m.goal}`} · ${m.note}</small>${!m.achieved && html`<span class="bar"><i style=${`width:${Math.round((m.progress / m.goal) * 100)}%`}></i></span>`}
          ${m.achieved && mLv2 && html`<button class="btn sm quiet" title="마일스톤 진열 레벨 2" onClick=${() => saveMilestoneCard(state.office?.name, m, d.totals)}>${ic('download', 14)} 카드 저장</button>`}</div>`)}</div>
        <p class="note">누적: 끝낸 주 ${d.totals.cycles} · 연속 ${d.totals.streak}주 · 게시 ${d.totals.published} · 뉴스레터 초안 ${d.totals.newsletters} · 배운 것 ${d.totals.rules} · 회사 지식 ${d.totals.knowledge}. 반응 지표(조회수 등)는 모으지 않아요.</p>
        ${!mLv2 && d.milestones.some((m) => m.achieved) && html`<${FacLock} state=${state} fkey="milestones" />`}</div>
    </div>
    ${book && html`<aside class="openbook card"><p class="eyebrow">${CAT[book.category]}</p><h2>${book.title}</h2><p>${book.body}</p>
      <p class="note">적용 범위: ${book.scope || '전체'} · 참고된 결과물 ${book.usedCount} · 마지막 확인 ${book.checkedAt ? when(book.checkedAt) : '—'}${book.users ? ` · 출처 ${book.users}` : ''}</p>
      <ol class="hist">${book.history.map((h) => html`<li>${when(h.at)} · ${h.text}</li>`)}</ol>
      <div class="row"><button class="btn sm" onClick=${() => setAdd({ ...book, edit: true })}>고치기</button><button class="btn sm" onClick=${() => kact(book.id, 'still_valid')}>아직 맞아요</button><button class="btn sm quiet" onClick=${() => { kact(book.id, 'archive'); setOpen(null); }}>보관</button></div></aside>`}
    ${add && html`<div class="drawer" onClick=${(e) => e.target.classList.contains('drawer') && setAdd(null)}><div class="drawer-b card">
      <h2>${add.edit ? '지식 고치기' : '회사 지식 추가'}</h2>
      ${!add.edit && html`<div class="row">${Object.entries(CAT).map(([c, l]) => html`<button class=${`chip-opt${add.category === c ? ' on' : ''}`} onClick=${() => setAdd({ ...add, category: c })}>${l}</button>`)}</div>`}
      <label class="f">제목<input class="in" value=${add.title} onInput=${(e) => setAdd({ ...add, title: e.target.value })}/></label>
      <label class="f">내용<textarea class="in" rows="4" value=${add.body} onInput=${(e) => setAdd({ ...add, body: e.target.value })}></textarea></label>
      <label class="f">적용 범위<input class="in" value=${add.scope} onInput=${(e) => setAdd({ ...add, scope: e.target.value })} placeholder="예: LinkedIn 글"/></label>
      <div class="row end"><button class="btn pri" onClick=${async () => { await act(() => (add.edit ? api('POST', `/api/knowledge/${add.id}`, { action: 'edit', title: add.title, body: add.body, scope: add.scope }) : api('POST', '/api/knowledge', add)), '저장했어요'); setAdd(null); }}>저장</button></div></div></div>`}
  </div>`;
}

function Chronicle() {
  const d = useApi('/api/company').data;
  if (!d) return html`<p class="muted">불러오는 중…</p>`;
  const cart = d.knowledge.filter((k) => k.status === 'candidate');
  return html`<div class="col">
    ${cart.length > 0 && html`<div class="card"><h3>검토 대기 ${cart.length}건 — 여기서 바로 처리할 수 있어요</h3>${cart.map((k) => html`<div class="row"><span>${k.title}</span><span class="sp"></span>
      <button class="btn sm pri" onClick=${() => act(() => api('POST', `/api/knowledge/${k.id}`, { action: 'activate' }))}>저장</button><button class="btn sm" onClick=${() => act(() => api('POST', `/api/knowledge/${k.id}`, { action: 'keep_rule' }))}>규칙으로만</button></div>`)}</div>`}
    <ol class="journal">${d.chronicle.map((c) => html`<li class=${`j-${c.type}`}><time>${when(c.at)}</time><span>${c.text}</span></li>`)}</ol></div>`;
}

/** 회차에서 맡는 일 — 채용 탭 안내(결정 71) */
const ROLE_JOB = {
  researcher: '이번 주 트렌드 조사', writer: '블로그 · 뉴스레터 · SNS 글', designer: '썸네일 · 이미지 기획',
  marketer: '배포 계획 · 홍보 문구', editor: '블로그 교정 · 교열(게시 확인은 교정본으로)', producer: '숏폼 대본 · 스토리보드', seo: '검색 키워드 브리프 → 기획',
};

function Hire({ state }) {
  const ob = useApi('/api/onboarding').data;
  const count = (r) => state.employees.filter((e) => e.role === r).length;
  const roles = Object.keys(ROLE_JOB); // 매니저 말고는 같은 직무를 여러 명 둘 수 있어요
  const [role, setRole] = useState(null);
  if (!ob) return html`<p class="muted">불러오는 중…</p>`;
  // 사업 설계도의 채용 순서(결정 73)에서 아직 없는 직무를 먼저 — 없으면 아직 없는 직무
  const next = ob.roadmap.find((h) => !count(h.role))?.role ?? roles.find((r) => !count(r)) ?? roles[0];
  const cur = role ?? next;
  const why = ob.roadmap.find((h) => h.role === cur);
  const req = ob.samples[cur];
  const start = () => act(() => api('POST', '/api/onboarding/samples', { role: cur }));
  return html`<div class="col"><div class="row">${roles.map((r) => html`<button class=${`chip-opt${cur === r ? ' on' : ''}`} onClick=${() => setRole(r)} title=${roleDesc(r)}>${roleLabel(r)}${count(r) ? ` · ${count(r)}명` : r === next ? ' · 다음 추천' : ''}</button>`)}</div>
    <p class="note"><b>${roleFull(cur)}</b> — 이번 주 일: ${ROLE_JOB[cur]}.${why ? ` 설계도: ${why.why}(${why.when}).` : ''}${count(cur) ? ` 지금 ${count(cur)}명이 있어요. 더 뽑으면 이번 주 일을 나눠 맡아요.` : ''}</p>
    ${!req && html`<div class="row"><p class="note">후보 2명이 내 사업 주제로 짧은 샘플을 만들어요 → 마음에 드는 한 명을 골라 이름·성향을 다듬고 → 고용해요. AI 요청은 짧게 1번이에요.</p><button class="btn pri" onClick=${start}>후보 샘플 받기</button></div>`}
    ${req && html`<${CandidatePicker} key=${`${cur}:${req.id}`} role=${cur} ob=${ob} req=${req} kind="samples" taken=${state.employees.map((e) => e.name)} onStart=${start} />`}</div>`;
}

export function Company({ state, tab = 'employees', id }) {
  return html`<div class="page company">
    <div class="page-h"><h1>회사</h1><span class="sp"></span>
      <div class="tabs">${[['employees', '직원'], ['hire', '채용'], ['library', '책장·트로피'], ['chronicle', '연대기']].map(([k, l]) => html`<button class=${tab === k ? 'on' : ''} onClick=${() => go(`company/${k}`)}>${l}</button>`)}</div></div>
    ${tab === 'employees' && (id ? html`<${Sheet} key=${id} id=${id} />` : html`<div class="emps">${state.employees.map((e) => html`<a class="emp-card card" href=${`#/company/employees/${e.id}`}>
      <${Portrait} look=${e.look} size=${64} role=${e.role} rank=${e.rank} /><div><b>${e.name}</b><p class="muted">${roleFull(e.role)} · ${e.rank}</p><span class=${`pill st-${e.activity.status}`} title=${e.activity.detail ?? e.activity.label}>${stWord(e.activity.status, e.activity.label)}</span></div></a>`)}</div>`)}
    ${tab === 'hire' && html`<${Hire} state=${state} />`}
    ${tab === 'library' && html`<${Library} state=${state} />`}
    ${tab === 'chronicle' && html`<${Chronicle} />`}
  </div>`;
}
