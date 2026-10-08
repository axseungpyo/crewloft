// S3 온보딩(결정 54–57 · 73) — 서비스 소개 → 사업 소개 → 전력(AI) 연결 → 매니저 면접 → 다듬기·계약 → 사업 인터뷰 → 사업 설계도 → 첫 주
import { Figure, Portrait } from '../art.js';
import { Customizer, defaultStyle } from '../customizer.js';
import { act, api, html, josa, meta, refresh, roleDesc, roleFull, roleLabel, useApi, useEffect, useState } from '../lib.js';
import { officeSVG, VB } from '../office-art.js';
import { MiniOffice } from '../office-mini.js';
import { ic } from '../icons.js';

const QUESTS = ['서비스 알아보기', '사업 소개하기', '사무실에 전력 연결', '첫 매니저 면접', '매니저 다듬고 고용', '사업 인터뷰', '사업 설계도 확인', '첫 주 시작'];
const STAGE_INDEX = { intro: 0, describe: 1, power: 2, interview: 3, setup: 5, blueprint: 6, first: 7 };
const UNKNOWN = '__unknown__';
/** 같은 직무를 또 뽑을 때 후보 이름이 이미 있으면 쓸 이름(결정 71) */
const NAME_POOL = ['지후', '민재', '수아', '하린', '도윤', '시아', '이안', '다온', '서준', '채원', '로하', '유진'];
const freeName = (name, taken = []) => (taken.includes(name) ? NAME_POOL.find((n) => !taken.includes(n)) ?? `${name}2` : name);

function Quest({ index }) {
  return html`<div class="quest card"><h3 class="q-h">${ic('map')} 시작 퀘스트 <small>${Math.min(index, QUESTS.length)}/${QUESTS.length}</small></h3>
    <div class="q-bar" aria-hidden="true"><i style=${{ width: `${(Math.min(index, QUESTS.length) / QUESTS.length) * 100}%` }}></i></div>
    ${QUESTS.map((q, i) => html`<div class=${`qi ${i < index ? 'done' : i === index ? 'cur' : ''}`}><i>${i < index ? ic('check', 12) : i + 1}</i><span>${q}</span></div>`)}</div>`;
}

function Preview({ state, aiOn }) {
  const [flat, setFlat] = useState(false);
  const [cands, setCands] = useState([]);
  useEffect(() => {
    const on = (e) => setCands(e.detail ?? []);
    document.addEventListener('ao-candidates', on);
    return () => document.removeEventListener('ao-candidates', on);
  }, []);
  const employees = state.employees.map((e) => ({ ...e, pose: 'type', bubble: null, promoted: false }));
  if (flat) {
    const { svg } = officeSVG({ employees, showEmpty: employees.length > 0, aiOn, brand: state.office?.name ?? '', flow: [], books: 0, trophies: 0, mail: 0, decor: {} });
    return html`<div class="ob-office"><svg viewBox=${`0 0 ${VB.w} ${VB.h}`} preserveAspectRatio="xMidYMid meet" dangerouslySetInnerHTML=${{ __html: svg }}></svg>
      <div class="ob-count"><b>${state.employees.length}</b>명 근무 중</div></div>`;
  }
  const people = [
    ...state.employees.map((e) => ({ id: e.id, name: e.name, role: e.role, rank: e.rank, status: 'working', statusLabel: '근무 중', mode: 'type' })),
    ...cands.filter((c) => !state.employees.some((e) => e.name === c.name && e.role === c.role)),
  ];
  return html`<div class="ob-office"><${MiniOffice} state=${state} people=${people} onFail=${() => setFlat(true)} />
    <div class="ob-count"><b>${state.employees.length}</b>명 근무 중${cands.length ? ` · 후보 ${cands.length}명 면접 대기` : ''}</div></div>`;
}

function Waiting({ req, label, onRetry }) {
  if (!req || req.status === 'running') return html`<div class="waiting"><span class="spin"></span>${label}</div>`;
  if (req.status === 'failed') return html`<div class="waiting err">AI 요청이 실패했어요 — ${req.error}<button class="btn sm" onClick=${onRetry}>다시 요청</button></div>`;
  return null;
}
const usageNote = (req) => (req?.costUsd ? ` · 이번 요청 ${'$'}${req.costUsd.toFixed(3)}(API 환산 추정)` : '');

/** 서비스 소개(30초) — 무엇을 해 주는지와 첫 주에 받는 것(결정 73) */
function Intro() {
  const samples = [
    ['사업 진단서', '지금 단계: 준비 중\n가장 큰 위험: ① 고객 수요 미확인 ② 가격이 원가를 못 덮음\n먼저 검증할 것: 첫 고객이 정말 돈을 낼지'],
    ['고객 인터뷰 질문지', '1. 최근에 이 문제를 겪은 때를 이야기해 주세요.\n2. 그때 어떻게 해결했나요?\n3. 그 방법에서 가장 불편했던 건요?'],
    ['랜딩 페이지 문구', '한 줄 소개 — 당신에게 꼭 맞는 선택을 빠르게\n헤드라인 — 고민은 짧게, 선택은 정확하게\n행동 유도 — 먼저 받아 보기'],
  ];
  return html`<div class="stack">
    <p class="eyebrow">퀘스트 1 · 서비스 알아보기</p><h1>창업, 혼자 시작해도 팀이 있어요</h1>
    <p class="sub">하려는 사업을 말하면 <b>매니저</b>가 사업을 이해하고 <b>사업 설계도</b>를 짜요. AI 팀이 조사 · 계획 · 준비를 나눠 맡고, 대표님은 확인 · 결정만 해요. 일할수록 사무실이 자라요.</p>
    <div class="road">${[['사업을 말해요', '한 문단이면 충분해요'], ['매니저가 설계도를 짜요', '짧은 인터뷰 → 이번 달 목표 · 할 일 묶음 · 채용 순서'], ['첫 주에 받는 것', '사업 진단 + 이번 달 실행 계획 — 대표님의 첫 확인']].map(([t, d], i) => html`<div class="rd"><span class="n">${i + 1}</span><span><b>${t}</b><small>${d}</small></span><span></span></div>`)}</div>
    <div class="intro-samples">${samples.map(([t, b]) => html`<div class="card"><span class="pill">예시</span><b>${t}</b><p>${b}</p></div>`)}</div>
    <p class="honest">밖으로 올리거나 보내는 일은 대표님 확인 뒤에만 해요. 블로그 · SNS는 사업에 필요할 때만 넣어요. AI가 없어도 견본 AI로 먼저 둘러볼 수 있어요.</p>
    <div class="row end ob-actions"><button class="btn pri big" onClick=${() => act(() => api('POST', '/api/onboarding/intro'))}>시작하기</button></div>
  </div>`;
}

const EXAMPLES = [
  ['카페', '골목커피', '동네 직장인을 위한 작은 카페를 열려고 해요. 메뉴와 가격, 오픈 준비를 혼자 하기 벅차요.'],
  ['앱 서비스', '모아일정', '혼자 일하는 사람들이 일정과 할 일을 한곳에서 관리하는 앱을 만들고 싶어요. 아직 아이디어 단계예요.'],
  ['온라인 판매', '손끝공방', '직접 만든 도자기 소품을 온라인으로 팔기 시작했어요. 첫 주문을 늘리고 싶어요.'],
];

function Describe() {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const submit = (e) => { e.preventDefault(); act(() => api('POST', '/api/office', { name, description: desc }), '사무실을 열었어요'); };
  return html`<form class="stack" onSubmit=${submit}>
    <p class="eyebrow">퀘스트 2 · 사업 소개하기</p><h1>어떤 사업을 하려고 하세요?</h1>
    <p class="sub">한 문단이면 충분해요. 무엇을 · 누구에게 · 지금 어디까지 왔는지. 첫 직원은 이 이야기를 가장 잘 이해하고 계획을 함께 세울 <b>매니저</b>예요.</p>
    <label class="f">회사 이름<input class="in" required maxlength="40" value=${name} onInput=${(e) => setName(e.target.value)} placeholder="예: 골목커피"/></label>
    <label class="f">사업 설명<textarea class="in" required rows="5" maxlength="2000" value=${desc} onInput=${(e) => setDesc(e.target.value)} placeholder=${EXAMPLES[0][2]}></textarea></label>
    <div class="row"><span class="note">예시로 채우기</span>${EXAMPLES.map(([k, n, d]) => html`<button type="button" class="chip-opt" onClick=${() => { setName(n); setDesc(d); }}>${k}</button>`)}</div>
    <div class="row end ob-actions"><button class="btn pri big">다음 · 사무실 열기</button></div>
  </form>`;
}

function Power({ state }) {
  const ai = state.ai;
  return html`<div class="stack">
    <p class="eyebrow">퀘스트 3 · 사무실에 전력 연결</p><h1>사무실에 전기를 넣어 주세요</h1>
    <p class="sub">직원들은 <b>내 AI 구독</b>으로 일해요. 면접부터 AI가 일하기 때문에 지금 연결해요. 한도에 닿으면 그 일만 쉬고, 자동 전환·추가 과금은 없어요.</p>
    <div class="gens">${ai.options.map((o) => html`<button class=${`gen${o.id === ai.id ? ' on' : ''}`} onClick=${() => act(() => api('POST', '/api/ai', { provider: o.id }))}>
      <span class="lamp"></span><b>${o.label}</b><small>${o.id === 'claude-cli' ? '내 PC의 Claude Code 로그인(구독)으로 실행' : '자격증명 없이 흐름만 확인(견본 결과)'}</small></button>`)}</div>
    <div class=${`ai-st st-${ai.status.state}`}><b>${{ ready: '연결됨', needs_login: '로그인 필요', unavailable: '사용할 수 없음', unknown: '확인 필요' }[ai.status.state]}</b> — ${ai.status.detail}</div>
    ${ai.id === 'claude-cli' && html`<p class="note">터미널에서 <code>claude</code>를 실행해 구독으로 로그인해 두세요. 이 앱은 자격증명을 읽거나 저장하지 않아요. ${ai.policy}</p>`}
    <div class="row"><button class="btn sm" onClick=${() => act(() => api('GET', '/api/ai/status'), '다시 확인했어요')}>연결 다시 확인</button><span class="sp"></span>
      <button class="btn pri big" disabled=${ai.status.state === 'unavailable'} onClick=${() => act(() => api('POST', '/api/onboarding/power'), '전력이 들어왔어요')}>매니저 면접 보러 가기</button></div>
  </div>`;
}

function Contract({ role, value, rank }) {
  const st = value.style;
  return html`<div class="contract"><h3>근로계약서</h3><dl>
    <dt>이름 · 직위</dt><dd>${value.name} · ${rank}${role === 'manager' ? ` · ${roleFull(role)} · 사업 파트너` : ` · ${roleFull(role)}`}</dd>
    <dt>일하는 방식</dt><dd>${{ haeyo: '해요체', hamnida: '합니다체', banmal: '편한 반말' }[st.tone.form]} · ${st.traits.bold >= 60 ? '과감' : '신중'} · ${st.traits.data >= 60 ? '데이터' : '직관'} · ${st.report.detail === 'detail' ? '상세 보고' : '한 줄 보고'}</dd>
    <dt>항상 지키는 것</dt><dd>외부 게시·발송·결제·추가 고용은 대표 확인 후</dd>
    <dt>승급 경로</dt><dd>${role === 'manager' ? '매니저(팀장) → 실장 → 본부장 · 실적 기반 제안, 대표 결정' : '사원 → 주임 → 선임 · 실적 기반 제안, 대표 결정'}</dd></dl></div>`;
}

export function CandidatePicker({ role, ob, req, kind, onStart, taken = [] }) {
  const archetypes = ob.archetypes.filter((a) => a.role === role);
  const [pick, setPick] = useState(null);
  const [custom, setCustom] = useState(null);
  const out = req?.status === 'done' ? req.output?.candidates ?? [] : [];
  useEffect(() => {
    const rank = role === 'manager' ? '매니저(팀장)' : '사원';
    const list = out.length ? archetypes.map((a) => ({ id: `cand-${role}-${a.id}`, name: a.name, role, rank, status: 'idle', statusLabel: pick?.id === a.id ? '선택됨' : '후보 · 면접 대기', mode: pick?.id === a.id ? 'raise' : 'idle', ghost: true })) : [];
    document.dispatchEvent(new CustomEvent('ao-candidates', { detail: custom ? list.filter((c) => c.id === `cand-${role}-${pick?.id}`) : list }));
  }, [out.length, pick?.id, !!custom]);
  useEffect(() => () => document.dispatchEvent(new CustomEvent('ao-candidates', { detail: [] })), []);
  if (custom) {
    const rank = role === 'manager' ? '매니저(팀장)' : '사원';
    const hire = () => act(async () => {
      await api('POST', '/api/employees', { role, archetype: pick.id, name: custom.name, style: custom.style, look: custom.look });
      document.dispatchEvent(new CustomEvent('ao-hired', { detail: { name: custom.name, look: custom.look, role } }));
    });
    return html`<div class="stack">
      <p class="eyebrow">${role === 'manager' ? '퀘스트 5 · 매니저 다듬고 고용' : `${roleLabel(role)} 다듬기`}</p><h1>${josa(custom.name || pick.name, '은', '는')} 어떤 사람이면 좋을까요?</h1>
      <${Customizer} value=${custom} onChange=${setCustom} subtitle=${`${rank} · ${roleLabel(role)}`} />
      <${Contract} role=${role} value=${custom} rank=${rank} />
      <div class="row"><button class="btn" onClick=${() => setCustom(null)}>다른 후보 보기</button><span class="sp"></span><button class="btn decide big" onClick=${hire}>도장 찍고 고용하기</button></div>
    </div>`;
  }
  return html`<div class="stack">
    ${kind === 'interview' && html`<p class="eyebrow">퀘스트 4 · 첫 매니저 면접</p>`}
    <h1>${kind === 'interview' ? '매니저 후보 3명이 내 사업을 읽고 왔어요' : `${roleLabel(role)} 후보 2명의 샘플이에요`}</h1>
    <p class="sub">${kind === 'interview' ? '각자 방향과 첫 한 달 계획을 제안했어요. 마음에 드는 생각을 가진 사람을 고르세요.' : '내 사업 주제로 만든 짧은 샘플이에요. 고른 뒤 다듬을 수 있어요.'}</p>
    <${Waiting} req=${req} label=${kind === 'interview' ? '후보들이 사업 설명을 읽는 중…' : '후보들이 샘플을 만드는 중…'} onRetry=${onStart} />
    ${out.length > 0 && html`<div class=${`cands n${archetypes.length}`}>${archetypes.map((a) => {
      const c = out.find((x) => x.archetype === a.id) ?? {};
      return html`<div class=${`cand${pick?.id === a.id ? ' pick' : ''}`}>
        <div class="row"><${Portrait} look=${a.look} size=${54} role=${a.role} rank=${a.role === 'manager' ? '매니저(팀장)' : '사원'} /><div><b class="nm">${a.name}</b><div class="row">${a.tags.map((t) => html`<span class="pill">${t}</span>`)}</div></div></div>
        <p class="pitch">“${a.pitch}”</p>
        ${kind === 'interview' ? html`<div class="diag"><b>내 사업 진단</b><p>${c.direction}</p><ul>${(c.plan ?? []).map((p) => html`<li>${p}</li>`)}</ul></div><p class="q">먼저 묻고 싶은 것 · “${c.question}”</p>`
          : html`<div class="sample">${c.sample}</div>`}
        <button class="btn" onClick=${() => setPick(a)}>${pick?.id === a.id ? html`${ic('check')} 선택됨` : `이 ${roleLabel(role)}로`}</button></div>`;
    })}</div>
    <p class="honest">후보는 모두 같은 AI 연결로 일해요. 차이는 <b>일하는 방식 설정</b>이고 나중에 바꿀 수 있어요.${usageNote(req)}</p>
    <div class="row end"><button class="btn pri big" disabled=${!pick} onClick=${() => setCustom({ name: freeName(pick.name, taken), look: pick.look, style: defaultStyle(pick.traits) })}>${pick ? `${pick.name} 다듬기` : '후보를 골라 주세요'}</button></div>`}
  </div>`;
}

const Bubble = ({ who, children }) => html`<div class="mt-msg"><${Portrait} look=${who.look} size=${34} role=${who.role} rank=${who.rank} /><div class="bb">${children}</div></div>`;

/** 사업 인터뷰(결정 73) — 질문 뼈대는 고정, 매니저가 이 사업에 맞는 말 · 선택지를 만든다. 모르면 가정으로 */
function Setup({ state, ob }) {
  const manager = state.employees.find((e) => e.role === 'manager');
  const req = ob.setup;
  const qs = ob.questions;
  const [ans, setAns] = useState(() => ({ ...ob.answers }));
  const [typed, setTyped] = useState({});
  const busy = ob.design?.status === 'running';
  const pick = (k, v) => { setAns({ ...ans, [k]: v }); if (v !== typed[k]) setTyped({ ...typed, [k]: '' }); };
  const known = (k) => ans[k] && ans[k] !== UNKNOWN;
  const ready = known('stage') || known('customer') || known('goal');
  const answered = (qs?.list ?? []).filter((q) => ans[q.key]).length;
  const submit = () => act(() => api('POST', '/api/onboarding/setup', { answers: ans }), `${josa(manager.name, '이', '가')} 설계도를 쓰기 시작했어요`);
  return html`<div class="stack">
    <p class="eyebrow">퀘스트 6 · 사업 인터뷰</p><h1>${josa(manager.name, '과', '와')} 사업 인터뷰</h1>
    <p class="sub">답에 맞춰 ${josa(manager.name, '이', '가')} <b>사업 설계도</b>(이번 달 목표 · 할 일 묶음 · 채용 순서)를 짜요. 모르는 건 “잘 모르겠어요” — 설계도에 <b>가정</b>으로 남고 조사해서 제안받아요.</p>
    <${Waiting} req=${req} label=${`${josa(manager.name, '이', '가')} 질문을 준비하는 중…`} onRetry=${() => act(() => api('POST', '/api/onboarding/setup/start'))} />
    ${req?.status === 'done' && html`<div class="meet">
      ${qs.greeting && html`<${Bubble} who=${manager}>${qs.greeting}<//>`}
      ${qs.list.map((q) => html`<${Bubble} who=${manager}>${q.text}
        <div class="row mt">${q.options.map((o) => html`<button class=${`chip-opt${ans[q.key] === o ? ' on' : ''}`} onClick=${() => pick(q.key, o)}>${o}</button>`)}
          <button class=${`chip-opt res${ans[q.key] === UNKNOWN ? ' on' : ''}`} onClick=${() => pick(q.key, UNKNOWN)}>${ic('search', 14)} 잘 모르겠어요</button></div>
        <div class="row mt"><input class="in sm" placeholder="직접 입력" value=${typed[q.key] ?? ''} onInput=${(e) => { setTyped({ ...typed, [q.key]: e.target.value }); setAns({ ...ans, [q.key]: e.target.value || undefined }); }}/></div><//>`)}
      <div class="row end ob-actions"><span class="note">${ready ? `${qs.list.length}개 중 ${answered}개 답했어요 — 나머지는 비워도 돼요` : '단계 · 고객 · 이번 달 목표 중 하나는 알려 주세요'}</span>
        <button class="btn pri big" disabled=${!ready || busy} onClick=${submit}>${busy ? '설계도를 쓰는 중…' : '설계도 부탁하기'}</button></div>
      ${busy && html`<${Waiting} req=${ob.design} label=${`${josa(manager.name, '이', '가')} 사업 설계도를 쓰는 중…`} />`}
      ${ob.design?.status === 'failed' && html`<p class="note err">설계도 요청이 실패했어요 — ${ob.design.error} · 버튼을 다시 눌러 주세요</p>`}
    </div>`}
  </div>`;
}

function BlockCard({ b, on, why, hired, onToggle }) {
  const missing = b.roles.filter((r) => r !== 'manager' && !hired.has(r));
  return html`<div class=${`bp-block${on ? ' on' : ''}`}>
    <div class="row"><b>${b.name}</b><span class="sp"></span><button class=${`btn sm ${on ? '' : 'pri'}`} onClick=${onToggle}>${on ? '빼기' : '+ 더하기'}</button></div>
    <p class="note">${why || b.purpose}</p>
    <div class="row">${b.roles.map((r) => html`<span class="pill" title=${roleDesc(r)}>${roleLabel(r)}</span>`)}
      ${b.confirm && html`<span class="pill st-me">대표 확인</span>`}${b.sensitive && html`<span class="pill st-issue">전문가 확인 필요</span>`}
      ${missing.length > 0 && html`<span class="muted small">${missing.map((r) => roleLabel(r)).join(' · ')} 채용 후</span>`}</div></div>`;
}

/** 사업 설계도 확인 · 고치기(결정 73) — 블록 켜고 끄기 · 목표 고치기 · 글로 고쳐 달라기 → 확정 */
function BlueprintView({ state, ob }) {
  const d = ob.draft;
  const data = d.data;
  const manager = state.employees.find((e) => e.role === 'manager');
  const hired = new Set(state.employees.map((e) => e.role));
  const [blocks, setBlocks] = useState(data.blocks.map((b) => b.id));
  const [goals, setGoals] = useState(data.goals);
  const [ch, setCh] = useState('all');
  const [cad, setCad] = useState('std');
  const [text, setText] = useState('');
  useEffect(() => { setBlocks(data.blocks.map((b) => b.id)); setGoals(data.goals); }, [d.id]);
  const revising = ob.revise?.status === 'running';
  const byId = Object.fromEntries(ob.catalog.map((b) => [b.id, b]));
  const chosen = blocks.map((id) => byId[id]).filter(Boolean);
  const others = ob.catalog.filter((b) => !blocks.includes(b.id));
  // 한 달 예상: 실행 계획 1 + 블록(매주 도는 블록은 4번) + 주간 회고 4
  const perMonth = 1 + chosen.reduce((n, b) => n + b.aiRequests * (b.cadence === 'weekly' ? 4 : 1), 0) + 4;
  const toggle = (id) => setBlocks(blocks.includes(id) ? blocks.filter((x) => x !== id) : [...blocks, id]);
  const setGoal = (i, k, v) => setGoals(goals.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const confirm = () => act(() => api('POST', '/api/onboarding/blueprint/confirm', { blocks, goals: goals.filter((g) => g.text.trim()), channels: ch, cadence: cad }), '사업 설계도를 확정했어요');
  return html`<div class="stack bp">
    <p class="eyebrow">퀘스트 7 · 사업 설계도 확인</p>
    <h1>${manager.name}의 사업 설계도 <small class="muted">v${d.version}${d.source === 'owner' ? ' · 대표가 고침' : ''}</small></h1>
    <p class="sub">고칠 곳은 바로 고치거나 글로 부탁하세요. 확정하면 이 설계도대로 업무 · 채용 순서가 정해지고, 첫 주에 ${josa(manager.name, '이', '가')} 사업 진단과 이번 달 실행 계획을 써요.</p>
    <div class="card stack"><h3>사업 요약</h3><p>${data.summary}</p>
      <div class="row"><span class="pill st-done">${meta.stages[data.stage]}</span><span class="note">${data.stageWhy}</span></div>
      <p class="note"><b>첫 고객</b> ${data.customer}${/가정/.test(data.customer) ? html` <i class="tag assume">가정</i>` : ''}</p></div>
    <div class="card stack"><h3>이번 달 목표 <small class="muted">확인할 수 있는 것 1–3개</small></h3>
      ${goals.map((g, i) => html`<div class="bp-goal"><input class="in" value=${g.text} onInput=${(e) => setGoal(i, 'text', e.target.value)} placeholder="목표"/><label class="bp-check"><span>확인</span><input class="in" value=${g.check} onInput=${(e) => setGoal(i, 'check', e.target.value)} placeholder="어떻게 확인하나요"/></label>
        <button class="icon-btn" title="빼기" disabled=${goals.length < 2} onClick=${() => setGoals(goals.filter((_, j) => j !== i))} aria-label="빼기">${ic('x', 16)}</button></div>`)}
      ${goals.length < 3 && html`<button class="btn sm bp-add" onClick=${() => setGoals([...goals, { text: '', check: '' }])}>+ 목표 더하기</button>`}</div>
    <div class="stack"><h3>할 일 묶음 <small class="muted">이번 달 AI 요청 약 ${perMonth}번(실행 계획 · 할 일 · 주간 회고)</small></h3>
      <div class="bp-blocks">${chosen.map((b) => html`<${BlockCard} b=${b} on=${true} why=${data.blocks.find((x) => x.id === b.id)?.why} hired=${hired} onToggle=${() => toggle(b.id)} />`)}</div>
      ${blocks.includes('content_ops') && html`<div class="card stack"><h3>콘텐츠 운영 설정</h3>
        <div class="row">${ob.channelOptions.map((o) => html`<button class=${`chip-opt${ch === o.key ? ' on' : ''}`} onClick=${() => setCh(o.key)}>${o.label}</button>`)}</div>
        <div class="row">${ob.cadenceOptions.map((o) => html`<button class=${`chip-opt${cad === o.key ? ' on' : ''}`} onClick=${() => setCad(o.key)}>${o.label}</button>`)}</div>
        <p class="note">게시는 항상 대표 확인 뒤, 처음엔 연습 게시(기록만)예요.</p></div>`}
      ${others.length > 0 && html`<details class="bp-more"><summary>더할 수 있는 할 일 묶음 ${others.length}개</summary><div class="bp-blocks">${others.map((b) => html`<${BlockCard} b=${b} on=${false} hired=${hired} onToggle=${() => toggle(b.id)} />`)}</div></details>`}</div>
    <div class="bp-cols">
      <div class="card stack"><h3>대표님이 직접 할 일</h3>${data.split.owner.map((x) => html`<p class="note">· ${x}</p>`)}</div>
      <div class="card stack"><h3>AI 팀이 할 일</h3>${data.split.team.map((x) => html`<p class="note">· ${x}</p>`)}</div></div>
    <div class="card stack"><h3>채용 순서 <small class="muted">고른 할 일에 맞춰 확정할 때 다시 맞춰요</small></h3>
      <div class="road">${data.hiring.map((h, i) => html`<div class=${`rd${hired.has(h.role) ? ' done' : ''}`}><span class="n">${hired.has(h.role) ? ic('check', 14) : i + 1}</span><span><b>${roleLabel(h.role)}</b><small>${h.why}</small></span><span class="pill">${hired.has(h.role) ? '근무 중' : h.when}</span></div>`)}</div></div>
    ${(data.assumptions.length > 0 || data.ideas.length > 0) && html`<div class="bp-cols">
      ${data.assumptions.length > 0 && html`<div class="card stack"><h3>아직 가정인 것</h3>${data.assumptions.map((x) => html`<p class="note">· ${x}</p>`)}</div>`}
      ${data.ideas.length > 0 && html`<div class="card stack"><h3>매니저 제안 <small class="muted">아직 할 일 묶음에 없는 일</small></h3>${data.ideas.map((x) => html`<p class="note">· ${x}</p>`)}</div>`}</div>`}
    <div class="card stack"><h3>글로 고쳐 달라기</h3>
      <textarea class="in" rows="2" maxlength="600" value=${text} onInput=${(e) => setText(e.target.value)} placeholder="예: 블로그는 빼 주세요 · 첫 고객 확보 계획도 넣어 주세요"></textarea>
      ${revising ? html`<${Waiting} req=${ob.revise} label=${`${josa(manager.name, '이', '가')} 설계도를 고치는 중…`} />`
        : html`<div class="row end">${ob.revise?.status === 'failed' && html`<span class="note err">고치기 요청이 실패했어요 — ${ob.revise.error}</span>`}<button class="btn" disabled=${text.trim().length < 2} onClick=${() => act(() => api('POST', '/api/onboarding/blueprint/revise', { text }), '고쳐 달라고 했어요').then(() => setText(''))}>고쳐 달라기</button></div>`}</div>
    <div class="row end ob-actions"><span class="note">${state.ai.id === 'fake' ? '견본 AI라 구독 사용량은 들지 않아요 — 실제 AI면 대표님 AI 구독에서 나가요' : `AI 사용량은 대표님의 AI 구독에서 나가요${usageNote(ob.design)}`}</span><button class="btn decide big" disabled=${!blocks.length || revising} onClick=${confirm}>이 설계도로 확정</button></div>
  </div>`;
}

/** 첫 주(결정 73) — 매니저 혼자 사업 진단 + 이번 달 실행 계획 → 대표의 첫 확인 */
function First({ state, ob }) {
  const manager = state.employees.find((e) => e.role === 'manager');
  const bp = ob.blueprint?.data;
  const hired = new Set(state.employees.map((e) => e.role));
  const next = bp?.hiring.find((h) => !hired.has(h.role));
  const start = () => act(async () => { await api('POST', '/api/onboarding/finish'); await api('POST', '/api/cycles'); location.hash = '#/office'; }, '첫 주를 시작했어요');
  const hireNext = () => { location.hash = '#/company/hire'; act(() => api('POST', '/api/onboarding/finish')); };
  return html`<div class="stack">
    <p class="eyebrow">퀘스트 8 · 첫 주 시작</p><h1>첫 주에는 ${josa(manager.name, '이', '가')} 사업 진단과 이번 달 실행 계획을 써요</h1>
    <div class="road">${[['사업 진단 + 이번 달 실행 계획', `${manager.name} 혼자 해요 — 설계도의 할 일 묶음으로 1–4주차를 짜고 대표님 할 일을 정리해요`], ['확인할 것에서 확인', '문단에 코멘트를 달아 고쳐 달라거나, 그대로 확정해요'], ['다음 주부터 계획대로', '확정한 계획의 1주차 일 + 주간 회고로 일해요']].map(([t, d], i) => html`<div class=${`rd${i === 0 ? ' now' : ''}`}><span class="n">${i + 1}</span><span><b>${t}</b><small>${d}</small></span><span></span></div>`)}</div>
    ${next && html`<div class="next-hire"><span class="pill">다음 채용 · ${next.when}</span><p><b>${roleFull(next.role)}</b> — ${next.why}<br/><span class="muted">지금 뽑지 않아도 첫 주는 시작할 수 있어요.</span></p></div>`}
    <p class="honest">밖으로 올리거나 보내는 일은 대표님 확인 뒤에만 해요. 법 · 세무 · 인허가는 지어내지 않고 “확인 필요(전문가)”로 표시해요.</p>
    <div class="row ob-actions"><button class="btn" onClick=${() => act(() => api('POST', '/api/onboarding/finish'))}>사무실로 먼저 가기</button><span class="sp"></span>
      ${next && html`<button class="btn" onClick=${hireNext}>먼저 ${roleLabel(next.role)} 채용하기</button>`}<button class="btn decide big" onClick=${start}>첫 주 시작</button></div>
  </div>`;
}

export function Onboarding({ state }) {
  const ob = useApi('/api/onboarding').data;
  const [celebrate, setCelebrate] = useState(null);
  useEffect(() => {
    const on = (e) => { setCelebrate(e.detail); refresh(); };
    document.addEventListener('ao-hired', on);
    return () => document.removeEventListener('ao-hired', on);
  }, []);
  const stage = state.onboarding;
  useEffect(() => {
    if (!ob) return;
    if (stage === 'interview' && !ob.interview) act(() => api('POST', '/api/onboarding/interview'));
    if (stage === 'setup' && !ob.setup) act(() => api('POST', '/api/onboarding/setup/start'));
  }, [stage, ob?.interview?.id, ob?.setup?.id, !!ob]);
  const qi = STAGE_INDEX[stage] ?? 0;
  let panel = html`<p class="muted">불러오는 중…</p>`;
  if (stage === 'intro') panel = html`<${Intro} />`;
  else if (stage === 'describe') panel = html`<${Describe} />`;
  else if (stage === 'power') panel = html`<${Power} state=${state} />`;
  else if (ob && stage === 'interview') panel = html`<${CandidatePicker} role="manager" ob=${ob} req=${ob.interview} kind="interview" onStart=${() => act(() => api('POST', '/api/onboarding/interview'))} />`;
  else if (ob && stage === 'setup') panel = html`<${Setup} state=${state} ob=${ob} />`;
  else if (ob && stage === 'blueprint' && ob.draft) panel = html`<${BlueprintView} state=${state} ob=${ob} />`;
  else if (ob && stage === 'first') panel = html`<${First} state=${state} ob=${ob} />`;
  return html`<div class="ob">
    <aside class="ob-left"><${Quest} index=${qi} /><${Preview} state=${state} aiOn=${qi > 2} /></aside>
    <section class="ob-right">${panel}</section>
    ${celebrate && html`<div class="celebrate" onClick=${() => setCelebrate(null)}><div class="cel card">
      <${Figure} look=${celebrate.look} pose="happy" /><h1>${celebrate.name} 입사!</h1><p class="sub">${roleFull(celebrate.role)} — 사무실에 자리가 생겼어요.</p>
      <button class="btn pri big">좋아요</button></div></div>`}
  </div>`;
}
